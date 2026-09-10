-- 20260910000218_gps_admin_adicionar_socio_confirma_login_existente.sql
--
-- ADICIONAR SÓCIO NÃO TROCA MAIS A SENHA DE UMA CONTA PREEXISTENTE SEM CONFIRMAÇÃO
--
-- O BURACO (achado do ciclo 2 do war-room, 10/09/2026)
--   `gps.admin_adicionar_socio`, quando o e-mail JÁ tem linha em `auth.users`,
--   SOBRESCREVE `encrypted_password` e apaga `auth.sessions`/`auth.refresh_tokens`
--   daquela conta. E `auth.users` é compartilhado por 7 portais do grupo.
--   A action `adicionarSocioAluno` pedia confirmação, mas só quando
--   `gps.admin_programas_do_email` acusava papel em OUTRO portal. Conta que
--   existe e não tem papel em portal nenhum (lead do Workbook, cadastro
--   abandonado, pessoa que só tem login) passava direto: senha trocada e
--   sessões derrubadas sem que ninguém decidisse isso.
--
--   A guarda na action é conveniência de tela (ela NOMEIA os portais). A
--   fronteira tem de estar no banco: quem chama o PostgREST direto — ou uma
--   tela futura — não passa pela action.
--
-- O QUE MUDA
--   * 5º parâmetro `p_confirmar_login_existente boolean default false`.
--   * `v_user is not null` (o login já existe) + confirmação ausente
--     => `raise exception ... using errcode = 'P0003'`, ANTES de qualquer
--     escrita (nenhum UPDATE em auth.users, nenhum INSERT em gps.membros,
--     gps.ambientes ou gps.acessos_log acontece antes desse ponto).
--   * O `default false` mantém a chamada antiga compilando, mas invertendo o
--     resultado: o caminho perigoso passou a ser o que RECUSA.
--
--   ⚠️ ORDEM DAS GUARDAS: a recusa nova fica DEPOIS de
--   `gps.admin_alvo_e_equipe` e da checagem de "outro ambiente". As duas são
--   LEITURA (não escrevem nada) e são recusas DEFINITIVAS — pedir confirmação
--   para depois responder "esta conta é da equipe" faria o admin confirmar uma
--   troca de senha que nunca poderia acontecer. "Antes de qualquer escrita"
--   continua valendo: a primeira escrita da função é o `update auth.users`
--   logo abaixo da guarda nova.
--
-- ERRCODE `P0003`: não é `22023` (o mapa de tela traduz 22023 para "algum dado
--   está fora do formato", que é falso aqui) nem `42501` (não é falta de
--   permissão — o admin PODE, só precisa confirmar). O par action/tela decide
--   por CÓDIGO, não pelo texto (`src/app/admin/senha-actions.ts`).
--
-- FORMA: corpo VIGENTE da migração ...212 (pessoa_aluno_id no insert e no
--   `on conflict`), copiado, com a guarda nova e mais nada. `drop function`
--   antes: mudar a assinatura com `create or replace` deixaria as DUAS
--   sobrecargas de pé e a chamada com 4 argumentos continuaria trocando senha
--   em silêncio (sobrecarga ambígua quebra em runtime).
--   O `drop` apaga as ACLs: `revoke`/`grant` refeitos abaixo.
--
-- REVERSÃO: `drop function gps.admin_adicionar_socio(uuid,uuid,text,text,boolean);`
--   e reaplicar a ...212 inteira.

drop function if exists gps.admin_adicionar_socio(uuid, uuid, text, text);

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

-- O `drop` apagou as ACLs. `anon` volta a ser revogado explicitamente; o
-- ALTER DEFAULT PRIVILEGES do projeto já concede execute a `authenticated` em
-- toda função nova, e o `grant` abaixo deixa isso escrito em vez de herdado.
revoke execute on function gps.admin_adicionar_socio(uuid, uuid, text, text, boolean) from public, anon;
grant  execute on function gps.admin_adicionar_socio(uuid, uuid, text, text, boolean) to authenticated;

comment on function gps.admin_adicionar_socio(uuid, uuid, text, text, boolean) is
  'Adiciona um SOCIO ao ambiente (cria ou reaproveita o login, define senha, grava gps.membros papel=socio). Desde a ...212 grava pessoa_aluno_id = p_socio_aluno_id (o cadastro escolhido na tela), salvo quando esse cadastro ja e pessoa de outro membro -- ai nasce sem pessoa e a Central resolve. Desde a ...218, quando o e-mail JA tem login em auth.users (compartilhado por 7 portais do grupo) a funcao RECUSA com P0003 e escreve ZERO enquanto p_confirmar_login_existente nao vier true -- e a fronteira, nao a tela: a guarda da action (gps.admin_programas_do_email) so enxerga quem tem PAPEL em outro portal, e conta sem papel nenhum passava batido com a senha trocada. Reaproveitar o login CONFIRMADO troca a senha dele e derruba as sessoes em todos os portais.';

-- ═══════════════════════════════════════════════════════════════════════════
-- ROTEIRO DE PROVA EM ROLLBACK (rodar como `postgres`, DEPOIS de aplicar)
--
-- Tudo num `do $$ ... $$` que termina em `raise exception 'PROVA %'`: o RAISE
-- aborta a transacao e NADA do que o roteiro escreveu (login de mentira,
-- membro, log) sobrevive. Nao ha `commit` em lugar nenhum.
--
-- Cobre os 4 casos: e-mail novo sem confirmacao CRIA · e-mail existente sem
-- confirmacao recusa com P0003 e ZERO escrita em auth.users/gps.membros/
-- gps.acessos_log · e-mail existente COM confirmacao adiciona · sem JWT 42501.
--
-- do $$
-- declare
--   v_admin      uuid;
--   v_ambiente   uuid;
--   v_socio      uuid;
--   v_email      text := 'prova.socio.218@exemplo.invalid';
--   v_user_a     uuid;
--   v_hash_pre   text;      v_hash_pos   text;
--   v_upd_pre    timestamptz; v_upd_pos  timestamptz;
--   v_users_pre  bigint;    v_users_pos  bigint;
--   v_memb_pre   bigint;    v_memb_pos   bigint;
--   v_log_pre    bigint;    v_log_pos    bigint;
--   v_r          jsonb;
--   v_caso_a     text := 'NAO RODOU';
--   v_caso_b     text := 'NAO RODOU';
--   v_caso_c     text := 'NAO RODOU';
--   v_caso_d     text := 'NAO RODOU';
--   v_state      text;
--   v_msg        text;
-- begin
--   -- contexto: um admin de verdade, um ambiente COM titular e um cadastro
--   -- livre para ser o socio.
--   select p.id into v_admin
--     from public.perfis p
--    where p.status = 'ativo' and p.cargo in ('dev','admin')
--    limit 1;
--   select m.aluno_id into v_ambiente
--     from gps.membros m where m.papel = 'titular' limit 1;
--   select a.id into v_socio
--     from public.thb_alunos a
--    where not exists (select 1 from gps.membros x where x.pessoa_aluno_id = a.id)
--      and not exists (select 1 from gps.membros x where x.aluno_id = a.id)
--    limit 1;
--   if v_admin is null or v_ambiente is null or v_socio is null then
--     raise exception 'PROVA ABORTADA: faltou admin=% ambiente=% cadastro=%',
--       v_admin, v_ambiente, v_socio;
--   end if;
--   if exists (select 1 from auth.users where lower(email) = v_email) then
--     raise exception 'PROVA ABORTADA: % ja existe em auth.users', v_email;
--   end if;
--
--   perform set_config('role', 'authenticated', true);
--   perform set_config('request.jwt.claims',
--     json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
--
--   -- CASO A: e-mail NOVO, SEM confirmacao => CRIA
--   v_r := gps.admin_adicionar_socio(v_ambiente, v_socio, v_email, 'Prova#218aaa');
--   v_user_a := (v_r->>'user_id')::uuid;
--   v_caso_a := case
--     when v_user_a is not null
--      and exists (select 1 from gps.membros m
--                   where m.user_id = v_user_a and m.aluno_id = v_ambiente and m.papel = 'socio')
--     then 'OK criou ' || v_user_a::text
--     else 'FALHOU: ' || coalesce(v_r::text, 'null') end;
--
--   -- simula "conta preexistente SEM papel em portal nenhum": o login fica, o
--   -- vinculo com o GPS sai. E exatamente o caso que passava batido.
--   perform set_config('role', 'none', true);
--   delete from gps.acessos_log where user_id_alvo = v_user_a;
--   delete from gps.membros     where user_id      = v_user_a;
--
--   select encrypted_password, updated_at into v_hash_pre, v_upd_pre
--     from auth.users where id = v_user_a;
--   select count(*) into v_users_pre from auth.users;
--   select count(*) into v_memb_pre  from gps.membros;
--   select count(*) into v_log_pre   from gps.acessos_log;
--
--   perform set_config('role', 'authenticated', true);
--   perform set_config('request.jwt.claims',
--     json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
--
--   -- CASO B: e-mail EXISTENTE, SEM confirmacao => P0003 e ZERO escrita
--   begin
--     v_r := gps.admin_adicionar_socio(v_ambiente, v_socio, v_email, 'Prova#218bbb');
--     v_caso_b := 'FALHOU: nao levantou nada, devolveu ' || coalesce(v_r::text,'null');
--   exception when others then
--     get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
--     perform set_config('role', 'none', true);
--     select encrypted_password, updated_at into v_hash_pos, v_upd_pos
--       from auth.users where id = v_user_a;
--     select count(*) into v_users_pos from auth.users;
--     select count(*) into v_memb_pos  from gps.membros;
--     select count(*) into v_log_pos   from gps.acessos_log;
--     v_caso_b := format(
--       'sqlstate=%s msg=%L | senha_intacta=%s updated_at_intacto=%s | auth.users %s->%s gps.membros %s->%s gps.acessos_log %s->%s',
--       v_state, v_msg,
--       (v_hash_pos is not distinct from v_hash_pre),
--       (v_upd_pos  is not distinct from v_upd_pre),
--       v_users_pre, v_users_pos, v_memb_pre, v_memb_pos, v_log_pre, v_log_pos);
--     v_caso_b := case when v_state = 'P0003'
--                       and v_hash_pos is not distinct from v_hash_pre
--                       and v_upd_pos  is not distinct from v_upd_pre
--                       and v_users_pos = v_users_pre
--                       and v_memb_pos  = v_memb_pre
--                       and v_log_pos   = v_log_pre
--                      then 'OK ' || v_caso_b else 'FALHOU ' || v_caso_b end;
--   end;
--
--   -- CASO C: e-mail EXISTENTE, COM confirmacao => ADICIONA
--   perform set_config('role', 'authenticated', true);
--   perform set_config('request.jwt.claims',
--     json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
--   v_r := gps.admin_adicionar_socio(v_ambiente, v_socio, v_email, 'Prova#218ccc', true);
--   perform set_config('role', 'none', true);
--   select encrypted_password into v_hash_pos from auth.users where id = v_user_a;
--   v_caso_c := case
--     when (v_r->>'user_id')::uuid = v_user_a
--      and exists (select 1 from gps.membros m
--                   where m.user_id = v_user_a and m.aluno_id = v_ambiente and m.papel = 'socio')
--      and v_hash_pos is distinct from v_hash_pre
--     then 'OK reaproveitou o login e trocou a senha'
--     else 'FALHOU: ' || coalesce(v_r::text,'null') end;
--
--   -- CASO D: sem JWT => 42501
--   perform set_config('role', 'authenticated', true);
--   perform set_config('request.jwt.claims', '', true);
--   begin
--     perform gps.admin_adicionar_socio(v_ambiente, v_socio,
--               'prova.sem.jwt.218@exemplo.invalid', 'Prova#218ddd', true);
--     v_caso_d := 'FALHOU: passou sem JWT';
--   exception when others then
--     get stacked diagnostics v_state = returned_sqlstate;
--     v_caso_d := case when v_state = '42501' then 'OK 42501'
--                      else 'FALHOU sqlstate=' || v_state end;
--   end;
--
--   perform set_config('role', 'none', true);
--   raise exception E'PROVA ...218\n A (email novo, sem confirmar): %\n B (email existente, sem confirmar): %\n C (email existente, confirmando): %\n D (sem JWT): %',
--     v_caso_a, v_caso_b, v_caso_c, v_caso_d;
-- end $$;
--
-- ESPERADO: A = "OK criou <uuid>" · B = "OK sqlstate=P0003 ... senha_intacta=t
--   updated_at_intacto=t" com os TRES contadores iguais antes e depois ·
--   C = "OK reaproveitou o login e trocou a senha" · D = "OK 42501".
--
-- CONFERENCIA DE ASSINATURA (fora do rollback, so leitura). Tem de voltar UMA
-- linha — se voltarem duas, a sobrecarga velha sobreviveu e a chamada com 4
-- argumentos ainda troca senha sem confirmar:
--   select p.oid::regprocedure::text                          as assinatura,
--          has_function_privilege('anon',          p.oid, 'execute') as anon,
--          has_function_privilege('authenticated', p.oid, 'execute') as authenticated
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'gps' and p.proname = 'admin_adicionar_socio';
--   -- ESPERADO: 1 linha ·
--   --   gps.admin_adicionar_socio(uuid,uuid,text,text,boolean) · anon=f · authenticated=t
