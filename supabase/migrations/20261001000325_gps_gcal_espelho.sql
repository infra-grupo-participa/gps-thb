-- ═══════════════════════════════════════════════════════════════════════════
-- 325 — Espelho das sessões EP/RP na agenda Google IMPLEMENTAÇÃO (fatia 1)
-- ═══════════════════════════════════════════════════════════════════════════
-- O banco NÃO fala com o Google. Ele só:
--   1. marca "esta sessão precisa ser espelhada" (gps.gcal_espelho, pendente);
--   2. cutuca a edge `calendar-espelho` por pg_net (só ids no corpo — o
--      corpo fica gravado em net.http_request_queue, PII não entra lá);
--   3. entrega à edge, por RPC service_role, o payload e recebe o resultado.
-- A edge é quem cria/atualiza/apaga/adota o evento (outro agente).
--
-- 🔴 NASCE DESLIGADO: gcal_espelho_ativo = 'false'. Desligado, o trigger só
-- grava a pendência (barato) e não posta nada; o cron retorna na 1ª linha.
-- Ligar: update gps.config set valor='true' where chave='gcal_espelho_ativo';
-- ⚠️ Antes de ligar: (a) segredo no Vault com o nome `gps_gcal_espelho_segredo`
-- (igual ao env da edge), (b) gcal_calendar_id preenchido, (c) rodar
-- scripts/gcal-reconciliar.ts em ensaio — sem adoção prévia, cada evento que a
-- Aldri criou à mão pode virar duplicata.
--
-- ⚠️ As 4 chaves novas NÃO entram na allowlist de gps.config_definir nem em
-- INTERRUPTORES_CONFIG (src/lib/config-tipos.ts) — fora do escopo (TS/tela).
--
-- 🔴 TRIGGER: WHEN compara SÓ inicio_em, fim_em, estado, responsavel_id,
-- link_reuniao e tipo_id. O cron de e-mail carimba email_*_em/_req em
-- toda passada e o touch muda atualizado_em: nada disso pode acordar o
-- espelho. Sem `UPDATE OF <colunas>` de propósito: inicio_em/fim_em são
-- GERADAS e nunca aparecem no SET — `UPDATE OF inicio_em` jamais dispararia
-- numa remarcação de `data`. O WHEN de trigger AFTER enxerga o valor gerado.
--
-- DOWN (comentado — rodar à mão):
--   select cron.unschedule('gcal-espelho-varrer');
--   drop trigger if exists trg_gcal_espelho_sessao_ins on gps.sessao_agendamentos;
--   drop trigger if exists trg_gcal_espelho_sessao_upd on gps.sessao_agendamentos;
--   drop trigger if exists trg_gcal_espelho_sessao_del on gps.sessao_agendamentos;
--   drop function if exists gps.gcal_espelho_sessao_pendente();
--   drop function if exists gps.gcal_espelho_varrer();
--   drop function if exists gps.gcal_espelho_chamar(uuid);
--   drop function if exists gps.gcal_espelho_segredo();
--   drop function if exists gps.gcal_espelho_pendentes(uuid, int);
--   drop function if exists gps.gcal_espelho_marcar(text, uuid, timestamptz, boolean, text, text, text, text);
--   drop function if exists gps.gcal_espelho_adotar(uuid, text);
--   drop function if exists gps.gcal_espelho_agenda(timestamptz, timestamptz);
--   alter table gps.gcal_espelho rename to gcal_espelho_arquivo_<data>;  -- arquivar, não dropar
--   delete from gps.config where chave in
--     ('gcal_espelho_ativo','gcal_calendar_id','gcal_adotar_manual','gcal_espelho_url');
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '2s';

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Config
-- ═══════════════════════════════════════════════════════════════════════════
insert into gps.config (chave, valor) values
  ('gcal_espelho_ativo', 'false'),
  -- 🔴 BLOQUEIO: id da agenda IMPLEMENTAÇÃO não informado. Vazio = a edge
  -- não tem onde escrever (ela deve recusar vazio).
  ('gcal_calendar_id',   ''),
  ('gcal_adotar_manual', 'true'),
  ('gcal_espelho_url',   'https://mbvybujpkwuorhtdzcde.supabase.co/functions/v1/calendar-espelho')
on conflict (chave) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) Tabela
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists gps.gcal_espelho (
  id              bigserial primary key,
  origem          text not null,
  origem_id       uuid not null,             -- sem FK: a linha sobrevive ao DELETE da sessão (o evento precisa ser apagado)
  google_event_id text,
  assinatura      text,                      -- hash do payload espelhado; a edge decide se precisa PATCH
  modo            text,
  pendente_em     timestamptz,               -- not null = falta espelhar a versão atual
  tentativas      int not null default 0,
  proxima_em      timestamptz,
  erro            text,
  sincronizado_em timestamptz,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  constraint gcal_espelho_origem_unica unique (origem, origem_id),
  constraint chk_gcal_espelho_origem check (origem in ('sessao')),
  constraint chk_gcal_espelho_modo   check (modo is null or modo in ('criado', 'adotado', 'apagado_fora')),
  constraint chk_gcal_espelho_evento check (google_event_id is null
                                            or (char_length(google_event_id) between 1 and 1024
                                                and google_event_id !~ '\s')),
  constraint chk_gcal_espelho_erro   check (erro is null or char_length(erro) <= 500),
  constraint chk_gcal_espelho_tent   check (tentativas >= 0)
);

comment on table gps.gcal_espelho is
  'Estado do espelho de cada sessao (gps.sessao_agendamentos) na agenda Google IMPLEMENTACAO. Escrita SO pelo trigger e pelas RPCs service_role gcal_espelho_*. pendente_em not null = a versao atual ainda nao foi espelhada. RLS ligada, ZERO policy e nenhum grant: nem authenticated nem service_role leem direto.';

create index if not exists gcal_espelho_pendente_proxima
  on gps.gcal_espelho (proxima_em)
  where pendente_em is not null;

-- 🔴 Tabela nova em gps nasce com DML para authenticated (default privileges):
-- revoke nomeando PUBLIC, anon, authenticated e service_role. Só as funções
-- SECURITY DEFINER (owner) escrevem.
alter table gps.gcal_espelho enable row level security;
revoke all on table gps.gcal_espelho from public, anon, authenticated, service_role;
revoke all on sequence gps.gcal_espelho_id_seq from public, anon, authenticated, service_role;

drop trigger if exists trg_gcal_espelho_atualizado_em on gps.gcal_espelho;
create trigger trg_gcal_espelho_atualizado_em
  before update on gps.gcal_espelho
  for each row execute function gps.touch_atualizado_em();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) Segredo — porta única (Vault), molde de gps.resend_api_key (…272)
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function gps.gcal_espelho_segredo()
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select nullif(btrim(coalesce((
    select decrypted_secret from vault.decrypted_secrets
     where name = 'gps_gcal_espelho_segredo' limit 1), '')), '');
$function$;

revoke all on function gps.gcal_espelho_segredo() from public, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) Cutucar a edge (interno)
-- ═══════════════════════════════════════════════════════════════════════════
-- Devolve o request_id do pg_net, ou null quando desligado/sem segredo.
-- Corpo só com o id: nada de nome/e-mail em net.http_request_queue.
create or replace function gps.gcal_espelho_chamar(p_origem_id uuid default null)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_ativo   text;
  v_url     text;
  v_segredo text;
  v_req     bigint;
begin
  select valor into v_ativo from gps.config where chave = 'gcal_espelho_ativo';
  if coalesce(btrim(v_ativo), 'false') <> 'true' then
    return null;
  end if;

  select nullif(btrim(valor), '') into v_url from gps.config where chave = 'gcal_espelho_url';
  v_segredo := gps.gcal_espelho_segredo();
  if v_url is null or v_segredo is null then
    raise warning 'gcal_espelho: url ou segredo ausente; pendencia fica para o cron';
    return null;
  end if;

  select net.http_post(
    url     := v_url,
    body    := jsonb_build_object('origem', 'sessao', 'origem_id', p_origem_id),
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-espelho-segredo', v_segredo),
    timeout_milliseconds := 10000
  ) into v_req;

  return v_req;
end;
$function$;

revoke all on function gps.gcal_espelho_chamar(uuid) from public, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) Trigger em gps.sessao_agendamentos
-- ═══════════════════════════════════════════════════════════════════════════
-- SECURITY DEFINER: quem agenda é `authenticated`, que não tem grant na
-- tabela do espelho. 🔴 Nunca derruba a escrita da sessão: a cutucada está
-- em bloco exception (a pendência gravada é o que garante o espelho; o cron
-- cobre a cutucada perdida).
create or replace function gps.gcal_espelho_sessao_pendente()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
begin
  -- `if`, não `case` numa expressão só: a expressão referenciaria OLD num
  -- INSERT (e NEW num DELETE), que não estão atribuídos.
  if tg_op = 'DELETE' then
    v_id := old.id;
  else
    v_id := new.id;
  end if;

  insert into gps.gcal_espelho as e (origem, origem_id, pendente_em, proxima_em, tentativas)
  values ('sessao', v_id, now(), now(), 0)
  on conflict (origem, origem_id) do update
     set pendente_em = now(),
         proxima_em  = now(),
         tentativas  = 0,
         erro        = null;

  begin
    perform gps.gcal_espelho_chamar(v_id);
  exception when others then
    raise warning 'gcal_espelho: cutucada falhou (%); fica para o cron', sqlstate;
  end;

  return null;
end;
$function$;

revoke all on function gps.gcal_espelho_sessao_pendente() from public, anon, authenticated, service_role;

drop trigger if exists trg_gcal_espelho_sessao_ins on gps.sessao_agendamentos;
create trigger trg_gcal_espelho_sessao_ins
  after insert on gps.sessao_agendamentos
  for each row execute function gps.gcal_espelho_sessao_pendente();

drop trigger if exists trg_gcal_espelho_sessao_upd on gps.sessao_agendamentos;
create trigger trg_gcal_espelho_sessao_upd
  after update on gps.sessao_agendamentos
  for each row
  when ((old.inicio_em, old.fim_em, old.estado, old.responsavel_id, old.link_reuniao, old.tipo_id)
        is distinct from
        (new.inicio_em, new.fim_em, new.estado, new.responsavel_id, new.link_reuniao, new.tipo_id))
  execute function gps.gcal_espelho_sessao_pendente();

drop trigger if exists trg_gcal_espelho_sessao_del on gps.sessao_agendamentos;
create trigger trg_gcal_espelho_sessao_del
  after delete on gps.sessao_agendamentos
  for each row execute function gps.gcal_espelho_sessao_pendente();

-- Semente: sessões vivas futuras entram pendentes (desligado, nada sai).
-- Ao ligar, o cron/edge espelha todas — DEPOIS da adoção pelo script.
insert into gps.gcal_espelho (origem, origem_id, pendente_em, proxima_em)
select 'sessao', a.id, now(), now()
  from gps.sessao_agendamentos a
 where a.estado = 'agendado'
   and a.fim_em > now()
on conflict (origem, origem_id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6) Varredura (cron 1x/hora)
-- ═══════════════════════════════════════════════════════════════════════════
-- Uma cutucada por passada, só se houver vencido. A edge pede o lote por
-- gcal_espelho_pendentes. 24 passadas/dia, cada uma = 1 index scan vazio.
create or replace function gps.gcal_espelho_varrer()
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_ativo text;
  v_n     int;
begin
  select valor into v_ativo from gps.config where chave = 'gcal_espelho_ativo';
  if coalesce(btrim(v_ativo), 'false') <> 'true' then
    return 0;
  end if;

  select count(*) into v_n
    from (select 1 from gps.gcal_espelho
           where pendente_em is not null and proxima_em <= now()
           limit 100) x;

  if v_n > 0 then
    perform gps.gcal_espelho_chamar(null);
  end if;
  return v_n;
end;
$function$;

revoke all on function gps.gcal_espelho_varrer() from public, anon, authenticated, service_role;

commit;

select cron.schedule(
  'gcal-espelho-varrer',
  '17 * * * *',
  $cron$ select gps.gcal_espelho_varrer(); $cron$
);

begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7) RPCs da edge/script — SÓ service_role
-- ═══════════════════════════════════════════════════════════════════════════
grant usage on schema gps to service_role;

-- 7.1) Lote pendente com payload. `existe=false` = a sessão foi apagada:
-- a edge apaga o evento. Responsável por uuid (perfis/auth.users), nunca por
-- nome. Sem briefing, sem descricao_caso.
create or replace function gps.gcal_espelho_pendentes(
  p_origem_id uuid default null,
  p_limite    int  default 25
)
returns table (
  origem            text,
  origem_id         uuid,
  pendente_em       timestamptz,
  tentativas        int,
  google_event_id   text,
  assinatura        text,
  modo              text,
  existe            boolean,
  tipo_id           smallint,
  tipo_etapa        smallint,
  tipo_nome         text,
  estado            text,
  inicio_em         timestamptz,
  fim_em            timestamptz,
  link_reuniao      text,
  aluno_nome        text,
  cliente_nome      text,
  responsavel_email text,
  responsavel_nome  text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select e.origem, e.origem_id, e.pendente_em, e.tentativas, e.google_event_id,
         e.assinatura, e.modo,
         (a.id is not null),
         a.tipo_id, t.etapa_id, t.nome, a.estado, a.inicio_em, a.fim_em, a.link_reuniao,
         al.nome, c.nome,
         nullif(btrim(coalesce(p.email, u.email, '')), ''),
         p.nome
    from gps.gcal_espelho e
    left join gps.sessao_agendamentos a on a.id = e.origem_id
    left join gps.sessao_tipos      t  on t.id  = a.tipo_id
    left join gps.etapa1_clientes   c  on c.id  = a.cliente_id
    left join public.thb_alunos     al on al.id = a.aluno_id
    left join public.perfis         p  on p.id  = a.responsavel_id
    left join auth.users            u  on u.id  = a.responsavel_id
   where e.origem = 'sessao'
     and e.pendente_em is not null
     and (p_origem_id is null or e.origem_id = p_origem_id)
     and (p_origem_id is not null or e.proxima_em <= now())
   order by e.proxima_em
   limit least(greatest(coalesce(p_limite, 25), 1), 100);
$function$;

-- 7.2) Resultado. 🔴 Só limpa a pendência se ela ainda é a MESMA que a edge
-- leu (p_pendente_em): se a sessão mudou no meio, a nova versão continua
-- pendente e não se perde.
create or replace function gps.gcal_espelho_marcar(
  p_origem          text,
  p_origem_id       uuid,
  p_pendente_em     timestamptz,
  p_ok              boolean,
  p_google_event_id text default null,
  p_assinatura      text default null,
  p_modo            text default null,
  p_erro            text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_e gps.gcal_espelho%rowtype;
begin
  if p_origem is null or p_origem_id is null or p_ok is null then
    raise exception 'parametros obrigatorios ausentes' using errcode = '22023';
  end if;
  if p_modo is not null and p_modo not in ('criado', 'adotado', 'apagado_fora') then
    raise exception 'modo invalido' using errcode = '22023';
  end if;

  select * into v_e from gps.gcal_espelho
   where origem = p_origem and origem_id = p_origem_id
   for update;
  if not found then
    raise exception 'espelho nao encontrado' using errcode = 'P0002';
  end if;

  if p_ok then
    update gps.gcal_espelho
       set google_event_id = coalesce(p_google_event_id, google_event_id),
           assinatura      = p_assinatura,
           modo            = coalesce(p_modo, modo),
           erro            = null,
           tentativas      = 0,
           sincronizado_em = now(),
           pendente_em     = case when pendente_em is not distinct from p_pendente_em then null else pendente_em end,
           proxima_em      = case when pendente_em is not distinct from p_pendente_em then null else proxima_em end
     where id = v_e.id
    returning * into v_e;
  else
    -- Recuo: 5, 10, 20, 40 min ... teto 6h. Continua tentando (o erro fica visível).
    update gps.gcal_espelho
       set tentativas = tentativas + 1,
           erro       = left(coalesce(p_erro, 'erro sem mensagem'), 500),
           modo       = coalesce(p_modo, modo),
           google_event_id = coalesce(p_google_event_id, google_event_id),
           proxima_em = now() + least(interval '5 minutes' * power(2, least(tentativas, 10)),
                                      interval '6 hours')
     where id = v_e.id
    returning * into v_e;
  end if;

  return jsonb_build_object('ainda_pendente', v_e.pendente_em is not null,
                            'tentativas', v_e.tentativas,
                            'proxima_em', v_e.proxima_em);
end;
$function$;

-- 7.3) Adoção do evento manual (script de reconciliação / edge).
-- Recusa trocar um evento já vinculado por outro (exceto se o antigo foi
-- apagado fora). Deixa PENDENTE: a edge então grava gps_origem no evento
-- adotado, para ele não ser "achado" de novo como manual.
create or replace function gps.gcal_espelho_adotar(
  p_origem_id       uuid,
  p_google_event_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_e gps.gcal_espelho%rowtype;
begin
  if p_origem_id is null or nullif(btrim(coalesce(p_google_event_id, '')), '') is null then
    raise exception 'parametros obrigatorios ausentes' using errcode = '22023';
  end if;
  if not exists (select 1 from gps.sessao_agendamentos where id = p_origem_id) then
    raise exception 'sessao nao encontrada' using errcode = 'P0002';
  end if;

  select * into v_e from gps.gcal_espelho
   where origem = 'sessao' and origem_id = p_origem_id
   for update;

  if found and v_e.google_event_id is not null
     and v_e.google_event_id <> p_google_event_id
     and coalesce(v_e.modo, '') <> 'apagado_fora' then
    raise exception 'sessao ja vinculada a outro evento' using errcode = '23505';
  end if;

  insert into gps.gcal_espelho (origem, origem_id, google_event_id, modo, pendente_em, proxima_em)
  values ('sessao', p_origem_id, p_google_event_id, 'adotado', now(), now())
  on conflict (origem, origem_id) do update
     set google_event_id = excluded.google_event_id,
         modo            = 'adotado',
         assinatura      = null,
         pendente_em     = now(),
         proxima_em      = now(),
         tentativas      = 0,
         erro            = null;

  return jsonb_build_object('origem_id', p_origem_id, 'google_event_id', p_google_event_id, 'modo', 'adotado');
end;
$function$;

-- 7.4) Agenda viva numa janela (ensaio do script). Janela máx. 120 dias.
create or replace function gps.gcal_espelho_agenda(p_de timestamptz, p_ate timestamptz)
returns table (
  origem_id         uuid,
  tipo_etapa        smallint,
  tipo_nome         text,
  estado            text,
  inicio_em         timestamptz,
  fim_em            timestamptz,
  aluno_nome        text,
  cliente_nome      text,
  responsavel_email text,
  google_event_id   text,
  modo              text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_de is null or p_ate is null or p_ate <= p_de or p_ate - p_de > interval '120 days' then
    raise exception 'janela invalida (maximo 120 dias)' using errcode = '22023';
  end if;
  return query
  select a.id, t.etapa_id, t.nome, a.estado, a.inicio_em, a.fim_em,
         al.nome, c.nome,
         nullif(btrim(coalesce(p.email, u.email, '')), ''),
         e.google_event_id, e.modo
    from gps.sessao_agendamentos a
    join gps.sessao_tipos      t  on t.id  = a.tipo_id
    join gps.etapa1_clientes   c  on c.id  = a.cliente_id
    join public.thb_alunos     al on al.id = a.aluno_id
    left join public.perfis    p  on p.id  = a.responsavel_id
    left join auth.users       u  on u.id  = a.responsavel_id
    left join gps.gcal_espelho e  on e.origem = 'sessao' and e.origem_id = a.id
   where a.estado = 'agendado'
     and a.inicio_em >= p_de
     and a.inicio_em <  p_ate
   order by a.inicio_em;
end;
$function$;

-- 7.5) Config da edge — SÓ as 2 chaves do espelho.
-- 🔴 Medido em 01/10: has_table_privilege('service_role','gps.config','select')
-- = false → a edge lendo gps.config por REST daria 503 permanente ao ligar.
-- Não se dá grant na tabela: service_role tem BYPASSRLS e leria TODAS as
-- linhas de gps.config (e-mails da equipe, interruptores). Porta única com a
-- lista de chaves fixa, molde de gps.chamados_abertos(). Não liga nada:
-- só devolve o que está gravado (nasce 'false').
create or replace function gps.gcal_espelho_config()
returns table (chave text, valor text)
language sql
stable
security definer
set search_path = ''
as $function$
  select c.chave, c.valor
    from gps.config c
   where c.chave in ('gcal_calendar_id', 'gcal_espelho_ativo');
$function$;

comment on function gps.gcal_espelho_config() is
  'Leitura da config do espelho pela edge calendar-espelho (service_role). Devolve SO gcal_calendar_id e gcal_espelho_ativo; service_role nao tem grant em gps.config e nao deve ter (BYPASSRLS leria a tabela inteira).';

-- 🔴 Função nova nasce executável por PUBLIC/authenticated: revoke nomeando
-- PUBLIC (revoke de anon sozinho não pega) e grant SÓ a service_role.
revoke all on function gps.gcal_espelho_config() from public, anon, authenticated;
grant execute on function gps.gcal_espelho_config() to service_role;
revoke all on function gps.gcal_espelho_pendentes(uuid, int) from public, anon, authenticated;
revoke all on function gps.gcal_espelho_marcar(text, uuid, timestamptz, boolean, text, text, text, text) from public, anon, authenticated;
revoke all on function gps.gcal_espelho_adotar(uuid, text) from public, anon, authenticated;
revoke all on function gps.gcal_espelho_agenda(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function gps.gcal_espelho_pendentes(uuid, int) to service_role;
grant execute on function gps.gcal_espelho_marcar(text, uuid, timestamptz, boolean, text, text, text, text) to service_role;
grant execute on function gps.gcal_espelho_adotar(uuid, text) to service_role;
grant execute on function gps.gcal_espelho_agenda(timestamptz, timestamptz) to service_role;

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- 🔬 ROTEIRO DE PROVA — por MCP, cada bloco em begin … rollback
-- ═══════════════════════════════════════════════════════════════════════════
-- Pré: gcal_espelho_ativo = 'false' (nenhum net.http_post sai).
--
-- (A) update que DISPARA o trigger:
--   begin; set local lock_timeout='2s'; set local statement_timeout='20s';
--   explain (analyze, buffers)
--     update gps.sessao_agendamentos set link_reuniao = 'https://meet.google.com/xxx-prova'
--      where id = (select id from gps.sessao_agendamentos where estado='agendado' order by inicio_em desc limit 1);
--   -- esperado: linha "Trigger trg_gcal_espelho_sessao_upd: ... calls=1"
--   rollback;
--
-- (B) carimbo de e-mail que NÃO dispara:
--   begin; set local lock_timeout='2s'; set local statement_timeout='20s';
--   explain (analyze, buffers)
--     update gps.sessao_agendamentos set email_24h_dra_em = now()
--      where id = (select id from gps.sessao_agendamentos where estado='agendado' order by inicio_em desc limit 1);
--   -- esperado: NENHUMA linha "Trigger trg_gcal_espelho_sessao_upd"
--   rollback;
--
-- (C) varredura do cron (consulta interna, com o índice parcial):
--   begin; set local statement_timeout='20s';
--   explain (analyze, buffers)
--     select 1 from gps.gcal_espelho where pendente_em is not null and proxima_em <= now() limit 100;
--   -- esperado: Index Scan / Bitmap em gcal_espelho_pendente_proxima (ou Seq Scan
--   -- enquanto a tabela tiver poucas linhas — conferir Rows Removed by Filter)
--   rollback;
--
-- (D) superfície:
--   select p.proname, has_function_privilege('authenticated', p.oid, 'execute') as auth,
--          has_function_privilege('anon', p.oid, 'execute') as anon,
--          has_function_privilege('service_role', p.oid, 'execute') as srv
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'gps' and p.proname like 'gcal\_%' order by 1;
--   -- esperado: auth=false, anon=false em todas; srv=true só nas 5 RPCs da seção 7
--   --   (gcal_espelho_config incluída; has_table_privilege service_role em gps.config
--   --   continua false DE PROPÓSITO — a edge lê pela RPC)
--   select has_table_privilege('authenticated','gps.gcal_espelho','insert'),
--          has_table_privilege('authenticated','gps.gcal_espelho','select');  -- false, false
--
-- ── SAÍDA DO ENSAIO (01/10/2026, mbvybujpkwuorhtdzcde) ────────────────────
--   Corpo da migration num `do` que termina em raise (nada persistiu); em 2
--   partes porque o execute_sql não aceita os 27 KB de uma vez. Sem o
--   cron.schedule (tabela cron.job, sem efeito no plano).
--   (A) link_reuniao:   Index Scan sessao_agendamentos_pkey 0,022 ms
--                       Trigger trg_gcal_espelho_sessao_upd: time=0.938 calls=1
--                       Execution Time 4,442 ms
--   (B) email_24h_dra_em: NENHUMA linha trg_gcal_espelho_* (só atualizado_em
--                       e os checks de FK, que disparam porque a linha já foi
--                       alterada na mesma transação do ensaio — artefato)
--   (C) varredura do cron: Seq Scan em gcal_espelho, 4 linhas, 0,031 ms
--                       (tabela de 4 linhas; o índice parcial entra com volume)
--   backfill = 4 sessões futuras agendadas · net.http_request_queue = 0
--                       (desligado → nenhuma cutucada sai)
--   (D) gcal_espelho_{adotar,agenda,marcar,pendentes}: auth=false anon=false srv=true
--       gps.gcal_espelho: authenticated insert=false select=false; anon select=false
--   gcal_espelho_agenda(now, now+120 dias): 4 linhas em 49,264 ms
--       (uso só pelo script manual da reconciliação, 1 chamada por rodada)
