-- RETRATO (baseline) da família de gestão de acesso do admin — extraído do banco real
-- (pg_get_functiondef + proacl) em 09/09/2026 pelo orquestrador. NÃO altera nada:
-- é `create or replace` com o corpo VIGENTE, para o repo saber recriar o banco.
--
-- Por que existe: o Fable apontou, na trava final de 09/09, que o baseline
-- 00000000000000 listava "o que ficou de fora de propósito" e omitia estas 5
-- funções SECURITY DEFINER sobre auth.users — gps.admin_excluir_acesso (...114)
-- e a UI de "Gerenciar acesso" dependem delas, e nenhuma migration as criava.
-- É exatamente o buraco que deixou gps.admin_adotar_login_existente quebrada por
-- 15 dias sem ninguém ver (ela só existia no banco). Ver CLAUDE.md, seção
-- "Gerenciar acesso do aluno (2026-07-31)".
--
-- Funções: admin_user_do_aluno, admin_alvo_e_equipe, admin_status_acesso,
-- admin_definir_senha, admin_adicionar_socio. ACL vigente em todas:
-- postgres=X, authenticated=X, service_role=X (sem public/anon).
--
-- O QUE NÃO FAZ: não muda corpo, assinatura nem grant; não toca
-- admin_excluir_acesso (...114) nem admin_adotar_login_existente (...020).
--
-- Reversão: nenhuma necessária (idempotente sobre o estado atual).

create or replace function gps.admin_user_do_aluno(p_aluno_id uuid)
 returns uuid
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce(
    (select m.user_id from gps.membros m
      where m.aluno_id = p_aluno_id and m.user_id is not null
      order by (m.papel = 'titular') desc, m.criado_em asc limit 1),
    (select u.id from auth.users u
       join public.thb_alunos a on lower(trim(a.email)) = lower(trim(u.email))
      where a.id = p_aluno_id and u.deleted_at is null
      order by u.created_at limit 1)
  );
$function$;

create or replace function gps.admin_alvo_e_equipe(p_user_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select exists (
    select 1 from public.perfis p
     where p.id = p_user_id and p.status = 'ativo' and p.cargo in ('dev', 'admin')
  );
$function$;

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
    where aluno_id = p_aluno_id order by (papel='titular') desc, criado_em asc limit 1;
  if v_user is not null then
    select * into v_u from auth.users where id = v_user;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'membro_id', m.id,
           'papel', m.papel,
           'user_id', m.user_id,
           'email', u.email,
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
    'email_bate', v_user is not null
        and lower(trim(coalesce(v_u.email, ''))) = lower(trim(coalesce(v_aluno.email, ''))),
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

create or replace function gps.admin_definir_senha(p_aluno_id uuid, p_senha text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_user uuid; v_email text;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_senha is null or length(trim(p_senha)) < 8 then
    raise exception 'A senha precisa ter ao menos 8 caracteres.' using errcode = '22023';
  end if;

  v_user := gps.admin_user_do_aluno(p_aluno_id);
  if v_user is null then
    raise exception 'Este aluno ainda não tem login. Use "Criar acesso".' using errcode = 'P0002';
  end if;
  if gps.admin_alvo_e_equipe(v_user) then
    raise exception 'Esta conta é da equipe — a senha não pode ser trocada por aqui.' using errcode = '42501';
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         recovery_token = '', recovery_sent_at = null, confirmation_token = '',
         email_change = '', email_change_token_new = '', email_change_token_current = '',
         updated_at = now()
   where id = v_user
   returning email into v_email;

  delete from auth.refresh_tokens where user_id = v_user::text;
  delete from auth.sessions where user_id = v_user;

  -- conflito por user_id (constraint que realmente existe)
  insert into gps.membros (aluno_id, user_id, papel)
  values (p_aluno_id, v_user,
          case when exists (select 1 from gps.membros m
                             where m.aluno_id = p_aluno_id and m.papel='titular' and m.user_id <> v_user)
               then 'socio' else 'titular' end)
  on conflict (user_id) do nothing;

  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, feito_por)
  values ('senha_definida', p_aluno_id, v_user, v_email, auth.uid());

  return jsonb_build_object('user_id', v_user, 'email', v_email);
end $function$;

create or replace function gps.admin_adicionar_socio(p_ambiente_aluno_id uuid, p_socio_aluno_id uuid, p_email text, p_senha text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_user uuid; v_email text := lower(trim(p_email)); v_existente uuid;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if v_email is null or v_email = '' then
    raise exception 'Informe o e-mail do sócio.' using errcode = '22023';
  end if;
  if p_senha is null or length(trim(p_senha)) < 8 then
    raise exception 'A senha precisa ter ao menos 8 caracteres.' using errcode = '22023';
  end if;
  if not exists (select 1 from gps.membros where aluno_id = p_ambiente_aluno_id and papel = 'titular') then
    raise exception 'Este ambiente não tem titular — crie o acesso do titular primeiro.' using errcode = 'P0002';
  end if;

  select id into v_user from auth.users where lower(email) = v_email and deleted_at is null limit 1;

  if v_user is not null then
    if gps.admin_alvo_e_equipe(v_user) then
      raise exception 'Esta conta é da equipe — não pode virar sócio de um ambiente.' using errcode = '42501';
    end if;
    select aluno_id into v_existente from gps.membros where user_id = v_user;
    if v_existente is not null and v_existente <> p_ambiente_aluno_id then
      raise exception 'Este e-mail já pertence a outro ambiente do GPS. Remova o acesso anterior antes.' using errcode = '23505';
    end if;

    update auth.users
       set encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           updated_at = now()
     where id = v_user;
    delete from auth.refresh_tokens where user_id = v_user::text;
    delete from auth.sessions where user_id = v_user;
  else
    v_user := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated',
      v_email, extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('origem','gps','documento', (select documento from public.thb_alunos where id = p_socio_aluno_id)),
      '', '', '', ''
    );
    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (v_user::text, v_user,
            jsonb_build_object('sub', v_user::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
            'email', now(), now(), now());
  end if;

  insert into gps.membros (aluno_id, user_id, papel)
  values (p_ambiente_aluno_id, v_user, 'socio')
  on conflict (aluno_id, user_id) do update set papel = 'socio';

  insert into gps.ambientes (aluno_id) values (p_ambiente_aluno_id) on conflict (aluno_id) do nothing;

  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, detalhe, feito_por)
  values ('socio_adicionado', p_ambiente_aluno_id, v_user, v_email,
          'sócio ' || coalesce(p_socio_aluno_id::text,'?'), auth.uid());

  return jsonb_build_object('user_id', v_user, 'email', v_email);
end $function$;

-- ACL vigente: sem public/anon; execute só para authenticated (e service_role, padrão do Supabase).
revoke execute on function gps.admin_user_do_aluno(uuid)                    from public, anon;
revoke execute on function gps.admin_alvo_e_equipe(uuid)                    from public, anon;
revoke execute on function gps.admin_status_acesso(uuid)                    from public, anon;
revoke execute on function gps.admin_definir_senha(uuid, text)              from public, anon;
revoke execute on function gps.admin_adicionar_socio(uuid, uuid, text, text) from public, anon;
grant  execute on function gps.admin_user_do_aluno(uuid)                    to authenticated;
grant  execute on function gps.admin_alvo_e_equipe(uuid)                    to authenticated;
grant  execute on function gps.admin_status_acesso(uuid)                    to authenticated;
grant  execute on function gps.admin_definir_senha(uuid, text)              to authenticated;
grant  execute on function gps.admin_adicionar_socio(uuid, uuid, text, text) to authenticated;
