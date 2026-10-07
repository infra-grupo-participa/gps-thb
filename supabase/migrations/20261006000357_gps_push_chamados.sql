-- ═══════════════════════════════════════════════════════════════════════════
-- 357 — Avisos no computador (Web Push) para a EQUIPE quando o PARCEIRO grava
--       mensagem em chamado (abertura, resposta, reabertura)
-- ═══════════════════════════════════════════════════════════════════════════
-- Caminho: INSERT em gps.chamado_mensagens (autor_papel = 'aluno')
--   → gatilho trg_chamado_mensagens_push (AFTER INSERT, FOR EACH ROW)
--   → gps.push_chamar(mensagem_id) → net.http_post (pg_net, assíncrono)
--   → edge `push-enviar` (outro executor) → gps.push_preparar (service_role)
--   → envia a cada inscrição → gps.push_resultado (service_role) por endpoint.
--
-- pg_net grava o pedido numa fila (net.http_request_queue) que o worker só
-- enxerga DEPOIS do commit: mensagem desfeita = push nunca sai.
-- O gatilho NUNCA desfaz a mensagem: tudo dentro de begin … exception.
--
-- 🔴 NASCE DESLIGADO: push_chamados_ativo = 'false' (ausente = desligado).
-- Ligar (depois de: segredo no Vault `gps_push_segredo` = env da edge,
-- chaves VAPID na edge, push_vapid_publica preenchida, deploy da edge):
--   update gps.config set valor = 'true' where chave = 'push_chamados_ativo';
--
-- Payload SEM assunto do chamado (decisão: o assunto pode ter nome de cliente,
-- e a notificação aparece na tela bloqueada / central do sistema operacional).
--
-- push_vapid_publica: NÃO entra na allowlist de gps.config_definir (só o dono
-- do banco grava). Lida pelo servidor Next via gps.push_vapid_publica()
-- (admin). ⚠️ A policy gps_config_admin (…110) dá UPDATE direto em gps.config
-- a qualquer admin pelo PostgREST: a allowlist é a porta da TELA, não uma
-- cerca. Por isso push_chamar NÃO confia na URL da config: só posta para
-- https://mbvybujpkwuorhtdzcde.supabase.co/functions/v1/ (o header leva o
-- segredo do Vault; URL trocada por admin = segredo exfiltrado).
--
-- gps.config_definir recriada a partir do corpo VIVO mais recente no repo:
-- 20260924000310_gps_documento_inline_ativo.sql (16 chaves). A guarda da
-- seção 0 ABORTA se a função viva tiver chave que esta versão não conhece.
--
-- ── AS 5 PERGUNTAS ─────────────────────────────────────────────────────────
-- 1 Escala: inscrições = admins × navegadores (teto 10 por pessoa) → dezenas.
--   Mensagens de parceiro: dezenas/dia.
-- 2 Índice: push_inscricoes_endpoint_key (unique) para upsert/resultado;
--   push_inscricoes_ativas_idx (user_id) where revogada_em is null para o teto
--   e o preparar. perfis por PK (id). chamado_mensagens/chamados por PK.
-- 3 Frequência: gatilho 1×/mensagem de parceiro; desligado = 1 leitura por
--   PK em gps.config (21 linhas) e nada mais. Ligado = + 1 SELECT no Vault +
--   1 INSERT na fila do pg_net. Mensagem de equipe: o WHEN corta antes da
--   função (custo zero).
-- 4 Repetição: um push por mensagem; sem janela (o e-mail tem 30 min). O
--   service worker deve usar chamado_id como `tag` para colapsar.
-- 5 Reversão: interruptor = 'false' (o gatilho volta na 1ª linha; preparar
--   devolve null). Remoção total no bloco DOWN.
--
-- DOWN (comentado — rodar à mão; arquivar, nunca dropar tabela com dado):
--   update gps.config set valor = 'false' where chave = 'push_chamados_ativo';
--   drop trigger if exists trg_chamado_mensagens_push on gps.chamado_mensagens;
--   drop function if exists gps.chamado_mensagens_push_trg();
--   drop function if exists gps.push_chamar(uuid);
--   drop function if exists gps.push_segredo();
--   drop function if exists gps.push_ativo();
--   drop function if exists gps.push_preparar(uuid);
--   drop function if exists gps.push_resultado(text, int);
--   drop function if exists gps.push_inscrever(text, text, text, text);
--   drop function if exists gps.push_desinscrever(text);
--   drop function if exists gps.push_vapid_publica();
--   drop function if exists gps.gerador_minutas_ativo();
--   -- + reaplicar a seção 2 da …310 (allowlist de 16 chaves)
--   alter table gps.push_inscricoes rename to push_inscricoes_arquivo_<data>;
--   (linhas de gps.config ficam; são inertes sem as funções)
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- ═══════════════════════════════════════════════════════════════════════════
-- 0) Guarda: a config_definir VIVA não pode ter chave que esta versão perde
-- ═══════════════════════════════════════════════════════════════════════════
-- Extrai todo literal 'minusculas_com_underscore' do corpo vivo e subtrai o
-- que esta versão conhece. Sobrou algo = alguém mexeu fora do repo → aborta.
do $guarda$
declare
  v_def   text;
  v_resto text[];
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'gps' and p.proname = 'config_definir'
     and pg_get_function_identity_arguments(p.oid) = 'p_chave text, p_valor text';

  if v_def is null then
    raise exception '357: gps.config_definir(text, text) não existe — abortado.';
  end if;
  if position('documento_inline_ativo' in v_def) = 0 then
    raise exception '357: gps.config_definir viva não é a da …310 — abortado.';
  end if;

  select array_agg(distinct m[1]) into v_resto
    from regexp_matches(v_def, '''([a-z_]+)''', 'g') as m
   where m[1] not in (
     'chamados_aberto','chamados_categorias_ativo','convite_socio_ativo','entrada_codigo_ativa',
     'minuta_contexto_obrigatorio',
     'plantao_inscricao_aberta','resgate_ativo','slack_mencoes_ativo','socio_cadastro_obrigatorio',
     'troca_email_login_ativa','tutoriais_ativo','videos_ativo',
     'sessoes_email_ativo','sessoes_exige_disc','sessoes_exige_confirmacao',
     'documento_inline_ativo',
     'push_chamados_ativo','gerador_minutas_ativo',
     'true','false','interruptor_alterado');

  if v_resto is not null then
    raise exception '357: gps.config_definir viva tem literal desconhecido %, abortado (recrie a partir do corpo vivo).', v_resto;
  end if;

  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'gps' and p.proname = 'config_definir') <> 1 then
    raise exception '357: mais de uma gps.config_definir viva — abortado.';
  end if;
end;
$guarda$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Config
-- ═══════════════════════════════════════════════════════════════════════════
insert into gps.config (chave, valor) values
  ('push_chamados_ativo',   'false'),
  ('gerador_minutas_ativo', 'true'),
  ('push_vapid_publica',    ''),
  ('push_enviar_url',       'https://mbvybujpkwuorhtdzcde.supabase.co/functions/v1/push-enviar')
on conflict (chave) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) gps.push_inscricoes
-- ═══════════════════════════════════════════════════════════════════════════
create table gps.push_inscricoes (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  endpoint     text        not null
    constraint push_inscricoes_endpoint_key unique
    constraint push_inscricoes_endpoint_check
    -- Só os serviços de push dos navegadores (achado MÉDIO do kirad: a edge
    -- faz POST no endpoint — host livre = SSRF pela conta da edge). Mesma
    -- regex em gps.push_inscrever.
    check (char_length(endpoint) <= 1000
           and endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com|web\.push\.apple\.com)/[^[:space:][:cntrl:]]+$'),
  p256dh       text        not null
    constraint push_inscricoes_p256dh_check check (p256dh ~ '^[A-Za-z0-9_=+/-]{40,200}$'),
  auth         text        not null
    constraint push_inscricoes_auth_check check (auth ~ '^[A-Za-z0-9_=+/-]{16,64}$'),
  user_agent   text
    constraint push_inscricoes_user_agent_check
    check (user_agent is null or (char_length(user_agent) <= 500 and user_agent !~ '[[:cntrl:]]')),
  criado_em    timestamptz not null default now(),
  ultimo_ok_em timestamptz,
  falhas       int         not null default 0
    constraint push_inscricoes_falhas_check check (falhas between 0 and 1000),
  revogada_em  timestamptz
);

comment on table gps.push_inscricoes is
  'Inscricoes Web Push (PushSubscription) da EQUIPE (357). Sem policy e sem grant: so as funcoes SECURITY DEFINER leem/escrevem (push_inscrever/push_desinscrever para admin; push_preparar/push_resultado para service_role). endpoint e capacidade de envio: nunca sai para o navegador. revogada_em = desligada (pelo usuario, 404/410 do servico ou 5 falhas seguidas). Nunca apagar: arquivar.';

create index push_inscricoes_ativas_idx
  on gps.push_inscricoes (user_id)
  where revogada_em is null;

alter table gps.push_inscricoes enable row level security;
-- Sem policy de propósito. Tabela nova nasce gravável por authenticated
-- (default privileges do schema gps) e `revoke from anon` não pega o que vem
-- de PUBLIC: revoke explícito de todos, inclusive service_role (a edge só
-- passa pelas RPCs; BYPASSRLS leria os endpoints de todo mundo).
revoke all on table gps.push_inscricoes from public, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) Internas: interruptor e segredo
-- ═══════════════════════════════════════════════════════════════════════════
-- AUSENTE = DESLIGADO (libera feature nova; molde de gps.drive_ativo).
create or replace function gps.push_ativo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((select btrim(c.valor) = 'true'
                     from gps.config c
                    where c.chave = 'push_chamados_ativo'), false);
$function$;

revoke all on function gps.push_ativo() from public, anon, authenticated, service_role;

create or replace function gps.push_segredo()
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select nullif(btrim(coalesce((
    select decrypted_secret from vault.decrypted_secrets
     where name = 'gps_push_segredo' limit 1), '')), '');
$function$;

revoke all on function gps.push_segredo() from public, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) RPCs da equipe (authenticated + guarda de admin)
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function gps.push_inscrever(
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_user_agent text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_uid      uuid := auth.uid();
  v_endpoint text := btrim(coalesce(p_endpoint, ''));
  v_p256dh   text := btrim(coalesce(p_p256dh, ''));
  v_auth     text := btrim(coalesce(p_auth, ''));
  v_ua       text := nullif(left(btrim(regexp_replace(coalesce(p_user_agent, ''), '[[:cntrl:]]', ' ', 'g')), 500), '');
  v_ativas   int;
  v_n        int;
begin
  -- coalesce: guarda que devolve null falharia ABERTA.
  if v_uid is null or not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if char_length(v_endpoint) > 1000
     or v_endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com|web\.push\.apple\.com)/[^[:space:][:cntrl:]]+$' then
    raise exception 'Navegador não suportado para avisos.' using errcode = '22023';
  end if;
  if v_p256dh !~ '^[A-Za-z0-9_=+/-]{40,200}$' or v_auth !~ '^[A-Za-z0-9_=+/-]{16,64}$' then
    raise exception 'Inscrição de aviso inválida.' using errcode = '22023';
  end if;

  -- Serializa as inscrições da MESMA pessoa: dois cliques simultâneos não
  -- furam o teto.
  perform pg_advisory_xact_lock(hashtextextended('gps.push_inscrever:' || v_uid::text, 0));

  select count(*) into v_ativas
    from gps.push_inscricoes i
   where i.user_id = v_uid
     and i.revogada_em is null
     and i.endpoint <> v_endpoint;
  if v_ativas >= 10 then
    raise exception 'Você já tem avisos ligados em 10 navegadores. Desligue em um deles antes.' using errcode = '22023';
  end if;

  insert into gps.push_inscricoes (user_id, endpoint, p256dh, auth, user_agent)
  values (v_uid, v_endpoint, v_p256dh, v_auth, v_ua)
  on conflict (endpoint) do update
     set p256dh      = excluded.p256dh,
         auth        = excluded.auth,
         user_agent  = excluded.user_agent,
         revogada_em = null,
         falhas      = 0
   -- Nunca transfere a inscrição de OUTRA pessoa (achado BAIXO do kirad):
   -- dono diferente → o update não acontece (row_count 0) → 22023.
   where gps.push_inscricoes.user_id = excluded.user_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'Este navegador já está com avisos ligados para outra pessoa da equipe.' using errcode = '22023';
  end if;
end;
$function$;

revoke all on function gps.push_inscrever(text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function gps.push_inscrever(text, text, text, text) to authenticated;

comment on function gps.push_inscrever(text, text, text, text) is
  'Liga o aviso no computador para o admin logado (357). Endpoint so de servico de push conhecido (FCM, Mozilla, WNS, Apple) senao 22023 "Navegador nao suportado para avisos.". Upsert pelo endpoint SO do proprio dono (reativa: revogada_em/falhas zerados); endpoint de outra pessoa = 22023, nunca transfere. Teto de 10 ativas por pessoa (22023). Nao-admin: 42501.';

-- Devolve true se desligou; false se o endpoint não existe, já estava
-- desligado ou é de OUTRA pessoa (não revela qual dos três).
create or replace function gps.push_desinscrever(p_endpoint text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_n   int;
begin
  if v_uid is null or not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  update gps.push_inscricoes i
     set revogada_em = now()
   where i.endpoint = btrim(coalesce(p_endpoint, ''))
     and i.user_id = v_uid
     and i.revogada_em is null;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$function$;

revoke all on function gps.push_desinscrever(text) from public, anon, authenticated, service_role;
grant execute on function gps.push_desinscrever(text) to authenticated;

comment on function gps.push_desinscrever(text) is
  'Desliga o aviso deste navegador (357): marca revogada_em SO se a inscricao for do proprio usuario. Nao-admin: 42501.';

-- Chave pública VAPID, lida pelo SERVIDOR Next (não há env NEXT_PUBLIC).
-- Pública por natureza, mas só a equipe tem uso para ela.
create or replace function gps.push_vapid_publica()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  return (select nullif(btrim(c.valor), '') from gps.config c where c.chave = 'push_vapid_publica');
end;
$function$;

revoke all on function gps.push_vapid_publica() from public, anon, authenticated, service_role;
grant execute on function gps.push_vapid_publica() to authenticated;

comment on function gps.push_vapid_publica() is
  'Chave publica VAPID (gps.config.push_vapid_publica) para o servidor Next montar a inscricao (357). null = nao configurada. So admin (42501). A chave NAO esta na allowlist de gps.config_definir.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) RPCs da edge push-enviar (só service_role)
-- ═══════════════════════════════════════════════════════════════════════════
-- null = não enviar (desligado, mensagem inexistente ou de equipe).
-- inscricoes pode vir [] (nenhum admin com aviso ligado).
create or replace function gps.push_preparar(p_mensagem_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_chamado uuid;
  v_aluno   uuid;
  v_autor   uuid;
  v_nome    text;
  v_insc    jsonb;
begin
  if not gps.push_ativo() then
    return null;
  end if;

  select m.chamado_id, c.aluno_id, m.autor_id
    into v_chamado, v_aluno, v_autor
    from gps.chamado_mensagens m
    join gps.chamados c on c.id = m.chamado_id
   where m.id = p_mensagem_id
     and m.autor_papel = 'aluno';
  if v_chamado is null then
    return null;
  end if;

  -- Nome de quem escreveu (titular ou sócio, molde da …333); senão o do
  -- titular do ambiente; senão 'parceiro'.
  select nullif(btrim(t.nome), '') into v_nome
    from gps.membros mb
    join public.thb_alunos t
      on t.id = coalesce(mb.pessoa_aluno_id, case when mb.papel = 'titular' then mb.aluno_id end)
   where mb.user_id = v_autor and mb.aluno_id = v_aluno
   limit 1;
  if v_nome is null then
    select nullif(btrim(t.nome), '') into v_nome from public.thb_alunos t where t.id = v_aluno;
  end if;
  v_nome := coalesce(nullif(split_part(regexp_replace(coalesce(v_nome, ''), '[[:cntrl:]]', ' ', 'g'), ' ', 1), ''), 'parceiro');
  v_nome := left(v_nome, 60);

  -- Só inscrição viva de quem AINDA é admin ativo: mesma condição de
  -- public.gp_is_admin() (baseline), aplicada ao user_id da inscrição.
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', i.endpoint,
                                               'p256dh',   i.p256dh,
                                               'auth',     i.auth)
                            order by i.criado_em), '[]'::jsonb)
    into v_insc
    from gps.push_inscricoes i
    join public.perfis p on p.id = i.user_id
   where i.revogada_em is null
     and p.status = 'ativo'
     and p.cargo in ('dev', 'admin');

  return jsonb_build_object(
    'chamado_id', v_chamado,
    'titulo',     'Nova mensagem no chamado',
    'corpo',      'Chamado de ' || v_nome,
    'url',        '/admin/chamados/' || v_chamado::text,
    'inscricoes', v_insc
  );
end;
$function$;

revoke all on function gps.push_preparar(uuid) from public, anon, authenticated, service_role;
grant execute on function gps.push_preparar(uuid) to service_role;

comment on function gps.push_preparar(uuid) is
  'Edge push-enviar (service_role, 357). null se push_chamados_ativo <> true (ausente = desligado) ou a mensagem nao e de autor_papel aluno. Senao {chamado_id, titulo, corpo:"Chamado de <primeiro nome>", url:/admin/chamados/<id>, inscricoes:[{endpoint,p256dh,auth}]} so de inscricoes nao revogadas de admin ativo (perfis status ativo, cargo dev/admin). SEM assunto: pode conter nome de cliente.';

create or replace function gps.push_resultado(p_endpoint text, p_status int)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if p_endpoint is null or p_status is null then
    return;
  end if;

  if p_status between 200 and 299 then
    update gps.push_inscricoes
       set ultimo_ok_em = now(), falhas = 0
     where endpoint = p_endpoint;
  elsif p_status in (404, 410) then
    update gps.push_inscricoes
       set revogada_em = now()
     where endpoint = p_endpoint and revogada_em is null;
  else
    update gps.push_inscricoes
       set falhas      = least(falhas + 1, 1000),
           revogada_em = case when falhas + 1 >= 5 then now() else revogada_em end
     where endpoint = p_endpoint and revogada_em is null;
  end if;
end;
$function$;

revoke all on function gps.push_resultado(text, int) from public, anon, authenticated, service_role;
grant execute on function gps.push_resultado(text, int) to service_role;

comment on function gps.push_resultado(text, int) is
  'Edge push-enviar (service_role, 357): status HTTP do servico de push por endpoint. 2xx: ultimo_ok_em=now, falhas=0. 404/410: revogada. Outro (inclusive 0 = erro de rede): falhas+1; na 5a seguida, revogada.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 6) Cutucada (molde de gps.drive_chamar, …347) — nunca lança
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function gps.push_chamar(p_mensagem_id uuid)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_url     text;
  v_segredo text;
  v_req     bigint;
begin
  if not gps.push_ativo() then
    return null;
  end if;

  select nullif(btrim(valor), '') into v_url from gps.config where chave = 'push_enviar_url';
  -- A URL leva o segredo no header: só o domínio de functions do projeto.
  if v_url is null
     or v_url !~ '^https://mbvybujpkwuorhtdzcde\.supabase\.co/functions/v1/[a-z0-9-]+$' then
    raise warning 'push: push_enviar_url ausente ou fora do projeto; aviso não enviado';
    return null;
  end if;

  v_segredo := gps.push_segredo();
  if v_segredo is null then
    raise warning 'push: segredo gps_push_segredo ausente no Vault; aviso não enviado';
    return null;
  end if;

  select net.http_post(
    url     := v_url,
    body    := jsonb_build_object('mensagem_id', p_mensagem_id),
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-push-segredo', v_segredo),
    timeout_milliseconds := 10000
  ) into v_req;

  return v_req;
exception when others then
  raise warning 'push: falha ao enfileirar (%): %', sqlstate, sqlerrm;
  return null;
end;
$function$;

revoke all on function gps.push_chamar(uuid) from public, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7) Gatilho em gps.chamado_mensagens
-- ═══════════════════════════════════════════════════════════════════════════
-- volatile (chama pg_net, que grava). Erro de qualquer tipo vira warning:
-- a mensagem do parceiro nunca é desfeita por causa do aviso.
create or replace function gps.chamado_mensagens_push_trg()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  begin
    if gps.push_ativo() then
      perform gps.push_chamar(new.id);
    end if;
  exception when others then
    raise warning 'push: gatilho falhou (%): %', sqlstate, sqlerrm;
  end;
  return null;
end;
$function$;

revoke all on function gps.chamado_mensagens_push_trg() from public, anon, authenticated, service_role;

create trigger trg_chamado_mensagens_push
  after insert on gps.chamado_mensagens
  for each row
  when (new.autor_papel = 'aluno')
  execute function gps.chamado_mensagens_push_trg();

-- ═══════════════════════════════════════════════════════════════════════════
-- 8) gps.gerador_minutas_ativo() — molde de gps.ajuda_ativo (…342)
-- ═══════════════════════════════════════════════════════════════════════════
-- AUSENTE = LIGADO (freio de mão de feature viva), como ajuda_ativo.
create or replace function gps.gerador_minutas_ativo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
           (select c.valor from gps.config c where c.chave = 'gerador_minutas_ativo'),
           'true'
         ) <> 'false';
$function$;

revoke all on function gps.gerador_minutas_ativo() from public, anon, authenticated, service_role;
grant execute on function gps.gerador_minutas_ativo() to authenticated;

comment on function gps.gerador_minutas_ativo() is
  'Interruptor do gerador de minutas: AUSENTE ou "true" = ligado; so "false" desliga. SECURITY DEFINER porque o parceiro nao le gps.config (policy so-admin). Molde de gps.ajuda_ativo. Na allowlist de gps.config_definir (357).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 9) gps.config_definir — allowlist 16 → 18
-- ═══════════════════════════════════════════════════════════════════════════
-- Corpo da …310 (o mais recente no repo; a guarda da seção 0 conferiu que o
-- vivo não tem chave a mais). Mesma assinatura (text, text): substitui e
-- preserva o ACL; revoke/grant reaplicados iguais aos da …260.
-- push_vapid_publica e push_enviar_url FORA de propósito.
create or replace function gps.config_definir(p_chave text, p_valor text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode='42501'; end if;
  if p_chave is null or p_chave not in (
    'chamados_aberto','chamados_categorias_ativo','convite_socio_ativo','entrada_codigo_ativa',
    'minuta_contexto_obrigatorio',
    'plantao_inscricao_aberta','resgate_ativo','slack_mencoes_ativo','socio_cadastro_obrigatorio',
    'troca_email_login_ativa','tutoriais_ativo','videos_ativo',
    -- Agenda de Sessões (…293 e …294). Desligar `sessoes_email_ativo` é o
    -- freio de mão do disparo por cron; as outras duas relaxam exigências
    -- de fluxo sem deploy.
    'sessoes_email_ativo','sessoes_exige_disc','sessoes_exige_confirmacao',
    -- Pré-visualização INLINE de documento na ficha do cliente (…310). Lido
    -- por `gps.documento_inline_ativo()`. AUSENTE = LIGADO: desligar faz a
    -- equipe voltar a só BAIXAR o documento; a leitura continua existindo.
    'documento_inline_ativo',
    -- Avisos no computador (…357). AUSENTE = DESLIGADO.
    'push_chamados_ativo',
    -- Gerador de minutas (…357). AUSENTE = LIGADO.
    'gerador_minutas_ativo'
  ) then raise exception 'Este interruptor não existe.' using errcode='22023'; end if;
  if p_valor not in ('true','false') then
    raise exception 'Este interruptor só aceita ligado ou desligado.' using errcode='22023'; end if;
  insert into gps.config (chave, valor, atualizado_por)
  values (p_chave, p_valor, auth.uid())
  on conflict (chave) do update set valor=excluded.valor, atualizado_por=excluded.atualizado_por;
  insert into gps.acessos_log (acao, aluno_id, detalhe, feito_por)
  values ('interruptor_alterado', null,
    format('interruptor "%s" definido para %s', p_chave, p_valor), auth.uid());
end; $function$;

revoke all on function gps.config_definir(text, text) from public, anon;
grant execute on function gps.config_definir(text, text) to authenticated;

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROTEIRO DE PROVA — Marcio roda e cola o resultado. Tudo que escreve: dentro
-- de begin … rollback. JWT simulado por
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<uid>","role":"authenticated"}';
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── P1. ACL: nada para PUBLIC/anon; preparar/resultado só service_role ──
--   select p.proname, p.prosecdef, p.proconfig, p.proacl::text
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'gps'
--      and p.proname in ('push_inscrever','push_desinscrever','push_preparar','push_resultado',
--                        'push_chamar','push_ativo','push_segredo','push_vapid_publica',
--                        'chamado_mensagens_push_trg','gerador_minutas_ativo','config_definir')
--    order by 1;
--   -- esperado: prosecdef t, proconfig {search_path=""}; nenhuma entrada '=X/'
--   select p.proname, a::text from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace, lateral unnest(p.proacl) a
--    where n.nspname='gps' and p.proname like 'push\_%' and (a::text like '=%' or a::text like 'anon=%');
--   -- esperado: 0 linhas
--   select has_function_privilege('anon','gps.push_inscrever(text,text,text,text)','EXECUTE'),        -- f
--          has_function_privilege('authenticated','gps.push_preparar(uuid)','EXECUTE'),               -- f
--          has_function_privilege('authenticated','gps.push_resultado(text,int)','EXECUTE'),          -- f
--          has_function_privilege('service_role','gps.push_preparar(uuid)','EXECUTE'),                -- t
--          has_function_privilege('authenticated','gps.push_chamar(uuid)','EXECUTE'),                 -- f
--          has_table_privilege('authenticated','gps.push_inscricoes','INSERT'),                       -- f
--          has_table_privilege('service_role','gps.push_inscricoes','SELECT');                        -- f
--
-- ── P2. Parceiro chama push_inscrever → 42501 ──
--   begin;
--     set local role authenticated;
--     set local request.jwt.claims = '{"sub":"<uid de PARCEIRO>","role":"authenticated"}';
--     select gps.push_inscrever('https://fcm.googleapis.com/fcm/send/x', repeat('A',87), repeat('B',22), 'ua');
--     -- esperado: ERROR 42501 "Sem permissão."
--   rollback;
--
-- ── P3. anon sem execute ──
--   begin; set local role anon;
--     select gps.push_inscrever('https://x', 'a', 'b', null);
--     -- esperado: ERROR 42501 permission denied for function push_inscrever
--   rollback;
--
-- ── P4. push_preparar como authenticated → permission denied ──
--   begin; set local role authenticated;
--     set local request.jwt.claims = '{"sub":"<uid de ADMIN>","role":"authenticated"}';
--     select gps.push_preparar(gen_random_uuid());
--     -- esperado: ERROR 42501 permission denied for function push_preparar
--   rollback;
--
-- ── P5. Admin inscreve, teto 10, desinscreve (rollback) ──
--   begin; set local role authenticated;
--     set local request.jwt.claims = '{"sub":"<uid de ADMIN>","role":"authenticated"}';
--     select gps.push_inscrever('https://fcm.googleapis.com/fcm/send/p' || g, repeat('A',87), repeat('B',22), 'ua')
--       from generate_series(1,10) g;                                 -- 10 ok
--     select gps.push_inscrever('https://fcm.googleapis.com/fcm/send/p1', repeat('C',87), repeat('B',22), 'ua'); -- ok (mesmo endpoint)
--     select gps.push_inscrever('https://fcm.googleapis.com/fcm/send/p11', repeat('A',87), repeat('B',22), 'ua'); -- ERROR 22023
--     select gps.push_inscrever('http://inseguro', repeat('A',87), repeat('B',22), null);                  -- ERROR 22023
--     select gps.push_desinscrever('https://fcm.googleapis.com/fcm/send/p1');   -- t
--     select gps.push_desinscrever('https://fcm.googleapis.com/fcm/send/p1');   -- f
--   rollback;
--
-- ── P5b. Allowlist de host (admin, rollback) — todas ERROR 22023
--         "Navegador não suportado para avisos." ──
--   begin; set local role authenticated;
--     set local request.jwt.claims = '{"sub":"<uid de ADMIN>","role":"authenticated"}';
--     select gps.push_inscrever('https://evil.example/x', repeat('A',87), repeat('B',22), null);
--     select gps.push_inscrever('https://fcm.googleapis.com.evil.example/x', repeat('A',87), repeat('B',22), null);
--     select gps.push_inscrever('https://fcm.googleapis.com@evil.example/x', repeat('A',87), repeat('B',22), null);
--     select gps.push_inscrever('https://evil.example/.notify.windows.com/x', repeat('A',87), repeat('B',22), null);
--     select gps.push_inscrever('https://169.254.169.254/latest', repeat('A',87), repeat('B',22), null);
--     -- aceitas (uma por transação, ou com savepoint):
--     select gps.push_inscrever('https://wns2-par02p.notify.windows.com/w/?token=x', repeat('A',87), repeat('B',22), null); -- ok
--     select gps.push_inscrever('https://web.push.apple.com/abc', repeat('A',87), repeat('B',22), null);                   -- ok
--     select gps.push_inscrever('https://updates.push.services.mozilla.com/wpush/v2/x', repeat('A',87), repeat('B',22), null); -- ok
--   rollback;
--   -- e o CHECK da tabela (como postgres, fura a RPC):
--   begin;
--     insert into gps.push_inscricoes (user_id, endpoint, p256dh, auth)
--     values ('<uid admin>', 'https://evil.example/x', repeat('A',87), repeat('B',22));
--     -- esperado: ERROR 23514 push_inscricoes_endpoint_check
--   rollback;
--
-- ── P5c. Sequestro: 2º admin com o MESMO endpoint → erro, dono intacto ──
--   begin; set local role authenticated;
--     set local request.jwt.claims = '{"sub":"<uid ADMIN A>","role":"authenticated"}';
--     select gps.push_inscrever('https://fcm.googleapis.com/fcm/send/seq', repeat('A',87), repeat('B',22), 'A');  -- ok
--     set local request.jwt.claims = '{"sub":"<uid ADMIN B>","role":"authenticated"}';
--     select gps.push_inscrever('https://fcm.googleapis.com/fcm/send/seq', repeat('C',87), repeat('D',22), 'B');
--     -- esperado: ERROR 22023 "Este navegador já está com avisos ligados para outra pessoa da equipe."
--   rollback;
--   -- sem o rollback no meio, conferir como postgres (em outra transação revertida):
--   --   select user_id, p256dh like 'A%' from gps.push_inscricoes where endpoint like '%/seq';
--   --   esperado: user_id = A, p256dh do A (o erro desfaz o comando de B inteiro)
--
-- ── P6. Mensagem de EQUIPE não dispara; de parceiro dispara (rollback) ──
--   begin;
--     update gps.config set valor = 'true' where chave = 'push_chamados_ativo';
--     select count(*) as antes from net.http_request_queue;
--     insert into gps.chamado_mensagens (chamado_id, autor_id, autor_papel, texto)
--       values ('<chamado>', '<uid admin>', 'equipe', 'prova equipe');
--     select count(*) as depois_equipe from net.http_request_queue;   -- = antes
--     insert into gps.chamado_mensagens (chamado_id, autor_id, autor_papel, texto)
--       values ('<chamado>', '<uid parceiro>', 'aluno', 'prova aluno')
--       returning id \gset
--     select count(*) as depois_aluno from net.http_request_queue;    -- = antes + 1 (se Vault tem o segredo)
--     select gps.push_preparar(:'id');   -- jsonb com corpo 'Chamado de <nome>', sem assunto
--   rollback;   -- a fila do pg_net também volta: nada é enviado
--
-- ── P7. Desligado: preparar null, gatilho não enfileira ──
--   select gps.push_ativo();   -- f (valor 'false' desta migração)
--
-- ── P8. config_definir: chaves novas aceitas, VAPID recusada (admin, rollback) ──
--   begin; set local role authenticated;
--     set local request.jwt.claims = '{"sub":"<uid de ADMIN>","role":"authenticated"}';
--     select gps.config_definir('gerador_minutas_ativo','false');  -- ok
--     select gps.gerador_minutas_ativo();                          -- f
--     select gps.config_definir('push_vapid_publica','true');      -- ERROR 22023
--   rollback;
-- ═══════════════════════════════════════════════════════════════════════════
