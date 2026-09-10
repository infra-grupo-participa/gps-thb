-- 20260910000220_gps_admin_adicionar_socio_titular_e_pessoa.sql
--
-- Dois riscos residuais do veredito do Fable (ciclo 3, 10/09/2026) fechados:
--   1. e-mail do PRÓPRIO titular do ambiente passado como sócio: a ...219 movia
--      o membro por `on conflict (user_id)` e o titular virava sócio — ambiente
--      sem titular (pré-existente desde a ...118, agravado pela 219). Agora
--      recusa com 22023 antes de qualquer escrita.
--   2. o gatilho de signup pode casar um CADASTRO DIFERENTE do escolhido na
--      tela; o `coalesce(gps.membros.pessoa_aluno_id, excluded…)` mantinha o
--      do gatilho e o retorno dizia o da tela. Agora a escolha do admin vence
--      (quando válida; senão fica a do gatilho).
--
-- FORMA: corpo VIGENTE = ...219 (drop + create, assinatura idêntica, sem
-- sobrecarga). REVERSÃO: reaplicar a ...219.

drop function if exists gps.admin_adicionar_socio(uuid, uuid, text, text, boolean);

create function gps.admin_adicionar_socio(
  p_ambiente_aluno_id uuid,
  p_socio_aluno_id uuid,
  p_email text,
  p_senha text,
  p_confirmar_login_existente boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_user uuid; v_email text := lower(trim(p_email)); v_existente uuid; v_pessoa uuid;
        v_amb_trigger uuid;
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
    -- ...220: o e-mail é do TITULAR deste mesmo ambiente. Sem esta guarda o
    -- `on conflict (user_id) do update` da ...219 rebaixava o titular a sócio
    -- (e o ambiente ficava sem titular) — risco residual apontado pelo Fable.
    if exists (select 1 from gps.membros
                where user_id = v_user and aluno_id = p_ambiente_aluno_id and papel = 'titular') then
      raise exception 'Este e-mail é do titular deste ambiente — o sócio precisa de um e-mail próprio.'
        using errcode = '22023';
    end if;

    -- ...218: a conta JÁ EXISTE em auth.users (compartilhado por 7 portais do
    -- grupo). Daqui para baixo a função troca a senha dela e derruba as
    -- sessões. Sem confirmação explícita, PARA AQUI — e nada foi escrito até
    -- esta linha.
    if not coalesce(p_confirmar_login_existente, false) then
      raise exception 'Este e-mail já tem login no grupo. Confirme para trocar a senha dessa conta e adicioná-la como sócio.'
        using errcode = 'P0003';
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

  -- ...219: o gatilho de signup (`on_auth_user_created_gps`) roda no INSERT em
  -- auth.users feito ACIMA e, quando o CPF/e-mail do sócio casa com um
  -- cadastro, já grava um membro para este user_id (titular do PRÓPRIO
  -- cadastro do sócio). A constraint que existe é `membros_user_id_key`
  -- (user_id único): o `on conflict (aluno_id, user_id)` antigo não a cobria e
  -- a função morria em 23505 — "Adicionar sócio" com e-mail novo falhava para
  -- todo sócio que tem documento na base. Guarda-se o ambiente que o gatilho
  -- escolheu para desfazer o `gps.ambientes` órfão que ele deixou.
  select m.aluno_id into v_amb_trigger from gps.membros m where m.user_id = v_user;

  insert into gps.membros (aluno_id, user_id, papel, pessoa_aluno_id)
  values (p_ambiente_aluno_id, v_user, 'socio', v_pessoa)
  on conflict (user_id) do update
     set aluno_id = excluded.aluno_id,
         papel = 'socio',
         -- ...220: a PESSOA escolhida na tela vence a que o gatilho casou
         -- (quando são diferentes, o retorno dizia uma e o banco guardava outra).
         -- `excluded.pessoa_aluno_id` já vem NULL quando o cadastro escolhido é
         -- pessoa de outro membro (membros_pessoa_uk), e aí fica a do gatilho.
         pessoa_aluno_id = coalesce(excluded.pessoa_aluno_id, gps.membros.pessoa_aluno_id);

  -- Só o ambiente que o gatilho criou NESTA transação (`criado_em >= now()`)
  -- e que ficou sem nenhum membro. Um ambiente pré-existente ("Só criar
  -- ambiente", sem login) nunca é tocado.
  if v_amb_trigger is not null and v_amb_trigger <> p_ambiente_aluno_id then
    delete from gps.ambientes am
     where am.aluno_id = v_amb_trigger
       and am.criado_em >= now()
       and not exists (select 1 from gps.membros m where m.aluno_id = v_amb_trigger);
  end if;

  insert into gps.ambientes (aluno_id) values (p_ambiente_aluno_id) on conflict (aluno_id) do nothing;

  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, detalhe, feito_por)
  values ('socio_adicionado', p_ambiente_aluno_id, v_user, v_email,
          'sócio ' || coalesce(p_socio_aluno_id::text,'?'), auth.uid());

  return jsonb_build_object('user_id', v_user, 'email', v_email, 'pessoa_aluno_id', v_pessoa);
end $function$;



revoke execute on function gps.admin_adicionar_socio(uuid, uuid, text, text, boolean) from public, anon;
grant  execute on function gps.admin_adicionar_socio(uuid, uuid, text, text, boolean) to authenticated;

comment on function gps.admin_adicionar_socio(uuid, uuid, text, text, boolean) is
  'Adiciona um SOCIO ao ambiente (cria ou reaproveita o login, define senha, grava gps.membros papel=socio). ...212 pessoa_aluno_id; ...218 P0003 (zero escrita) quando o e-mail ja tem login sem p_confirmar_login_existente; ...219 on conflict (user_id) porque o gatilho de signup ja grava o membro do login novo, e apaga o ambiente orfao da mesma transacao; ...220 recusa o e-mail do proprio titular do ambiente (22023) e faz a pessoa escolhida na tela vencer a que o gatilho casou. Reaproveitar o login CONFIRMADO troca a senha dele e derruba as sessoes em todos os portais.';
