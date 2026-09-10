-- gps.admin_adicionar_socio grava pessoa_aluno_id — o sócio novo nasce com identidade.
--
-- POR QUÊ (achado do Fable na mega feature de 10/09/2026)
--   O onboarding é da PESSOA (gps.pessoa_atual() = gps.membros.pessoa_aluno_id).
--   `admin_adicionar_socio` inseria o membro SEM pessoa_aluno_id, e a trigger da
--   ...187 só preenche o TITULAR. Resultado: todo sócio novo entraria no portal,
--   o pop-up do questionário montaria e toda action responderia "Seu cadastro
--   ainda não está vinculado ao programa" — pop-up que nunca salva. Os 13 sócios
--   de hoje só têm pessoa porque o backfill da ...154 casou pelo e-mail do login.
--
-- O QUE FAZ
--   Corpo VIGENTE (pg_get_functiondef de 10/09) + `pessoa_aluno_id` no insert e no
--   `on conflict`. A pessoa é `p_socio_aluno_id` — o cadastro que o admin
--   escolheu na tela para ser o sócio. Se esse cadastro JÁ for pessoa de outro
--   membro (o índice único parcial membros_pessoa_uk recusaria com 23505 no meio
--   da criação do login), o membro nasce SEM pessoa e a Central resolve depois
--   com "Vincular pessoa" — melhor um sócio sem pessoa do que um erro genérico
--   depois de a senha já ter sido trocada em auth.users.
--
-- O QUE NÃO FAZ: não altera a lógica de auth.users, senha, papel nem log.
-- REVERSÃO: reaplicar o corpo anterior (retrato na ...118) — não recomendado.

create or replace function gps.admin_adicionar_socio(
  p_ambiente_aluno_id uuid, p_socio_aluno_id uuid, p_email text, p_senha text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_user uuid; v_email text := lower(trim(p_email)); v_existente uuid; v_pessoa uuid;
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

  -- A PESSOA do sócio: o cadastro escolhido na tela — a menos que já seja
  -- pessoa de outro membro (membros_pessoa_uk), caso em que nasce sem e a
  -- Central resolve.
  v_pessoa := case
                when p_socio_aluno_id is null then null
                when exists (select 1 from gps.membros x
                              where x.pessoa_aluno_id = p_socio_aluno_id
                                and x.user_id is distinct from v_user) then null
                else p_socio_aluno_id
              end;

  insert into gps.membros (aluno_id, user_id, papel, pessoa_aluno_id)
  values (p_ambiente_aluno_id, v_user, 'socio', v_pessoa)
  on conflict (aluno_id, user_id) do update
     set papel = 'socio',
         pessoa_aluno_id = coalesce(gps.membros.pessoa_aluno_id, excluded.pessoa_aluno_id);

  insert into gps.ambientes (aluno_id) values (p_ambiente_aluno_id) on conflict (aluno_id) do nothing;

  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, detalhe, feito_por)
  values ('socio_adicionado', p_ambiente_aluno_id, v_user, v_email,
          'sócio ' || coalesce(p_socio_aluno_id::text,'?'), auth.uid());

  return jsonb_build_object('user_id', v_user, 'email', v_email, 'pessoa_aluno_id', v_pessoa);
end $function$;

comment on function gps.admin_adicionar_socio(uuid, uuid, text, text) is
  'Adiciona um SOCIO ao ambiente (cria ou reaproveita o login, define senha, grava gps.membros papel=socio). Desde a ...212 grava pessoa_aluno_id = p_socio_aluno_id (o cadastro escolhido na tela), salvo quando esse cadastro ja e pessoa de outro membro -- ai nasce sem pessoa e a Central resolve. Sem isso o socio novo nao conseguia responder o onboarding (gps.pessoa_atual() = NULL). ⚠️ Troca a senha do login se ele ja existir (auth.users e compartilhado).';
