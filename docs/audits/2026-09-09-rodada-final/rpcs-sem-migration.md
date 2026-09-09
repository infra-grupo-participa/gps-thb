# 4 RPCs que existem só no banco (extraídas em 09/09/2026 por pg_get_functiondef) — CD10

ACL: as três `admin_*` = `{postgres=X, authenticated=X, service_role=X}` (sem public/anon).
`aluno_por_documento` = `{=X (PUBLIC!), postgres=X, authenticated=X, service_role=X}` — é SECURITY INVOKER
(RLS de thb_alunos vale), mas o execute para PUBLIC é grant largo: versionar com `revoke from public, anon` + `grant to authenticated`.

```sql
CREATE OR REPLACE FUNCTION gps.admin_direito_ao_acesso(p_aluno_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
declare v record; v_ok boolean; v_motivo text;
begin
  select * into v from cs.vw_gps_acessos where aluno_id = p_aluno_id;
  if not found then
    return jsonb_build_object('tem_direito', false,
      'motivo', 'Aluno não encontrado na base de acessos (sem compra vinculada).');
  end if;
  if v.cancelado_em is not null then
    v_ok := false; v_motivo := 'Matrícula cancelada em ' || to_char(v.cancelado_em,'DD/MM/YYYY') || '.';
  elsif coalesce(v.situacao_financeira,'') = 'reembolsado' then
    v_ok := false; v_motivo := 'Compra reembolsada.';
  elsif coalesce(v.status_acesso,'') = '' and coalesce(v.situacao_financeira,'') = 'so_sinal' then
    v_ok := false; v_motivo := 'Pagou só o sinal — acesso ainda não liberado.';
  else
    v_ok := true;
    v_motivo := 'Acesso ' || coalesce(v.status_acesso,'sem status')
             || ' / financeiro ' || coalesce(v.situacao_financeira,'não informado')
             || case when v.acesso_vencido then ' (prazo vencido)' else '' end || '.';
  end if;
  return jsonb_build_object(
    'tem_direito', v_ok, 'motivo', v_motivo,
    'nome', v.nome, 'email', v.email, 'turma', v.turma, 'plano', v.plano,
    'status_acesso', v.status_acesso, 'situacao_financeira', v.situacao_financeira,
    'acesso_vencido', v.acesso_vencido, 'data_expiracao', v.data_expiracao);
end $function$;

CREATE OR REPLACE FUNCTION gps.admin_excluir_membro(p_membro_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare m record; v_email text;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  select * into m from gps.membros where id = p_membro_id;
  if not found then
    raise exception 'Membro não encontrado.' using errcode = 'P0002';
  end if;
  if m.papel = 'titular' then
    raise exception 'Este é o titular do ambiente. Para remover, use "Excluir acesso".' using errcode = '42501';
  end if;
  if m.user_id = auth.uid() then
    raise exception 'Você não pode excluir o próprio acesso.' using errcode = '42501';
  end if;
  if m.user_id is not null and gps.admin_alvo_e_equipe(m.user_id) then
    raise exception 'Esta conta é da equipe — não pode ser excluída por aqui.' using errcode = '42501';
  end if;
  if m.user_id is not null then
    select email into v_email from auth.users where id = m.user_id;
  end if;
  delete from gps.membros where id = p_membro_id;
  if m.user_id is not null then
    delete from gps.solicitacoes_acesso where user_id = m.user_id;
    begin
      delete from auth.users where id = m.user_id;
    exception when foreign_key_violation then null;
    end;
  end if;
  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, detalhe, feito_por)
  values ('membro_excluido', m.aluno_id, m.user_id, v_email, 'sócio removido do ambiente', auth.uid());
  return jsonb_build_object('email', v_email);
end $function$;

CREATE OR REPLACE FUNCTION gps.admin_programas_do_email(p_email text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
declare
  v_user uuid; v_email text; v_progs jsonb := '[]'::jsonb; v_u record;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if coalesce(trim(p_email),'') = '' then
    return jsonb_build_object('tem_login', false, 'programas', '[]'::jsonb);
  end if;
  select id, email into v_user, v_email
    from auth.users where lower(trim(email)) = lower(trim(p_email));
  if v_user is null then
    return jsonb_build_object('tem_login', false, 'email', lower(trim(p_email)),
                              'programas', '[]'::jsonb);
  end if;
  select * into v_u from auth.users where id = v_user;
  -- GPS
  if exists (select 1 from gps.membros where user_id = v_user) then
    v_progs := v_progs || jsonb_build_array(jsonb_build_object(
      'programa','GPS',
      'detalhe', (select 'papel: '||m.papel from gps.membros m where m.user_id=v_user limit 1)));
  end if;
  -- Workbook CNHF
  if exists (select 1 from workbook.perfis where user_id = v_user) then
    v_progs := v_progs || jsonb_build_array(jsonb_build_object(
      'programa','Workbook CNHF',
      'detalhe', (select 'role: '||p.role from workbook.perfis p where p.user_id=v_user limit 1)));
  end if;
  -- Central de Projetos
  if exists (select 1 from central.alunos where id = v_user) then
    v_progs := v_progs || jsonb_build_array(jsonb_build_object(
      'programa','Central de Projetos',
      'detalhe', (select 'status: '||a.status from central.alunos a where a.id=v_user limit 1)));
  end if;
  -- Rede Nacional de Especialistas
  if exists (select 1 from rede.perfis where auth_id = v_user) then
    v_progs := v_progs || jsonb_build_array(jsonb_build_object(
      'programa','Rede de Especialistas',
      'detalhe', (select 'status: '||r.status::text from rede.perfis r where r.auth_id=v_user limit 1)));
  end if;
  -- SIP
  if exists (select 1 from sip.progress where user_id = v_user)
     or exists (select 1 from sip.meta where user_id::text = v_user::text) then
    v_progs := v_progs || jsonb_build_array(jsonb_build_object(
      'programa','SIP', 'detalhe','tem progresso registrado'));
  end if;
  -- Holding Total (ht)
  if exists (select 1 from ht.lesson_progress where user_id = v_user) then
    v_progs := v_progs || jsonb_build_array(jsonb_build_object(
      'programa','Holding Total', 'detalhe','tem progresso de aula'));
  end if;
  -- Equipe interna
  if exists (select 1 from public.perfis where id = v_user) then
    v_progs := v_progs || jsonb_build_array(jsonb_build_object(
      'programa','Equipe interna',
      'detalhe', (select 'cargo: '||p.cargo::text||' / '||p.status
                    from public.perfis p where p.id=v_user limit 1)));
  end if;
  return jsonb_build_object(
    'tem_login', true,
    'user_id', v_user,
    'email', v_email,
    'origem', v_u.raw_user_meta_data->>'origem',
    'ultimo_acesso', v_u.last_sign_in_at,
    'criado_em', v_u.created_at,
    'tem_senha', coalesce(v_u.encrypted_password,'') <> '',
    'e_equipe', gps.admin_alvo_e_equipe(v_user),
    'programas', v_progs,
    'qtd_programas', jsonb_array_length(v_progs)
  );
end $function$;

CREATE OR REPLACE FUNCTION gps.aluno_por_documento(p_doc text)
 RETURNS TABLE(id uuid, nome text, email text, documento text)
 LANGUAGE sql STABLE SET search_path TO 'public', 'gps'
AS $function$
  with alvo as (
    select lpad(regexp_replace(coalesce(p_doc, ''), '\D', '', 'g'), 14, '0') as doc
  )
  select a.id, a.nome, a.email, a.documento
  from public.thb_alunos a, alvo
  where coalesce(a.documento, '') <> ''
    and alvo.doc <> lpad('', 14, '0')
    and lpad(regexp_replace(a.documento, '\D', '', 'g'), 14, '0') = alvo.doc
  order by a.importado_em desc nulls last
$function$;
```

## Estado atual das tabelas de configuração (para CD9)
- `gps.plantao_config`: `inscricao_aberta = 'true'` (1 linha).
- `gps.config`: `chamados_aberto = 'true'`, `chamados_email_equipe = ''` (2 linhas). CHECK de `config.valor`: `length <= 2000 and valor !~ '[\r\n]'` (vazio permitido); `plantao_config.valor`: `length between 1 and 200`.
