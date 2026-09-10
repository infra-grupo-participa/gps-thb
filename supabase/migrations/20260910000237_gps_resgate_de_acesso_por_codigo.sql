-- Resgate de acesso — "não consigo entrar" sem depender de e-mail nem de operador.
--
-- Pedido do Marcio (10/09/2026): *"se elas digitarem 1 a 8 (12345678), elas
-- podem redefinir sua senha... ele será avisado no grupo"*.
--
-- ═══════════════════════════════════════════════════════════════════════
-- 🔑 O CÓDIGO NÃO É SENHA. É UM CONVITE.
-- ═══════════════════════════════════════════════════════════════════════
--
-- O código anunciado no grupo NÃO entra em `auth.users` e NÃO abre o
-- sistema. Ele só diz "existe um caminho de resgate" e leva a pessoa à
-- tela de criar a própria senha. Quem confirma que é ela são o **e-mail**
-- e o **CPF**.
--
-- 🔴 POR QUE O CPF É OBRIGATÓRIO (e não só o e-mail)
--
-- O código vai ser anunciado no grupo — ou seja, é público entre os
-- alunos, por desenho. Se digitar o código bastasse, qualquer aluno
-- trocaria a senha de um colega sabendo só o e-mail dele, e derrubaria o
-- dono. Pior: `auth.users` é COMPARTILHADO pelos 7 sistemas do grupo, então
-- a senha trocada aqui vale no Workbook, na Rede e na Central também.
--
-- O CPF é a segunda prova, e é a mesma que o sistema já usa para vincular
-- login desde sempre (o gatilho `on_auth_user_created_gps`).
--
-- ⚠️ NÃO é autenticação forte, e não se pretende. É a mesma classe de
--    prova do "e-mail + data de nascimento" de qualquer suporte. O que ela
--    impede é o caso REAL: o colega de grupo que tem o código e o e-mail.
--
-- ═══════════════════════════════════════════════════════════════════════
-- 🔑 NORMALIZAÇÃO DO DOCUMENTO — `lpad(dígitos, 14, '0')`
-- ═══════════════════════════════════════════════════════════════════════
--
-- MEDIDO nos 137 titulares em 10/09/2026:
--
--   11 dígitos (CPF ok)          119
--   14 dígitos (CNPJ ok)           5
--   10 dígitos (zero perdido)      9
--    9 dígitos (zero perdido)      1
--    0 dígitos (vazio de verdade)  3
--
-- Os 10 com 9/10 dígitos são CPF que PERDEU O ZERO À ESQUERDA na
-- importação. Comparar cru deixaria essas 10 pessoas de fora sem erro
-- nenhum — elas digitariam o CPF certo e o sistema diria "não confere".
--
-- `lpad(dígitos, 14, '0')` é EXATAMENTE a normalização que
-- `gps.aluno_por_documento` e o gatilho de vínculo já usam. Reusar a mesma
-- regra é o que faz o resgate casar com quem o sistema já reconhece.
--
-- Resultado: **134 dos 137 se resolvem sozinhos.** Os 3 sem documento
-- caem no operador ("Gerenciar acesso" → Definir senha agora), que é o
-- caminho que já existe.
--
-- ═══════════════════════════════════════════════════════════════════════
-- 🔴 O RESGATE CRIA O LOGIN QUANDO NÃO EXISTE
-- ═══════════════════════════════════════════════════════════════════════
--
-- Pedido do Marcio: *"independente se ele tem senha ou não... ele vai poder
-- mudar a senha e acessar o sistema sozinho"*.
--
-- MEDIDO nos 137 titulares em 10/09/2026:
--
--   já entraram alguma vez                114
--   têm login e NUNCA entraram              4
--   🔴 NÃO têm login nenhum                19
--
-- Os 19 são exatamente quem mais vai tentar usar o código — nunca
-- conseguiram entrar. Um resgate que só troca senha de conta existente
-- diria "não confere" para eles, que é a pior resposta possível: a pessoa
-- tem direito ao acesso, digitou tudo certo, e ouve que não confere.
--
-- Por isso `resgate_concluir` CRIA o `auth.users` + `auth.identities`
-- quando não há, no mesmo molde de `gps.admin_adicionar_socio` (`…219`), e
-- grava `gps.membros.user_id`. O direito ao acesso já está provado: a
-- pessoa é titular de um ambiente do GPS e acertou e-mail + CPF.
--
-- ⚠️ O e-mail do login novo vem de `public.thb_alunos`, NUNCA do que a
--    pessoa digitou — senão o resgate viraria caminho para criar conta com
--    e-mail de terceiro.
--
-- ═══════════════════════════════════════════════════════════════════════
-- 🔴 AS TRÊS TRAVAS (sem elas isto vira porta escancarada)
-- ═══════════════════════════════════════════════════════════════════════
--
-- 1. NUNCA devolve senha. A função devolve um TOKEN de uso único, com 15
--    minutos de validade, que só serve para a tela de criar senha. Quem
--    escolhe a senha é a pessoa, não o sistema.
--
-- 2. RECUSA CONTA DA EQUIPE (`gps.admin_alvo_e_equipe`). Sem isso, o
--    código do grupo seria o caminho para trocar a senha de um admin —
--    escalada de privilégio pela porta da frente.
--
-- 3. RATE LIMIT por IP: 5 tentativas a cada 15 minutos, no molde de
--    `plantao_inscrever`. Sem ele o CPF (11 dígitos) seria adivinhável em
--    lote para um e-mail conhecido.
--
-- 🔑 A RECUSA É SEMPRE GENÉRICA. "Não confere" para código errado, e-mail
--    inexistente, CPF errado e conta de equipe — a MESMA frase. Mensagens
--    distintas deixariam descobrir quem tem cadastro e quem é da equipe
--    testando e-mails.
--
-- REVERSÃO (desliga sem deploy, é o caminho preferido):
--   update gps.config set valor = 'false' where chave = 'resgate_ativo';
-- Reversão total:
--   drop function gps.resgate_iniciar(text,text,text,text);
--   drop function gps.resgate_concluir(text,text);
--   drop table gps.resgate_tentativas;
--   delete from gps.config where chave in ('resgate_ativo','resgate_codigo');

-- ═════════════════════════════════════════════════════════════════════════
-- 1. Configuração — o código vive em gps.config, trocável sem deploy
-- ═════════════════════════════════════════════════════════════════════════

insert into gps.config (chave, valor)
values ('resgate_ativo', 'false'),      -- nasce DESLIGADO: liga quando o grupo for avisado
       ('resgate_codigo', '12345678')
on conflict (chave) do nothing;

comment on table gps.config is
  'Unica tabela de configuracao do GPS. Chaves de resgate: resgate_ativo (interruptor sem deploy) e resgate_codigo (o codigo anunciado no grupo; trocar aqui invalida o antigo na hora).';

-- ═════════════════════════════════════════════════════════════════════════
-- 2. Tentativas — rate limit e trilha
-- ═════════════════════════════════════════════════════════════════════════

create table if not exists gps.resgate_tentativas (
  id uuid primary key default gen_random_uuid(),
  ip_hash text,
  email_tentado text,
  sucesso boolean not null default false,
  -- Token de uso único. Só existe entre o `iniciar` e o `concluir`.
  token text,
  token_expira_em timestamptz,
  token_usado_em timestamptz,
  user_id uuid,
  -- O ambiente. Guardado porque `user_id` pode ser null na emissão (pessoa
  -- sem login): é por ele que o `concluir` sabe de quem criar a conta.
  aluno_id uuid,
  criado_em timestamptz not null default now()
);

-- O rate limit consulta por (ip_hash, criado_em) e a validação do token por
-- (token). Sem estes dois, cada tentativa varreria a tabela inteira — que
-- cresce sem teto, porque é append-only por natureza.
create index if not exists resgate_tentativas_ip_idx
  on gps.resgate_tentativas (ip_hash, criado_em desc) where ip_hash is not null;
create index if not exists resgate_tentativas_token_idx
  on gps.resgate_tentativas (token) where token is not null;

alter table gps.resgate_tentativas enable row level security;

-- Só admin lê. `anon` e `authenticated` NÃO têm grant nenhum: toda escrita
-- e leitura passa pelas duas RPCs `security definer`. Mesmo antídoto do
-- incidente CNHF, onde o GRANT passou antes do RLS.
create policy resgate_tentativas_admin_le on gps.resgate_tentativas
  for select using ((select public.gp_is_admin()));

revoke all on gps.resgate_tentativas from public, anon, authenticated;
grant select on gps.resgate_tentativas to authenticated;

comment on table gps.resgate_tentativas is
  'Trilha do resgate de acesso: rate limit por IP e token de uso unico. Append-only; so admin le. Nenhuma senha passa por aqui.';

-- ═════════════════════════════════════════════════════════════════════════
-- 3. resgate_iniciar — confere codigo + email + CPF, devolve TOKEN
-- ═════════════════════════════════════════════════════════════════════════

create or replace function gps.resgate_iniciar(
  p_codigo text, p_email text, p_documento text, p_ip_hash text default null
) returns jsonb
language plpgsql security definer set search_path to ''
as $function$
declare
  v_ativo text; v_codigo text; v_user uuid; v_aluno uuid; v_doc text; v_token text;
  v_tentativas integer;
begin
  -- Interruptor de emergência. Falha FECHADO: chave ausente = desligado.
  select valor into v_ativo from gps.config where chave = 'resgate_ativo';
  if coalesce(v_ativo, 'false') <> 'true' then
    raise exception 'Este caminho está indisponível no momento.' using errcode = '22023';
  end if;

  -- Rate limit ANTES de qualquer consulta a pessoa. IP ausente cai num
  -- balde comum ('sem-ip') em vez de escapar do limite.
  select count(*) into v_tentativas from gps.resgate_tentativas
   where ip_hash = coalesce(p_ip_hash, 'sem-ip')
     and criado_em > now() - interval '15 minutes';
  if v_tentativas >= 5 then
    raise exception 'Muitas tentativas. Aguarde 15 minutos e tente de novo.' using errcode = '22023';
  end if;

  insert into gps.resgate_tentativas (ip_hash, email_tentado)
  values (coalesce(p_ip_hash, 'sem-ip'), lower(btrim(coalesce(p_email, ''))));

  select valor into v_codigo from gps.config where chave = 'resgate_codigo';

  -- 🔑 A MESMA normalização de `gps.aluno_por_documento` e do gatilho de
  -- vínculo: reconstrói o zero à esquerda perdido na importação (10 dos
  -- 137 titulares em 10/09). Sem ela, essas pessoas digitariam o CPF certo
  -- e ouviriam "não confere".
  v_doc := lpad(regexp_replace(coalesce(p_documento, ''), '\D', '', 'g'), 14, '0');

  -- Documento vazio nunca casa: sem isto, os 3 titulares sem documento
  -- seriam alcançáveis por qualquer um que soubesse o e-mail deles.
  if v_doc = '00000000000000' then
    raise exception 'Não confere. Confira o código, o e-mail e o CPF.' using errcode = '22023';
  end if;

  -- 🔑 `left join` em `auth.users`: quem NÃO tem login também casa aqui (são
  -- 19 dos 137). O e-mail é conferido contra o do LOGIN quando existe, e
  -- contra o do CADASTRO quando não — os dois batem hoje nos 137 (medido:
  -- 0 divergências), e o cadastro é a única fonte para quem não tem conta.
  select m.user_id, m.aluno_id into v_user, v_aluno
    from gps.membros m
    join public.thb_alunos a on a.id = m.aluno_id
    left join auth.users u on u.id = m.user_id
   where coalesce(v_codigo, '') <> ''
     and p_codigo = v_codigo
     and lower(btrim(coalesce(u.email, a.email))) = lower(btrim(coalesce(p_email, '')))
     and lpad(regexp_replace(coalesce(a.documento, ''), '\D', '', 'g'), 14, '0') = v_doc
   limit 1;

  -- 🔴 RECUSA GENÉRICA. Código errado, e-mail inexistente, CPF errado e
  -- conta da equipe dão a MESMA frase — senão dá para descobrir quem tem
  -- cadastro e quem é admin testando e-mails com o código do grupo.
  -- `v_aluno is null` = não casou ninguém. `v_user` PODE ser null
  -- legitimamente (a pessoa não tem login ainda) — por isso a guarda é
  -- sobre o ambiente, e a de equipe só corre quando há conta.
  if v_aluno is null or (v_user is not null and gps.admin_alvo_e_equipe(v_user)) then
    raise exception 'Não confere. Confira o código, o e-mail e o CPF.' using errcode = '22023';
  end if;

  -- Token de uso único, 15 minutos. Nunca uma senha: quem escolhe a senha
  -- é a pessoa, na tela seguinte.
  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into gps.resgate_tentativas (ip_hash, email_tentado, sucesso, token, token_expira_em, user_id, aluno_id)
  values (coalesce(p_ip_hash, 'sem-ip'), lower(btrim(p_email)), true, v_token,
          now() + interval '15 minutes', v_user, v_aluno);

  return jsonb_build_object('token', v_token);
end;
$function$;

revoke all on function gps.resgate_iniciar(text, text, text, text) from public;
grant execute on function gps.resgate_iniciar(text, text, text, text) to anon, authenticated;

comment on function gps.resgate_iniciar(text, text, text, text) is
  'Resgate de acesso: confere codigo do grupo + email + CPF e devolve token de uso unico (15 min). NUNCA devolve senha. Recusa generica de proposito. Rate limit 5/15min por IP.';

-- ═════════════════════════════════════════════════════════════════════════
-- 4. resgate_concluir — troca o token pela senha que a PESSOA escolheu
-- ═════════════════════════════════════════════════════════════════════════

create or replace function gps.resgate_concluir(p_token text, p_senha text)
returns jsonb
language plpgsql security definer set search_path to ''
as $function$
declare v_id uuid; v_user uuid; v_aluno uuid; v_email text;
begin
  if p_senha is null or length(trim(p_senha)) < 8 then
    raise exception 'A senha precisa ter ao menos 8 caracteres.' using errcode = '22023';
  end if;

  -- `for update` fecha a corrida: dois cliques simultâneos no mesmo token
  -- não podem trocar a senha duas vezes.
  select t.id, t.user_id, t.aluno_id into v_id, v_user, v_aluno
    from gps.resgate_tentativas t
   where t.token = p_token
     and t.token_usado_em is null
     and t.token_expira_em > now()
   for update;

  if v_id is null then
    raise exception 'Este link expirou. Recomece o resgate.' using errcode = '22023';
  end if;

  -- Reconferido no momento do uso, não só na emissão: entre o `iniciar` e o
  -- `concluir` a pessoa pode ter virado admin.
  if v_user is not null and gps.admin_alvo_e_equipe(v_user) then
    raise exception 'Este link expirou. Recomece o resgate.' using errcode = '22023';
  end if;

  -- ═══════════════════════════════════════════════════════════════════
  -- Sem login (19 dos 137 titulares em 10/09): CRIA a conta.
  -- ═══════════════════════════════════════════════════════════════════
  if v_user is null then
    -- 🔴 O e-mail vem do CADASTRO, nunca do que a pessoa digitou. Confiar
    -- no digitado faria do resgate um caminho para criar conta com e-mail
    -- de terceiro — e o `iniciar` já conferiu que os dois batem.
    select a.email into v_email
      from gps.membros m join public.thb_alunos a on a.id = m.aluno_id
     where m.aluno_id = v_aluno and m.papel = 'titular' limit 1;

    if coalesce(btrim(v_email), '') = '' then
      raise exception 'Este link expirou. Recomece o resgate.' using errcode = '22023';
    end if;

    -- Corrida: entre o `iniciar` e o `concluir` alguém pode ter criado a
    -- conta (o operador pelo painel, ou a própria pessoa em /cadastro).
    -- Se já existe, ADOTA em vez de estourar com 23505.
    select id into v_user from auth.users where lower(btrim(email)) = lower(btrim(v_email)) limit 1;

    if v_user is null then
      v_user := gen_random_uuid();
      -- Molde de `gps.admin_adicionar_socio` (`…219`) — o mesmo que o
      -- sistema já usa para nascer login. `auth.identities` junto: sem ela
      -- o GoTrue não reconhece o provider e o login falha.
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
        jsonb_build_object('origem', 'gps_resgate',
                           'documento', (select documento from public.thb_alunos where id = v_aluno)),
        '', '', '', ''
      );
      insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (v_user::text, v_user,
              jsonb_build_object('sub', v_user::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
              'email', now(), now(), now());
    end if;

    -- ⚠️ `on conflict (user_id)`: o gatilho `on_auth_user_created_gps` roda
    -- DENTRO do insert acima e já pode ter gravado um `gps.membros` para
    -- este user_id (foi o que quebrou "adicionar sócio" até a `…219`).
    update gps.membros set user_id = v_user
     where aluno_id = v_aluno and papel = 'titular' and user_id is null;

    update gps.resgate_tentativas set user_id = v_user where id = v_id;

    delete from auth.refresh_tokens where user_id = v_user::text;
    delete from auth.sessions where user_id = v_user;
    update gps.resgate_tentativas set token_usado_em = now(), token = null where id = v_id;
    return jsonb_build_object('email', v_email, 'login_criado', true);
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         -- 🔑 SEM `gps_senha_temp_em`. A senha foi escolhida pela PRÓPRIA
         -- pessoa — obrigá-la a trocar de novo no passo 0 do onboarding
         -- seria pedir duas senhas seguidas pelo mesmo motivo.
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - 'gps_senha_temp_em',
         recovery_token = '', recovery_sent_at = null,
         updated_at = now()
   where id = v_user
   returning email into v_email;

  -- Derruba as sessões antigas: se alguém entrou indevidamente antes, o
  -- resgate expulsa essa sessão junto.
  delete from auth.refresh_tokens where user_id = v_user::text;
  delete from auth.sessions where user_id = v_user;

  update gps.resgate_tentativas set token_usado_em = now(), token = null where id = v_id;

  return jsonb_build_object('email', v_email, 'login_criado', false);
end;
$function$;

revoke all on function gps.resgate_concluir(text, text) from public;
grant execute on function gps.resgate_concluir(text, text) to anon, authenticated;

comment on function gps.resgate_concluir(text, text) is
  'Resgate de acesso: troca o token de uso unico pela senha que a pessoa escolheu. Derruba sessoes antigas. Limpa gps_senha_temp_em (a senha e propria, nao temporaria).';
