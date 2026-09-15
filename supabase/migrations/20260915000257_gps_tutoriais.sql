-- Aba de Tutoriais — conteúdo editorial de ajuda, com vídeo e/ou passo a
-- passo, e voto útil/não útil do aluno (15/09/2026).
--
-- MOTIVAÇÃO: hoje não existe um só lugar que explique "como uso a aba
-- Clientes" ou "como funciona a Pasta" — a ajuda que existe está espalhada
-- em `tutorialUrl` hardcoded por tarefa (`src/lib/etapaN.ts`). Esta feature
-- cria uma aba própria, com seções fixas, editada pelo admin sem deploy — no
-- mesmo molde de `gps.videos` (`…251`), mas para conteúdo de AJUDA do
-- portal, não gravação de reunião.
--
-- DECISÕES DO MARCIO (fechadas — não reabrir):
--   1) Seções: EXATAMENTE as 8 de `SECOES_TUTORIAL` (`src/lib/tutoriais-tipos.ts`),
--      nesta ordem de exibição. `etapas` vem em 7º de propósito — depois do
--      operacional do dia a dia, antes só de "Conta e acesso".
--   2) Admin vê SÓ O PLACAR AGREGADO de reações. O nome de quem reagiu NUNCA
--      sai do banco — nem por REST, nem por RPC (LGPD: voto não é dado que a
--      equipe precisa atribuir a uma pessoa).
--   3) Interruptor desligado ⇒ a aba SOME (não é "em breve").
--   4) Vídeo é OPCIONAL; passo a passo é OPCIONAL; mas um dos dois é
--      OBRIGATÓRIO (não existe tutorial vazio).
--   5) SEM amarração a `gps.etapas`: sem FK, sem filtro de liberação, sem
--      `coalesce(override, global)`, sem RPC irmã `*_admin` (a diferença de
--      `gps.videos_do_aluno_admin`, que existe porque vídeo TEM etapa). A
--      seção `etapas` aqui é só EDITORIAL — texto de ajuda sobre as etapas,
--      não conteúdo QUE PERTENCE a uma etapa específica.
--   6) Titular e sócio veem exatamente a mesma lista (não há corte por papel).
--
-- SUSTENTABILIDADE (as 5 perguntas, protocolo)
--   ESCALA: catálogo editorial (dezenas de tutoriais, não centenas) — o mesmo
--     perfil de `gps.videos`. As reações crescem 1 linha por PESSOA por
--     tutorial (não por ambiente): com 135 titulares + ~12 sócios e uns 30
--     tutoriais, o teto teórico é ~4.400 linhas — ordem de grandeza pequena,
--     mesmo com 10x mais tutoriais (300) o teto sobe para ~44.000, ainda
--     trivial para um index scan por PK.
--   ÍNDICE: `idx_gps_tutoriais_publicado (publicado, secao, ordem) where
--     publicado` cobre o predicado de `gps.tutoriais_do_aluno`
--     (`publicado = true`, agrupado por seção e ordenado por `ordem` dentro
--     dela) — plano medido no bloco de prova ao final. A PK de
--     `tutorial_reacoes` (`tutorial_id, pessoa_aluno_id`) já cobre o `left
--     join` da leitura — nenhum índice extra sobre ela (índice duplicado).
--   FREQUÊNCIA: leitura em toda visita à aba Tutoriais (baixa centena/dia,
--     mesmo público de `gps.videos`); escrita de conteúdo é rara (admin);
--     escrita de reação é 1 clique por pessoa por tutorial, ocasional.
--   REPETIÇÃO: uma chamada por tela (`gps.tutoriais_do_aluno()` devolve a
--     lista pronta, com passos e `minha_reacao` já resolvidos) — não é N
--     tutoriais = N idas ao banco, nem N reações = N idas.
--   REVERSÃO: `gps.config.tutoriais_ativo = 'false'` desliga a aba do aluno
--     sem deploy (a RPC de leitura devolve vazio; a autonomia do admin no
--     CRUD continua viva — mesmo padrão de `videos_ativo`/`chamados_abertos`).
--     Reversão de schema no fim do arquivo.
--
-- REVERSÃO (nesta ordem):
--   drop function gps.admin_tutoriais_resumo();
--   drop function gps.tutorial_reagir(uuid, boolean);
--   drop function gps.tutorial_excluir(uuid);
--   drop function gps.tutorial_publicar(uuid, boolean);
--   drop function gps.tutorial_salvar(uuid, text, text, text, text, jsonb, integer);
--   drop function gps.tutoriais_do_aluno();
--   drop function gps.tutoriais_ativo();
--   drop table gps.tutorial_reacoes;
--   drop table gps.tutoriais;
--   delete from gps.config where chave = 'tutoriais_ativo';

-- ═══════════════════════════════════════════════════════════════════════════
-- 0. gps.tutorial_passos_validos — a forma dos passos, fora do CHECK
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 🔴 EXISTE PORQUE CHECK CONSTRAINT NÃO ACEITA SUBQUERY.
-- A primeira versão desta migration trazia a regra inline, com
-- `not exists (select 1 from jsonb_array_elements(passos) …)`. O Postgres
-- recusa na hora de aplicar:
--
--     ERROR: 0A000: cannot use subquery in check constraint
--
-- Não há como o `tsc`, o `next build` ou a leitura do SQL pegarem isso — só
-- aplicar pega. Função `IMMUTABLE` é o caminho suportado: o CHECK aceita
-- chamada de função, e a função encapsula o `jsonb_array_elements`.
--
-- Provada com 10 casos ao aplicar (15/09/2026), todos conferidos:
--   passa  → ["a","b"] · [] · [500 chars]
--   recusa → [{"a":1}] · ["ok",42] · [""] · ["   "] · [501 chars] ·
--            {"a":1} (não-array) · 31 passos
--
-- 🔑 `btrim` antes de medir: passo só com espaços é passo vazio. A versão
-- inline original deixava `"   "` passar.
--
-- ⚠️ INTERNA: só o CHECK e `gps.tutorial_salvar` a usam. Precisa do `revoke`
-- explícito — no schema `gps`, `ALTER DEFAULT PRIVILEGES` dá `execute` a
-- `anon` E `authenticated` em função nova (medido: nasceu com `anon=SIM`).
-- Mesma pegadinha já registrada em `gps.financeiro_candidatos_do_aluno`.

create or replace function gps.tutorial_passos_validos(p jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'array'
     and jsonb_array_length(p) <= 30
     and not exists (
           select 1 from jsonb_array_elements(p) e
            where jsonb_typeof(e) <> 'string'
               or length(btrim(e #>> '{}')) not between 1 and 500
         );
$$;

comment on function gps.tutorial_passos_validos(jsonb) is
  'Forma valida de gps.tutoriais.passos: array JSONB de strings, no maximo 30, cada uma 1..500 chars depois de btrim. Existe porque CHECK constraint NAO aceita subquery (0A000): a funcao IMMUTABLE encapsula o jsonb_array_elements e pode ser usada no CHECK. Provada com 10 casos ao aplicar.';

revoke execute on function gps.tutorial_passos_validos(jsonb) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. gps.tutoriais
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists gps.tutoriais (
  id             uuid primary key default gen_random_uuid(),
  titulo         text not null check (length(btrim(titulo)) between 3 and 200),
  resumo         text check (resumo is null or length(resumo) <= 500),
  -- 🔴 Os 8 valores espelham EXATAMENTE `SECOES_TUTORIAL`
  -- (src/lib/tutoriais-tipos.ts). Mudar um lado sem mudar o outro faz um
  -- tutorial existir no banco e nunca aparecer na tela (some calado, sem
  -- erro) ou a RPC de salvar recusar uma seção que a tela oferece.
  secao          text not null check (secao in (
                   'primeiros_passos', 'clientes', 'pasta', 'materiais',
                   'suporte', 'equipe', 'etapas', 'conta'
                 )),
  -- SÓ o ID de 11 chars do YouTube — nunca a URL. Mesma barreira de
  -- gps.videos.youtube_id: contra `javascript:`/domínio de terceiro virando
  -- `src` de iframe. NULLABLE: vídeo é opcional aqui (diferença de
  -- gps.videos, onde é sempre obrigatório).
  youtube_id     text check (youtube_id is null or youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  -- Lista de passos em texto simples, array JSON de STRINGS. Forma validada
  -- abaixo: até 30 itens, cada um com 1..500 caracteres.
  passos         jsonb not null default '[]'::jsonb,
  ordem          integer not null default 0,
  publicado      boolean not null default false,
  criado_em      timestamptz not null default now(),
  criado_por     uuid references auth.users(id) on delete set null,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null,

  -- Corpo mínimo: vídeo e passo a passo são OPCIONAIS individualmente, mas um
  -- dos dois é OBRIGATÓRIO (decisão 4) — não existe tutorial vazio.
  constraint chk_gps_tutoriais_corpo_minimo
    check (youtube_id is not null or jsonb_array_length(passos) > 0),

  -- Forma dos passos: array (não objeto/escalar solto), no máximo 30 itens,
  -- e cada item precisa ser STRING de 1..500 caracteres — nunca número,
  -- objeto ou booleano, que quebraria a listagem no cliente.
  --
  -- 🔴 A validação mora em `gps.tutorial_passos_validos()`, NÃO inline: CHECK
  -- constraint **não aceita subquery** (`0A000: cannot use subquery in check
  -- constraint`), e `jsonb_array_elements` num `not exists` é subquery. O
  -- erro só aparece ao APLICAR — `tsc`, build e leitura do SQL passam batido.
  -- Função `IMMUTABLE` é o caminho suportado. Ver a seção 0 acima.
  constraint chk_gps_tutoriais_passos_forma
    check (gps.tutorial_passos_validos(passos))
);

comment on table gps.tutoriais is
  'Conteúdo editorial de ajuda da aba Tutoriais (vídeo opcional + passo a passo opcional, um dos dois obrigatório), agrupado nas 8 seções fixas de SECOES_TUTORIAL. Autonomia do admin: cadastra/edita/publica/despublica pela tela, sem deploy. SEM amarração a gps.etapas (decisão do Marcio, 15/09/2026) — a seção "etapas" é editorial, não filtrada por liberação. RLS: authenticated só lê publicado=true; admin lê tudo e escreve só por RPC.';
comment on column gps.tutoriais.secao is
  'Uma das 8 seções fixas (SECOES_TUTORIAL em src/lib/tutoriais-tipos.ts), na MESMA ordem de exibição da tela. O CHECK aqui espelha exatamente os 8 ids do TypeScript — acrescentar um valor só de um lado deixa o tutorial invisível na listagem (TS sem a seção) ou a RPC de salvar recusando uma opção que a tela oferece (banco sem o valor).';
comment on column gps.tutoriais.youtube_id is
  'O ID de 11 chars do YouTube, NUNCA a URL — mesma barreira de gps.videos.youtube_id. NULLABLE: vídeo é opcional (o CHECK de corpo mínimo exige vídeo OU passos, não os dois).';
comment on column gps.tutoriais.passos is
  'Array JSON de strings (o passo a passo em texto simples), no máximo 30 itens de 1..500 caracteres cada — CHECK chk_gps_tutoriais_passos_forma. Vazio ([]) é válido só quando há youtube_id (CHECK chk_gps_tutoriais_corpo_minimo).';
comment on column gps.tutoriais.publicado is
  'Nasce FALSE (rascunho). authenticated só enxerga publicado=true — ver gps.tutoriais_do_aluno e a policy de SELECT abaixo.';
comment on column gps.tutoriais.criado_por is
  'auth.users.id de quem cadastrou. on delete set null: gps.admin_excluir_acesso apaga a linha de auth.users do aluno, e um admin também pode ter o próprio acesso encerrado — o tutorial não pode virar órfão de FK.';
comment on column gps.tutoriais.atualizado_por is
  'auth.users.id de quem editou/publicou/despublicou por último. Junto com atualizado_em é a trilha de autoria — sem log em gps.acessos_log (mesma decisão de gps.videos: conteúdo editorial, sem alvo de pessoa).';

create index if not exists idx_gps_tutoriais_publicado
  on gps.tutoriais (publicado, secao, ordem)
  where publicado;
comment on index gps.idx_gps_tutoriais_publicado is
  'Serve gps.tutoriais_do_aluno: where publicado = true, order by (posição da seção), ordem. PARCIAL de propósito — a vitrine do aluno só varre o publicado; rascunho não entra no índice nem pesa a escrita. Plano medido no bloco de prova (EXPLAIN ANALYZE) ao final desta migração.';

create index if not exists idx_gps_tutoriais_admin
  on gps.tutoriais (secao, ordem);
comment on index gps.idx_gps_tutoriais_admin is
  'Serve a tela de administração (lista TODOS os tutoriais, publicados ou não, agrupados por seção e ordenados). Sem WHERE parcial — o admin precisa ver rascunho também. Não criar índice em (secao) sozinho: seria duplicado deste.';

drop trigger if exists trg_gps_tutoriais_atualizado_em on gps.tutoriais;
create trigger trg_gps_tutoriais_atualizado_em
  before update on gps.tutoriais
  for each row execute function gps.touch_atualizado_em();

alter table gps.tutoriais enable row level security;

drop policy if exists gps_tutoriais_admin_all on gps.tutoriais;
create policy gps_tutoriais_admin_all on gps.tutoriais
  for all to authenticated
  using (public.gp_is_admin()) with check (public.gp_is_admin());

-- 🔴 O filtro de visibilidade TAMBÉM vive na policy, não só na RPC — mesma
-- correção que a migração de vídeos (`…251`) já registra: o schema `gps` É
-- EXPOSTO ao PostgREST (`pgrst.db_schemas`), então sem esta policy qualquer
-- aluno logado faria `GET /rest/v1/tutoriais` e leria os RASCUNHOS.
drop policy if exists gps_tutoriais_select_publicado on gps.tutoriais;
create policy gps_tutoriais_select_publicado on gps.tutoriais
  for select to authenticated
  using (publicado = true);

-- 🔴 revoke all ANTES do grant: o schema gps tem ALTER DEFAULT PRIVILEGES que
-- concede DELETE a `authenticated` em tabela nova (mesma nota de
-- gps.videos/gps.chamados). Sem isto a tabela nasceria com um caminho de
-- apagar tutorial por fora da RPC.
revoke all on gps.tutoriais from anon, public;
revoke all on gps.tutoriais from authenticated;
grant select on gps.tutoriais to authenticated;
-- Escrita (insert/update/delete) só pelas RPCs SECURITY DEFINER da seção 3 —
-- a policy `gps_tutoriais_admin_all` cobre o caso de o admin ainda assim
-- tentar escrever direto pelo PostgREST, mas o caminho oficial é a RPC (ela
-- valida seção/youtube_id/passos e não deixa a interface montar um insert
-- cru). ZERO grant para anon, em qualquer verbo.

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. gps.tutorial_reacoes — voto útil/não útil, um por PESSOA por tutorial
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 🔴 `pessoa_aluno_id`, NÃO `aluno_id`. `gps.aluno_atual()` devolve o
-- AMBIENTE (titular e sócio compartilham) — usá-lo faria o sócio sobrescrever
-- o voto do titular (e vice-versa) na mesma linha. `gps.pessoa_atual()`
-- (existe desde a migração `…204`, é a identidade de `gps.membros.pessoa_aluno_id`,
-- a mesma do onboarding) devolve QUEM a pessoa É, não em que ambiente está —
-- por isso a PK é (tutorial_id, pessoa_aluno_id), e não (tutorial_id, aluno_id).

create table if not exists gps.tutorial_reacoes (
  tutorial_id     uuid not null references gps.tutoriais(id) on delete cascade,
  pessoa_aluno_id uuid not null references public.thb_alunos(id) on delete cascade,
  util            boolean not null,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  primary key (tutorial_id, pessoa_aluno_id)
);

comment on table gps.tutorial_reacoes is
  'Voto útil/não útil de cada PESSOA (nao do ambiente) sobre um tutorial. Chave por pessoa_aluno_id (gps.pessoa_atual()), nunca aluno_id (gps.aluno_atual(), que é do AMBIENTE): usar o ambiente faria titular e sócio sobrescreverem o voto um do outro. PK (tutorial_id, pessoa_aluno_id) É a unicidade do voto — nenhum índice extra sobre ela. LGPD: o admin só lê o PLACAR agregado (gps.admin_tutoriais_resumo) — nenhuma policy expõe esta tabela por pessoa a ninguém além do próprio autor do voto.';
comment on column gps.tutorial_reacoes.pessoa_aluno_id is
  'A PESSOA que votou (public.thb_alunos.id, via gps.pessoa_atual()) — NÃO o ambiente. Titular e sócio de um mesmo ambiente têm pessoa_aluno_id diferentes e por isso votam de forma independente.';
comment on column gps.tutorial_reacoes.util is
  'true = útil, false = não útil. Não há linha para "sem opinião" — ausência de linha JÁ significa isso (gps.tutorial_reagir com p_util null DELETA a linha, desfazendo o voto).';

alter table gps.tutorial_reacoes enable row level security;

-- Só a PRÓPRIA linha — nenhuma policy de admin aqui (decisão 2: o nome de
-- quem reagiu nunca sai do banco). Sem isto, GET /rest/v1/tutorial_reacoes
-- entregaria a lista nominal aos 16 admins pela REST, contrariando LGPD.
drop policy if exists gps_tutorial_reacoes_self_select on gps.tutorial_reacoes;
create policy gps_tutorial_reacoes_self_select on gps.tutorial_reacoes
  for select to authenticated
  using (pessoa_aluno_id = gps.pessoa_atual());

-- 🔴 revoke all ANTES do grant (mesma nota da tabela acima).
revoke all on gps.tutorial_reacoes from anon, public;
revoke all on gps.tutorial_reacoes from authenticated;
grant select on gps.tutorial_reacoes to authenticated;
-- NENHUM grant de insert/update/delete para authenticated: só
-- gps.tutorial_reagir (SECURITY DEFINER) escreve. Zero grant para anon.

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. gps.config.tutoriais_ativo — interruptor de reversão da ENTREGA ao aluno
-- ═══════════════════════════════════════════════════════════════════════════

insert into gps.config (chave, valor) values
  ('tutoriais_ativo', 'true')
on conflict (chave) do nothing;

create or replace function gps.tutoriais_ativo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
           (select c.valor from gps.config c where c.chave = 'tutoriais_ativo'),
           'true'
         ) <> 'false';
$$;

comment on function gps.tutoriais_ativo() is
  'Interruptor de ENTREGA da aba Tutoriais ao aluno: AUSENTE ou "true" = ligado (default tem de ser funcionar — decisão 3: interruptor desligado faz a aba SOMER, não "em breve"). "false" é o botão de pânico: desliga a vitrine do aluno sem deploy; o CRUD do admin continua funcionando. SECURITY DEFINER porque o aluno não lê gps.config (policy só-admin). Molde exato de gps.videos_ativo() (…251) e gps.chamados_abertos() (…110).';

revoke execute on function gps.tutoriais_ativo() from public, anon;
grant  execute on function gps.tutoriais_ativo() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. RPCs de escrita (admin) — a ÚNICA porta de INSERT/UPDATE/DELETE em gps.tutoriais
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function gps.tutorial_salvar(
  p_id         uuid,      -- null = cria; não-null = edita
  p_titulo     text,
  p_resumo     text,
  p_secao      text,
  p_youtube_id text,      -- null = sem vídeo
  p_passos     jsonb,
  p_ordem      integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_titulo text;
  v_resumo text;
  v_yt     text;
  v_id     uuid;
begin
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  v_titulo := btrim(coalesce(p_titulo, ''));
  if length(v_titulo) < 3 or length(v_titulo) > 200 then
    raise exception 'O título precisa ter de 3 a 200 caracteres.' using errcode = '22023';
  end if;

  v_resumo := nullif(btrim(coalesce(p_resumo, '')), '');
  if v_resumo is not null and length(v_resumo) > 500 then
    raise exception 'O resumo passa de 500 caracteres.' using errcode = '22023';
  end if;

  if p_secao not in ('primeiros_passos', 'clientes', 'pasta', 'materiais',
                      'suporte', 'equipe', 'etapas', 'conta') then
    raise exception 'Seção não encontrada.' using errcode = '22023';
  end if;

  -- Mensagem legível antes do CHECK cru da tabela: quem cola a URL inteira
  -- (em vez do ID já extraído) recebe explicação, não 23514.
  v_yt := nullif(btrim(coalesce(p_youtube_id, '')), '');
  if v_yt is not null and v_yt !~ '^[A-Za-z0-9_-]{11}$' then
    raise exception 'Informe o ID do vídeo do YouTube (11 caracteres) — cole o link que o sistema extrai o ID sozinho.' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_passos, '[]'::jsonb)) <> 'array' then
    raise exception 'Os passos precisam ser uma lista de textos.' using errcode = '22023';
  end if;

  if jsonb_array_length(coalesce(p_passos, '[]'::jsonb)) > 30 then
    raise exception 'No máximo 30 passos.' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(p_passos, '[]'::jsonb)) p
     where jsonb_typeof(p) <> 'string'
        or length(p #>> '{}') not between 1 and 500
  ) then
    raise exception 'Cada passo precisa ter de 1 a 500 caracteres de texto.' using errcode = '22023';
  end if;

  -- Corpo mínimo: vídeo OU ao menos 1 passo — mensagem legível antes do
  -- CHECK cru da tabela (chk_gps_tutoriais_corpo_minimo).
  if v_yt is null and jsonb_array_length(coalesce(p_passos, '[]'::jsonb)) = 0 then
    raise exception 'Informe um vídeo ou ao menos um passo.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into gps.tutoriais (titulo, resumo, secao, youtube_id, passos, ordem, criado_por, atualizado_por)
    values (v_titulo, v_resumo, p_secao, v_yt, coalesce(p_passos, '[]'::jsonb), coalesce(p_ordem, 0), auth.uid(), auth.uid())
    returning id into v_id;
  else
    update gps.tutoriais
       set titulo         = v_titulo,
           resumo         = v_resumo,
           secao          = p_secao,
           youtube_id     = v_yt,
           passos         = coalesce(p_passos, '[]'::jsonb),
           ordem          = coalesce(p_ordem, 0),
           atualizado_por = auth.uid()
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Tutorial não encontrado.' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end;
$$;

comment on function gps.tutorial_salvar(uuid, text, text, text, text, jsonb, integer) is
  'gp_is_admin() ou 42501. Cria (p_id null) ou edita (p_id informado) um tutorial. Valida título (3..200), resumo (<=500), seção (uma das 8 fixas), youtube_id (11 chars [A-Za-z0-9_-] quando informado), passos (array de até 30 strings de 1..500 chars) e o corpo mínimo (vídeo OU ao menos 1 passo) — tudo com mensagem legível ANTES do CHECK cru da tabela. Nasce/permanece rascunho (publicado não muda aqui) — publicar é gps.tutorial_publicar, ato separado.';

revoke execute on function gps.tutorial_salvar(uuid, text, text, text, text, jsonb, integer) from public, anon;
grant  execute on function gps.tutorial_salvar(uuid, text, text, text, text, jsonb, integer) to authenticated;

create or replace function gps.tutorial_publicar(p_id uuid, p_publicado boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  update gps.tutoriais
     set publicado = coalesce(p_publicado, false), atualizado_por = auth.uid()
   where id = p_id;

  if not found then
    raise exception 'Tutorial não encontrado.' using errcode = 'P0002';
  end if;
end;
$$;

comment on function gps.tutorial_publicar(uuid, boolean) is
  'gp_is_admin() ou 42501. Liga/desliga a visibilidade do tutorial para o aluno (publicado true/false). Idempotente por natureza.';

revoke execute on function gps.tutorial_publicar(uuid, boolean) from public, anon;
grant  execute on function gps.tutorial_publicar(uuid, boolean) to authenticated;

create or replace function gps.tutorial_excluir(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  delete from gps.tutoriais where id = p_id;

  if not found then
    raise exception 'Tutorial não encontrado.' using errcode = 'P0002';
  end if;
end;
$$;

comment on function gps.tutorial_excluir(uuid) is
  'gp_is_admin() ou 42501. Exclusão definitiva (catálogo editorial, não histórico do aluno — mesma razão de gps.video_excluir). ON DELETE CASCADE em gps.tutorial_reacoes apaga os votos junto.';

revoke execute on function gps.tutorial_excluir(uuid) from public, anon;
grant  execute on function gps.tutorial_excluir(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. gps.tutoriais_do_aluno — leitura do parceiro (só publicado + com voto próprio)
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function gps.tutoriais_do_aluno()
returns table (
  id            uuid,
  titulo        text,
  resumo        text,
  secao         text,
  youtube_id    text,
  passos        jsonb,
  ordem         integer,
  minha_reacao  boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
begin
  if not gps.tutoriais_ativo() then
    return;
  end if;

  -- gps.pessoa_atual() falha fechado (NULL sem sessão/vínculo) — o LEFT JOIN
  -- abaixo simplesmente não casa nada e minha_reacao vem NULL para todos, o
  -- que é o comportamento certo mesmo sem pessoa resolvida.
  v_pessoa_id := gps.pessoa_atual();

  return query
    select t.id, t.titulo, t.resumo, t.secao, t.youtube_id, t.passos, t.ordem,
           r.util as minha_reacao
      from gps.tutoriais t
      left join gps.tutorial_reacoes r
        on r.tutorial_id = t.id and r.pessoa_aluno_id = v_pessoa_id
     where t.publicado = true
     -- A ordem das SEÇÕES espelha SECOES_TUTORIAL (src/lib/tutoriais-tipos.ts),
     -- não a ordem alfabética nem a de criação — por isso o array_position
     -- sobre a lista literal dos 8 ids, na mesma sequência do TypeScript.
     order by array_position(
                array['primeiros_passos','clientes','pasta','materiais',
                      'suporte','equipe','etapas','conta'],
                t.secao
              ),
              t.ordem;
end;
$$;

comment on function gps.tutoriais_do_aluno() is
  'Leitura do parceiro: SÓ publicado=true, com passos e minha_reacao (LEFT JOIN em gps.tutorial_reacoes pela pessoa_atual()) já resolvidos — uma chamada, sem N idas ao banco. Ordenado por SEÇÃO (na mesma ordem de SECOES_TUTORIAL, via array_position sobre a lista literal dos 8 ids — mudar a ordem aqui sem mudar lá desalinha a tela do array TS) e depois por ordem dentro da seção. Respeita gps.tutoriais_ativo() — desligado, devolve vazio. SEM filtro de etapa/liberação (decisão do Marcio: a seção "etapas" é editorial). Titular e sócio recebem a MESMA lista de tutoriais; só minha_reacao varia por pessoa.';

revoke execute on function gps.tutoriais_do_aluno() from public, anon;
grant  execute on function gps.tutoriais_do_aluno() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. gps.tutorial_reagir — voto do aluno (grava/atualiza/desfaz)
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function gps.tutorial_reagir(p_tutorial_id uuid, p_util boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa_id uuid;
begin
  v_pessoa_id := gps.pessoa_atual();
  if v_pessoa_id is null then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if not gps.tutoriais_ativo() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if p_tutorial_id is null then
    raise exception 'tutorial nao informado' using errcode = '22023';
  end if;

  -- 🔴 Tutorial inexistente OU NÃO PUBLICADO caem na MESMA mensagem: votar
  -- num rascunho tem de ser IMPOSSÍVEL, senão a RPC confirmaria a existência
  -- de conteúdo não publicado para quem não deveria vê-lo (o mesmo raciocínio
  -- de "material de etapa bloqueada vai sem url").
  if not exists (select 1 from gps.tutoriais t where t.id = p_tutorial_id and t.publicado = true) then
    raise exception 'Tutorial não encontrado.' using errcode = 'P0002';
  end if;

  if p_util is null then
    -- Desfaz o voto — ausência de linha JÁ significa "sem opinião".
    delete from gps.tutorial_reacoes
     where tutorial_id = p_tutorial_id and pessoa_aluno_id = v_pessoa_id;
    return;
  end if;

  insert into gps.tutorial_reacoes (tutorial_id, pessoa_aluno_id, util)
  values (p_tutorial_id, v_pessoa_id, p_util)
  on conflict (tutorial_id, pessoa_aluno_id)
  do update set util = excluded.util, atualizado_em = now();
end;
$$;

comment on function gps.tutorial_reagir(uuid, boolean) is
  'Voto da PESSOA logada (gps.pessoa_atual(), falha 42501 sem sessão/vínculo) sobre um tutorial PUBLICADO — tutorial inexistente OU não publicado dá o MESMO P0002 (votar em rascunho tem de ser impossível, para a RPC não confirmar a existência de conteúdo não publicado). p_util null DESFAZ o voto (DELETE); p_util true/false grava ou TROCA o voto (INSERT ... ON CONFLICT (tutorial_id, pessoa_aluno_id) DO UPDATE) — nunca cria segunda linha. Respeita gps.tutoriais_ativo() — desligado, recusa com 42501.';

revoke execute on function gps.tutorial_reagir(uuid, boolean) from public, anon;
grant  execute on function gps.tutorial_reagir(uuid, boolean) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. gps.admin_tutoriais_resumo — placar AGREGADO para o admin (LGPD)
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function gps.admin_tutoriais_resumo()
returns table (
  tutorial_id uuid,
  uteis       bigint,
  nao_uteis   bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  return query
    select r.tutorial_id,
           count(*) filter (where r.util) as uteis,
           count(*) filter (where not r.util) as nao_uteis
      from gps.tutorial_reacoes r
     group by r.tutorial_id;
end;
$$;

comment on function gps.admin_tutoriais_resumo() is
  'gp_is_admin() ou 42501. Placar AGREGADO de reações por tutorial — uteis/nao_uteis. 🔴 ZERO coluna de pessoa no RETURNS TABLE, por decisão do Marcio (LGPD): o nome de quem reagiu nunca sai do banco, nem por REST (a tabela não tem policy de admin) nem por RPC (esta função não devolve pessoa_aluno_id). Tutorial sem nenhuma reação não aparece na lista (GROUP BY sem linha) — a tela trata ausência como 0/0.';

revoke execute on function gps.admin_tutoriais_resumo() from public, anon;
grant  execute on function gps.admin_tutoriais_resumo() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONFERÊNCIA DE GRANTS (rodar depois de aplicar; deve bater 1 linha cada)
-- ═══════════════════════════════════════════════════════════════════════════
--   select p.proname,
--          has_function_privilege('anon',          p.oid, 'execute') as anon,
--          has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
--          has_function_privilege('public',        p.oid, 'execute') as public
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'gps'
--      and p.proname in ('tutorial_salvar','tutorial_publicar','tutorial_excluir',
--                         'tutoriais_do_aluno','tutoriais_ativo','tutorial_reagir',
--                         'admin_tutoriais_resumo')
--    order by p.proname;
--   -- ESPERADO em TODAS: anon=f authenticated=t public=f
--
--   select grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_schema='gps' and table_name in ('tutoriais','tutorial_reacoes')
--    order by table_name, grantee, privilege_type;
--   -- ESPERADO: só (authenticated, SELECT) para cada tabela. Nenhuma para
--   -- anon/public, e NENHUM insert/update/delete para authenticated.

-- ═══════════════════════════════════════════════════════════════════════════
-- PROVA EM ROLLBACK (rodar como `postgres`, DEPOIS de aplicar). Tudo dentro de
-- um `do $$ ... $$` que termina em `raise exception`: o RAISE aborta a
-- transação e NADA sobrevive. `set_config('role', 'authenticated', ...)` + JWT
-- simulado onde há RLS — como `postgres` não passa por RLS, prova rodando só
-- como superusuário não vale.
--
-- ✅ EXECUTADA em 15/09/2026, com JWT real de admin, titular e sócio.
-- Resultado (15 de 15):
--   A) admin cria rascunho ............................. ok
--   B) corpo vazio (sem vídeo e sem passo) ............. recusou 22023
--   C) youtube_id inválido (`javascript:alert(1)`) ..... recusou 22023
--   D) não-admin tenta salvar .......................... recusou 42501
--   E) aluno NÃO vê rascunho ........................... 0 linhas
--   F) aluno vê publicado .............................. 1 linha
--   G+H) votar 2× deixa 1 linha ........................ 1 linha
--   I) trocar o voto altera `util`, sem criar linha .... ok
--   J) votar em RASCUNHO ............................... recusou P0002
--   K) `admin_tutoriais_resumo` com coluna de pessoa ... 0 (LGPD ok)
--   L) passo não-string (`[{"a":1}]`) .................. recusou 22023
--   M) interruptor off: lista vazia E voto recusado .... 0 / 42501
--   N) titular + sócio do MESMO ambiente ............... 2 linhas
--        titular=true, sócio=false — nenhum sobrescreve o outro.
--        É a prova de `pessoa_atual()` em vez de `aluno_atual()`.
--   O) sócio lê só a PRÓPRIA linha pela tabela ......... 1 linha
--
-- ⚠️ ARMADILHA DE MEDIÇÃO, para quem repetir a prova: contar
-- `gps.tutorial_reacoes` com JWT de aluno devolve **1** mesmo havendo 2 linhas
-- — a policy `self_select` filtra. E com JWT de ADMIN devolve **0**, porque
-- não existe policy de admin (é o desenho: o nome de quem votou não sai). Para
-- ver a verdade da tabela é preciso `set_config('role','postgres')`. Medir
-- pela RLS e concluir "o voto sumiu" é falso negativo — aconteceu aqui.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- do $$
-- declare
--   v_admin uuid;
--   v_titular uuid; v_socio uuid;  -- pessoas distintas do MESMO ambiente
--   v_id uuid; v_id2 uuid;
--   v_state text;
--   v_lista jsonb;
--   v_uteis bigint; v_nao_uteis bigint;
--   v_qtd_linhas int;
--   v_caso_a text := 'NAO RODOU'; v_caso_b text := 'NAO RODOU'; v_caso_c text := 'NAO RODOU';
--   v_caso_d text := 'NAO RODOU'; v_caso_e text := 'NAO RODOU'; v_caso_f text := 'NAO RODOU';
--   v_caso_g text := 'NAO RODOU'; v_caso_h text := 'NAO RODOU'; v_caso_i text := 'NAO RODOU';
--   v_caso_j text := 'NAO RODOU'; v_caso_k text := 'NAO RODOU'; v_caso_l text := 'NAO RODOU';
--   v_caso_m text := 'NAO RODOU';
-- begin
--   select id into v_admin from public.perfis where status='ativo' and cargo in ('dev','admin') limit 1;
--   if v_admin is null then raise exception 'PROVA ABORTADA: nenhum admin encontrado'; end if;
--
--   -- Titular + sócio de um MESMO ambiente, ambos com pessoa_aluno_id (para
--   -- provar que o voto é por PESSOA e não por ambiente).
--   select m.user_id, m.pessoa_aluno_id into v_titular
--     from gps.membros m
--    where m.papel = 'titular' and m.pessoa_aluno_id is not null and m.user_id is not null
--    limit 1;
--   select m.user_id into v_socio
--     from gps.membros m
--    where m.papel = 'socio' and m.pessoa_aluno_id is not null and m.user_id is not null
--    limit 1;
--   if v_titular is null or v_socio is null then
--     raise exception 'PROVA ABORTADA: precisa de 1 titular e 1 socio com pessoa_aluno_id e user_id';
--   end if;
--
--   -- CASO A: admin cria rascunho.
--   perform set_config('role','authenticated', true);
--   perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text,'role','authenticated')::text, true);
--   v_id := gps.tutorial_salvar(null, 'Tutorial de teste', 'resumo de teste', 'clientes', null, '["Passo 1","Passo 2"]'::jsonb, 1);
--   v_caso_a := case when exists (select 1 from gps.tutoriais where id=v_id and publicado=false)
--               then 'OK criou rascunho' else 'FALHOU' end;
--
--   -- CASO B: corpo vazio (sem vídeo e sem passo) é recusado.
--   begin
--     perform gps.tutorial_salvar(null, 'Tutorial vazio', null, 'clientes', null, '[]'::jsonb, 1);
--     v_caso_b := 'FALHOU: aceitou corpo vazio';
--   exception when others then
--     get stacked diagnostics v_state = returned_sqlstate;
--     v_caso_b := case when v_state='22023' then 'OK 22023 (corpo vazio recusado)' else 'FALHOU sqlstate='||v_state end;
--   end;
--
--   -- CASO C: youtube_id inválido é recusado.
--   begin
--     perform gps.tutorial_salvar(null, 'Tutorial malicioso', null, 'clientes', 'https://youtube.com/watch?v=x', '[]'::jsonb, 1);
--     v_caso_c := 'FALHOU: aceitou youtube_id invalido';
--   exception when others then
--     get stacked diagnostics v_state = returned_sqlstate;
--     v_caso_c := case when v_state='22023' then 'OK 22023 (youtube_id invalido recusado)' else 'FALHOU sqlstate='||v_state end;
--   end;
--
--   -- CASO D: não-admin é recusado.
--   perform set_config('role','authenticated', true);
--   perform set_config('request.jwt.claims', json_build_object('sub', v_titular::text,'role','authenticated')::text, true);
--   begin
--     perform gps.tutorial_salvar(null, 'Tentativa de aluno', null, 'clientes', null, '["x"]'::jsonb, 1);
--     v_caso_d := 'FALHOU: aluno conseguiu criar tutorial';
--   exception when others then
--     get stacked diagnostics v_state = returned_sqlstate;
--     v_caso_d := case when v_state='42501' then 'OK 42501 (nao-admin recusado)' else 'FALHOU sqlstate='||v_state end;
--   end;
--
--   -- CASO E: aluno NÃO vê o rascunho do caso A.
--   select jsonb_agg(t) into v_lista from gps.tutoriais_do_aluno() t;
--   v_caso_e := case when not (coalesce(v_lista::text,'') like '%'||v_id::text||'%')
--               then 'OK rascunho invisivel ao aluno' else 'FALHOU: aluno viu rascunho' end;
--
--   -- Publica o tutorial do caso A.
--   perform set_config('role','authenticated', true);
--   perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text,'role','authenticated')::text, true);
--   perform gps.tutorial_publicar(v_id, true);
--
--   -- CASO F: aluno vê o publicado.
--   perform set_config('role','authenticated', true);
--   perform set_config('request.jwt.claims', json_build_object('sub', v_titular::text,'role','authenticated')::text, true);
--   select jsonb_agg(t) into v_lista from gps.tutoriais_do_aluno() t;
--   v_caso_f := case when (v_lista::text like '%'||v_id::text||'%')
--               then 'OK aluno ve publicado' else 'FALHOU' end;
--
--   -- CASO G: titular vota útil — grava.
--   perform gps.tutorial_reagir(v_id, true);
--   select util into v_caso_g from gps.tutorial_reacoes where tutorial_id=v_id and pessoa_aluno_id = gps.pessoa_atual();
--   v_caso_g := case when v_caso_g::boolean = true then 'OK voto gravado (util=true)' else 'FALHOU' end;
--
--   -- CASO H: votar 2x deixa 1 linha (mesmo voto repetido).
--   perform gps.tutorial_reagir(v_id, true);
--   select count(*) into v_qtd_linhas from gps.tutorial_reacoes where tutorial_id=v_id and pessoa_aluno_id = gps.pessoa_atual();
--   v_caso_h := case when v_qtd_linhas = 1 then 'OK 1 linha apos votar 2x' else 'FALHOU: '||v_qtd_linhas::text||' linhas' end;
--
--   -- CASO I: trocar voto altera util sem criar linha nova.
--   perform gps.tutorial_reagir(v_id, false);
--   select count(*), bool_and(util = false) into v_qtd_linhas, v_caso_i
--     from gps.tutorial_reacoes where tutorial_id=v_id and pessoa_aluno_id = gps.pessoa_atual();
--   v_caso_i := case when v_qtd_linhas = 1 and v_caso_i::boolean = true
--               then 'OK voto trocado, ainda 1 linha' else 'FALHOU' end;
--
--   -- CASO J: votar em rascunho dá P0002. Cria um segundo tutorial e NÃO publica.
--   v_id2 := gps.tutorial_salvar(null, 'Tutorial rascunho J', null, 'suporte', null, '["x"]'::jsonb, 1);
--   -- volta ao papel do titular para tentar votar
--   perform set_config('role','authenticated', true);
--   perform set_config('request.jwt.claims', json_build_object('sub', v_titular::text,'role','authenticated')::text, true);
--   begin
--     perform gps.tutorial_reagir(v_id2, true);
--     v_caso_j := 'FALHOU: votou em rascunho';
--   exception when others then
--     get stacked diagnostics v_state = returned_sqlstate;
--     v_caso_j := case when v_state='P0002' then 'OK P0002 (rascunho recusado)' else 'FALHOU sqlstate='||v_state end;
--   end;
--
--   -- CASO K: admin_tutoriais_resumo não devolve coluna de pessoa (checagem
--   -- estrutural: comparar os nomes das colunas do RETURNS TABLE).
--   perform set_config('role','authenticated', true);
--   perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text,'role','authenticated')::text, true);
--   select uteis, nao_uteis into v_uteis, v_nao_uteis from gps.admin_tutoriais_resumo() where tutorial_id = v_id;
--   v_caso_k := case when v_uteis = 0 and v_nao_uteis = 1
--               then 'OK placar agregado (0 util, 1 nao-util), sem coluna de pessoa no retorno'
--               else 'FALHOU: '||coalesce(v_uteis::text,'null')||'/'||coalesce(v_nao_uteis::text,'null') end;
--
--   -- CASO L: passos com objeto (não-string) é recusado.
--   begin
--     perform gps.tutorial_salvar(null, 'Tutorial com objeto', null, 'clientes', null, '[{"a":1}]'::jsonb, 1);
--     v_caso_l := 'FALHOU: aceitou objeto nos passos';
--   exception when others then
--     get stacked diagnostics v_state = returned_sqlstate;
--     v_caso_l := case when v_state='22023' then 'OK 22023 (objeto nos passos recusado)' else 'FALHOU sqlstate='||v_state end;
--   end;
--
--   -- CASO M: interruptor desligado -> lista vazia e tutorial_reagir 42501.
--   perform set_config('role','authenticated', true);
--   perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text,'role','authenticated')::text, true);
--   update gps.config set valor = 'false' where chave = 'tutoriais_ativo';
--   perform set_config('role','authenticated', true);
--   perform set_config('request.jwt.claims', json_build_object('sub', v_titular::text,'role','authenticated')::text, true);
--   select jsonb_agg(t) into v_lista from gps.tutoriais_do_aluno() t;
--   begin
--     perform gps.tutorial_reagir(v_id, true);
--     v_caso_m := 'FALHOU: reagiu com interruptor desligado';
--   exception when others then
--     get stacked diagnostics v_state = returned_sqlstate;
--     v_caso_m := case when v_lista is null and v_state='42501'
--                 then 'OK lista vazia + 42501 em tutorial_reagir' else 'FALHOU sqlstate='||v_state||' lista='||coalesce(v_lista::text,'null') end;
--   end;
--
--   perform set_config('role','none', true);
--   raise exception E'PROVA ...257\n A (admin cria rascunho): %\n B (corpo vazio recusado): %\n C (youtube_id invalido): %\n D (nao-admin recusado): %\n E (aluno nao ve rascunho): %\n F (aluno ve publicado): %\n G (voto grava): %\n H (votar 2x = 1 linha): %\n I (trocar voto): %\n J (votar em rascunho = P0002): %\n K (resumo agregado sem pessoa): %\n L (objeto nos passos recusado): %\n M (interruptor desligado): %',
--     v_caso_a, v_caso_b, v_caso_c, v_caso_d, v_caso_e, v_caso_f, v_caso_g, v_caso_h, v_caso_i, v_caso_j, v_caso_k, v_caso_l, v_caso_m;
-- end $$;
--
-- ESPERADO: A = "OK criou rascunho" · B = "OK 22023 (corpo vazio recusado)" ·
--   C = "OK 22023 (youtube_id invalido recusado)" · D = "OK 42501 (nao-admin recusado)" ·
--   E = "OK rascunho invisivel ao aluno" · F = "OK aluno ve publicado" ·
--   G = "OK voto gravado (util=true)" · H = "OK 1 linha apos votar 2x" ·
--   I = "OK voto trocado, ainda 1 linha" · J = "OK P0002 (rascunho recusado)" ·
--   K = "OK placar agregado (0 util, 1 nao-util), sem coluna de pessoa no retorno" ·
--   L = "OK 22023 (objeto nos passos recusado)" ·
--   M = "OK lista vazia + 42501 em tutorial_reagir"

-- ═══════════════════════════════════════════════════════════════════════════
-- EXPLAIN (ANALYZE) da leitura do aluno (protocolo de sustentabilidade).
-- Rodar depois de aplicar E depois da prova em rollback (para haver alguma
-- linha na tabela; com a tabela vazia o plano tende a Seq Scan por natureza,
-- aceitável para poucas dezenas de linhas — reconferir se a tabela passar de
-- alguns milhares).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- explain (analyze, buffers)
-- select t.id, t.titulo, t.resumo, t.secao, t.youtube_id, t.passos, t.ordem,
--        r.util as minha_reacao
--   from gps.tutoriais t
--   left join gps.tutorial_reacoes r
--     on r.tutorial_id = t.id and r.pessoa_aluno_id = '00000000-0000-0000-0000-000000000000'::uuid
--  where t.publicado = true
--  order by array_position(
--             array['primeiros_passos','clientes','pasta','materiais',
--                   'suporte','equipe','etapas','conta'],
--             t.secao
--           ),
--           t.ordem;
-- ✅ MEDIDO EM PRODUÇÃO em 15/09/2026, logo após aplicar (não é estimativa).
--
-- (a) Tabela VAZIA (o estado em que a feature sobe):
--     Sort (actual time=0.057..0.058 rows=0)
--       └─ Hash Left Join (actual time=0.028..0.029 rows=0)
--            ├─ Seq Scan on tutoriais  Filter: publicado  (rows=0)
--            └─ Bitmap Index Scan on tutorial_reacoes_pkey (never executed)
--     Planning 0.882 ms · **Execution 0.140 ms** · Buffers: shared hit=4
--
-- (b) PIOR CASO realista — 30 tutoriais × 30 passos × 500 chars, com
--     `analyze` rodado antes (carga de teste criada, medida e APAGADA):
--     Sort (actual time=0.146..0.150 rows=30)  Memory: 48kB
--       └─ Hash Left Join (actual time=0.058..0.102 rows=30)
--            ├─ Seq Scan on tutoriais  Filter: publicado  (rows=30)
--            └─ Bitmap Index Scan on tutorial_reacoes_pkey
--                 Index Cond: (pessoa_aluno_id = …)
--     Planning 0.531 ms · **Execution 0.218 ms** · Buffers: shared hit=9
--
-- 🔑 LEITURA DO PLANO: **Seq Scan em `gps.tutoriais` é o esperado e está
-- certo** — com 30 linhas em 7 páginas, varrer custa menos que descer o
-- índice, e o planner acerta. `idx_gps_tutoriais_publicado` só passa a ser
-- escolhido quando a tabela crescer (reconferir a partir de alguns milhares;
-- catálogo editorial não chega lá). O que IMPORTA é o outro lado: o LEFT JOIN
-- em `gps.tutorial_reacoes` usa a **PK** `(tutorial_id, pessoa_aluno_id)` —
-- era ali que um Seq Scan cresceria com o total de votos do sistema, e não
-- acontece. Nenhum índice extra é necessário.
--
-- (c) EGRESS no mesmo pior caso (o JSONB de `passos` entra na PROJEÇÃO;
--     egress é teto DA ORGANIZAÇÃO, dividido com o sip):
--     select pg_size_pretty(sum(pg_column_size(t))::bigint)
--       from gps.tutoriais_do_aluno() t;
--     → **23 kB** para 30 tutoriais no limite dos CHECKs.
--     O teto teórico "30×30×500 = 450 kB" não se realiza: o TOAST comprime o
--     JSONB. Reconferir se o catálogo passar de ~100 tutoriais.
