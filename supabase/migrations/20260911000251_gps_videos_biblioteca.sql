-- Biblioteca de vídeos das reuniões — autonomia do admin (demanda 5, 11/09/2026).
--
-- MOTIVAÇÃO: "subir MP4 pro sistema consome demais à toa" (o Marcio está certo:
-- upload estouraria Storage + egress, teto da ORGANIZAÇÃO, dividido com o sip).
-- Embed por link resolve. Decisões já fechadas no briefing (não reabrir):
--   1) SÓ YouTube (incl. não listado) — nada de Vimeo/Loom/Drive nesta versão.
--   2) NÃO migrar o acervo atual: as aulas de hoje (`tutorialUrl` hardcoded em
--      src/lib/etapa1.ts/etapa2.ts/etapa3.ts) continuam como estão. Apurado:
--      apontam para `1sh.co` e `membros.holdingmasters.com.br`, que redirecionam
--      para tela de LOGIN — não são embedáveis. Esta feature é só para
--      gravações NOVAS.
--   3) Autonomia do admin: cadastra, edita, publica e despublica pela tela, sem
--      deploy.
--
-- GUARDA O youtube_id, NÃO A URL. O admin cola qualquer forma (watch?v=,
-- youtu.be/, /embed/, com ?t= ou &list=) e a EXTRAÇÃO é lógica de apresentação
-- (fica no TS, camada de admin) — o banco só aceita o resultado já extraído e
-- barra qualquer coisa que não seja exatamente 11 caracteres de
-- [A-Za-z0-9_-]. É a barreira contra `javascript:` ou domínio de terceiro
-- virando `src` de iframe: quem monta a URL de embed sempre concatena
-- `https://www.youtube-nocookie.com/embed/` + este valor já validado pelo
-- CHECK, nunca a URL crua que o admin colou.
--
-- ETAPA BLOQUEADA: o aluno NÃO vê o vídeo de uma etapa que ainda não abriu
-- para ele. Decisão: `gps.videos_do_aluno` filtra por `gps.aluno_atual()` e
-- pela MESMA regra de liberação de `gps.etapa_liberada_para`
-- (coalesce(override, global)) — mas embutida inline, e não reusando aquela
-- função: `etapa_liberada_para(p_aluno_id, p_etapa)` recusa `p_etapa is null`
-- (vídeo GERAL, sem etapa, tem de passar sempre) e tem guarda de "admin OU o
-- próprio aluno" que aqui é redundante (a RPC já está escopada ao aluno_atual()
-- do próprio chamador — perguntar pelo ambiente alheio nem é possível). Sem
-- este filtro na LEITURA, o youtube_id viajaria no HTML de uma etapa travada e
-- o vídeo ficaria assistível por view-source, ainda que a UI escondesse o
-- player — o mesmo raciocínio da regra "material de etapa bloqueada vai sem
-- `url`" (F.1, 09/09).
--
-- LOG EM gps.acessos_log: NÃO. Decisão, não esquecimento. O CHECK de `acao` é
-- fechado e cada ação nova tem de ser encontrada pelo CONTEÚDO (ver bloco 3).
-- `gps.acessos_log` audita ações que afetam uma PESSOA/ambiente (aluno_id não
-- nulo, "o que a equipe fez EM QUEM"). Vídeo é conteúdo EDITORIAL do admin, sem
-- alvo de pessoa — logar geraria linhas com `aluno_id null`, que não é o
-- desenho da tabela (toda ação hoje aponta para um ambiente). A trilha de
-- autoria fica na própria tabela (`criado_por`/`atualizado_por`/
-- `atualizado_em`), suficiente para responder "quem publicou isto e quando".
-- Vídeo não é dado pessoal de aluno (LGPD não se aplica aqui).
--
-- SUSTENTABILIDADE (as 5 perguntas, protocolo)
--   ESCALA: catálogo editorial, tamanho da ordem de dezenas (reuniões
--     gravadas), não de linha por aluno. Com 10x mais vídeos (centenas)
--     continua sendo `select * where publicado [and etapa]`, resolvido por
--     índice — nenhuma variável do sistema (nº de alunos, nº de cliques) infla
--     esta tabela.
--   ÍNDICE: `idx_gps_videos_publicado_etapa (publicado, etapa, ordem) where
--     publicado` cobre exatamente o predicado de `gps.videos_do_aluno`
--     (`publicado = true and (etapa is null or etapa = $1)`) — plano medido no
--     bloco de prova ao final (EXPLAIN ANALYZE).
--   FREQUÊNCIA: leitura em toda visita à tela de vídeos/etapa (baixa
--     centena/dia hoje, 135 titulares); escrita é rara (admin publica de vez em
--     quando). Perfil de leitura pesada / escrita leve — index parcial por
--     `publicado` é exatamente o par certo.
--   REPETIÇÃO: uma chamada por tela (`gps.videos_do_aluno(p_etapa)` devolve a
--     lista pronta, filtrada e ordenada) — não é N vídeos = N idas ao banco.
--   REVERSÃO: `gps.config.videos_ativo = 'false'` desliga a ENTREGA ao aluno
--     sem deploy (gps.videos_ativo() vira false, a RPC de leitura devolve
--     vazio) — a autonomia do admin (CRUD) segue viva, só a vitrine do aluno
--     apaga. Reversão de schema no fim do arquivo.
--
-- REVERSÃO (nesta ordem):
--   drop function gps.videos_do_aluno(smallint);
--   drop function gps.video_excluir(uuid);
--   drop function gps.video_publicar(uuid, boolean);
--   drop function gps.video_salvar(uuid, text, text, text, smallint, integer);
--   drop function gps.videos_ativo();
--   drop table gps.videos;
--   delete from gps.config where chave = 'videos_ativo';

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. gps.videos
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists gps.videos (
  id            uuid primary key default gen_random_uuid(),
  titulo        text not null check (length(btrim(titulo)) between 3 and 200),
  descricao     text check (descricao is null or length(descricao) <= 2000),
  -- SÓ o ID de 11 chars do YouTube — nunca a URL inteira. Ver motivação no
  -- cabeçalho. `_`/`-` fazem parte do alfabeto real de IDs do YouTube.
  youtube_id    text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  -- nullable: vídeo pode ser GERAL (não amarrado a nenhuma etapa específica).
  etapa         smallint references gps.etapas(id) on delete set null,
  ordem         integer not null default 0,
  publicado     boolean not null default false,
  criado_em     timestamptz not null default now(),
  criado_por    uuid references auth.users(id) on delete set null,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null
);

comment on table gps.videos is
  'Biblioteca de vídeos (reuniões/gravações) embedados por link do YouTube — SÓ YouTube (incl. não listado) nesta versão. Autonomia do admin: cadastra/edita/publica/despublica pela tela, sem deploy. NÃO inclui o acervo atual (tutorialUrl hardcoded em src/lib/etapaN.ts) — decisão do Marcio, ver briefing 2026-09-11-4-demandas. RLS: authenticated só lê publicados (e só de etapa liberada para ele, via gps.videos_do_aluno); admin lê tudo e escreve só por RPC.';
comment on column gps.videos.youtube_id is
  'O ID de 11 chars do YouTube, NUNCA a URL. Extrair de watch?v=/youtu.be//embed/ (com ?t=/&list=) é lógica de apresentação (TS, camada de admin) — o banco só aceita o resultado já extraído. CHECK ~ ''^[A-Za-z0-9_-]{11}$'' é a barreira contra `javascript:` ou domínio de terceiro virando `src` de iframe: quem monta a URL de embed concatena https://www.youtube-nocookie.com/embed/ + este valor, nunca a URL crua colada pelo admin.';
comment on column gps.videos.etapa is
  'Etapa do programa (gps.etapas.id) a que o vídeo pertence. NULL = vídeo GERAL, visível independente de etapa. `on delete set null`: remover uma etapa (não deveria acontecer, mas não é este o lugar de impedir) não pode arrastar o vídeo.';
comment on column gps.videos.publicado is
  'Nasce FALSE (rascunho). authenticated só enxerga publicado=true, e mesmo assim só se a etapa (quando houver) estiver liberada para ele — ver gps.videos_do_aluno.';
comment on column gps.videos.criado_por is
  'auth.users.id de quem cadastrou. `on delete set null`: gps.admin_excluir_acesso apaga a linha de auth.users do aluno, e um admin também pode ter o próprio acesso encerrado um dia — o vídeo não pode virar órfão de FK.';
comment on column gps.videos.atualizado_por is
  'auth.users.id de quem editou/publicou/despublicou por último. Junto com atualizado_em é a trilha de autoria desta feature — não há log em gps.acessos_log (decisão: vídeo é conteúdo editorial, sem alvo de pessoa; ver cabeçalho).';

create index if not exists idx_gps_videos_publicado_etapa
  on gps.videos (publicado, etapa, ordem)
  where publicado;
comment on index gps.idx_gps_videos_publicado_etapa is
  'Serve gps.videos_do_aluno: where publicado = true and (etapa is null or etapa = $1), order by ordem. PARCIAL de propósito -- a vitrine do aluno só varre o que está publicado; rascunho não entra no índice nem pesa a escrita. Plano medido no bloco de prova (EXPLAIN ANALYZE) ao final desta migração.';

create index if not exists idx_gps_videos_admin_lista
  on gps.videos (etapa, ordem);
comment on index gps.idx_gps_videos_admin_lista is
  'Serve a tela de administração (lista TODOS os vídeos, publicados ou não, agrupados por etapa e ordenados): where etapa = $1 order by ordem, ou a listagem completa ordenada. Sem WHERE parcial -- o admin precisa ver rascunho também.';

drop trigger if exists trg_gps_videos_atualizado_em on gps.videos;
create trigger trg_gps_videos_atualizado_em
  before update on gps.videos
  for each row execute function gps.touch_atualizado_em();

alter table gps.videos enable row level security;

drop policy if exists gps_videos_admin_all on gps.videos;
create policy gps_videos_admin_all on gps.videos
  for all to authenticated
  using (public.gp_is_admin()) with check (public.gp_is_admin());

-- 🔴 O FILTRO DE ETAPA TAMBÉM VIVE NA POLICY, não só na RPC (corrigido na
-- revisão, 11/09/2026).
--
-- A versão original desta migração dava `using (publicado = true)` e chamava
-- isso de "rede de segurança contra quem chamar o PostgREST direto". É o
-- inverso: o schema `gps` É EXPOSTO ao PostgREST
-- (`pgrst.db_schemas = 'public, graphql_public, gps'`, ver CLAUDE.md), então
-- qualquer aluno logado faria `GET /rest/v1/videos` e leria o `youtube_id` de
-- TODA etapa publicada — inclusive das que ainda não abriram para ele. A RPC
-- filtrava; a REST, ao lado, entregava.
--
-- É exatamente o furo que a regra F.1 (09/09) existe para fechar: "material de
-- etapa bloqueada vai para o cliente SEM url — o corte é no servidor".
--
-- Agora a mesma regra `coalesce(override, global)` da RPC está aqui. Custa uma
-- subconsulta por linha numa tabela de dezenas de linhas, lida por um catálogo
-- pequeno — e fecha a porta lateral.
drop policy if exists gps_videos_select_publicado on gps.videos;
create policy gps_videos_select_publicado on gps.videos
  for select to authenticated
  using (
    publicado = true
    and (
      etapa is null
      or coalesce(
           (select o.liberada
              from gps.etapa_liberacao_aluno o
             where o.aluno_id = gps.aluno_atual() and o.etapa = gps.videos.etapa),
           (select e.liberada from gps.etapas e where e.id = gps.videos.etapa),
           false
         )
    )
  );

-- 🔴 revoke all ANTES do grant: o schema gps tem ALTER DEFAULT PRIVILEGES que
-- concede DELETE a `authenticated` em tabela nova (conferido em 08/09, mesma
-- nota de gps.chamados/...110). Sem isto a tabela nasceria com um caminho de
-- apagar vídeo por fora da RPC.
revoke all on gps.videos from anon, public;
revoke all on gps.videos from authenticated;
grant select on gps.videos to authenticated;
-- Escrita (insert/update/delete) só pelas RPCs SECURITY DEFINER abaixo — a
-- policy `gps_videos_admin_all` cobre o caso de o admin ainda assim tentar
-- escrever direto pelo PostgREST, mas o caminho oficial é sempre a RPC (ela
-- valida youtube_id/título e não deixa a interface montar um insert cru).
-- ZERO grant para anon, em qualquer verbo.

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. gps.config.videos_ativo — interruptor de reversão da ENTREGA ao aluno
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 gps.config é SÓ-ADMIN (policy gps_config_admin, ...110): sem uma função
-- SECURITY DEFINER de leitura, o parceiro leria 0 linhas e a biblioteca
-- sumiria calada -- o mesmo erro que já quase foi ao ar 3 vezes (nota do
-- briefing). Molde EXATO de gps.chamados_abertos().

insert into gps.config (chave, valor) values
  ('videos_ativo', 'true')
on conflict (chave) do nothing;

create or replace function gps.videos_ativo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
           (select c.valor from gps.config c where c.chave = 'videos_ativo'),
           'true'
         ) <> 'false';
$$;

comment on function gps.videos_ativo() is
  'Interruptor de ENTREGA da biblioteca de vídeos ao aluno: AUSENTE ou "true" = ligado (default tem de ser funcionar). "false" e o botao de panico -- desliga a vitrine do aluno sem deploy; o CRUD do admin continua funcionando (nao passa por este interruptor -- desligar a entrega nao pode travar quem esta cadastrando). SECURITY DEFINER porque o aluno nao le gps.config (policy gps_config_admin e so-admin). Molde exato de gps.chamados_abertos() (...110).';

revoke execute on function gps.videos_ativo() from public, anon;
grant  execute on function gps.videos_ativo() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. RPCs de escrita (admin) — a ÚNICA porta de INSERT/UPDATE/DELETE
-- ═══════════════════════════════════════════════════════════════════════════
-- Todas gp_is_admin() ou 42501. Mesmo padrão de gps.admin_definir_liberacao_etapa
-- e gps.chamado_*: SECURITY DEFINER, search_path vazio, revoke antes do grant.

create or replace function gps.video_salvar(
  p_id        uuid,      -- null = cria; não-null = edita
  p_titulo    text,
  p_youtube_id text,
  p_descricao text     default null,
  p_etapa     smallint default null,
  p_ordem     integer  default 0
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_titulo   text;
  v_yt       text;
  v_id       uuid;
begin
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  v_titulo := btrim(coalesce(p_titulo, ''));
  if length(v_titulo) < 3 or length(v_titulo) > 200 then
    raise exception 'O título precisa ter de 3 a 200 caracteres.' using errcode = '22023';
  end if;

  -- Mensagem legível antes do CHECK cru da tabela: quem cola a URL inteira por
  -- engano (em vez do ID já extraído) recebe explicação, não 23514.
  v_yt := btrim(coalesce(p_youtube_id, ''));
  if v_yt !~ '^[A-Za-z0-9_-]{11}$' then
    raise exception 'Informe o ID do vídeo do YouTube (11 caracteres) — cole o link que o sistema extrai o ID sozinho.' using errcode = '22023';
  end if;

  if p_descricao is not null and length(p_descricao) > 2000 then
    raise exception 'A descrição passa de 2.000 caracteres.' using errcode = '22023';
  end if;

  if p_etapa is not null and not exists (select 1 from gps.etapas e where e.id = p_etapa) then
    raise exception 'Etapa não encontrada.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into gps.videos (titulo, youtube_id, descricao, etapa, ordem, criado_por, atualizado_por)
    values (v_titulo, v_yt, nullif(btrim(coalesce(p_descricao, '')), ''), p_etapa, coalesce(p_ordem, 0), auth.uid(), auth.uid())
    returning id into v_id;
  else
    update gps.videos
       set titulo         = v_titulo,
           youtube_id     = v_yt,
           descricao      = nullif(btrim(coalesce(p_descricao, '')), ''),
           etapa          = p_etapa,
           ordem          = coalesce(p_ordem, 0),
           atualizado_por = auth.uid()
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Vídeo não encontrado.' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end;
$$;

comment on function gps.video_salvar(uuid, text, text, text, smallint, integer) is
  'gp_is_admin() ou 42501. Cria (p_id null) ou edita (p_id informado) um vídeo. Valida youtube_id (11 chars [A-Za-z0-9_-], com mensagem legível ANTES do CHECK cru da tabela) e título (3..200). Nasce/permanece rascunho (publicado não muda aqui) -- publicar é gps.video_publicar, ato separado. SECURITY DEFINER: a tabela não tem policy de insert/update para authenticated, só esta RPC escreve.';

revoke execute on function gps.video_salvar(uuid, text, text, text, smallint, integer) from public, anon;
grant  execute on function gps.video_salvar(uuid, text, text, text, smallint, integer) to authenticated;

create or replace function gps.video_publicar(p_id uuid, p_publicado boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  update gps.videos
     set publicado = coalesce(p_publicado, false), atualizado_por = auth.uid()
   where id = p_id;

  if not found then
    raise exception 'Vídeo não encontrado.' using errcode = 'P0002';
  end if;
end;
$$;

comment on function gps.video_publicar(uuid, boolean) is
  'gp_is_admin() ou 42501. Liga/desliga a visibilidade do vídeo para o aluno (publicado true/false). Idempotente por natureza -- setar o mesmo valor duas vezes não é erro.';

revoke execute on function gps.video_publicar(uuid, boolean) from public, anon;
grant  execute on function gps.video_publicar(uuid, boolean) to authenticated;

create or replace function gps.video_excluir(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  delete from gps.videos where id = p_id;

  if not found then
    raise exception 'Vídeo não encontrado.' using errcode = 'P0002';
  end if;
end;
$$;

comment on function gps.video_excluir(uuid) is
  'gp_is_admin() ou 42501. Exclusão definitiva (a biblioteca é catálogo editorial, não histórico do aluno -- não há razão de negócio para soft delete aqui, ao contrário de gps.aluno_notas/gps.chamados).';

revoke execute on function gps.video_excluir(uuid) from public, anon;
grant  execute on function gps.video_excluir(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. gps.videos_do_aluno — leitura do parceiro (só publicado + só etapa liberada)
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function gps.videos_do_aluno(p_etapa smallint default null)
returns table (
  id         uuid,
  titulo     text,
  descricao  text,
  youtube_id text,
  etapa      smallint,
  ordem      integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_aluno_id uuid;
begin
  v_aluno_id := gps.aluno_atual();
  if v_aluno_id is null then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  if not gps.videos_ativo() then
    return;
  end if;

  return query
    select v.id, v.titulo, v.descricao, v.youtube_id, v.etapa, v.ordem
      from gps.videos v
     where v.publicado = true
       and (p_etapa is null or v.etapa is null or v.etapa = p_etapa)
       -- Mesma regra de gps.etapa_liberada_para (coalesce(override, global)),
       -- embutida aqui em vez de reusada: aquela função recusa p_etapa IS NULL
       -- (vídeo GERAL tem de passar sempre, sem etapa nenhuma) e sua guarda de
       -- "admin OU o próprio aluno" é redundante nesta RPC, que já está
       -- escopada a v_aluno_id = gps.aluno_atual() do próprio chamador.
       and (
         v.etapa is null
         or coalesce(
              (select o.liberada
                 from gps.etapa_liberacao_aluno o
                where o.aluno_id = v_aluno_id and o.etapa = v.etapa),
              (select e.liberada from gps.etapas e where e.id = v.etapa),
              false
            )
       )
     order by v.etapa nulls first, v.ordem;
end;
$$;

comment on function gps.videos_do_aluno(smallint) is
  'Leitura do parceiro: SÓ publicado=true e SÓ de etapa liberada PARA ELE (coalesce(override, global), mesma regra de gps.etapa_liberada_para, embutida inline porque aquela função recusa p_etapa null). Sem este filtro na LEITURA (e não só escondido na UI), o youtube_id de uma etapa travada viajaria no HTML e o vídeo seria assistível por view-source -- mesmo raciocínio de "material de etapa bloqueada vai sem url" (F.1, 09/09). p_etapa null = todos os vídeos gerais + os de toda etapa liberada (uso: tela "Biblioteca" agregada); p_etapa preenchido = vídeos gerais + os daquela etapa específica (uso: dentro da própria etapa). Respeita gps.videos_ativo() -- desligado, devolve vazio.';

revoke execute on function gps.videos_do_aluno(smallint) from public, anon;
grant  execute on function gps.videos_do_aluno(smallint) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONFERÊNCIA DE GRANTS (rodar depois de aplicar; deve bater 1 linha cada)
-- ═══════════════════════════════════════════════════════════════════════════
--   select p.proname,
--          has_function_privilege('anon',          p.oid, 'execute') as anon,
--          has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
--          has_function_privilege('public',        p.oid, 'execute') as public
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'gps'
--      and p.proname in ('video_salvar','video_publicar','video_excluir',
--                         'videos_do_aluno','videos_ativo')
--    order by p.proname;
--   -- ESPERADO em TODAS: anon=f authenticated=t public=f
--
--   select grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_schema='gps' and table_name='videos';
--   -- ESPERADO: 1 linha (authenticated, SELECT). Nenhuma para anon/public.

-- ═══════════════════════════════════════════════════════════════════════════
-- PROVA EM ROLLBACK (rodar como `postgres`, DEPOIS de aplicar). Tudo dentro de
-- um `do $$ ... $$` que termina em `raise exception`: o RAISE aborta a
-- transação e NADA sobrevive. `set_config('role', 'authenticated', ...)` + JWT
-- simulado onde há RLS -- como `postgres` não passa por RLS, prova rodando só
-- como superusuário não vale.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- do $$
-- declare
--   v_admin        uuid;
--   v_aluno_livre  uuid; v_ambiente_livre uuid;  -- ambiente SEM override de etapa (segue o global)
--   v_etapa_travada smallint; v_etapa_liberada smallint;
--   v_video_geral  uuid; v_video_travado uuid; v_video_liberado uuid;
--   v_id           uuid;
--   v_state        text;
--   v_lista        jsonb;
--   v_caso_a text := 'NAO RODOU'; v_caso_b text := 'NAO RODOU';
--   v_caso_c text := 'NAO RODOU'; v_caso_d text := 'NAO RODOU';
--   v_caso_e text := 'NAO RODOU'; v_caso_f text := 'NAO RODOU';
--   v_caso_g text := 'NAO RODOU';
-- begin
--   select id into v_admin from public.perfis where status='ativo' and cargo in ('dev','admin') limit 1;
--   if v_admin is null then raise exception 'PROVA ABORTADA: nenhum admin encontrado'; end if;
--
--   select id into v_etapa_liberada from gps.etapas where liberada = true order by ordem limit 1;
--   select id into v_etapa_travada  from gps.etapas where liberada = false order by ordem limit 1;
--   if v_etapa_liberada is null or v_etapa_travada is null then
--     raise exception 'PROVA ABORTADA: precisa de 1 etapa liberada e 1 travada em gps.etapas';
--   end if;
--
--   -- Ambiente qualquer, sem override de liberação de etapa (segue o global).
--   select m.user_id, m.aluno_id into v_aluno_livre, v_ambiente_livre
--     from gps.membros m
--    where m.papel = 'titular'
--      and not exists (select 1 from gps.etapa_liberacao_aluno o where o.aluno_id = m.aluno_id)
--    limit 1;
--   if v_ambiente_livre is null then raise exception 'PROVA ABORTADA: nenhum ambiente sem override de etapa'; end if;
--
--   -- CASO A: admin cria vídeo geral (sem etapa) — nasce rascunho.
--   perform set_config('role','authenticated', true);
--   perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text,'role','authenticated')::text, true);
--   v_video_geral := gps.video_salvar(null, 'Vídeo de teste — geral', 'dQw4w9WgXcQ', 'descrição de teste', null, 1);
--   v_caso_a := case when exists (select 1 from gps.videos where id=v_video_geral and publicado=false and etapa is null)
--               then 'OK criou rascunho geral' else 'FALHOU' end;
--
--   -- CASO B: youtube_id inválido é recusado (URL inteira colada por engano).
--   begin
--     perform gps.video_salvar(null, 'Vídeo malicioso', 'https://youtube.com/watch?v=dQw4w9WgXcQ', null, null, 1);
--     v_caso_b := 'FALHOU: aceitou youtube_id invalido';
--   exception when others then
--     get stacked diagnostics v_state = returned_sqlstate;
--     v_caso_b := case when v_state='22023' then 'OK 22023 (youtube_id invalido recusado)' else 'FALHOU sqlstate='||v_state end;
--   end;
--
--   -- CASO C: não-admin é recusado em toda RPC de escrita.
--   perform set_config('role','authenticated', true);
--   perform set_config('request.jwt.claims', json_build_object('sub', v_aluno_livre::text,'role','authenticated')::text, true);
--   begin
--     perform gps.video_salvar(null, 'Tentativa de aluno', 'dQw4w9WgXcQ', null, null, 1);
--     v_caso_c := 'FALHOU: aluno conseguiu criar video';
--   exception when others then
--     get stacked diagnostics v_state = returned_sqlstate;
--     v_caso_c := case when v_state='42501' then 'OK 42501 (nao-admin recusado)' else 'FALHOU sqlstate='||v_state end;
--   end;
--
--   -- CASO D: aluno NÃO vê rascunho (o geral criado no caso A ainda não foi publicado).
--   select jsonb_agg(t) into v_lista from gps.videos_do_aluno(null) t;
--   v_caso_d := case when not (v_lista::text like '%'||v_video_geral::text||'%')
--               then 'OK rascunho invisivel ao aluno' else 'FALHOU: aluno viu rascunho' end;
--
--   -- Publica o geral e cria um vídeo por etapa travada e outro por etapa liberada.
--   perform set_config('role','authenticated', true);
--   perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text,'role','authenticated')::text, true);
--   perform gps.video_publicar(v_video_geral, true);
--   v_video_travado  := gps.video_salvar(null, 'Vídeo etapa travada', 'jNQXAC9IVRw', null, v_etapa_travada, 1);
--   perform gps.video_publicar(v_video_travado, true);
--   v_video_liberado := gps.video_salvar(null, 'Vídeo etapa liberada', '9bZkp7q19f0', null, v_etapa_liberada, 1);
--   perform gps.video_publicar(v_video_liberado, true);
--
--   -- CASO E: aluno vê o geral publicado + o de etapa liberada, mas NÃO o de etapa travada.
--   perform set_config('role','authenticated', true);
--   perform set_config('request.jwt.claims', json_build_object('sub', v_aluno_livre::text,'role','authenticated')::text, true);
--   select jsonb_agg(t) into v_lista from gps.videos_do_aluno(null) t;
--   v_caso_e := case when (v_lista::text like '%'||v_video_geral::text||'%')
--                     and (v_lista::text like '%'||v_video_liberado::text||'%')
--                     and not (v_lista::text like '%'||v_video_travado::text||'%')
--               then 'OK ve geral+liberado, NAO ve travado' else 'FALHOU: '||coalesce(v_lista::text,'vazio') end;
--
--   -- CASO F: publicar/despublicar alterna a visibilidade.
--   perform set_config('role','authenticated', true);
--   perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text,'role','authenticated')::text, true);
--   perform gps.video_publicar(v_video_liberado, false);
--   perform set_config('role','authenticated', true);
--   perform set_config('request.jwt.claims', json_build_object('sub', v_aluno_livre::text,'role','authenticated')::text, true);
--   select jsonb_agg(t) into v_lista from gps.videos_do_aluno(null) t;
--   v_caso_f := case when not (v_lista::text like '%'||v_video_liberado::text||'%')
--               then 'OK despublicar escondeu o video' else 'FALHOU' end;
--
--   -- CASO G: excluir remove de verdade; excluir de novo dá "não encontrado".
--   perform set_config('role','authenticated', true);
--   perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text,'role','authenticated')::text, true);
--   perform gps.video_excluir(v_video_liberado);
--   begin
--     perform gps.video_excluir(v_video_liberado);
--     v_caso_g := 'FALHOU: excluiu duas vezes sem erro';
--   exception when others then
--     get stacked diagnostics v_state = returned_sqlstate;
--     v_caso_g := case when v_state='P0002' then 'OK P0002 (excluir 2x recusado)' else 'FALHOU sqlstate='||v_state end;
--   end;
--
--   perform set_config('role','none', true);
--   raise exception E'PROVA ...251\n A (admin cria rascunho geral): %\n B (youtube_id invalido): %\n C (nao-admin recusado): %\n D (aluno nao ve rascunho): %\n E (aluno ve geral+liberado, nao ve travado): %\n F (publicar/despublicar): %\n G (excluir): %',
--     v_caso_a, v_caso_b, v_caso_c, v_caso_d, v_caso_e, v_caso_f, v_caso_g;
-- end $$;
--
-- ESPERADO: A = "OK criou rascunho geral" · B = "OK 22023 (youtube_id invalido recusado)" ·
--   C = "OK 42501 (nao-admin recusado)" · D = "OK rascunho invisivel ao aluno" ·
--   E = "OK ve geral+liberado, NAO ve travado" · F = "OK despublicar escondeu o video" ·
--   G = "OK P0002 (excluir 2x recusado)"

-- ═══════════════════════════════════════════════════════════════════════════
-- EXPLAIN (ANALYZE) da leitura do aluno (protocolo de sustentabilidade).
-- Rodar depois de aplicar E depois da prova em rollback (para haver alguma
-- linha na tabela; com a tabela vazia o plano tende a Seq Scan por natureza,
-- o que é aceitável para poucas dezenas de linhas — reconferir se a tabela
-- passar de alguns milhares).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- explain (analyze, buffers)
-- select v.id, v.titulo, v.youtube_id, v.etapa, v.ordem
--   from gps.videos v
--  where v.publicado = true
--    and (v.etapa is null or v.etapa = 1)
--  order by v.etapa nulls first, v.ordem;
-- -- ESPERADO: Index Scan (ou Bitmap Index Scan) usando
-- -- idx_gps_videos_publicado_etapa, Index Cond em (publicado, etapa) — o
-- -- índice parcial já embute `where publicado`, então só sobra o filtro de
-- -- etapa como Index Cond, sem Filter residual relevante. Se a tabela ainda
-- -- tiver poucas linhas (dezenas), Seq Scan é esperado e aceitável — o teste
-- -- de sustentabilidade real é reconferir quando passar de alguns milhares.
