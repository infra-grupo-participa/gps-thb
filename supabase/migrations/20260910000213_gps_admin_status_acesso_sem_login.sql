-- gps.admin_status_acesso não pode quebrar para aluno SEM login.
--
-- O QUE QUEBROU (10/09/2026, relato do João: "Não foi possível conferir o
-- ambiente para Paula Maria")
--   A função declara `v_u record` e só o preenche `if v_user is not null`.
--   Para ambiente sem login (19 titulares hoje — o lote manual de 09/09),
--   `v_user` é NULL, `v_u` nunca é atribuído, e o primeiro `v_u.email` do
--   jsonb_build_object levanta `55000 record "v_u" is not assigned yet`.
--   Efeito: a Central (`admin_diagnostico_ambiente`, que reusa esta função)
--   e o diagnóstico de "Gerenciar acesso" caíam na tela de erro exatamente
--   para quem mais precisa deles — o aluno que ainda não consegue entrar.
--   Pré-existente (retrato na ...118); ficou invisível enquanto todo membro
--   tinha `user_id`.
--
-- CONSERTO: corpo VIGENTE (pg_get_functiondef de 10/09) com o `select into
-- v_u` SEM o `if` — com `v_user` NULL a consulta devolve zero linhas e o
-- plpgsql atribui NULL a todos os campos do record, que é o que o retorno já
-- tratava (`v_u.email` → null, `tem_senha` → false, ...).
--
-- O QUE NÃO FAZ: não muda chave nem valor do jsonb devolvido para quem TEM
-- login. REVERSÃO: reaplicar o corpo da ...118 (não recomendado).

create or replace function gps.admin_status_acesso(p_aluno_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare v_user uuid; v_aluno record; v_u record; v_membro record; v_membros jsonb;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  select id, nome, email into v_aluno from public.thb_alunos where id = p_aluno_id;
  if not found then
    raise exception 'Aluno não encontrado.' using errcode = 'P0002';
  end if;
  v_user := gps.admin_user_do_aluno(p_aluno_id);
  select * into v_membro from gps.membros
   where aluno_id = p_aluno_id
   order by (papel='titular') desc, criado_em asc limit 1;
  -- Sem `if`: com v_user NULL vem zero linhas e v_u fica com todos os campos
  -- NULL (antes ficava "not assigned" e a função morria em 55000).
  select * into v_u from auth.users where id = v_user;
  select coalesce(jsonb_agg(jsonb_build_object(
           'membro_id', m.id, 'papel', m.papel, 'user_id', m.user_id, 'email', u.email,
           'tem_senha', coalesce(u.encrypted_password,'') <> '',
           'email_confirmado', u.email_confirmed_at is not null,
           'ultimo_acesso', u.last_sign_in_at
         ) order by (m.papel='titular') desc, m.criado_em asc), '[]'::jsonb)
    into v_membros
    from gps.membros m left join auth.users u on u.id = m.user_id
   where m.aluno_id = p_aluno_id;
  return jsonb_build_object(
    'aluno_id', p_aluno_id,
    'email_cadastro', v_aluno.email,
    'tem_login', v_user is not null,
    'user_id', v_user,
    'email_login', v_u.email,
    'email_bate', v_user is not null and lower(trim(coalesce(v_u.email, ''))) = lower(trim(coalesce(v_aluno.email, ''))),
    'email_confirmado', v_u.email_confirmed_at is not null,
    'tem_senha', coalesce(v_u.encrypted_password, '') <> '',
    'ultimo_acesso', v_u.last_sign_in_at,
    'criado_em', v_u.created_at,
    'no_gps', v_membro.id is not null,
    'vinculo_completo', v_membro.user_id is not null,
    'qtd_membros', jsonb_array_length(v_membros),
    'membros', v_membros,
    'solicitacao_pendente', exists (
      select 1 from gps.solicitacoes_acesso s
       where s.status = 'pendente'
         and (s.user_id = v_user or lower(trim(s.email)) = lower(trim(coalesce(v_aluno.email, ''))))
    )
  );
end $function$;

comment on function gps.admin_status_acesso(uuid) is
  'Diagnostico de acesso do ambiente (Gerenciar acesso e Central). Desde a ...213 nao quebra para ambiente SEM login: o record de auth.users e lido sem `if`, ficando NULL em vez de "not assigned" (55000). gp_is_admin() ou 42501.';
