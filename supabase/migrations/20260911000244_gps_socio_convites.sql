-- Equipe — autosserviço de convite de sócio (feature "Equipe", 11/09/2026).
--
-- O QUE MUDA (decisões do Marcio em docs/audits/2026-09-11-socios/decisoes.md)
--   Hoje só o admin adiciona sócio (`gps.admin_adicionar_socio`, ...212/.../.220).
--   Esta migração INVERTE QUEM CONVIDA: o TITULAR logado gera um link por
--   e-mail (decisão #3), o convidado cria a PRÓPRIA senha (decisão #5: se já
--   tem login no grupo, NUNCA adota — instrui a entrar com a senha atual).
--   Teto de 1 convite por ambiente (decisão #8), validade de 7 dias com
--   reenvio pelo titular (decisão #7). NÃO redesenha gps.membros — o sócio
--   continua entrando por `gps.membros (papel='socio')`, no mesmo molde do
--   admin_adicionar_socio.
--
-- POR QUE UMA TABELA NOVA (gps.socio_convites) EM VEZ DE REIVINDICAR A RPC DO
-- ADMIN
--   `admin_adicionar_socio` define a senha NA HORA, porque é o admin que
--   digita. Aqui a senha só existe quando o convidado a escolhe, dias depois
--   — precisa de estado intermediário (token, prazo, e-mail-alvo) que a RPC
--   do admin não tem onde guardar. Reaproveita os MESMOS moldes de risco
--   (…219 conflito por user_id, resgate_iniciar token+rate limit).
--
-- 🔴 NÃO EXISTE TETO DE SÓCIOS HOJE (conferido pelo Marcio: `membros_um_titular
-- _por_ambiente` é parcial `where papel='titular'`; sócio escapa). O teto de 1
-- é NOVO e nasce só AQUI, na RPC de criar convite (contagem sobre
-- gps.membros + gps.socio_convites pendente) — não é CHECK/índice em
-- gps.membros, que continuaria aceitando 2 sócios se alguém inserisse direto.
-- Os 12 ambientes com sócio hoje têm exatamente 1 cada → o teto não quebra
-- ninguém (medido).
--
-- 🔑 NORMALIZAÇÃO DE E-MAIL = lower(trim(email)), a MESMA expressão do índice
-- `thb_alunos_email_uidx`. NUNCA lower(btrim()) invertido — foi essa inversão
-- que travou produção em 19/08 (índice não bate, Seq Scan). `trim(x)` em
-- Postgres já é `trim(both from x)`; a coluna abaixo usa a forma longa só
-- para deixar a equivalência impossível de reler errado.
--
-- 🔴 O BLOQUEIO DO p_ip_hash FORJÁVEL (pendência D3 do ClickUp, registrada no
-- CLAUDE.md para as RPCs públicas do Plantão) — DECISÃO PARA ESTA FEATURE:
--   `socio_convite_aceitar` é pública (`anon`) e recebe `p_ip_hash` do
--   cliente, que qualquer chamada direta ao PostgREST pode forjar. Em vez de
--   inventar uma env nova só para esta RPC (o que criaria um 2º padrão de
--   proteção incompatível com o resto do sistema), este código adota o MESMO
--   compromisso já em produção em `gps.resgate_iniciar`/`resgate_concluir`
--   (rate limit por IP informado, balde comum 'sem-ip' quando ausente) e
--   soma três mitigações que já existem por desenho e não dependem do IP:
--     1. o TOKEN é gen_random_bytes(32) em hex (32 bytes = espaço de busca
--        inviável por força bruta, independente de quantas tentativas o IP
--        aguenta);
--     2. o teto de 1 convite PENDENTE por ambiente (índice parcial abaixo)
--        limita a NO MÁXIMO 1 token válido por ambiente a qualquer momento —
--        não há "lista de tokens" para varrer;
--     3. a recusa é sempre GENÉRICA (mesma frase para token errado, expirado,
--        e-mail divergente e conta de equipe) — quem forja o IP não aprende
--        nada testando, só descobre se acertou tudo de uma vez.
--   Resolver a pendência D3 de verdade (segredo do servidor) é dívida GERAL
--   do sistema, compartilhada com as 3 RPCs do Plantão — não é escopo desta
--   migração corrigi-la só aqui, criando um padrão divergente. Reportado ao
--   Marcio para decisão de prioridade.
--
-- REVERSÃO
--   update gps.config set valor = 'false' where chave = 'convite_socio_ativo';
--   -- (desliga sem deploy; é o caminho preferido)
--   -- Reversão total:
--   drop function if exists gps.socio_convite_aceitar(text, text, text, text);
--   drop function if exists gps.socio_convite_do_ambiente();
--   drop function if exists gps.socio_convite_revogar(uuid);
--   drop function if exists gps.socio_convite_criar(text, text);
--   drop table if exists gps.socio_convites;
--   delete from gps.config where chave = 'convite_socio_ativo';
--   -- o CHECK de acessos_log.acao NÃO reverte sozinho: ver bloco 2 abaixo.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. gps.socio_convites
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists gps.socio_convites (
  id                    uuid primary key default gen_random_uuid(),
  ambiente_aluno_id     uuid not null
                          references public.thb_alunos(id) on delete cascade,
  convidado_por_user_id uuid not null
                          references auth.users(id) on delete cascade,
  -- Normalizado com A MESMA expressão do índice de thb_alunos — nunca
  -- lower(btrim()) invertido (incidente de 19/08).
  email_alvo            text not null,
  token_hash            text not null,
  expira_em             timestamptz not null,
  status                text not null default 'pendente'
                          check (status in ('pendente', 'aceito', 'revogado')),
  aceito_por_user_id    uuid references auth.users(id) on delete set null,
  criado_em             timestamptz not null default now(),
  aceito_em             timestamptz,
  ip_hash               text
);

comment on table gps.socio_convites is
  'Convite de socio por autosservico do titular (feature Equipe, 11/09/2026). Token so existe em claro na resposta de socio_convite_criar -- aqui so o hash (sha256). Teto de 1 convite PENDENTE por ambiente via indice parcial; teto de ssocios (1 por ambiente) e regra de RPC, nao desta tabela. RLS ligada, ZERO grant a anon/authenticated -- toda leitura e escrita e por RPC SECURITY DEFINER (antidoto ao incidente CNHF, onde o GRANT passou antes do RLS).';
comment on column gps.socio_convites.email_alvo is
  'Normalizado com lower(trim(email)) -- a mesma expressao do indice thb_alunos_email_uidx. Nunca lower(btrim()), a ordem invertida nao usa o indice (travou producao em 19/08).';
comment on column gps.socio_convites.token_hash is
  'sha256 do token em claro (extensions.digest). O token em claro so existe na resposta de socio_convite_criar (vai no e-mail) -- nunca gravado aqui.';

-- Teto de 1 convite ABERTO por ambiente: é o índice, não um `if exists`
-- na RPC sozinho — dois cliques simultâneos do mesmo titular não criam 2
-- convites (a RPC confere ANTES, o índice é a rede contra a corrida).
create unique index if not exists socio_convites_um_pendente_por_ambiente
  on gps.socio_convites (ambiente_aluno_id) where status = 'pendente';

-- Busca do token em socio_convite_aceitar é sempre por token_hash igual.
create unique index if not exists socio_convites_token_hash_uk
  on gps.socio_convites (token_hash);

-- socio_convite_criar recusa e-mail com convite pendente já aberto para ele
-- (mesmo alvo, ambientes diferentes) sem varrer a tabela inteira.
create index if not exists socio_convites_email_pendente_idx
  on gps.socio_convites (email_alvo) where status = 'pendente';

alter table gps.socio_convites enable row level security;

-- RLS ligada por padrão do projeto (toda tabela gps_/gps.* tem RLS), mas SEM
-- policy nenhuma: não há `for select`/`for insert` — o resultado é "nega
-- tudo" via PostgREST, e a leitura/escrita real acontece pelas RPCs abaixo
-- (SECURITY DEFINER, que ignoram RLS). Isso é intencional; não falta policy.

-- 🔴 anon e authenticated SEM GRANT NENHUM. RLS liga por padrão, mas o
-- incidente CNHF foi o GRANT passando ANTES do RLS — aqui nem GRANT existe.
revoke all on gps.socio_convites from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- gps.socio_convite_tentativas — rate limit de socio_convite_aceitar, molde
-- EXATO de gps.resgate_tentativas (…237). Tabela dedicada, não o log de
-- auditoria: gps.acessos_log é texto livre sem índice para "quantas
-- tentativas este IP fez nos últimos 15 min" e não deve virar um contador.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists gps.socio_convite_tentativas (
  id         uuid primary key default gen_random_uuid(),
  ip_hash    text not null,
  sucesso    boolean not null default false,
  criado_em  timestamptz not null default now()
);

-- O rate limit consulta por (ip_hash, criado_em) — sem este índice, cada
-- tentativa varreria a tabela inteira, que cresce sem teto por natureza
-- (append-only).
create index if not exists socio_convite_tentativas_ip_idx
  on gps.socio_convite_tentativas (ip_hash, criado_em desc);

alter table gps.socio_convite_tentativas enable row level security;

create policy socio_convite_tentativas_admin_le on gps.socio_convite_tentativas
  for select using ((select public.gp_is_admin()));

revoke all on gps.socio_convite_tentativas from public, anon, authenticated;
-- 🔴 SEM grant nenhum (corrigido na revisão, 11/09/2026). A versão original
-- dava `select` a `authenticated`, contradizendo o próprio comentário da
-- tabela ("só admin lê"). A RLS já barraria, mas grant que ninguém usa é
-- superfície de ataque de graça: quem lê o balde de rate limit aprende
-- quantas tentativas faltam para o bloqueio. O admin lê pelas RPCs.

comment on table gps.socio_convite_tentativas is
  'Rate limit de gps.socio_convite_aceitar: 5 tentativas/15min por IP informado (ver BLOQUEIO no cabecalho da migracao sobre p_ip_hash forjavel). Append-only; so admin le. Nenhuma senha nem token passa por aqui.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. CHECK de gps.acessos_log.acao — some socio_convidado/aceito/revogado
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O CHECK é fechado (15 valores hoje: 5 do baseline + 7 da Central ...150 +
-- 3 da mega feature ...200). As RPCs abaixo gravam AÇÃO NOVA no MESMO log, e
-- o insert do log é o ÚLTIMO passo de cada uma — sem isto a transação
-- inteira reverte DEPOIS de já ter feito o trabalho (é o modo de falha que
-- deixou admin_adotar_login_existente quebrada por 15 dias). Acha o CHECK
-- pelo CONTEÚDO ('acessos_criados_em_lote', o último valor que a ...200
-- acrescentou), nunca pelo NOME — mesma técnica das ...092/...150/...200.

do $$
declare v_nome text;
begin
  select con.conname
    into v_nome
    from pg_constraint con
    join pg_class     c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'gps'
     and c.relname = 'acessos_log'
     and con.contype = 'c'
     and pg_get_constraintdef(con.oid) like '%acessos_criados_em_lote%';

  if v_nome is null then
    raise exception
      'CHECK de gps.acessos_log.acao nao encontrado (procurado pelo CONTEUDO acessos_criados_em_lote, da migracao ...200) -- migracao abortada para nao deixar as RPCs de convite de socio gravando uma acao que a constraint rejeita';
  end if;

  execute format('alter table gps.acessos_log drop constraint %I', v_nome);
end;
$$;

-- Lista COMPLETA: os 15 valores vigentes, na mesma ordem, + os 3 novos desta
-- feature.
alter table gps.acessos_log
  add constraint acessos_log_acao_check check (acao = any (array[
    'senha_definida',
    'acesso_excluido',
    'socio_adicionado',
    'membro_excluido',
    'ambiente_ambiguo',
    -- ── Central de resolução (09/09/2026, migrações ...152 a ...157) ──
    'etapa_liberacao_alterada',
    'progresso_reaberto',
    'membro_pessoa_vinculada',
    'titular_trocado',
    'membro_movido',
    'financeiro_vinculado',
    'financeiro_desvinculado',
    -- ── Mega feature: onboarding e trava do favorito (10/09/2026) ──
    'favorito_confirmado',
    'favorito_liberado',
    'acessos_criados_em_lote',
    -- ── Equipe: autosserviço de convite de sócio (11/09/2026) ──
    'socio_convidado',            -- gps.socio_convite_criar
    'socio_convite_aceito',       -- gps.socio_convite_aceitar
    'socio_convite_revogado'      -- gps.socio_convite_revogar
  ]));

comment on constraint acessos_log_acao_check on gps.acessos_log is
  'Catalogo fechado das acoes administrativas auditadas. Espelha ROTULO_ACAO_ADMIN em src/components/admin/diario-labels.ts. Os 5 primeiros sao do baseline; 7 entraram com a Central (...150); 3 com a mega feature (...200); 3 com a feature Equipe (...244): socio_convidado (socio_convite_criar), socio_convite_aceito (socio_convite_aceitar) e socio_convite_revogado (socio_convite_revogar).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. gps.config.convite_socio_ativo — nasce 'false' (decisão #6: um titular
--    de teste primeiro, depois abre sem deploy)
-- ═══════════════════════════════════════════════════════════════════════════

insert into gps.config (chave, valor)
values ('convite_socio_ativo', 'false')
on conflict (chave) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. gps.socio_convite_criar — o TITULAR logado convida
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function gps.socio_convite_criar(p_email text, p_ip_hash text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_ativo         text;
  v_email         text := lower(trim(p_email));
  v_ambiente      uuid;
  v_email_titular text;
  v_tentativas    integer;
  v_token         text;
  v_id            uuid;
  v_expira        timestamptz := now() + interval '7 days';
begin
  -- 1) Interruptor de emergência. FALHA FECHADO: chave ausente/false recusa.
  select valor into v_ativo from gps.config where chave = 'convite_socio_ativo';
  if coalesce(v_ativo, 'false') <> 'true' then
    raise exception 'Este recurso ainda não está disponível.' using errcode = '22023';
  end if;

  if v_email is null or v_email = '' then
    raise exception 'Informe o e-mail do sócio.' using errcode = '22023';
  end if;

  -- 2) Quem chama é TITULAR de um ambiente, resolvido por auth.uid() — NUNCA
  -- um aluno_id vindo do cliente (a única fonte de "de quem é este convite"
  -- é a sessão de quem chama).
  select m.aluno_id, a.email
    into v_ambiente, v_email_titular
    from gps.membros m
    join public.thb_alunos a on a.id = m.aluno_id
   where m.user_id = auth.uid() and m.papel = 'titular'
   limit 1;

  if v_ambiente is null then
    raise exception 'Só o titular do ambiente pode convidar um sócio.' using errcode = '42501';
  end if;

  -- 3) Teto de 1: já tem sócio OU já tem convite pendente não expirado.
  if exists (select 1 from gps.membros where aluno_id = v_ambiente and papel = 'socio') then
    raise exception 'Este ambiente já tem um sócio.' using errcode = '23505';
  end if;
  if exists (select 1 from gps.socio_convites
              where ambiente_aluno_id = v_ambiente
                and status = 'pendente'
                and expira_em > now()) then
    raise exception 'Já existe um convite em aberto para este ambiente.' using errcode = '23505';
  end if;

  -- 4) Recusa o e-mail do próprio titular (molde da …220: 22023, zero
  -- escrita).
  if v_email = lower(trim(coalesce(v_email_titular, ''))) then
    raise exception 'Este e-mail é o seu — o sócio precisa de um e-mail próprio.' using errcode = '22023';
  end if;

  -- 5) Recusa conta de equipe: quem já tem login de equipe com este e-mail
  -- não pode ser convidado.
  if exists (
    select 1 from auth.users u
     where lower(trim(u.email)) = v_email and u.deleted_at is null
       and gps.admin_alvo_e_equipe(u.id)
  ) then
    raise exception 'Este e-mail é da equipe — não pode virar sócio de um ambiente.' using errcode = '42501';
  end if;

  -- 6) Rate limit: 3 convites/24h por ambiente (não por IP — quem convida já
  -- está autenticado como titular, o limite é sobre o RECURSO, não sobre a
  -- origem da chamada).
  select count(*) into v_tentativas
    from gps.socio_convites
   where ambiente_aluno_id = v_ambiente
     and criado_em > now() - interval '24 hours';
  if v_tentativas >= 3 then
    raise exception 'Muitos convites enviados nas últimas 24 horas. Tente novamente mais tarde.' using errcode = '22023';
  end if;

  -- Token de uso único: 32 bytes aleatórios em hex. Só o HASH é gravado; o
  -- claro é devolvido UMA vez (vai no e-mail).
  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into gps.socio_convites
    (ambiente_aluno_id, convidado_por_user_id, email_alvo, token_hash, expira_em, ip_hash)
  values
    (v_ambiente, auth.uid(), v_email,
     encode(extensions.digest(v_token, 'sha256'), 'hex'), v_expira, p_ip_hash)
  returning id into v_id;

  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, detalhe, feito_por)
  values ('socio_convidado', v_ambiente, null, v_email,
          'convite ' || v_id::text || ' expira em ' || v_expira::text, auth.uid());

  return jsonb_build_object('id', v_id, 'token', v_token, 'email', v_email, 'expira_em', v_expira);
end;
$function$;

revoke execute on function gps.socio_convite_criar(text, text) from public, anon;
grant  execute on function gps.socio_convite_criar(text, text) to authenticated;

comment on function gps.socio_convite_criar(text, text) is
  'Titular logado (auth.uid()) convida um socio por e-mail. Falha fechado por gps.config.convite_socio_ativo. Teto de 1 socio/1 convite pendente por ambiente, recusa o proprio e-mail do titular e conta de equipe, rate limit 3/24h por ambiente. Devolve o TOKEN EM CLARO uma unica vez (vai no e-mail) -- so o hash sha256 fica gravado.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. gps.socio_convite_revogar — titular do ambiente OU admin
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function gps.socio_convite_revogar(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_convite record;
begin
  select * into v_convite from gps.socio_convites where id = p_id;
  if not found then
    raise exception 'Convite não encontrado.' using errcode = 'P0002';
  end if;

  if not (
    public.gp_is_admin()
    or exists (
      select 1 from gps.membros
       where aluno_id = v_convite.ambiente_aluno_id
         and user_id = auth.uid()
         and papel = 'titular'
    )
  ) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if v_convite.status <> 'pendente' then
    raise exception 'Este convite já não está mais pendente.' using errcode = '22023';
  end if;

  update gps.socio_convites set status = 'revogado' where id = p_id;

  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, detalhe, feito_por)
  values ('socio_convite_revogado', v_convite.ambiente_aluno_id, null, v_convite.email_alvo,
          'convite ' || p_id::text, auth.uid());

  return jsonb_build_object('id', p_id, 'status', 'revogado');
end;
$function$;

revoke execute on function gps.socio_convite_revogar(uuid) from public, anon;
grant  execute on function gps.socio_convite_revogar(uuid) to authenticated;

comment on function gps.socio_convite_revogar(uuid) is
  'Revoga um convite PENDENTE. So o titular do ambiente ou admin. Idempotente na intencao: convite ja aceito/revogado recusa com 22023 (nada a fazer).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. gps.socio_convite_do_ambiente — leitura para a aba Equipe
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function gps.socio_convite_do_ambiente()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare v_ambiente uuid; v_convite record;
begin
  select aluno_id into v_ambiente from gps.membros where user_id = auth.uid() limit 1;
  if v_ambiente is null then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  select id, email_alvo, status, criado_em, expira_em
    into v_convite
    from gps.socio_convites
   where ambiente_aluno_id = v_ambiente and status = 'pendente'
   order by criado_em desc
   limit 1;

  if not found then
    return null;
  end if;

  -- Sem token_hash de propósito: é leitura de tela, nunca precisa do hash.
  return jsonb_build_object(
    'id', v_convite.id,
    'email_alvo', v_convite.email_alvo,
    'status', v_convite.status,
    'criado_em', v_convite.criado_em,
    'expira_em', v_convite.expira_em,
    'expirado', v_convite.expira_em <= now()
  );
end;
$function$;

revoke execute on function gps.socio_convite_do_ambiente() from public, anon;
grant  execute on function gps.socio_convite_do_ambiente() to authenticated;

comment on function gps.socio_convite_do_ambiente() is
  'Le o convite PENDENTE mais recente do ambiente de quem chama (qualquer membro, titular ou socio). Nunca devolve token_hash. Usado pela aba Equipe.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. gps.socio_convite_aceitar — PÚBLICA (anon), quem aceita ainda não
--    tem sessão
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function gps.socio_convite_aceitar(p_token text, p_email text, p_senha text, p_ip_hash text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_email        text := lower(trim(p_email));
  v_ip           text := coalesce(p_ip_hash, 'sem-ip');
  v_convite      record;
  v_tentativas   integer;
  v_tentativa_id uuid;
  v_user         uuid;
  v_amb_trigger  uuid;
  v_pessoa_gatilho uuid;
  v_pessoa       uuid;
begin
  if p_senha is null or length(trim(p_senha)) < 8 then
    raise exception 'A senha precisa ter ao menos 8 caracteres.' using errcode = '22023';
  end if;

  -- Rate limit por IP informado — mesmo compromisso de gps.resgate_iniciar
  -- (ver cabeçalho da migração: p_ip_hash é forjável, mitigado por token de
  -- 32 bytes + teto de 1 pendente por ambiente + recusa sempre genérica).
  -- Tabela DEDICADA (gps.socio_convite_tentativas), não o log de auditoria.
  select count(*) into v_tentativas
    from gps.socio_convite_tentativas
   where ip_hash = v_ip
     and criado_em > now() - interval '15 minutes';
  if v_tentativas >= 5 then
    raise exception 'Muitas tentativas. Aguarde 15 minutos e tente de novo.' using errcode = '22023';
  end if;

  insert into gps.socio_convite_tentativas (ip_hash) values (v_ip) returning id into v_tentativa_id;

  select * into v_convite
    from gps.socio_convites
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
   for update;

  -- 🔑 RECUSA GENÉRICA: token inválido, expirado, já usado, e-mail diferente
  -- do email_alvo e conta de equipe dão a MESMA frase — anti-enumeração,
  -- molde de gps.resgate_iniciar.
  if not found
     or v_convite.status <> 'pendente'
     or v_convite.expira_em <= now()
     or v_convite.email_alvo <> v_email
     or exists (
          select 1 from auth.users u
           where lower(trim(u.email)) = v_email and u.deleted_at is null
             and gps.admin_alvo_e_equipe(u.id)
        )
  then
    raise exception 'Não confere. Confira o link e o e-mail.' using errcode = '22023';
  end if;

  -- Sucesso na conferência do token/e-mail: marca a PRÓPRIA tentativa (pelo
  -- id devolvido no insert) como bem sucedida — útil só para auditoria, não
  -- afeta o rate limit, que conta toda tentativa igual.
  update gps.socio_convite_tentativas set sucesso = true where id = v_tentativa_id;

  -- 🔴 E-MAIL JÁ TEM LOGIN no grupo: NÃO adota, NÃO troca senha (decisão do
  -- Marcio — adotar trocaria a senha da pessoa nos 7 portais).
  select u.id into v_user from auth.users u where lower(trim(u.email)) = v_email and u.deleted_at is null limit 1;
  if v_user is not null then
    raise exception 'Este e-mail já tem acesso aos sistemas do grupo. Entre com a sua senha atual e fale com a equipe para concluir o vínculo.'
      using errcode = '22023';
  end if;

  -- ═══════════════════════════════════════════════════════════════════
  -- Cria auth.users + auth.identities — molde de gps.admin_adicionar_socio
  -- (…219) / gps.resgate_concluir (…237). Sem `documento` no meta (diferente
  -- de admin_adicionar_socio): aqui NÃO há p_socio_aluno_id — o convidado
  -- ainda não se identificou por CPF, só por e-mail+token. O gatilho
  -- on_auth_user_created_gps casa pelo E-MAIL sozinho quando ele bate com um
  -- cadastro existente; sem cadastro, o membro nasce sem pessoa (v_pessoa
  -- fica null) e a Central resolve depois.
  -- ═══════════════════════════════════════════════════════════════════
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
    jsonb_build_object('origem', 'gps_convite_socio'),
    '', '', '', ''
  );
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (v_user::text, v_user,
          jsonb_build_object('sub', v_user::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
          'email', now(), now(), now());

  -- 🔴 ARMADILHA DA …219: o gatilho on_auth_user_created_gps já pode ter
  -- gravado um gps.membros para este user_id NOVO (titular de um cadastro
  -- que casou por e-mail) dentro do próprio insert acima. A constraint que
  -- existe é membros_user_id_key (user_id ÚNICO) — resolve por
  -- `on conflict (user_id)`, move o membro para o ambiente do convite.
  select m.aluno_id, m.pessoa_aluno_id into v_amb_trigger, v_pessoa_gatilho
    from gps.membros m where m.user_id = v_user;

  -- A pessoa: mesma regra de admin_adicionar_socio — se o cadastro que o
  -- gatilho casou já é pessoa de OUTRO membro, membros_pessoa_uk (UNIQUE
  -- parcial) recusaria o update; nesse caso fica NULL e a Central resolve.
  v_pessoa := case
                when v_pessoa_gatilho is null then null
                when exists (
                       select 1 from gps.membros x
                        where x.pessoa_aluno_id = v_pessoa_gatilho
                          and x.user_id is distinct from v_user
                     ) then null
                else v_pessoa_gatilho
              end;

  insert into gps.membros (aluno_id, user_id, papel, pessoa_aluno_id)
  values (v_convite.ambiente_aluno_id, v_user, 'socio', v_pessoa)
  on conflict (user_id) do update
     set aluno_id = excluded.aluno_id,
         papel = 'socio',
         pessoa_aluno_id = coalesce(gps.membros.pessoa_aluno_id, excluded.pessoa_aluno_id);

  -- Apaga o gps.ambientes órfão que o gatilho criou NESTA transação e que
  -- ficou sem membro nenhum (molde …219). Ambiente pré-existente sem login
  -- nunca é tocado.
  if v_amb_trigger is not null and v_amb_trigger <> v_convite.ambiente_aluno_id then
    delete from gps.ambientes am
     where am.aluno_id = v_amb_trigger
       and am.criado_em >= now()
       and not exists (select 1 from gps.membros m where m.aluno_id = v_amb_trigger);
  end if;

  insert into gps.ambientes (aluno_id) values (v_convite.ambiente_aluno_id) on conflict (aluno_id) do nothing;

  update gps.socio_convites
     set status = 'aceito', aceito_por_user_id = v_user, aceito_em = now(), ip_hash = coalesce(ip_hash, p_ip_hash)
   where id = v_convite.id;

  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, detalhe, feito_por)
  values ('socio_convite_aceito', v_convite.ambiente_aluno_id, v_user, v_email,
          'convite ' || v_convite.id::text, null);

  return jsonb_build_object('user_id', v_user, 'email', v_email, 'pessoa_aluno_id', v_pessoa);
end;
$function$;

revoke execute on function gps.socio_convite_aceitar(text, text, text, text) from public, anon, authenticated;
grant  execute on function gps.socio_convite_aceitar(text, text, text, text) to anon, authenticated;

comment on function gps.socio_convite_aceitar(text, text, text, text) is
  'PUBLICA (anon): troca o token do convite pela senha que o convidado escolheu, criando auth.users + gps.membros (papel=socio). Recusa GENERICA (token invalido/expirado/usado, e-mail diferente, conta de equipe). Se o e-mail JA TEM LOGIN no grupo, recusa com frase PROPRIA e NAO adota (decisao do Marcio — adotar trocaria a senha nos 7 portais). Rate limit 5/15min por IP informado (ver cabecalho da migracao sobre p_ip_hash forjavel). Molde: gps.admin_adicionar_socio (...219) e gps.resgate_concluir (...237).';

-- ═══════════════════════════════════════════════════════════════════════════
-- CONFERÊNCIA DE GRANTS (rodar depois de aplicar; deve bater 1 linha cada)
-- ═══════════════════════════════════════════════════════════════════════════
--   select p.proname,
--          has_function_privilege('anon',          p.oid, 'execute') as anon,
--          has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
--          has_function_privilege('public',        p.oid, 'execute') as public
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'gps' and p.proname like 'socio_convite%'
--    order by p.proname;
--   -- ESPERADO:
--   --   socio_convite_aceitar      anon=t authenticated=t public=f
--   --   socio_convite_criar        anon=f authenticated=t public=f
--   --   socio_convite_do_ambiente  anon=f authenticated=t public=f
--   --   socio_convite_revogar      anon=f authenticated=t public=f
--
--   select grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_schema='gps' and table_name='socio_convites';
--   -- ESPERADO: 0 linhas (nenhum grant a anon/authenticated/public).

-- ═══════════════════════════════════════════════════════════════════════════
-- PROVA EM ROLLBACK (rodar como `postgres`, DEPOIS de aplicar). Tudo dentro
-- de um `do $$ ... $$` que termina em `raise exception`: o RAISE aborta a
-- transação e NADA sobrevive. `set local role authenticated` + JWT real onde
-- há RLS — como `postgres` NÃO passa por RLS, prova rodando só como
-- superusuário não vale (as guardas de auth.uid() são as que importam aqui).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- do $$
-- declare
--   v_titular_a   uuid; v_ambiente_a uuid;   -- titular com ambiente livre
--   v_titular_b   uuid; v_ambiente_b uuid;   -- 2º titular (para "sócio convida" negativo)
--   v_socio_b     uuid;                       -- sócio de b, para tentar convidar
--   v_email_novo  text := 'prova.socio.244novo@exemplo.invalid';
--   v_email_login text;                       -- e-mail de login existente qualquer
--   v_r           jsonb;
--   v_token       text;
--   v_token2      text;
--   v_id          uuid;
--   v_id2         uuid;
--   v_caso_a      text := 'NAO RODOU';
--   v_caso_b      text := 'NAO RODOU';
--   v_caso_c      text := 'NAO RODOU';
--   v_caso_d      text := 'NAO RODOU';
--   v_caso_e      text := 'NAO RODOU';
--   v_caso_f      text := 'NAO RODOU';
--   v_state       text; v_msg text;
-- begin
--   -- liga o interruptor para a prova (revertido junto no raise final)
--   update gps.config set valor = 'true' where chave = 'convite_socio_ativo';
--
--   select m.user_id, m.aluno_id into v_titular_a, v_ambiente_a
--     from gps.membros m
--    where m.papel = 'titular'
--      and not exists (select 1 from gps.membros s where s.aluno_id = m.aluno_id and s.papel = 'socio')
--      and not exists (select 1 from gps.socio_convites c where c.ambiente_aluno_id = m.aluno_id and c.status='pendente')
--    limit 1;
--
--   select m.user_id, m.aluno_id into v_titular_b, v_ambiente_b
--     from gps.membros m where m.papel = 'titular' and m.aluno_id <> v_ambiente_a limit 1;
--   select user_id into v_socio_b from gps.membros where aluno_id = v_ambiente_b and papel = 'socio' limit 1;
--
--   select lower(trim(email)) into v_email_login from auth.users where deleted_at is null limit 1;
--
--   if v_titular_a is null or v_ambiente_a is null then
--     raise exception 'PROVA ABORTADA: nao achei titular com ambiente livre para a prova';
--   end if;
--
--   -- CASO A: titular cria convite com sucesso
--   perform set_config('role', 'authenticated', true);
--   perform set_config('request.jwt.claims', json_build_object('sub', v_titular_a::text, 'role','authenticated')::text, true);
--   v_r := gps.socio_convite_criar(v_email_novo);
--   v_token := v_r->>'token'; v_id := (v_r->>'id')::uuid;
--   v_caso_a := case when v_token is not null and length(v_token) = 64
--                     and exists (select 1 from gps.socio_convites where id = v_id and status='pendente')
--               then 'OK criou ' || v_id::text else 'FALHOU: ' || coalesce(v_r::text,'null') end;
--
--   -- CASO B: 2º convite no MESMO ambiente é recusado (teto)
--   begin
--     perform gps.socio_convite_criar('prova.segundo.244@exemplo.invalid');
--     v_caso_b := 'FALHOU: nao recusou o 2o convite';
--   exception when others then
--     get stacked diagnostics v_state = returned_sqlstate;
--     v_caso_b := case when v_state = '23505' then 'OK 23505 (teto)' else 'FALHOU sqlstate=' || v_state end;
--   end;
--
--   -- CASO C: SOCIO tentando convidar é recusado (só titular convida)
--   if v_socio_b is not null then
--     perform set_config('role', 'authenticated', true);
--     perform set_config('request.jwt.claims', json_build_object('sub', v_socio_b::text, 'role','authenticated')::text, true);
--     begin
--       perform gps.socio_convite_criar('prova.socio.tentando.244@exemplo.invalid');
--       v_caso_c := 'FALHOU: socio conseguiu convidar';
--     exception when others then
--       get stacked diagnostics v_state = returned_sqlstate;
--       v_caso_c := case when v_state = '42501' then 'OK 42501' else 'FALHOU sqlstate=' || v_state end;
--     end;
--   else
--     v_caso_c := 'PULADO: nao achei ambiente com socio para testar';
--   end if;
--
--   -- CASO D: token certo, e-mail ERRADO -> recusa generica
--   perform set_config('role', 'anon', true);
--   perform set_config('request.jwt.claims', '', true);
--   begin
--     perform gps.socio_convite_aceitar(v_token, 'email.errado.244@exemplo.invalid', 'Prova#244aaa');
--     v_caso_d := 'FALHOU: aceitou com e-mail errado';
--   exception when others then
--     get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
--     v_caso_d := case when v_state = '22023' and v_msg = 'Não confere. Confira o link e o e-mail.'
--                 then 'OK recusa generica' else format('FALHOU sqlstate=%s msg=%L', v_state, v_msg) end;
--   end;
--
--   -- CASO E: e-mail com LOGIN EXISTENTE -> recusa com frase PROPRIA, sem adotar
--   if v_email_login is not null then
--     -- cria um convite dedicado para nao consumir o da CASO A/F
--     perform set_config('role', 'authenticated', true);
--     perform set_config('request.jwt.claims', json_build_object('sub', v_titular_a::text, 'role','authenticated')::text, true);
--     update gps.socio_convites set status='revogado' where id = v_id; -- libera o teto
--     v_r := gps.socio_convite_criar('prova.login.existente.244@exemplo.invalid');
--     v_token2 := v_r->>'token'; v_id2 := (v_r->>'id')::uuid;
--
--     perform set_config('role', 'anon', true);
--     perform set_config('request.jwt.claims', '', true);
--     begin
--       perform gps.socio_convite_aceitar(v_token2, v_email_login, 'Prova#244bbb');
--       v_caso_e := 'FALHOU: aceitou email com login existente';
--     exception when others then
--       get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
--       v_caso_e := case when v_state = '22023' and v_msg like 'Este e-mail já tem acesso%'
--                   then 'OK frase propria, nao adotou' else format('FALHOU sqlstate=%s msg=%L', v_state, v_msg) end;
--     end;
--     -- reabre o convite original para o CASO F usar o token da CASO A
--     perform set_config('role', 'authenticated', true);
--     perform set_config('request.jwt.claims', json_build_object('sub', v_titular_a::text, 'role','authenticated')::text, true);
--     update gps.socio_convites set status='revogado' where id = v_id2;
--   else
--     v_caso_e := 'PULADO: nao achei login existente para testar';
--   end if;
--
--   -- CASO F: aceite de verdade cria login + membro + pessoa_aluno_id
--   update gps.socio_convites set status='pendente' where id = v_id; -- reabre o da CASO A
--   perform set_config('role', 'anon', true);
--   perform set_config('request.jwt.claims', '', true);
--   v_r := gps.socio_convite_aceitar(v_token, v_email_novo, 'Prova#244ccc');
--   v_caso_f := case
--     when (v_r->>'user_id') is not null
--      and exists (select 1 from gps.membros m
--                   where m.user_id = (v_r->>'user_id')::uuid
--                     and m.aluno_id = v_ambiente_a and m.papel = 'socio')
--     then 'OK aceitou, criou login+membro. pessoa_aluno_id=' || coalesce(v_r->>'pessoa_aluno_id','null')
--     else 'FALHOU: ' || coalesce(v_r::text,'null') end;
--
--   perform set_config('role', 'none', true);
--   raise exception E'PROVA ...244\n A (titular cria): %\n B (2o convite recusado): %\n C (socio convidando recusado): %\n D (token+email errado): %\n E (login existente): %\n F (aceite cria login/membro/pessoa): %\n contagem final gps.socio_convites (deve ser 0 apos o rollback): %',
--     v_caso_a, v_caso_b, v_caso_c, v_caso_d, v_caso_e, v_caso_f,
--     (select count(*) from gps.socio_convites);
-- end $$;
--
-- ESPERADO: A = "OK criou <uuid>" · B = "OK 23505 (teto)" · C = "OK 42501" ·
--   D = "OK recusa generica" · E = "OK frase propria, nao adotou" ·
--   F = "OK aceitou, criou login+membro..." · a contagem final É IRRELEVANTE
--   dentro do bloco (só é 0 DEPOIS que o `raise exception` reverte tudo —
--   conferir com `select count(*) from gps.socio_convites;` FORA do `do $$`,
--   já fora da transação abortada).

-- ═══════════════════════════════════════════════════════════════════════════
-- EXPLAIN (ANALYZE) das 3 queries principais (protocolo de sustentabilidade).
-- Rodar depois de aplicar E depois da prova em rollback (tabela vazia em
-- produção até o primeiro convite real — plano de tabela pequena por
-- natureza: no máximo 1 convite PENDENTE por ambiente, e o total de
-- ambientes com sócio é ~12 hoje. Os 3 índices parciais garantem que o custo
-- não cresce com o total de convites HISTÓRICOS, só com os PENDENTES).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1) BUSCA POR TOKEN (socio_convite_aceitar) — usa socio_convites_token_hash_uk
--   explain (analyze, buffers)
--   select * from gps.socio_convites
--    where token_hash = encode(extensions.digest('qualquertoken', 'sha256'), 'hex');
--   -- ESPERADO: Index Scan usando socio_convites_token_hash_uk, 0-1 linha,
--   -- custo constante independente do total de convites (índice único total,
--   -- não parcial — todo token, aceito ou não, precisa ser localizável para a
--   -- mensagem de "já usado").
--
-- 2) CONVITE DO AMBIENTE (socio_convite_do_ambiente) — usa
--    socio_convites_um_pendente_por_ambiente (o índice parcial cobre a
--    condição da query: status = 'pendente' É o WHERE do índice)
--   explain (analyze, buffers)
--   select id, email_alvo, status, criado_em, expira_em
--     from gps.socio_convites
--    where ambiente_aluno_id = '<uuid de um ambiente>' and status = 'pendente'
--    order by criado_em desc limit 1;
--   -- ESPERADO: Index Scan usando socio_convites_um_pendente_por_ambiente,
--   -- Index Cond em ambiente_aluno_id, sem Filter residual (o `status =
--   -- 'pendente'` já está no WHERE do índice, não é reconferido linha a
--   -- linha) — no máximo 1 linha por definição do próprio índice único.
--
-- 3) TETO (socio_convite_criar, guarda #3) — duas queries, ambas plano trivial
--    por serem sobre no máximo 1 linha:
--   explain (analyze, buffers)
--   select 1 from gps.membros where aluno_id = '<uuid>' and papel = 'socio';
--   -- usa membros_aluno_id_idx (já existente, ...baseline) + Filter papel
--   -- (papel não tem índice próprio, mas a tabela é filtrada primeiro por
--   -- aluno_id — no máximo 2 membros por ambiente hoje, filtro residual de
--   -- custo desprezível).
--   explain (analyze, buffers)
--   select 1 from gps.socio_convites
--    where ambiente_aluno_id = '<uuid>' and status = 'pendente' and expira_em > now();
--   -- ESPERADO: Index Scan usando socio_convites_um_pendente_por_ambiente,
--   -- Index Cond ambiente_aluno_id, Filter residual só em expira_em (não
--   -- entra no índice porque muda com o tempo — aceitável: no máximo 1 linha
--   -- por ambiente sob esse índice, o filtro nunca varre mais que 1 linha).
--
-- Nenhuma das 3 precisa de índice novo além dos já criados nesta migração —
-- todas resolvem por Index Scan/Index Only Scan, sem Seq Scan em
-- gps.socio_convites nem em gps.membros.
