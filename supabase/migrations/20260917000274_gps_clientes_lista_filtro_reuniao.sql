-- Filtro de reunião preliminar na lista consolidada de clientes (item 5 do
-- backlog do Marcio, 14/09/2026 — nunca começado até hoje).
--
-- ═══════════════════════════════════════════════════════════════════════
-- POR QUE 3 CHIPS, NÃO 1 ("com reunião agendada")
-- ═══════════════════════════════════════════════════════════════════════
--
-- Medido em 17/09/2026, 1.636 clientes:
--   sem reunião       : 1.594
--   marcada (futura)  :     3
--   vencida (passada) :    39   (34 sem `aderiu_reuniao`)
--
-- Um chip único juntaria as 3 futuras com as 39 vencidas — e é exatamente
-- a vencida SEM adesão (34) quem precisa de atenção; hoje some no meio de
-- 1.636. Decisão do Marcio, fechada: `marcada` | `vencida` | `sem` | null
-- (todos), comparando `data_reuniao_preliminar` (é `date`) contra
-- `current_date` — NUNCA `now()` (o bug do `hojeISO` em UTC já mordeu o
-- Financeiro; `date` × `date` não tem fuso a considerar).
--
-- ═══════════════════════════════════════════════════════════════════════
-- COMO A FUNÇÃO FOI CONSTRUÍDA
-- ═══════════════════════════════════════════════════════════════════════
--
-- Corpo inteiro copiado da definição viva em `…255` (única definição
-- existente — conferido: nenhuma migration entre `…255` e `…273` faz
-- `create or replace function gps.admin_clientes_lista`, só comentário
-- citando o nome). Âncoras do `where` da CTE `base` preservadas: allowlist
-- de colunas, LEFT JOIN em `thb_alunos`, `count(*) over()` DENTRO do
-- filtro, paginação com teto 5000. Único acréscimo: o predicado de
-- `p_reuniao` no `where`, e a validação de catálogo fechado no início.
--
-- 🔴 ASSINATURA NOVA (parâmetro extra) — `drop function` ANTES do
-- `create`, senão `create or replace` com assinatura diferente cria
-- SOBRECARGA (armadilha já paga neste repo: duas funções de mesmo nome
-- coexistindo, uma delas nunca chamada). Sem `if exists`: se a função não
-- existir com esta assinatura exata, a migração deve abortar — não
-- silenciar um `drop` que não dropou nada.
--
-- O QUE NÃO FAZ: não cria índice (ver bloco de medição ao final — a
-- decisão é ficar sem, com o EXPLAIN que sustenta); não muda
-- `gps.etapa1_clientes` nem RLS dela; não expõe `registro_contato`/CPF/
-- honorários/contrato (mesma trava de LGPD da `…255`); não toca em
-- `gps.admin_registrar_export_clientes` (fora de escopo desta migração).
--
-- REVERSÃO:
--   drop function gps.admin_clientes_lista(integer, integer, text, text, text, text);
--   -- e reaplicar o `create or replace` de `…255` (assinatura de 5 parâmetros)
--   -- para devolver a função ao estado anterior.

drop function gps.admin_clientes_lista(integer, integer, text, text, text);

create or replace function gps.admin_clientes_lista(
  p_limite   integer default 100,
  p_offset   integer default 0,
  p_fase     text default null,    -- null = todas
  p_grau     text default null,    -- '_nulo' = sem grau informado
  p_busca    text default null,    -- nome do cliente OU do parceiro
  p_reuniao  text default null     -- 'marcada' | 'vencida' | 'sem' | null (todos)
)
returns table (
  id                       uuid,
  aluno_id                 uuid,
  parceiro_nome            text,
  cliente_nome             text,
  telefone                 text,
  fase                     text,
  grau_relacao             text,
  perfil_disc              text,
  data_reuniao_preliminar  date,
  aderiu_reuniao           boolean,
  acompanhado_equipe       boolean,
  criado_em                timestamptz,
  total_linhas             bigint
)
language plpgsql stable security definer set search_path to ''
as $function$
declare
  v_limite integer;
  v_offset integer;
  v_busca  text;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  -- Catálogo fechado, mesma técnica de `p_grau='_nulo'`: valor fora dele é
  -- erro do chamador (parâmetro estranho na URL nunca chega aqui — fica
  -- retido na allowlist de `estado-na-url.ts` — mas a RPC não confia
  -- só na tela; é `security definer` exposta a `authenticated`).
  if p_reuniao is not null and p_reuniao not in ('marcada', 'vencida', 'sem') then
    raise exception 'Filtro de reunião inválido.' using errcode = '22023';
  end if;

  -- Teto 5000: serve o CSV do universo inteiro do filtro numa única
  -- chamada, sem paginar o export em N idas ao banco.
  v_limite := least(greatest(coalesce(p_limite, 100), 1), 5000);
  v_offset := greatest(coalesce(p_offset, 0), 0);
  v_busca  := nullif(btrim(coalesce(p_busca, '')), '');

  return query
  with base as (
    select
      c.id,
      c.aluno_id,
      t.nome as parceiro_nome,
      c.nome as cliente_nome,
      c.telefone,
      c.fase,
      c.grau_relacao,
      c.perfil_disc,
      c.data_reuniao_preliminar,
      c.aderiu_reuniao,
      c.acompanhado_equipe,
      c.criado_em
    from gps.etapa1_clientes c
    -- 🔑 LEFT, não INNER (conferido em 14/09: 0 órfãos hoje, 1.222 clientes).
    -- Com INNER, um cliente cujo cadastro do parceiro sumisse da base
    -- compartilhada `thb_alunos` (que o sip também escreve) DESAPARECERIA da
    -- lista e da contagem, sem erro nenhum -- o contador dizendo 1.200 e o
    -- admin sem como saber que faltam 22. Com LEFT, ele aparece com o dono
    -- vazio, que é uma pendência visível em vez de um sumiço silencioso.
    left join public.thb_alunos t on t.id = c.aluno_id
    where (p_fase is null or c.fase = p_fase)
      and (
        p_grau is null
        or (p_grau = '_nulo' and c.grau_relacao is null)
        or c.grau_relacao = p_grau
      )
      and (
        v_busca is null
        or c.nome ilike '%' || v_busca || '%'
        or t.nome ilike '%' || v_busca || '%'
      )
      -- `data_reuniao_preliminar` é `date`: comparar com `current_date` é
      -- data contra data, sem fuso a considerar (NUNCA `now()`).
      and (
        p_reuniao is null
        or (p_reuniao = 'marcada' and c.data_reuniao_preliminar >= current_date)
        or (p_reuniao = 'vencida' and c.data_reuniao_preliminar < current_date)
        or (p_reuniao = 'sem' and c.data_reuniao_preliminar is null)
      )
  )
  select
    b.id, b.aluno_id, b.parceiro_nome, b.cliente_nome, b.telefone, b.fase,
    b.grau_relacao, b.perfil_disc, b.data_reuniao_preliminar, b.aderiu_reuniao,
    b.acompanhado_equipe, b.criado_em,
    (count(*) over ())::bigint as total_linhas
  from base b
  order by b.criado_em desc, b.id
  limit v_limite offset v_offset;
end;
$function$;

revoke execute on function gps.admin_clientes_lista(integer, integer, text, text, text, text) from public, anon;
grant  execute on function gps.admin_clientes_lista(integer, integer, text, text, text, text) to authenticated;

comment on function gps.admin_clientes_lista(integer, integer, text, text, text, text) is
  'Lista consolidada de clientes do programa (todos os ambientes), para /admin/clientes e o export CSV. gp_is_admin() ou 42501. p_limite tem teto 5000 -- serve o CSV do universo do FILTRO numa unica chamada, nao a pagina. total_linhas e count(*) over() DENTRO do filtro (o universo do filtro, nao da pagina). Join com public.thb_alunos DIRETO por t.id = c.aluno_id (aluno_id ja e o titular do ambiente, mesmo padrao de gps.admin_diagnostico_ambiente) -- nao passa por gps.membros. Busca por ilike simples (nome do cliente OU do parceiro): NENHUM indice textual existe em etapa1_clientes.nome nem thb_alunos.nome -- Seq Scan assumido por escrito, decisao medida, nao suposta. p_grau=''_nulo'' pega clientes sem grau informado. p_reuniao (…274, 17/09/2026): catalogo fechado marcada|vencida|sem|null (todos) -- compara data_reuniao_preliminar (date) contra current_date, NUNCA now(). Valor fora do catalogo -> 22023. 🔴 DECISAO DE LGPD DO MARCIO: registro_contato, valor_honorarios, contrato_* e problemas NAO entram no retorno -- os terceiros da lista nao deram consentimento para consolidacao; a anotacao livre do parceiro sobre a vida deles fica so na ficha individual, com trilha propria.';

-- ═══════════════════════════════════════════════════════════════════════
-- ✅ APLICADA E PROVADA EM PRODUÇÃO — 17/09/2026
-- ═══════════════════════════════════════════════════════════════════════
-- ⚠️ COMO FOI APLICADA: o agente que escreveu este SQL não tinha acesso ao
--    banco. O orquestrador NÃO aplicou este arquivo: reescreveu a função a
--    partir da DEFINIÇÃO VIVA (`pg_get_functiondef`) por `replace` com três
--    âncoras (assinatura · validação · `where`), abortando se qualquer uma
--    não existisse — a função tem allowlist de colunas, `count(*) over()`,
--    LEFT JOIN e paginação que não podem se perder numa reescrita à mão.
--    O banco registra `gps_clientes_lista_filtro_reuniao_grants` além disso.
--    A verdade do que está no ar é `pg_get_functiondef`, não este arquivo.
--
-- CONTAGENS (JWT de admin), batendo com o medido antes de mexer:
--   todos (null) : 1.636
--   marcada      :     3   (data >= current_date)
--   vencida      :    39   (data <  current_date)  ← 34 sem aderiu_reuniao
--   sem          : 1.594
--   🔑 soma dos 3 = 1.636 = total → nenhum cliente some NEM duplica.
--      (era o risco real: filtro mal escrito esconde gente em silêncio)
--
-- EXPLAIN (2ª passada — a 1ª é cache frio e mente; neste mesmo repo já deu
-- 56 ms × 7,5 ms e 38 ms × 0,677 ms):
--   modo 'vencida' : Execution Time 1,168 ms · Buffers: shared hit=128
--   modo null      : Execution Time 3,435 ms · Buffers: shared hit=320
--
-- VEREDITO SOBRE ÍNDICE: **não criar**. O filtro deixa a consulta MAIS
--   RÁPIDA (1,17 ms contra 3,44 ms sem filtro) porque devolve menos linhas —
--   não há lentidão a resolver. Com 1.636 linhas o Seq Scan ganha, como já
--   medido na `…255` (fase: Seq Scan 0,686 ms × Index Scan 0,809 ms em
--   1.222 linhas). Índice aqui seria empilhar sem ganho.
--
-- OUTRAS CONFERÊNCIAS:
--   assinatura        : UMA, 6 parâmetros (o `drop` evitou sobrecarga)
--   modo inválido     : 22023 "Filtro de reunião inválido." ✓
--   fase + reuniao    : combinam sem conflito ✓
--   ACL               : postgres | authenticated | service_role — sem anon ✓
-- ═══════════════════════════════════════════════════════════════════════
