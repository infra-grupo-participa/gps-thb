-- CD10 — RETRATO das 4 RPCs que existiam SÓ no banco (rodada final de 09/09/2026).
--
-- Extraído do banco real por `pg_get_functiondef` + `proacl` em 09/09/2026 pelo
-- orquestrador (insumo em tmp/squad/rpcs-sem-migration.md). Segue o formato da
-- migração ...118: `create or replace` com o corpo VIGENTE, colado textual.
-- NENHUM corpo foi escrito de cabeça e NENHUM corpo foi alterado.
--
-- POR QUE EXISTE
--   gps.admin_excluir_membro, gps.aluno_por_documento, gps.admin_direito_ao_acesso
--   e gps.admin_programas_do_email não tinham DDL em supabase/migrations/** — nem
--   no baseline 00000000000000, nem na ...118. O app chama as quatro. É a mesma
--   condição que deixou gps.admin_adotar_login_existente quebrada por 15 dias sem
--   ninguém ver: função que só existe no banco não passa por code review, não
--   volta num restore e não aparece em diff. Duas destas estão no caminho de
--   exclusão de login (admin_excluir_membro) e de conferência de direito de
--   acesso (admin_direito_ao_acesso).
--
-- O ÚNICO AJUSTE — a ACL de gps.aluno_por_documento
--   ACL vigente das três `admin_*`: {postgres=X, authenticated=X, service_role=X}
--   — sem public/anon. Ficam como estão (o `revoke`/`grant` abaixo é o retrato
--   delas, idempotente, não uma mudança).
--   gps.aluno_por_documento estava com `=X` para PUBLIC (o default do Postgres
--   para função nova, nunca revogado). Ela é SECURITY INVOKER, então a RLS de
--   public.thb_alunos ainda vale e `anon` não leria linha nenhuma — mas execute
--   para PUBLIC é grant largo que ninguém decidiu dar, e a superfície fica
--   registrada no PostgREST (`/rest/v1/rpc/aluno_por_documento`) para qualquer
--   um sondar. O único chamador é `cadastrarAluno` (src/app/admin/actions.ts:173),
--   atrás de `ehAdmin()` — conferido com `rg -n "aluno_por_documento" src` → 1
--   ocorrência, nenhum caminho anônimo. Por isso: revoke de public/anon, grant a
--   authenticated. `revoke` ANTES do `grant`, sempre — antídoto explícito ao
--   incidente do CNHF (o GRANT que passou na frente do RLS).
--
-- O QUE NÃO FAZ
--   * não muda corpo nem assinatura de nenhuma das quatro;
--   * não muda a ACL das três `admin_*` (o bloco final apenas a versiona);
--   * não toca nas funções já versionadas (...114 admin_excluir_acesso,
--     ...118 a família de gestão de acesso, ...020 admin_adotar_login_existente).
--
-- REVERSÃO
--   Nenhuma necessária para os corpos (idempotente sobre o estado atual).
--   Para devolver o grant largo de aluno_por_documento (não recomendado):
--     grant execute on function gps.aluno_por_documento(text) to public;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. gps.admin_direito_ao_acesso — leitura de cs.vw_gps_acessos
-- ─────────────────────────────────────────────────────────────────────────

create or replace function gps.admin_direito_ao_acesso(p_aluno_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
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

-- ─────────────────────────────────────────────────────────────────────────
-- 2. gps.admin_excluir_membro — tira UM sócio do ambiente (e o login dele)
-- ─────────────────────────────────────────────────────────────────────────

create or replace function gps.admin_excluir_membro(p_membro_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
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

-- ─────────────────────────────────────────────────────────────────────────
-- 3. gps.admin_programas_do_email — em que programas do grupo esse login está
-- ─────────────────────────────────────────────────────────────────────────

create or replace function gps.admin_programas_do_email(p_email text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
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

-- ─────────────────────────────────────────────────────────────────────────
-- 4. gps.aluno_por_documento — duplicata por CPF/CNPJ normalizado
-- ─────────────────────────────────────────────────────────────────────────
-- SECURITY INVOKER de propósito (não tem `security definer`): quem chama é o
-- admin logado e a RLS de public.thb_alunos continua valendo por cima. O
-- `set search_path to 'public', 'gps'` é o VIGENTE — não vira '' aqui porque
-- mudar search_path de função invoker sem reescrever o corpo é como se troca
-- o significado de um `public.` implícito sem querer. O corpo já qualifica
-- `public.thb_alunos`; a arrumação do search_path é tarefa própria.

create or replace function gps.aluno_por_documento(p_doc text)
 returns table(id uuid, nome text, email text, documento text)
 language sql
 stable
 set search_path to 'public', 'gps'
as $function$
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

comment on function gps.aluno_por_documento(text) is
  'Procura aluno em public.thb_alunos pelo documento NORMALIZADO (lpad dos digitos, 14) -- mesma normalizacao do gatilho de vinculo por CPF, senao o login do aluno gruda na linha errada. SECURITY INVOKER: a RLS de thb_alunos vale para quem chama. Unico chamador: cadastrarAluno (src/app/admin/actions.ts), atras de ehAdmin(). Execute revogado de public/anon na migracao ...131 -- o grant largo era o default do Postgres, nunca uma decisao.';

-- ─────────────────────────────────────────────────────────────────────────
-- 5. ACL — `revoke` antes do `grant`, sempre
-- ─────────────────────────────────────────────────────────────────────────
-- As três admin_*: retrato da ACL vigente (sem public/anon, execute só para
-- authenticated + service_role). aluno_por_documento: ÚNICA mudança desta
-- migração — perde o execute de PUBLIC.

revoke execute on function gps.admin_direito_ao_acesso(uuid)  from public, anon;
revoke execute on function gps.admin_excluir_membro(uuid)     from public, anon;
revoke execute on function gps.admin_programas_do_email(text) from public, anon;
revoke execute on function gps.aluno_por_documento(text)      from public, anon;

grant execute on function gps.admin_direito_ao_acesso(uuid)  to authenticated;
grant execute on function gps.admin_excluir_membro(uuid)     to authenticated;
grant execute on function gps.admin_programas_do_email(text) to authenticated;
grant execute on function gps.aluno_por_documento(text)      to authenticated;
