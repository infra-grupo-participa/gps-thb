-- ═══════════════════════════════════════════════════════════════════════
-- /admin/clientes — o cliente com ESTRELA vem primeiro (28/09/2026)
-- ═══════════════════════════════════════════════════════════════════════
--
-- Pedido do Marcio: na lista de quem está com a reunião/entrevista marcada,
-- "a ordem de prioridade sempre vai ser os favoritados — a ordem de
-- visualização e de metrificação". Os sem estrela continuam na lista, com
-- menos destaque.
--
-- "Favorito" = `gps.etapa1_clientes.acompanhado_equipe` (a estrela que o
-- parceiro marca; 1 por parceiro, índice parcial `etapa1_clientes_unico_equipe`).
--
-- Contado ANTES de desenhar (28/09): 1.714 clientes · 55 com reunião ·
-- 42 com estrela · 18 com estrela E reunião (4 futuras, 14 vencidas).
-- O filtro não recusa 100%.
--
-- 1) `admin_clientes_lista`: só muda o `order by` — `acompanhado_equipe desc`
--    na frente do critério antigo. Mesma assinatura e mesmo retorno →
--    `create or replace` mantém o ACL.
-- 2) `admin_clientes_reuniao_kpis`: ganha 4 colunas (os mesmos 4 números,
--    só dos com estrela). Muda o RETURNS TABLE → exige `drop` + `create`,
--    e o `create` devolve EXECUTE a PUBLIC por padrão → o `revoke` abaixo
--    é obrigatório (lição do incidente LGPD de 28/09: SECURITY DEFINER
--    aberto a anon).
--
-- Custo medido (explain analyze, buffers — 28/09, 1.714 linhas, corpo das
-- consultas; a medida pela porta real, `Function Scan` com JWT de admin, está
-- no bloco de provas no fim do arquivo):
--   lista ANTES  (criado_em desc, id)       → Seq Scan + top-N heapsort 52 kB,
--                                              shared hit=335, 4,2 ms
--   lista DEPOIS (+ acompanhado_equipe desc) → MESMO plano, top-N 52 kB,
--                                              shared hit=340, 8,0 ms (1ª passada
--                                              fria 57 ms, dominada pelo join)
--   com_reuniao → Seq Scan + quicksort 32 kB (55 linhas).
--   KPIs (8 filtros) → Aggregate sobre Seq Scan, shared hit=65.
--   Nenhum índice novo: a ordenação já existia, só ganhou uma chave booleana;
--   índice em `acompanhado_equipe` não participaria de top-N com 1.714 linhas
--   e custaria escrita na tabela mais quente (a ficha do cliente).
--
-- Reverter:
--   lista → reaplicar a de `20260917000285_gps_clientes_modo_com_reuniao.sql`
--           (a ÚLTIMA viva; a `…282` não tem `com_reuniao` e quebraria o
--           chip/tile "Com reunião" com 22023). Só o `order by` volta a
--           `criado_em desc, id`.
--   KPIs  → `drop` desta + reaplicar a de `…282` (4 colunas), com o
--           `comment on function` e o revoke/grant de lá.
--   TS    → reverter o commit; com a KPI de 4 colunas a faixa mostraria
--           ALERTA (coluna `fav_*` ausente), nunca zero.
-- 🔴 Ordem de publicação: esta migração ANTES do deploy do TS.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function gps.admin_clientes_lista(
  p_limite integer default 100,
  p_offset integer default 0,
  p_fase text default null,
  p_grau text default null,
  p_busca text default null,
  p_reuniao text default null
)
returns table(
  id uuid, aluno_id uuid, parceiro_nome text, cliente_nome text, telefone text,
  fase text, grau_relacao text, perfil_disc text, data_reuniao_preliminar date,
  aderiu_reuniao boolean, acompanhado_equipe boolean, criado_em timestamptz,
  total_linhas bigint
)
language plpgsql
stable security definer
set search_path to ''
as $function$
declare v_limite integer; v_offset integer; v_busca text;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  -- Catalogo FECHADO do filtro de reuniao (…274, 17/09/2026). Valor fora
  -- da lista e erro, nunca "ignora e devolve tudo" -- filtro que se ignora
  -- em silencio faz a tela mentir sobre o universo.
  if p_reuniao is not null and p_reuniao not in ('com_reuniao', 'marcada', 'para_vencer', 'vencida', 'sem') then
    raise exception 'Filtro de reunião inválido.' using errcode = '22023';
  end if;

  v_limite := least(greatest(coalesce(p_limite, 100), 1), 5000);
  v_offset := greatest(coalesce(p_offset, 0), 0);
  v_busca  := nullif(btrim(coalesce(p_busca, '')), '');

  return query
  with base as (
    select c.id, c.aluno_id, t.nome as parceiro_nome, c.nome as cliente_nome,
           c.telefone, c.fase, c.grau_relacao, c.perfil_disc,
           c.data_reuniao_preliminar, c.aderiu_reuniao, c.acompanhado_equipe,
           c.criado_em
    from gps.etapa1_clientes c
    -- LEFT, nao INNER (conferido 14/09: 0 orfaos em 1.222 clientes). Com
    -- INNER, cliente cujo cadastro do parceiro sumisse de thb_alunos (base
    -- compartilhada com o sip) DESAPARECERIA da lista e da contagem, sem
    -- erro. Com LEFT ele aparece com o dono vazio -- pendencia visivel em
    -- vez de sumico silencioso.
    left join public.thb_alunos t on t.id = c.aluno_id
    where (p_fase is null or c.fase = p_fase)
      -- `data_reuniao_preliminar` e `date`: comparar com `current_date` e
      -- data contra data. NUNCA `now()` -- o bug do `hojeISO` em UTC ja morde
      -- o Financeiro das 21h a meia-noite.
      and (
        p_reuniao is null
        or (p_reuniao = 'com_reuniao' and c.data_reuniao_preliminar is not null)
        or (p_reuniao = 'marcada' and c.data_reuniao_preliminar > current_date + 7)
        or (p_reuniao = 'para_vencer' and c.data_reuniao_preliminar between current_date and current_date + 7)
        or (p_reuniao = 'vencida' and c.data_reuniao_preliminar <  current_date)
        or (p_reuniao = 'sem'     and c.data_reuniao_preliminar is null)
      )
      and (p_grau is null
           or (p_grau = '_nulo' and c.grau_relacao is null)
           or c.grau_relacao = p_grau)
      and (v_busca is null
           or c.nome ilike '%' || v_busca || '%'
           or t.nome ilike '%' || v_busca || '%')
  )
  select b.id, b.aluno_id, b.parceiro_nome, b.cliente_nome, b.telefone, b.fase,
         b.grau_relacao, b.perfil_disc, b.data_reuniao_preliminar,
         b.aderiu_reuniao, b.acompanhado_equipe, b.criado_em,
         (count(*) over ())::bigint as total_linhas
  from base b
  -- 🔑 (28/09) Estrela primeiro, SEMPRE — em qualquer filtro e em qualquer
  -- página. `desc` em boolean = true antes de false. A coluna é NOT NULL
  -- default false (conferido 28/09) — sem `coalesce`, que só esconderia a
  -- chave de ordenação do planner.
  order by b.acompanhado_equipe desc, b.criado_em desc, b.id
  limit v_limite offset v_offset;
end;
$function$;

revoke execute on function gps.admin_clientes_lista(integer, integer, text, text, text, text) from public, anon;
grant  execute on function gps.admin_clientes_lista(integer, integer, text, text, text, text) to authenticated, service_role;

-- ─── KPIs: os mesmos 4 números, agora também só dos com estrela ─────────

drop function if exists gps.admin_clientes_reuniao_kpis();

create function gps.admin_clientes_reuniao_kpis()
returns table(
  total_com_reuniao bigint, marcadas bigint, para_vencer bigint, vencidas bigint,
  fav_total_com_reuniao bigint, fav_marcadas bigint, fav_para_vencer bigint, fav_vencidas bigint
)
language plpgsql
stable security definer
set search_path to ''
as $function$
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  return query
  select
    count(*) filter (where c.data_reuniao_preliminar is not null),
    count(*) filter (where c.data_reuniao_preliminar > current_date + 7),
    count(*) filter (where c.data_reuniao_preliminar between current_date and current_date + 7),
    count(*) filter (where c.data_reuniao_preliminar < current_date),
    count(*) filter (where c.acompanhado_equipe and c.data_reuniao_preliminar is not null),
    count(*) filter (where c.acompanhado_equipe and c.data_reuniao_preliminar > current_date + 7),
    count(*) filter (where c.acompanhado_equipe and c.data_reuniao_preliminar between current_date and current_date + 7),
    count(*) filter (where c.acompanhado_equipe and c.data_reuniao_preliminar < current_date)
  from gps.etapa1_clientes c;
end;
$function$;

-- O `drop` apagou o comentário da `…282` — recriado com as 4 colunas novas.
comment on function gps.admin_clientes_reuniao_kpis() is
  'KPIs da aba "reuniao agendada" de /admin/clientes (Marcio, 17/09/2026): total com reuniao, marcadas (data > hoje+7), para vencer (hoje..hoje+7), vencidas (data < hoje). 28/09/2026 (…318): + os mesmos 4 so dos clientes com estrela (fav_*, acompanhado_equipe) -- o numero grande dos tiles. UMA chamada com 8 count(*) filter -- nao chama admin_clientes_lista N vezes. gp_is_admin() ou 42501. stable security definer, search_path vazio. Mesmo catalogo de gps.admin_clientes_lista(p_reuniao) -- os dois tem que somar igual: marcadas+para_vencer+vencidas = total_com_reuniao, idem fav_*, e fav_* <= cada total.';

-- 🔴 `create function` devolve EXECUTE a PUBLIC — sem este revoke, anon
-- executaria (o corpo recusa por `gp_is_admin()`, mas a porta não fica aberta).
revoke execute on function gps.admin_clientes_reuniao_kpis() from public, anon;
grant  execute on function gps.admin_clientes_reuniao_kpis() to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- PROVAS (aplicada em produção 28/09/2026 — resultados, não roteiro)
-- ═══════════════════════════════════════════════════════════════════════
-- Antes de aplicar: corpo VIVO de `admin_clientes_lista` (pg_proc.prosrc,
--   sem comentários) = corpo desta migração, exceto o `order by`.
-- JWT de admin real (`set local role authenticated` + claims):
--   KPIs: total 55 = 3 marcadas + 8 para vencer + 44 vencidas ✔
--         fav 18 = 0 + 4 + 14 ✔ · cada fav_* <= o total do par ✔
--   Tile × lista: `admin_clientes_lista(…,'com_reuniao')` = 55 linhas, 18 com
--         estrela — o tile grande (18) é exatamente o bloco do topo da lista.
--   Ordem: nenhuma linha sem estrela antes de uma com estrela ✔
--   Universo sem filtro: 1.714 = a tabela inteira (ninguém sumiu).
-- Function Scan (a porta real, 2 passadas):
--   admin_clientes_reuniao_kpis → 3,97 / 4,00 ms, shared hit=653 (…282: ~2,7 ms)
--   admin_clientes_lista(100)   → 11,4 / 12,1 ms, shared hit=1791
-- Sem JWT → 42501 ✔
-- proacl das duas: {postgres, authenticated, service_role} — sem anon/PUBLIC ✔
-- Sobrecargas: 1 cada ✔ · comment on function presente nas duas ✔
