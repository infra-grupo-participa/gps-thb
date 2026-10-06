-- ═══════════════════════════════════════════════════════════════════════════
-- …353 — etapa1_clientes.fase passa a ser DERIVADA da trajetória viva.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- DECISÃO DO DONO (05/10/2026) — SUPERA a regra da …345 "etapa1_clientes.fase
-- fica intocada e independente". Agora:
--   * fase = fase da etapa VIVA (desmarcado_em is null) de maior posição no
--     catálogo; sem marcação viva → 'prospeccao'.
--   * domínio: prospeccao | fechamento | contratado (rótulo "Execução") |
--     concluido (NOVO — entrega_pasta marcada).
--   * mantida SÓ por gatilho em gps.cliente_trajetoria. UPDATE direto de fase
--     é recusado (42501); INSERT nasce 'prospeccao'.
--
-- ── O QUE ENTRA ────────────────────────────────────────────────────────────
--   1. gps.cliente_etapa_tipos.fase (not null, CHECK nos 4) + backfill dos 11.
--      Prova no DO: "maior posição" ≡ "maior fase" (a fase é monotônica na
--      ordem pré-ordem do catálogo). Por isso o derivar ordena por fase, sem
--      CTE recursiva por chamada. Etapa nova que quebre a monotonicidade
--      ABORTA a migração que a inserir? NÃO — só esta. Quem mexer no catálogo
--      roda de novo o bloco "monotonicidade" abaixo.
--   2. chk_etapa1_clientes_fase refeito com 'concluido' (not valid + validate).
--   3. gps.cliente_fase_derivar(uuid) STABLE e gps.cliente_fase_etapas_legado(text)
--      IMMUTABLE (mapa fase antiga → etapas de topo; usado aqui e na
--      restauração da lixeira, …354).
--   4. Carga do legado ANTES dos gatilhos + recálculo de quem já tinha
--      trajetória + prova "0 divergentes" (raise se ≠ 0).
--   5. Gatilhos: AFTER INSERT / UPDATE OF desmarcado_em / DELETE em
--      cliente_trajetoria → recalcula; BEFORE UPDATE OF fase e BEFORE INSERT
--      em etapa1_clientes → guarda.
--
-- ── ORDEM DOS GATILHOS DE etapa1_clientes ──────────────────────────────────
--   O UPDATE do recálculo é um UPDATE comum: passa por TODOS os BEFORE UPDATE
--   (acompanhamento_travado, contrato_travado, entrevista_travada,
--   perda_nivel_congelados, status_congelado, touch, fase_derivada) e pelo
--   AFTER trg_aluno_eventos_etapa1_clientes (grava cliente_fase_mudou).
--   A trava do favorito (…305) lê old/new.fase e RECUSA a volta para
--   prospeccao: o raise sobe pelo gatilho AFTER de cliente_trajetoria e
--   ABORTA o desmarcar inteiro — nada é engolido aqui. A ordem entre a guarda
--   nova e a trava não importa: as duas só lançam, nenhuma altera `new`.
--
-- ── AS 5 PERGUNTAS ─────────────────────────────────────────────────────────
--   1. ESCALA. Custo por MARCAÇÃO, não por base: cada INSERT/desmarcar em
--      cliente_trajetoria recalcula UM cliente (≤ 11 linhas vivas por
--      cliente). Carga única: 1.922 clientes → ~2.072 marcações
--      (1.850×1 + 46×2 + 26×5). Com 10x clientes, o custo por clique é o mesmo.
--   2. ÍNDICE. O derivar filtra `cliente_id = $1 and desmarcado_em is null` =
--      exatamente o predicado do parcial cliente_trajetoria_ativa_uq
--      (cliente_id, etapa_codigo) WHERE (desmarcado_em IS NULL). O UPDATE usa
--      etapa1_clientes_pkey. EXPLAIN a rodar (troque o uuid; é leitura):
--        explain (analyze, buffers)
--        select t.fase
--          from gps.cliente_trajetoria tr
--          join gps.cliente_etapa_tipos t on t.codigo = tr.etapa_codigo
--         where tr.cliente_id = '<uuid>' and tr.desmarcado_em is null
--         order by array_position(array['prospeccao','fechamento','contratado','concluido']::text[], t.fase) desc
--         limit 1;
--      Esperado: Index Scan using cliente_trajetoria_ativa_uq (ou Bitmap) +
--      Seq Scan/Index em cliente_etapa_tipos (11 linhas — Seq é o certo).
--      O UPDATE só em begin; … rollback; (ver scratchpad/ensaio-fase.sql).
--   3. FREQUÊNCIA. Só no clique humano de marcar/desmarcar, onboarding,
--      restauração e conversão. Sem cron, sem varredura.
--   4. REPETIÇÃO. Um UPDATE por marcação, e só se a fase mudou
--      (`is distinct from`); marcar 5 etapas = no máximo 5 updates de 1 linha.
--   5. REVERSÃO (reverter o …354 ANTES: reaplicar os corpos anteriores —
--      pg_get_functiondef salvos em vivas/ — pois a restauração usa
--      cliente_fase_etapas_legado):
--        begin;
--        set local lock_timeout = '5s';
--        drop trigger trg_cliente_trajetoria_fase_ins on gps.cliente_trajetoria;
--        drop trigger trg_cliente_trajetoria_fase_upd on gps.cliente_trajetoria;
--        drop trigger trg_cliente_trajetoria_fase_del on gps.cliente_trajetoria;
--        drop trigger trg_etapa1_clientes_fase_derivada on gps.etapa1_clientes;
--        drop trigger trg_etapa1_clientes_fase_inicial  on gps.etapa1_clientes;
--        drop function gps.cliente_fase_recalcular();
--        drop function gps.etapa1_clientes_fase_guarda();
--        drop function gps.cliente_fase_derivar(uuid);
--        drop function gps.cliente_fase_etapas_legado(text);
--        update gps.etapa1_clientes set fase = 'contratado' where fase = 'concluido';
--        alter table gps.etapa1_clientes drop constraint chk_etapa1_clientes_fase;
--        alter table gps.etapa1_clientes add constraint chk_etapa1_clientes_fase
--          check ((fase = any (array['prospeccao'::text, 'fechamento'::text, 'contratado'::text])));
--        -- marcações da carga (desmarcadas depois inclusive) — só elas têm
--        -- marcado_por null E este marcado_em exato:
--        delete from gps.cliente_trajetoria
--         where marcado_por is null and marcado_em = timestamptz '2026-10-05 00:03:53+00';
--        alter table gps.cliente_etapa_tipos drop column fase;
--        commit;
--      (a fase de cada cliente fica no valor derivado da última hora — não
--       volta ao valor anterior; o QA fica 'contratado'.)
-- ═══════════════════════════════════════════════════════════════════════════

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ── 1. Catálogo ganha fase ────────────────────────────────────────────────
alter table gps.cliente_etapa_tipos add column fase text;

update gps.cliente_etapa_tipos t
   set fase = case t.codigo
                when 'prospeccao'               then 'prospeccao'
                when 'reuniao_preliminar'       then 'fechamento'
                when 'sessao_viabilidade'       then 'fechamento'
                when 'croqui_estrutural'        then 'fechamento'
                when 'execucao'                 then 'contratado'
                when 'reuniao_inicial_execucao' then 'contratado'
                when 'elaboracao_minutas'       then 'contratado'
                when 'processamento_itcmd'      then 'contratado'
                when 'processamento_itbi'       then 'contratado'
                when 'junta_comercial'          then 'contratado'
                when 'entrega_pasta'            then 'concluido'
              end;

do $$
declare v_sem int; v_total int; v_quebra int;
begin
  select count(*), count(*) filter (where fase is null) into v_total, v_sem
    from gps.cliente_etapa_tipos;
  if v_total <> 11 or v_sem <> 0 then
    raise exception 'catalogo inesperado: % linhas, % sem fase -- migracao abortada', v_total, v_sem;
  end if;

  -- monotonicidade: em pré-ordem (caminho de `ordem` desde a raiz), nenhuma
  -- etapa posterior tem fase MENOR que uma anterior. Garante que "maior
  -- posição" = "maior fase", que é o que o derivar usa.
  with recursive arv as (
    select t.codigo, t.fase, array[t.ordem] as caminho
      from gps.cliente_etapa_tipos t where t.pai_codigo is null
    union all
    select t.codigo, t.fase, a.caminho || t.ordem
      from gps.cliente_etapa_tipos t join arv a on t.pai_codigo = a.codigo
  )
  select count(*) into v_quebra
    from arv a join arv b on a.caminho < b.caminho
   where array_position(array['prospeccao','fechamento','contratado','concluido']::text[], a.fase)
       > array_position(array['prospeccao','fechamento','contratado','concluido']::text[], b.fase);
  if v_quebra <> 0 then
    raise exception 'fase do catalogo nao e monotonica na posicao (% pares) -- migracao abortada', v_quebra;
  end if;
end $$;

alter table gps.cliente_etapa_tipos alter column fase set not null;
alter table gps.cliente_etapa_tipos add constraint cliente_etapa_tipos_fase_check
  check (fase in ('prospeccao', 'fechamento', 'contratado', 'concluido'));

comment on column gps.cliente_etapa_tipos.fase is
  'Fase do cliente que esta etapa implica (…353). etapa1_clientes.fase = fase da etapa VIVA de maior posicao (gps.cliente_fase_derivar). A fase e monotonica na pre-ordem do catalogo -- quem acrescentar etapa tem de manter isso (bloco de prova na …353).';

-- ── 2. CHECK de etapa1_clientes.fase com 'concluido' ───────────────────────
-- Vivo (pg_get_constraintdef, 05/10):
--   CHECK ((fase = ANY (ARRAY['prospeccao'::text, 'fechamento'::text, 'contratado'::text])))
alter table gps.etapa1_clientes drop constraint chk_etapa1_clientes_fase;
alter table gps.etapa1_clientes add constraint chk_etapa1_clientes_fase
  check (fase = any (array['prospeccao'::text, 'fechamento'::text, 'contratado'::text, 'concluido'::text]))
  not valid;
alter table gps.etapa1_clientes validate constraint chk_etapa1_clientes_fase;

-- ── 3. Funções puras ───────────────────────────────────────────────────────
create or replace function gps.cliente_fase_derivar(p_cliente_id uuid)
returns text
language sql
stable
set search_path = ''
as $function$
  select coalesce(
    (select t.fase
       from gps.cliente_trajetoria tr
       join gps.cliente_etapa_tipos t on t.codigo = tr.etapa_codigo
      where tr.cliente_id = p_cliente_id
        and tr.desmarcado_em is null
      order by array_position(array['prospeccao','fechamento','contratado','concluido']::text[], t.fase) desc
      limit 1),
    'prospeccao');
$function$;

comment on function gps.cliente_fase_derivar(uuid) is
  'Fase derivada da trajetoria viva (…353): maior fase entre as etapas com desmarcado_em is null; sem marcacao = prospeccao. Usa o indice parcial cliente_trajetoria_ativa_uq. Sem grant: so o gatilho (SECURITY DEFINER) e migracoes chamam.';

revoke all on function gps.cliente_fase_derivar(uuid) from public, anon, authenticated;

create or replace function gps.cliente_fase_etapas_legado(p_fase text)
returns text[]
language sql
immutable
set search_path = ''
as $function$
  select case p_fase
    when 'fechamento' then array['prospeccao','reuniao_preliminar']
    when 'contratado' then array['prospeccao','reuniao_preliminar','sessao_viabilidade','croqui_estrutural','execucao']
    when 'concluido'  then array['prospeccao','reuniao_preliminar','sessao_viabilidade','croqui_estrutural','execucao','entrega_pasta']
    else array['prospeccao']
  end::text[];
$function$;

comment on function gps.cliente_fase_etapas_legado(text) is
  'Mapa fase antiga -> etapas a marcar (…353), com as etapas de TOPO anteriores (sem "pendente" falso). Usado na carga do legado e em admin_lixeira_restaurar_clientes (…354). concluido inclui entrega_pasta. Valor desconhecido/null = {prospeccao}.';

revoke all on function gps.cliente_fase_etapas_legado(text) from public, anon, authenticated;

-- ── 4. Carga do legado (ANTES dos gatilhos) + prova ────────────────────────
do $$
declare
  c_marcado_em constant timestamptz := timestamptz '2026-10-05 00:03:53+00';  -- constante da reversão
  v_pre        uuid[];
  v_inseridas  int;
  v_mudaram    int;
  v_diverg     int;
  v_dist       text;
begin
  -- quem JÁ tinha trajetória viva: só estes podem ter fase ≠ derivada depois
  -- da carga (os demais recebem exatamente as etapas da própria fase).
  select coalesce(array_agg(distinct tr.cliente_id), '{}') into v_pre
    from gps.cliente_trajetoria tr where tr.desmarcado_em is null;

  insert into gps.cliente_trajetoria (cliente_id, etapa_codigo, marcado_em, marcado_por)
  select c.id, e.codigo, c_marcado_em, null
    from gps.etapa1_clientes c
    cross join lateral unnest(gps.cliente_fase_etapas_legado(c.fase)) as e(codigo)
  on conflict (cliente_id, etapa_codigo) where desmarcado_em is null do nothing;
  get diagnostics v_inseridas = row_count;

  -- a trajetória vence (decisão do dono): recalcula quem já tinha marcação.
  -- Só pode SUBIR de fase (a carga marcou até a fase antiga), então a trava
  -- do favorito não dispara.
  update gps.etapa1_clientes c
     set fase = gps.cliente_fase_derivar(c.id)
   where c.id = any (v_pre)
     and c.fase is distinct from gps.cliente_fase_derivar(c.id);
  get diagnostics v_mudaram = row_count;

  select count(*) into v_diverg
    from gps.etapa1_clientes c
   where c.fase is distinct from gps.cliente_fase_derivar(c.id);
  if v_diverg <> 0 then
    raise exception 'apos a carga, % cliente(s) com fase <> derivada -- migracao abortada', v_diverg;
  end if;

  select string_agg(x.fase || '=' || x.n, ', ' order by x.fase) into v_dist
    from (select c.fase, count(*) as n from gps.etapa1_clientes c group by c.fase) x;
  raise notice '…353: % marcacoes inseridas; % com trajetoria previa; % fase(s) recalculada(s); distribuicao: %',
    v_inseridas, cardinality(v_pre), v_mudaram, v_dist;
end $$;

-- ── 5. Gatilhos ────────────────────────────────────────────────────────────
-- 5a. Recálculo. SECURITY DEFINER: quem marca é o aluno, que não tem UPDATE
-- livre em fase (e o derivar está sem grant). Liga o marcador LOCAL, grava
-- só se mudou, restaura o valor anterior. Não engole erro: a recusa da
-- trava do favorito tem de abortar o marcar/desmarcar.
create or replace function gps.cliente_fase_recalcular()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_cliente uuid;
  v_fase    text;
  v_antes   text;
begin
  v_cliente := case when tg_op = 'DELETE' then old.cliente_id else new.cliente_id end;
  v_fase    := gps.cliente_fase_derivar(v_cliente);
  v_antes   := coalesce(current_setting('gps.fase_recalculo', true), '');

  perform set_config('gps.fase_recalculo', '1', true);
  update gps.etapa1_clientes c
     set fase = v_fase
   where c.id = v_cliente
     and c.fase is distinct from v_fase;
  perform set_config('gps.fase_recalculo', v_antes, true);

  return null;
end;
$function$;

comment on function gps.cliente_fase_recalcular() is
  'Gatilho AFTER de gps.cliente_trajetoria (…353): recalcula etapa1_clientes.fase do cliente da linha via gps.cliente_fase_derivar. Liga gps.fase_recalculo (set_config local) so durante o UPDATE -- e a unica escrita de fase aceita pela guarda. Nao engole erro (a trava do favorito tem de subir).';

revoke all on function gps.cliente_fase_recalcular() from public, anon, authenticated;

-- 5b. Guarda. Não é SECURITY DEFINER (molde das travas de etapa1_clientes).
-- UPDATE: recusa mudança de fase fora do recálculo. Exige o marcador E
-- pg_trigger_depth() >= 2 (o UPDATE vem de dentro de um gatilho): um
-- set_config na mesma transação, sozinho, não abre a porta.
-- Reenviar a MESMA fase passa (o front pode mandar o registro inteiro).
-- INSERT: nasce 'prospeccao' — a fase vem das marcações feitas depois.
create or replace function gps.etapa1_clientes_fase_guarda()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_liberado boolean := coalesce(current_setting('gps.fase_recalculo', true), '') = '1';
begin
  if tg_op = 'INSERT' then
    if not v_liberado then
      new.fase := 'prospeccao';
    end if;
    return new;
  end if;

  if new.fase is distinct from old.fase
     and not (v_liberado and pg_trigger_depth() >= 2)
  then
    raise exception 'A fase do cliente segue a trajetória: marque ou desmarque as etapas.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

comment on function gps.etapa1_clientes_fase_guarda() is
  'Guarda de etapa1_clientes.fase (…353). BEFORE INSERT: forca prospeccao. BEFORE UPDATE OF fase: so o gatilho de recalculo (gps.fase_recalculo=1 e pg_trigger_depth>=2) muda a fase; senao 42501. Admin incluso.';

revoke all on function gps.etapa1_clientes_fase_guarda() from public, anon, authenticated;

create trigger trg_etapa1_clientes_fase_inicial
  before insert on gps.etapa1_clientes
  for each row execute function gps.etapa1_clientes_fase_guarda();

create trigger trg_etapa1_clientes_fase_derivada
  before update of fase on gps.etapa1_clientes
  for each row execute function gps.etapa1_clientes_fase_guarda();

create trigger trg_cliente_trajetoria_fase_ins
  after insert on gps.cliente_trajetoria
  for each row execute function gps.cliente_fase_recalcular();

create trigger trg_cliente_trajetoria_fase_upd
  after update of desmarcado_em on gps.cliente_trajetoria
  for each row
  when (old.desmarcado_em is distinct from new.desmarcado_em)
  execute function gps.cliente_fase_recalcular();

create trigger trg_cliente_trajetoria_fase_del
  after delete on gps.cliente_trajetoria
  for each row execute function gps.cliente_fase_recalcular();

-- ── 6. Documentação da decisão ────────────────────────────────────────────
comment on column gps.etapa1_clientes.fase is
  'DERIVADA da trajetoria viva desde a …353 (decisao do dono, 05/10/2026, supera "trajetoria != fase" da …345): prospeccao | fechamento | contratado (rotulo Execucao) | concluido. Mantida SO pelo gatilho gps.cliente_fase_recalcular em gps.cliente_trajetoria; UPDATE direto = 42501; INSERT nasce prospeccao. Honorario/contratado conta fase in (contratado, concluido).';

comment on table gps.cliente_trajetoria is
  'Marcacoes da trajetoria do cliente (…345). VARIAS por cliente, uma ATIVA por (cliente, etapa) -- indice unico parcial. Desmarcar e SOFT (desmarcado_em/_por); toda leitura filtra desmarcado_em is null. Escrita SO por SECURITY DEFINER (marcar/_desmarcar, onboarding, restauracao, conversao). Desde a …353 (05/10/2026) etapa1_clientes.fase e DERIVADA daqui por gatilho -- a regra "independente de fase" da …345 foi superada. Carga do legado: marcado_por null e marcado_em 2026-10-05 00:03:53+00.';
