-- ═══════════════════════════════════════════════════════════════════════════
-- 20261002000342 — Central de ajuda curada (Onda 5). SEM IA no produto
-- (decisão do João): artigo escrito por gente, busca por texto do Postgres.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Ensaiada primeiro em PGlite 0.5.8 e depois EM PRODUÇÃO (02/10/2026,
-- begin…rollback, schema inteiro + 2 artigos do seed + o bloco PROVA):
--   grants: authenticated só SELECT nas 2 tabelas; 0 função com PUBLIC/anon
--   anon: ajuda_por_rota e ajuda_buscar → 42501
--   parceiro: '/clientes/abc' → 2 artigos de /clientes; '/clientesx' → 0;
--     'não consigo cadastrar' → 1º "Onde cadastrar os meus 30 clientes";
--     injeção $$'); drop table…$$ → 0 sem erro; operadores soltos → sem erro;
--     'ab' → 0; lê 0 linhas de feedback; insert/update direto → 42501;
--     admin_ajuda_salvar / admin_ajuda_metricas → 42501;
--     feedback sem artigo fora de busca → P0002
--   admin: métricas com 1 "sim" e o termo "xyzzy inexistente"; cron criado
--   EXPLAIN (analyze, buffers), como o parceiro chama:
--     ajuda_buscar   Function Scan · 0,564 ms · shared hit=7
--     ajuda_por_rota Function Scan · 0,789 ms · shared hit=2
--   como dono, enable_seqscan=off: Bitmap Index Scan on
--     idx_gps_ajuda_artigos_busca · 0,026 ms · shared hit=5
--
-- ── O QUE CRIA ─────────────────────────────────────────────────────────────
--   gps.f_unaccent(text)            wrapper IMMUTABLE de public.unaccent
--   gps.ajuda_normalizar_rota(text) / gps.ajuda_rota_casa(text[], text)
--   gps.ajuda_artigos               catálogo (+ coluna gerada `busca` + GIN)
--   gps.ajuda_feedback              vista / resolveu sim-não / busca vazia
--   gps.ajuda_ativo()               interruptor (gps.config.ajuda_ativo)
--   gps.ajuda_por_rota / gps.ajuda_buscar / gps.ajuda_registrar_feedback
--   gps.admin_ajuda_salvar / gps.admin_ajuda_metricas
--   gps.ajuda_feedback_expurgar()   + pg_cron diário 'ajuda-feedback-expurgo'
--   seed de 12 artigos (ids fixos, `on conflict do nothing`)
--
-- ── POR QUE gps.f_unaccent ─────────────────────────────────────────────────
-- `public.unaccent(text)` é STABLE (depende do dicionário do search_path) —
-- registrado na …258. Coluna gerada e índice exigem IMMUTABLE. O wrapper
-- fixa o dicionário pelo nome qualificado ('public.unaccent'::regdictionary)
-- e por isso pode ser declarado IMMUTABLE. Nenhum wrapper existe nas
-- migrations (grep `unaccent` só acha a …258, que usa a função crua). A guarda
-- logo abaixo ABORTA se já houver um `gps.f_unaccent` vivo com corpo diferente
-- — nunca sobrescreve em silêncio o de outro sistema.
-- ⚠️ Trocar o dicionário `unaccent` depois deixa a coluna `busca` velha até
-- um `update gps.ajuda_artigos set titulo = titulo` (recalcula a gerada).
--
-- ── AS 5 PERGUNTAS ─────────────────────────────────────────────────────────
-- 1 Escala: catálogo editorial — dezenas de artigos (12 no seed). Feedback:
--   ~150 pessoas × poucas avaliações/semana, teto de 30/pessoa/hora, retenção
--   de 90 dias → milhares de linhas, nunca milhões.
-- 2 Índice: `busca @@ tsquery` usa o GIN `idx_gps_ajuda_artigos_busca` (a
--   coluna É a expressão — não há expressão funcional para casar). Com 12
--   linhas o planner escolhe Seq Scan e está certo; o plano com
--   enable_seqscan=off prova que o índice é elegível (bloco EXPLAIN abaixo).
--   ⚠️ Só como DONO da tabela: sob RLS o GIN fica inelegível (seção 5).
--   Feedback: (pessoa, criado_em) serve o teto por hora; (artigo_id) a
--   métrica e o FK; (criado_em) o expurgo.
-- 3 Frequência: `ajuda_ativo` + `ajuda_por_rota` a CADA página renderizada do
--   PARCEIRO (o botão "Como faço?" mora no header, que é Server Component):
--   2 RPCs em paralelo, memoizadas por requisição, 0,56 + 0,79 ms medidos.
--   Admin e modo assistência não chamam. `ajuda_buscar` por busca (debounce
--   de 400 ms, ≥ 3 letras); feedback por clique / 1 busca vazia ao fechar o
--   painel. Expurgo 1×/dia. Melhoria futura registrada: `ajuda_por_rota` já
--   avalia `ajuda_ativo()` por dentro — uma RPC `{ativo, artigos}` tiraria 1
--   ida por página.
-- 4 Repetição: `getAjudaPorRota` memoizado por requisição (`cache()`); sem
--   cache entre requisições (proibido: `src/lib/auth.ts` — cliente com cookie).
-- 5 Reversão: interruptor `gps.config.ajuda_ativo = 'false'` esvazia as três
--   RPCs do parceiro sem deploy. Remoção total no bloco REVERSÃO ao final.
--
-- ── SEGURANÇA ──────────────────────────────────────────────────────────────
-- Tabelas: revoke ALL de public/anon/authenticated (o default do schema `gps`
-- dá INSERT/UPDATE/DELETE a authenticated — memória de 16/09) e só então
-- `grant select` a authenticated. Escrita: só pelas RPCs DEFINER.
-- Funções: toda função nova nasce com execute para PUBLIC e para
-- authenticated (ALTER DEFAULT PRIVILEGES do projeto) → revoke explícito de
-- public, anon E authenticated; grant de volta só ao que o parceiro chama.
-- Leitura do parceiro: `ajuda_por_rota` INVOKER (RLS `ativo` é a cerca);
-- `ajuda_buscar` DEFINER com `where ativo` explícito (ver seção 5: a RLS
-- impediria o uso do GIN).
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '2s';
set local statement_timeout = '30s';

-- ───────────────────────────────────────────────────────────────────────────
-- 0) Guarda: wrapper vivo com corpo diferente → aborta
-- ───────────────────────────────────────────────────────────────────────────
do $guarda$
declare
  v_src text;
begin
  select p.prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'gps' and p.proname = 'f_unaccent'
     and pg_get_function_identity_arguments(p.oid) = 'text';
  if v_src is not null
     and btrim(v_src) <> 'select public.unaccent(''public.unaccent''::regdictionary, $1)' then
    raise exception 'gps.f_unaccent(text) já existe com outro corpo: %', v_src;
  end if;
end
$guarda$;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Funções puras (sem dado): unaccent imutável e normalização de rota
-- ───────────────────────────────────────────────────────────────────────────
create or replace function gps.f_unaccent(text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$select public.unaccent('public.unaccent'::regdictionary, $1)$$;

comment on function gps.f_unaccent(text) is
  'unaccent IMMUTABLE (dicionario fixo public.unaccent) para coluna gerada/indice de busca. Interna: so roda dentro das funcoes DEFINER (gps.ajuda_buscar, gps.admin_ajuda_salvar) e na coluna gerada. Migration 20261002000342.';

revoke all on function gps.f_unaccent(text) from public, anon, authenticated;

-- Rota de tela normalizada: minúscula, sem query/hash, sem barra final (exceto
-- a raiz). Fora do formato → null (a RPC ignora a rota, nunca erra por ela).
create or replace function gps.ajuda_normalizar_rota(p_rota text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
           when v ~ '^/[a-z0-9/_-]{0,80}$' then v
           else null
         end
    from (
      select case
               when length(r) > 1 then rtrim(r, '/')
               else r
             end as v
        from (select split_part(split_part(lower(btrim(coalesce(p_rota, ''))), '?', 1), '#', 1) as r) x
    ) y
$$;

comment on function gps.ajuda_normalizar_rota(text) is
  'Normaliza a rota da tela para casar com gps.ajuda_artigos.rotas: lower, sem ?query/#hash, sem barra final (exceto "/"), formato ^/[a-z0-9/_-]{0,80}$ ou NULL. Pura.';

revoke all on function gps.ajuda_normalizar_rota(text) from public, anon, authenticated;
grant execute on function gps.ajuda_normalizar_rota(text) to authenticated;

-- A rota do artigo casa a tela se for igual OU prefixo por SEGMENTO:
-- '/clientes' casa '/clientes/<uuid>', mas não '/clientesx'. '/' só casa a raiz.
-- Comparação por `left(...)`, não `like`: '_' é curinga do LIKE e é válido na rota.
create or replace function gps.ajuda_rota_casa(p_rotas text[], p_rota text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
           p_rota = any(p_rotas)
           or exists (
                select 1 from unnest(p_rotas) r
                 where r <> '/' and left(p_rota, length(r) + 1) = r || '/'
              ),
           false)
$$;

comment on function gps.ajuda_rota_casa(text[], text) is
  'true se alguma rota do artigo e igual a rota da tela ou prefixo dela por segmento ("/clientes" casa "/clientes/abc"). "/" casa so a raiz. Pura.';

revoke all on function gps.ajuda_rota_casa(text[], text) from public, anon, authenticated;
grant execute on function gps.ajuda_rota_casa(text[], text) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) gps.ajuda_artigos
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists gps.ajuda_artigos (
  id             uuid primary key default gen_random_uuid(),
  titulo         text not null,
  corpo          text not null,
  rotas          text[] not null default '{}',
  categorias     text[] not null default '{}',
  palavras_chave text,
  sinonimos      text,
  ativo          boolean not null default true,
  ordem          integer not null default 0,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  busca          tsvector generated always as (
                   setweight(to_tsvector('portuguese', gps.f_unaccent(titulo || ' ' || coalesce(palavras_chave, ''))), 'A')
                || setweight(to_tsvector('portuguese', gps.f_unaccent(coalesce(sinonimos, ''))), 'B')
                || setweight(to_tsvector('portuguese', gps.f_unaccent(corpo)), 'C')
                 ) stored,

  constraint chk_gps_ajuda_artigos_titulo
    check (length(btrim(titulo)) between 3 and 120),
  constraint chk_gps_ajuda_artigos_corpo
    check (length(btrim(corpo)) between 10 and 4000),
  constraint chk_gps_ajuda_artigos_palavras
    check (palavras_chave is null or length(palavras_chave) <= 1000),
  constraint chk_gps_ajuda_artigos_sinonimos
    check (sinonimos is null or length(sinonimos) <= 1000),
  -- As MESMAS 4 categorias de chamado (CategoriaChamado, src/lib/chamados-tipos.ts).
  constraint chk_gps_ajuda_artigos_categorias
    check (categorias <@ array['sistema','troca_cliente','troca_socio','outros']::text[]),
  -- Rotas: até 20, sem null, cada uma no formato de gps.ajuda_normalizar_rota.
  -- Sem subquery (CHECK não aceita — 0A000): junta com '|' e testa a forma inteira.
  constraint chk_gps_ajuda_artigos_rotas
    check (
      cardinality(rotas) <= 20
      and array_position(rotas, null) is null
      and (cardinality(rotas) = 0
           or ('|' || array_to_string(rotas, '|') || '|') ~ '^(\|/[a-z0-9/_-]{0,80})+\|$')
    )
);

comment on table gps.ajuda_artigos is
  'Central de ajuda curada (sem IA). Artigo em texto simples (paragrafos separados por linha em branco), ligado a rotas de tela e a categorias de chamado. Sem dado pessoal. Parceiro le so ativo=true (RLS); admin le tudo; escrita so por gps.admin_ajuda_salvar. Nunca apagar: arquivar com ativo=false. Migration 20261002000342.';
comment on column gps.ajuda_artigos.busca is
  'GERADA: A = titulo + palavras_chave, B = sinonimos, C = corpo; tudo via gps.f_unaccent e config portuguese. Indice GIN idx_gps_ajuda_artigos_busca.';
comment on column gps.ajuda_artigos.rotas is
  'Rotas de tela onde o artigo aparece ("/clientes" casa tambem "/clientes/<id>"). Formato de gps.ajuda_normalizar_rota.';

create index if not exists idx_gps_ajuda_artigos_busca
  on gps.ajuda_artigos using gin (busca);

drop trigger if exists trg_gps_ajuda_artigos_atualizado_em on gps.ajuda_artigos;
create trigger trg_gps_ajuda_artigos_atualizado_em
  before update on gps.ajuda_artigos
  for each row execute function gps.touch_atualizado_em();

alter table gps.ajuda_artigos enable row level security;

drop policy if exists gps_ajuda_artigos_select_ativo on gps.ajuda_artigos;
create policy gps_ajuda_artigos_select_ativo on gps.ajuda_artigos
  for select to authenticated
  using (ativo);

drop policy if exists gps_ajuda_artigos_select_admin on gps.ajuda_artigos;
create policy gps_ajuda_artigos_select_admin on gps.ajuda_artigos
  for select to authenticated
  using ((select coalesce(public.gp_is_admin(), false)));

revoke all on gps.ajuda_artigos from public, anon, authenticated;
grant select on gps.ajuda_artigos to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) gps.ajuda_feedback
--   resolveu = null  → VISTA (abriu o artigo, ainda sem responder)
--   resolveu = t/f   → "isso resolveu?" sim/não
--   artigo_id = null → busca SEM resultado (origem 'busca', termo obrigatório)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists gps.ajuda_feedback (
  id         uuid primary key default gen_random_uuid(),
  artigo_id  uuid references gps.ajuda_artigos(id) on delete cascade,
  pessoa     uuid not null references auth.users(id) on delete cascade,
  resolveu   boolean,
  origem     text not null,
  termo      text,
  criado_em  timestamptz not null default now(),

  constraint chk_gps_ajuda_feedback_origem
    check (origem in ('tela', 'busca', 'chamado')),
  constraint chk_gps_ajuda_feedback_termo
    check (termo is null or (length(termo) between 1 and 120 and termo !~ '[[:cntrl:]]')),
  constraint chk_gps_ajuda_feedback_sem_artigo
    check (artigo_id is not null
           or (origem = 'busca' and termo is not null and resolveu is false))
);

comment on table gps.ajuda_feedback is
  'Uso da central de ajuda: vista (resolveu null), resolveu sim/nao, e busca sem resultado (artigo_id null, origem busca, termo). pessoa = auth.uid(). Insert so por gps.ajuda_registrar_feedback (teto 30/pessoa/hora); leitura so admin. Expurgo > 90 dias (gps.ajuda_feedback_expurgar, cron diario). Migration 20261002000342.';
comment on column gps.ajuda_feedback.termo is
  'O que a pessoa digitou na busca (ate 120, sem caractere de controle). Texto livre: pode conter nome de cliente — por isso o expurgo de 90 dias e a leitura so-admin.';

create index if not exists idx_gps_ajuda_feedback_artigo
  on gps.ajuda_feedback (artigo_id);
create index if not exists idx_gps_ajuda_feedback_criado_em
  on gps.ajuda_feedback (criado_em);
create index if not exists idx_gps_ajuda_feedback_pessoa_criado
  on gps.ajuda_feedback (pessoa, criado_em);

alter table gps.ajuda_feedback enable row level security;

drop policy if exists gps_ajuda_feedback_select_admin on gps.ajuda_feedback;
create policy gps_ajuda_feedback_select_admin on gps.ajuda_feedback
  for select to authenticated
  using ((select coalesce(public.gp_is_admin(), false)));

revoke all on gps.ajuda_feedback from public, anon, authenticated;
grant select on gps.ajuda_feedback to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) Interruptor
-- ───────────────────────────────────────────────────────────────────────────
insert into gps.config (chave, valor) values ('ajuda_ativo', 'true')
on conflict (chave) do nothing;

create or replace function gps.ajuda_ativo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
           (select c.valor from gps.config c where c.chave = 'ajuda_ativo'),
           'true'
         ) <> 'false';
$$;

comment on function gps.ajuda_ativo() is
  'Interruptor da central de ajuda: AUSENTE ou "true" = ligada; "false" esvazia ajuda_por_rota/ajuda_buscar e faz ajuda_registrar_feedback nao gravar. Le SO a chave ajuda_ativo. SECURITY DEFINER porque o parceiro nao le gps.config (policy so-admin). Molde de gps.tutoriais_ativo. NAO esta na allowlist de gps.config_definir (ver relatorio).';

revoke all on function gps.ajuda_ativo() from public, anon, authenticated;
grant execute on function gps.ajuda_ativo() to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 5) Leitura do parceiro
--   ajuda_por_rota: INVOKER — a RLS `ativo` é a cerca.
--   ajuda_buscar: DEFINER, e de propósito. MEDIDO no ensaio: com RLS ativa
--   para quem chama, o `@@` (ts_match_vq, NÃO leakproof) não pode descer para
--   o índice antes das quals da policy — com enable_seqscan=off o plano ficou
--   em "Seq Scan … Disabled: true", o GIN ignorado. Como dono da tabela a
--   função usa o índice; a cerca vira o `where a.ativo` explícito + a guarda
--   de `auth.uid()`, e o retorno só tem colunas de artigo ativo.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function gps.ajuda_por_rota(p_rota text)
returns table (
  id         uuid,
  titulo     text,
  corpo      text,
  rotas      text[],
  categorias text[],
  ordem      integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.id, a.titulo, a.corpo, a.rotas, a.categorias, a.ordem
    from gps.ajuda_artigos a
   cross join (select gps.ajuda_normalizar_rota(p_rota) as v) r
   where a.ativo
     and r.v is not null
     and gps.ajuda_ativo()
     and gps.ajuda_rota_casa(a.rotas, r.v)
   order by a.ordem, a.titulo
   limit 10;
$$;

comment on function gps.ajuda_por_rota(text) is
  'Ate 10 artigos ATIVOS ligados a rota da tela (igual ou prefixo por segmento), por ordem e titulo. Rota invalida ou interruptor desligado = vazio. INVOKER: RLS de gps.ajuda_artigos vale.';

revoke all on function gps.ajuda_por_rota(text) from public, anon, authenticated;
grant execute on function gps.ajuda_por_rota(text) to authenticated;

create or replace function gps.ajuda_buscar(
  p_q         text,
  p_rota      text default null,
  p_categoria text default null
)
returns table (
  id         uuid,
  titulo     text,
  corpo      text,
  rotas      text[],
  categorias text[],
  ordem      integer,
  relevancia real
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_q      text;
  v_ou     text;
  v_tsq_e  tsquery;
  v_tsq_ou tsquery;
  v_rota   text;
  v_cat    text;
begin
  if auth.uid() is null then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if not gps.ajuda_ativo() then
    return;
  end if;

  v_q := btrim(regexp_replace(coalesce(p_q, ''), '\s+', ' ', 'g'));
  if char_length(v_q) < 3 then
    return;
  end if;
  v_q := gps.f_unaccent(lower(left(v_q, 120)));

  -- E (todas as palavras): websearch_to_tsquery nunca dá erro de sintaxe —
  -- aspas, "-palavra" e "or" do usuário viram operadores ou somem.
  v_tsq_e := websearch_to_tsquery('portuguese', v_q);

  -- OU (qualquer palavra): só [a-z0-9], sem as palavras vazias que perderam
  -- o acento no unaccent (a lista de stopwords do Postgres é acentuada:
  -- "não" sai, "nao" não sairia) e sem "or" (operador do websearch).
  select string_agg(w, ' or ')
    into v_ou
    from regexp_split_to_table(regexp_replace(v_q, '[^a-z0-9]+', ' ', 'g'), ' ') as w
   where length(w) >= 2
     and w <> all (array['nao','voce','voces','ja','so','tambem','ate','apos',
                         'sao','ha','tem','tera','sera','serao','estao','esta',
                         'ai','la','ali','aqui','pra','pro','or']);
  if v_ou is null then
    return;
  end if;
  v_tsq_ou := websearch_to_tsquery('portuguese', v_ou);
  if numnode(v_tsq_ou) = 0 then
    return;
  end if;

  v_rota := gps.ajuda_normalizar_rota(p_rota);
  v_cat  := case when p_categoria in ('sistema','troca_cliente','troca_socio','outros')
                 then p_categoria end;

  return query
    select a.id, a.titulo, a.corpo, a.rotas, a.categorias, a.ordem,
           ( ts_rank_cd(a.busca, v_tsq_ou, 32)
           + case when numnode(v_tsq_e) > 0 and a.busca @@ v_tsq_e then 1 else 0 end
           + case when v_rota is not null and gps.ajuda_rota_casa(a.rotas, v_rota) then 0.3 else 0 end
           + case when v_cat is not null and v_cat = any(a.categorias) then 0.3 else 0 end
           )::real as relevancia
      from gps.ajuda_artigos a
     where a.ativo
       and a.busca @@ v_tsq_ou
     order by 7 desc, a.ordem, a.titulo
     limit 5;
end;
$$;

comment on function gps.ajuda_buscar(text, text, text) is
  'Busca na central de ajuda: q com menos de 3 caracteres = vazio; corta em 120. Filtra por QUALQUER palavra (OU) e ranqueia: ts_rank_cd normalizado (0..1) + 1 se casar TODAS (websearch_to_tsquery) + 0,3 rota da tela + 0,3 categoria. Ate 5. DEFINER para o GIN ser usavel (RLS + @@ nao-leakproof o bloqueia); cerca = where ativo + auth.uid(). Interruptor desligado = vazio.';

revoke all on function gps.ajuda_buscar(text, text, text) from public, anon, authenticated;
grant execute on function gps.ajuda_buscar(text, text, text) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 6) Feedback (DEFINER — o parceiro não tem INSERT na tabela)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function gps.ajuda_registrar_feedback(
  p_artigo   uuid,
  p_resolveu boolean,
  p_origem   text,
  p_termo    text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_termo text;
  v_n     integer;
begin
  if v_uid is null then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if not gps.ajuda_ativo() then
    return;
  end if;
  -- Clique da equipe não entra na métrica do parceiro.
  if coalesce(public.gp_is_admin(), false) then
    return;
  end if;

  if p_origem is null or p_origem not in ('tela', 'busca', 'chamado') then
    raise exception 'Origem da avaliação inválida.' using errcode = '22023';
  end if;

  v_termo := nullif(btrim(regexp_replace(coalesce(p_termo, ''), '[[:cntrl:][:space:]]+', ' ', 'g')), '');
  if v_termo is not null then
    v_termo := left(v_termo, 120);
  end if;

  if p_artigo is null then
    if p_origem <> 'busca' or v_termo is null then
      raise exception 'Artigo não encontrado.' using errcode = 'P0002';
    end if;
  elsif not exists (select 1 from gps.ajuda_artigos a where a.id = p_artigo and a.ativo) then
    raise exception 'Artigo não encontrado.' using errcode = 'P0002';
  end if;

  -- Teto por pessoa: 30 por hora. O lock serializa os pedidos simultâneos da
  -- MESMA pessoa (sem ele, 2 abas passariam juntas do teto); pessoas
  -- diferentes não se bloqueiam.
  perform pg_advisory_xact_lock(hashtextextended('gps.ajuda_feedback:' || v_uid::text, 0));
  select count(*) into v_n
    from gps.ajuda_feedback f
   where f.pessoa = v_uid
     and f.criado_em > now() - interval '1 hour';
  if v_n >= 30 then
    raise exception 'Muitas avaliações em pouco tempo. Tente de novo mais tarde.' using errcode = 'P0001';
  end if;

  insert into gps.ajuda_feedback (artigo_id, pessoa, resolveu, origem, termo)
  values (p_artigo,
          v_uid,
          case when p_artigo is null then false else p_resolveu end,
          p_origem,
          v_termo);
end;
$$;

comment on function gps.ajuda_registrar_feedback(uuid, boolean, text, text) is
  'Registra uso da ajuda pela pessoa logada (auth.uid()): p_resolveu null = vista; true/false = resolveu. p_artigo null so com origem busca e termo = busca sem resultado (resolveu gravado false). Artigo inexistente ou inativo = P0002. Teto 30/pessoa/hora (P0001). Admin e interruptor desligado: nao grava, sem erro.';

revoke all on function gps.ajuda_registrar_feedback(uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function gps.ajuda_registrar_feedback(uuid, boolean, text, text) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 7) Admin
-- ───────────────────────────────────────────────────────────────────────────
create or replace function gps.admin_ajuda_salvar(
  p_id             uuid,
  p_titulo         text,
  p_corpo          text,
  p_rotas          text[],
  p_categorias     text[],
  p_palavras_chave text,
  p_sinonimos      text,
  p_ativo          boolean,
  p_ordem          integer
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_titulo     text;
  v_corpo      text;
  v_palavras   text;
  v_sinonimos  text;
  v_rotas      text[];
  v_categorias text[];
  v_invalida   text;
  v_id         uuid;
begin
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  v_titulo := btrim(regexp_replace(coalesce(p_titulo, ''), '\s+', ' ', 'g'));
  if length(v_titulo) < 3 or length(v_titulo) > 120 then
    raise exception 'O título precisa ter de 3 a 120 caracteres.' using errcode = '22023';
  end if;

  v_corpo := btrim(replace(coalesce(p_corpo, ''), E'\r\n', E'\n'));
  if length(v_corpo) < 10 or length(v_corpo) > 4000 then
    raise exception 'O texto precisa ter de 10 a 4000 caracteres.' using errcode = '22023';
  end if;

  v_palavras  := nullif(btrim(coalesce(p_palavras_chave, '')), '');
  v_sinonimos := nullif(btrim(coalesce(p_sinonimos, '')), '');
  if coalesce(length(v_palavras), 0) > 1000 or coalesce(length(v_sinonimos), 0) > 1000 then
    raise exception 'Palavras-chave e sinônimos aceitam até 1000 caracteres cada.' using errcode = '22023';
  end if;

  select r into v_invalida
    from unnest(coalesce(p_rotas, '{}')) r
   where gps.ajuda_normalizar_rota(r) is null
   limit 1;
  if found then
    raise exception 'Rota inválida: use o caminho da tela, como /clientes.' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct gps.ajuda_normalizar_rota(r)), '{}')
    into v_rotas
    from unnest(coalesce(p_rotas, '{}')) r;
  if cardinality(v_rotas) > 20 then
    raise exception 'No máximo 20 rotas por artigo.' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct c), '{}')
    into v_categorias
    from unnest(coalesce(p_categorias, '{}')) c;
  if not (v_categorias <@ array['sistema','troca_cliente','troca_socio','outros']::text[]) then
    raise exception 'Categoria inválida.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into gps.ajuda_artigos
      (titulo, corpo, rotas, categorias, palavras_chave, sinonimos, ativo, ordem)
    values
      (v_titulo, v_corpo, v_rotas, v_categorias, v_palavras, v_sinonimos,
       coalesce(p_ativo, true), coalesce(p_ordem, 0))
    returning id into v_id;
  else
    update gps.ajuda_artigos a
       set titulo         = v_titulo,
           corpo          = v_corpo,
           rotas          = v_rotas,
           categorias     = v_categorias,
           palavras_chave = v_palavras,
           sinonimos      = v_sinonimos,
           ativo          = coalesce(p_ativo, a.ativo),
           ordem          = coalesce(p_ordem, a.ordem)
     where a.id = p_id
    returning a.id into v_id;
    if v_id is null then
      raise exception 'Artigo não encontrado.' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end;
$$;

comment on function gps.admin_ajuda_salvar(uuid, text, text, text[], text[], text, text, boolean, integer) is
  'gp_is_admin() ou 42501. p_id null cria; senao edita (P0002 se nao existe). Valida titulo 3..120, corpo 10..4000 (CRLF vira LF), palavras/sinonimos <= 1000, rotas no formato de gps.ajuda_normalizar_rota (dedup, <= 20), categorias das 4 de chamado. Arquivar = p_ativo false (nunca apagar).';

revoke all on function gps.admin_ajuda_salvar(uuid, text, text, text[], text[], text, text, boolean, integer) from public, anon, authenticated;
grant execute on function gps.admin_ajuda_salvar(uuid, text, text, text[], text[], text, text, boolean, integer) to authenticated;

create or replace function gps.admin_ajuda_metricas()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_artigos jsonb;
  v_termos  jsonb;
begin
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'artigo_id',    a.id,
           'titulo',       a.titulo,
           'ativo',        a.ativo,
           'vistas',       coalesce(m.vistas, 0),
           'resolveu_sim', coalesce(m.sim, 0),
           'resolveu_nao', coalesce(m.nao, 0),
           'ultimo_em',    m.ultimo_em
         ) order by coalesce(m.nao, 0) desc, coalesce(m.vistas, 0) desc, a.ordem, a.titulo), '[]'::jsonb)
    into v_artigos
    from gps.ajuda_artigos a
    left join (
      select f.artigo_id,
             count(*) filter (where f.resolveu is null)  as vistas,
             count(*) filter (where f.resolveu is true)  as sim,
             count(*) filter (where f.resolveu is false) as nao,
             max(f.criado_em)                            as ultimo_em
        from gps.ajuda_feedback f
       where f.artigo_id is not null
       group by f.artigo_id
    ) m on m.artigo_id = a.id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'termo', t.termo, 'vezes', t.vezes, 'ultimo_em', t.ultimo_em
         ) order by t.vezes desc, t.ultimo_em desc), '[]'::jsonb)
    into v_termos
    from (
      select lower(f.termo) as termo, count(*) as vezes, max(f.criado_em) as ultimo_em
        from gps.ajuda_feedback f
       where f.artigo_id is null and f.origem = 'busca'
       group by lower(f.termo)
       order by count(*) desc, max(f.criado_em) desc
       limit 50
    ) t;

  return jsonb_build_object(
    'janela_dias', 90,
    'artigos', v_artigos,
    'termos_sem_resultado', v_termos
  );
end;
$$;

comment on function gps.admin_ajuda_metricas() is
  'gp_is_admin() ou 42501. AGREGADO, sem coluna de pessoa: por artigo (vistas, resolveu sim/nao, ultimo uso) e os 50 termos de busca sem resultado mais frequentes. Janela = retencao (90 dias). INVOKER: RLS so-admin de ajuda_feedback vale.';

revoke all on function gps.admin_ajuda_metricas() from public, anon, authenticated;
grant execute on function gps.admin_ajuda_metricas() to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 8) Expurgo > 90 dias (interno) + pg_cron diário
--   Não há job diário SQL genérico para pendurar: os diários existentes são de
--   e-mail (sessao-resumo-dra) e reescrever o comando deles acoplaria
--   retenção a envio. Job próprio, 07:23 UTC (04:23 em Brasília).
-- ───────────────────────────────────────────────────────────────────────────
create or replace function gps.ajuda_feedback_expurgar()
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_n integer;
begin
  delete from gps.ajuda_feedback f
   where f.criado_em < now() - interval '90 days';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function gps.ajuda_feedback_expurgar() is
  'Apaga feedback da central de ajuda com mais de 90 dias (termo de busca e texto livre). Interna: so o pg_cron (postgres) chama. Devolve quantas linhas saíram.';

revoke all on function gps.ajuda_feedback_expurgar() from public, anon, authenticated;

select cron.unschedule('ajuda-feedback-expurgo')
 where exists (select 1 from cron.job where jobname = 'ajuda-feedback-expurgo');

select cron.schedule(
  'ajuda-feedback-expurgo',
  '23 7 * * *',
  $cron$ select gps.ajuda_feedback_expurgar(); $cron$
);

-- ───────────────────────────────────────────────────────────────────────────
-- 9) Seed — 12 artigos escritos a partir do código das telas em 02/10/2026
--   (main 87343b6 + working tree). Ids fixos: reaplicar não duplica e
--   não sobrescreve edição feita pela equipe depois.
-- ───────────────────────────────────────────────────────────────────────────
insert into gps.ajuda_artigos (id, titulo, corpo, rotas, categorias, palavras_chave, sinonimos, ordem) values
(
  'a7a00000-0000-4000-8000-000000000001',
  'Onde cadastrar os meus 30 clientes',
  $t$Os clientes ficam na aba Clientes, no topo da tela. Há dois jeitos de cadastrar: um por um ou vários de uma vez.

Um por um: clique em "Adicionar", escreva o nome e o telefone com DDD e escolha a fase e o grau de relação. "Criar e abrir a ficha" salva e leva você para a ficha completa. "Salvar e adicionar outro" salva e deixa a janela aberta para o próximo: só o nome e o telefone são limpos, a fase e o grau continuam escolhidos.

Vários de uma vez: clique em "Colar lista" e cole uma pessoa por linha, com o nome e o telefone separados por hífen, ponto e vírgula ou vírgula. Também dá para copiar as duas colunas (nome e telefone) de uma planilha. Antes de gravar, o sistema mostra quem vai entrar e quem fica de fora, com o motivo. Cabem até 50 pessoas por vez.

O que faz a ficha contar para os 30 é ter nome e telefone. Quem entra sem telefone aparece na lista, mas só conta depois que você preencher o telefone na ficha.

Se mesmo assim não conseguir salvar, abra um chamado na aba Suporte e anexe um print da tela.$t$,
  array['/clientes', '/', '/etapa'],
  array['sistema'],
  'cadastrar cliente, adicionar cliente, não consigo cadastrar, cadastro de clientes, 30 clientes, lista de clientes, colar lista, salvar e adicionar outro, só consegui cadastrar um',
  'incluir registrar inserir lançar contatos pessoas planilha excel importar lote vários nomes telefone',
  10
),
(
  'a7a00000-0000-4000-8000-000000000002',
  'Os modelos de mensagem já aparecem, mas a tarefa não conclui',
  $t$Na Etapa 01, o passo "Enviar a sequência de 3 mensagens" traz os três modelos prontos: o problema (dia 1), a solução (dia 3) e a urgência com os dois horários (dia 5). Eles ficam abertos desde o início para você ler, copiar e se preparar.

O passo em si só é liberado quando a lista de 30 clientes está pronta: 30 fichas com nome e telefone. Antes disso, ele aparece com cadeado, com a frase "Após listar os 30 clientes" e quantos ainda faltam.

O motivo é a ordem do método: as mensagens são para os 30 da sua lista, e a ligação vem logo depois delas.

O passo "Listar 30 clientes potenciais" se conclui sozinho quando a 30ª ficha com nome e telefone é salva. Você não precisa marcar nada. Se você já tem 30 nomes e o passo continua travado, confira quais fichas estão sem telefone.$t$,
  array['/etapa', '/', '/clientes'],
  array['sistema'],
  'modelos de mensagem, sequência de 3 mensagens, tarefa não conclui, passo travado, cadeado, após listar os 30 clientes',
  'mensagem texto pronto copiar whatsapp bloqueado trancado liberar concluir etapa 01',
  20
),
(
  'a7a00000-0000-4000-8000-000000000003',
  'A estrela: o cliente que a equipe acompanha',
  $t$A estrela na aba Clientes não é "favorito" nem "por onde começar". Ela escolhe o único cliente que a equipe vai acompanhar com você até a execução da holding.

Ao clicar na estrela, o sistema explica a escolha antes. Ela só vale quando você clica em "Escolher este cliente". Com o cliente escolhido, os passos 4 a 8 da Etapa 01 são liberados.

Você mesmo pode trocar enquanto esse cliente estiver em Prospecção e sem reunião preliminar marcada. Assim que o caso avança (muda de fase ou ganha data de reunião), a troca passa a ser feita pela equipe.

Para trocar depois disso, abra um chamado na aba Suporte e escolha a categoria "Troca de cliente". Você indica para qual cliente quer trocar, e a equipe aprova ou explica o motivo. Se a categoria não aparecer, descreva o pedido na mensagem do chamado.$t$,
  array['/clientes', '/etapa'],
  array['troca_cliente'],
  'estrela, cliente favorito, favoritar, trocar cliente, cliente acompanhado, desmarcar estrela, não consigo trocar a estrela',
  'favorito principal destaque marcar acompanhamento equipe trocar mudar substituir',
  30
),
(
  'a7a00000-0000-4000-8000-000000000004',
  'Grau de relação e a opção "Eu mesmo"',
  $t$O grau de relação diz como você conhece o cliente: Parente, Amigo, Conhecido, Indicação, Cliente atual, Lead ou Eu mesmo (minha família). Você escolhe ao cadastrar ou depois, na ficha.

Se você não escolher, fica "Não informado". O sistema nunca preenche sozinho.

"Eu mesmo (minha família)" é para quando o cliente é você: a holding é da sua própria família.

O grau de relação não muda a contagem dos 30. O que conta é nome e telefone, para qualquer grau. Se for cadastrar várias pessoas da mesma família, use "Salvar e adicionar outro": o grau escolhido fica guardado para o próximo.$t$,
  array['/clientes'],
  array['sistema'],
  'grau de relação, eu mesmo, minha família, parente, amigo, conhecido, indicação, cliente atual, lead, não informado',
  'vínculo relacionamento parentesco próprio pessoal família tipo',
  40
),
(
  'a7a00000-0000-4000-8000-000000000005',
  'Como abrir um chamado e onde ver a resposta',
  $t$O atendimento fica na aba Suporte, no topo da tela. Clique em "Abrir chamado", escreva um assunto curto e conte na mensagem o que você tentou fazer, o que aconteceu e em qual tela. Se ajudar, anexe um print ou um PDF.

Quando a opção aparecer, escolha a categoria: Dificuldade no sistema, Troca de cliente, Troca de sócio ou Outros. As duas trocas têm um formulário próprio.

A resposta da equipe aparece dentro do próprio chamado, na aba Suporte. Quando chega resposta nova, a aba Suporte ganha um selo com o número de respostas, e você também recebe um e-mail.

Para continuar a conversa, responda no próprio chamado. Quando o problema estiver resolvido, clique em "Fechar chamado". Você pode ter até 5 chamados em aberto ao mesmo tempo.$t$,
  array['/chamados', '/'],
  array['sistema', 'outros'],
  'abrir chamado, suporte, resposta, onde vejo a resposta, falar com a equipe, selo, fechar chamado',
  'ajuda atendimento ticket pedido reclamação problema erro contato equipe respondeu',
  50
),
(
  'a7a00000-0000-4000-8000-000000000006',
  'Esqueci a senha',
  $t$Na tela de entrada há três caminhos para voltar a entrar.

Código de acesso: se a equipe passou um código para o seu grupo, digite o seu e-mail e, no campo de senha, o código. Não depende de e-mail chegar. Entrar pelo código troca a sua senha por uma provisória; depois de entrar, crie uma senha sua em Seu perfil (menu Sua conta), na opção "Trocar senha".

"Recuperar com e-mail e CPF": abre uma tela onde você informa o código de acesso, o seu e-mail e o seu CPF, e cria a senha nova na hora.

"Receber um link por e-mail": enviamos um link para criar uma nova senha. O e-mail pode levar alguns minutos e às vezes cai no spam ou no lixo eletrônico. Se o link expirar ou já tiver sido usado, peça outro.

Este login é o mesmo dos outros portais do Grupo Participa: a senha nova vale para todos eles.

Se nenhum caminho funcionar, fale com a secretaria pelo WhatsApp do Programa. Quem já está logado encontra o botão "Falar com a secretaria" no canto da tela; também dá para pedir ajuda por um chamado na aba Suporte.$t$,
  array['/perfil', '/'],
  array['sistema'],
  'esqueci a senha, recuperar senha, trocar senha, redefinir senha, não consigo entrar, e-mail não chegou, spam',
  'senha login acesso entrar bloqueado código cpf link redefinição',
  60
),
(
  'a7a00000-0000-4000-8000-000000000007',
  'Como dar acesso ao meu sócio',
  $t$O sócio entra no mesmo ambiente que você: os mesmos clientes, as mesmas tarefas e o mesmo progresso. Cada um entra com o próprio e-mail e a própria senha.

Abra o menu Sua conta, no topo da tela, e vá em Equipe. Informe o e-mail do sócio e clique em "Convidar meu sócio". Quem convida é o titular do ambiente.

O sócio recebe por e-mail o link do convite, que vale por 7 dias. Se expirar, reenvie pela própria aba Equipe. Se o e-mail não puder ser enviado na hora, a tela mostra o link para você copiar e mandar direto ao seu sócio.

Se o botão de convite não aparecer, o convite ainda não está liberado para o seu ambiente, e a tela avisa isso.

Para trocar o sócio, abra um chamado na aba Suporte com a categoria "Troca de sócio". A equipe aprova a saída do sócio atual e você convida o novo pela aba Equipe.$t$,
  array['/equipe'],
  array['troca_socio'],
  'acesso ao sócio, convidar sócio, convite, equipe, trocar sócio, sócio não recebeu',
  'parceiro sociedade dupla compartilhar ambiente login sócio link convite expirou',
  70
),
(
  'a7a00000-0000-4000-8000-000000000008',
  'Plantão de dúvidas: onde fica e como se inscrever',
  $t$O Plantão fica na aba Plantão. Como você já está logado, a inscrição usa a sua conta: não precisa informar nome nem e-mail.

Um plantão por vez: você escolhe o próximo depois que o atual acontecer.

Prazo: as inscrições fecham ao meio-dia (12h) do dia anterior ao plantão.

Intervalo: depois de cada plantão, o seguinte fica de fora. Por exemplo, com plantões na segunda, na terça e na quarta, quem foi na segunda pode escolher a quarta em diante. Se você estiver em intervalo, a própria tela diz a partir de qual plantão pode se inscrever de novo.

Todos os horários estão no horário de Brasília.$t$,
  array['/plantao'],
  array['outros'],
  'plantão, plantão de dúvidas, inscrição, prazo de inscrição, intervalo, não consigo me inscrever',
  'inscrever vaga horário encerrada fechada véspera meio-dia dúvidas ao vivo',
  80
),
(
  'a7a00000-0000-4000-8000-000000000009',
  'Sessões com a equipe jurídica',
  $t$A aba Sessões é onde você marca as reuniões com a equipe jurídica: a Entrevista Prévia e a Reunião Preliminar.

Quando há horários abertos, escolha um na grade. Os horários são os que a própria equipe disponibilizou. Se ainda não houver nenhum, a tela avisa.

Para marcar, é preciso ter escolhido na aba Clientes o cliente que a equipe acompanha (a estrela) e a etapa estar liberada para você. A tela também mostra o que a equipe já sabe sobre esse cliente e o que ainda falta.

Com a sessão marcada, o link da sala aparece nela. Você pode cancelar até 24 horas antes do início; depois disso, fale com a equipe pela aba Suporte.$t$,
  array['/sessoes'],
  array['outros'],
  'sessões, marcar reunião, entrevista prévia, reunião preliminar, agendar, cancelar sessão, link da sala',
  'agenda horário doutora advogada jurídico marcar remarcar desmarcar reunião',
  90
),
(
  'a7a00000-0000-4000-8000-000000000010',
  'Pasta do Drive: como abrir e o aviso de "sem permissão"',
  $t$A aba Pasta abre a pasta do Drive do seu ambiente direto no Google Drive, em outra aba. Lá ficam os documentos do seu processo.

Se a pasta ainda não foi vinculada, a tela pede o link: cole o link da pasta do Drive ou aguarde a equipe inserir. O link precisa começar com https://drive.google.com/ ou https://docs.google.com/.

Se foi você quem criou a pasta, antes de colar o link compartilhe a pasta no Drive (botão "Compartilhar", acesso de editor) com os e-mails da equipe que aparecem na tela.

Se o Google mostrar que você precisa de permissão, a conta Google aberta no navegador não tem acesso a essa pasta. Confira em qual conta do Google você está. Se for a conta certa, peça à equipe acesso de editor: abra um chamado na aba Suporte informando o e-mail dessa conta Google.$t$,
  array['/pasta'],
  array['sistema'],
  'pasta, drive, google drive, sem permissão, solicitar acesso, link da pasta, não abre a pasta',
  'documentos arquivos acesso negado permissão editor compartilhar pasta vazia',
  100
),
(
  'a7a00000-0000-4000-8000-000000000011',
  'Minuta: como anexar com o contexto',
  $t$As minutas do contrato ficam na ficha do cliente, na aba "Fechamento da Holding", na seção Minutas. Envie sempre em PDF (exporte o Word em PDF antes), com até 5 MB.

Na primeira minuta, preencha três campos antes de anexar: "Descreva o caso", "O que foi feito" e "Qual o primeiro ponto que você precisa de ajuda". Nas seguintes, um campo só: "O que foi alterado em relação à minuta anterior". Cada campo aceita até 2.000 caracteres.

Esse contexto é o que permite à equipe entender a minuta sem ter acompanhado a conversa.

Deixe em vermelho o que mudou em relação à minuta anterior e envie uma minuta por vez. Cada envio vira uma versão nova; as anteriores continuam na lista, com a data.$t$,
  array['/clientes'],
  array['sistema'],
  'minuta, anexar minuta, enviar minuta, contexto da minuta, nova versão, fechamento da holding',
  'contrato documento pdf word arquivo versão anexo revisão enviar subir',
  110
),
(
  'a7a00000-0000-4000-8000-000000000012',
  'O Programa e a área de membros: qual a diferença',
  $t$São duas plataformas diferentes. Este portal é o do Programa de Implementação Assistida: aqui ficam os seus clientes, as tarefas de cada etapa, o Suporte, as Sessões com a equipe jurídica, o Plantão e a sua Pasta.

As aulas gravadas ficam na área de membros, em outra plataforma (membros.holdingmasters.com.br). Quando uma tarefa pede para assistir a uma aula, o link abre a área de membros em outra aba.

A aba Materiais deste portal reúne os links das aulas e dos modelos de todas as etapas num lugar só. Material de etapa ainda não liberada aparece na lista, mas sem link.

O Suporte deste portal atende o Programa. Se não conseguir entrar na área de membros, avise a equipe por um chamado ou pela secretaria.$t$,
  array['/', '/materiais'],
  array['outros'],
  'área de membros, aulas, curso, diferença entre portal e área de membros, onde ficam as aulas, materiais',
  'aula vídeo curso plataforma hotmart membros acesso conteúdo gravado',
  120
)
on conflict (id) do nothing;

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- PROVA (rodar DEPOIS de aplicar; tudo em begin/rollback; trocar os uuids)
--
-- begin;
--   -- 0) grants: anon sem nada; authenticated só SELECT
--   select grantee, string_agg(privilege_type, ',' order by privilege_type)
--     from information_schema.role_table_grants
--    where table_schema='gps' and table_name in ('ajuda_artigos','ajuda_feedback')
--    group by 1;                          -- esperado: authenticated=SELECT (só)
--   select p.proname, p.proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='gps' and (p.proname like 'ajuda%' or p.proname like 'admin_ajuda%'
--          or p.proname='f_unaccent');  -- nenhum "=X/" (PUBLIC) nem anon=X
--   -- 1) anon: nada
--   set local role anon;
--   select * from gps.ajuda_por_rota('/clientes');              -- 42501
--   reset role;
--   -- 2) parceiro
--   select set_config('request.jwt.claims','{"sub":"<uuid-parceiro>","role":"authenticated"}', true);
--   set local role authenticated;
--   select titulo from gps.ajuda_por_rota('/clientes/abc');     -- 5 artigos de /clientes
--   select titulo, relevancia from gps.ajuda_buscar('não consigo cadastrar');
--                                                               -- 1º: "Onde cadastrar os meus 30 clientes"
--   select count(*) from gps.ajuda_buscar($$'); drop table gps.ajuda_artigos; --$$); -- sem erro
--   select count(*) from gps.ajuda_buscar('"cadastrar" -estrela or ''x'' & | ! <->'); -- sem erro
--   select count(*) from gps.ajuda_buscar('ab');                -- 0 (< 3)
--   select gps.ajuda_registrar_feedback('a7a00000-0000-4000-8000-000000000001', true, 'busca', 'não consigo cadastrar');
--   select gps.ajuda_registrar_feedback(null, null, 'busca', 'xyzzy inexistente');
--   select count(*) from gps.ajuda_feedback;                    -- 0 (RLS: parceiro não lê)
--   insert into gps.ajuda_feedback (pessoa, origem) values (auth.uid(),'tela'); -- 42501
--   update gps.ajuda_artigos set ativo=false;                   -- 42501
--   select gps.admin_ajuda_salvar(null,'x','yyyyyyyyyy',null,null,null,null,true,0); -- 42501
--   select gps.admin_ajuda_metricas();                          -- 42501
--   reset role;
--   -- 3) admin
--   select set_config('request.jwt.claims','{"sub":"<uuid-admin>","role":"authenticated"}', true);
--   set local role authenticated;
--   select gps.admin_ajuda_metricas();                          -- 1 sim, termo "xyzzy inexistente"
--   reset role;
-- rollback;
--
-- EXPLAIN (só SELECT; em transação mesmo assim; rodar 2× — a 1ª mede cache frio):
-- begin;
--   -- a) a RPC inteira, como o parceiro a chama
--   select set_config('request.jwt.claims','{"sub":"<uuid-parceiro>","role":"authenticated"}', true);
--   set local role authenticated;
--   explain (analyze, buffers) select * from gps.ajuda_buscar('não consigo cadastrar');
--   explain (analyze, buffers) select * from gps.ajuda_por_rota('/clientes/abc');
--   reset role;
--   -- b) o SELECT interno como DONO (é o que a DEFINER executa), normal e sem seqscan
--   explain (analyze, buffers)
--     select a.id from gps.ajuda_artigos a
--      where a.ativo and a.busca @@ websearch_to_tsquery('portuguese','consigo or cadastrar');
--   set local enable_seqscan = off;
--   explain (analyze, buffers)
--     select a.id from gps.ajuda_artigos a
--      where a.ativo and a.busca @@ websearch_to_tsquery('portuguese','consigo or cadastrar');
--                                    -- esperado: Bitmap Index Scan on idx_gps_ajuda_artigos_busca
-- rollback;
-- -- expurgo (DELETE: só em transação):
-- begin; explain (analyze, buffers) select gps.ajuda_feedback_expurgar(); rollback;
--
-- REVERSÃO (sem deploy: `update gps.config set valor='false' where chave='ajuda_ativo'`).
-- Remoção total:
--   select cron.unschedule('ajuda-feedback-expurgo');
--   drop function gps.ajuda_feedback_expurgar(), gps.admin_ajuda_metricas(),
--     gps.admin_ajuda_salvar(uuid,text,text,text[],text[],text,text,boolean,integer),
--     gps.ajuda_registrar_feedback(uuid,boolean,text,text),
--     gps.ajuda_buscar(text,text,text), gps.ajuda_por_rota(text), gps.ajuda_ativo();
--   drop table gps.ajuda_feedback; drop table gps.ajuda_artigos;
--   drop function gps.ajuda_rota_casa(text[],text), gps.ajuda_normalizar_rota(text), gps.f_unaccent(text);
--   delete from gps.config where chave='ajuda_ativo';
-- ═══════════════════════════════════════════════════════════════════════════
