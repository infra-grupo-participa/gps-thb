-- `com_reuniao`: o 5º modo do catálogo de `gps.admin_clientes_lista(p_reuniao)`.
--
-- Pedido do Marcio, 17/09/2026, minutos depois de a faixa de KPIs subir:
--   "eu preciso ao selecionar os 42, exiba todos da lista, eu quando clico
--    em um dos filtros, nao exibe todos da lista"
--
-- O tile "Total com reunião" (42) tinha sido entregue NÃO clicável, porque o
-- catálogo só tinha os 3 recortes (marcada/para_vencer/vencida) e o `sem`.
-- Eu tratei a ausência do modo como uma restrição do sistema e escrevi na
-- migração `…282` que inventar um `?reuniao=` fora da allowlist seria link
-- quebrado. Estava certo sobre a allowlist e errado sobre o produto: o que
-- faltava não era desistir do clique, era o modo existir.
--
-- 🔑 `com_reuniao` NÃO é o mesmo que `p_reuniao = null`:
--     null        -> a base INTEIRA (1.650 hoje, incluindo os 1.608 que não
--                    têm reunião nenhuma)
--     com_reuniao -> só quem TEM data marcada, em qualquer prazo (42)
--                    = marcada + para_vencer + vencida
-- É exatamente o número que o tile promete. Usar `null` no clique mostraria
-- 1.650 linhas para um tile que diz 42 — o tipo de divergência que faz o
-- admin desconfiar de todos os outros números da tela.
--
-- ═══════════════════════════════════════════════════════════════════════
-- COMO FOI APLICADO
-- ═══════════════════════════════════════════════════════════════════════
-- Por REESCRITA PROGRAMÁTICA a partir de `pg_get_functiondef` (a definição
-- VIVA), com duas âncoras e `raise exception` se qualquer uma não bater
-- caractere a caractere — não reescrevendo a função de memória. A função tem
-- allowlist de colunas no `returns table`, LEFT JOIN em `thb_alunos` e
-- `count(*) over()` DENTRO do filtro; reescrever à mão é onde se perde
-- comportamento sem perceber.
--   âncora 1: a lista do `not in (...)` da validação
--   âncora 2: a linha do ramo `p_reuniao = 'marcada'`, para inserir o ramo
--             novo ANTES dela
-- A assinatura NÃO muda (6 parâmetros) — `create or replace`, sem risco de
-- sobrecarga.
--
-- ⚠️ O bloco `do $$ ... $$` abaixo é o que foi de fato executado em
-- produção. É idempotente por construção: rodado de novo, a âncora 1 não
-- encontra mais o texto antigo (já tem `com_reuniao`) e ABORTA com mensagem
-- clara, em vez de aplicar mudança cega.
--
-- ═══════════════════════════════════════════════════════════════════════
-- PROVA — MEDIDO EM PRODUÇÃO, 17/09/2026 (claims de admin real)
-- ═══════════════════════════════════════════════════════════════════════
--   com_reuniao = 42  ← idêntico a `total_com_reuniao` de
--                        gps.admin_clientes_reuniao_kpis() ✓
--   marcada 1 · para_vencer 2 · vencida 39  → 1+2+39 = 42 ✓
--   sem 1.608 · 42 + 1.608 = 1.650 = select count(*) from gps.etapa1_clientes ✓
--   'invalido' → RECUSADO 22023 (o catálogo continua fechado)
--   sem JWT → 42501 · JWT de aluno titular real → 42501
--   CSV: admin_registrar_export_clientes com reuniao='com_reuniao' gravou
--        "42 linha(s) exportada(s). Filtro: ... reuniao=com_reuniao" — a
--        linha de teste foi APAGADA depois (não foi export de verdade).
--
-- 🔑 A BASE CRESCEU DURANTE O TRABALHO: `…282` mediu 1.636 e aqui são 1.650
-- (36 clientes criados nas 3h anteriores — parceiros usando o sistema agora).
-- O que se conserva não é o total, é o INVARIANTE: os modos somam a base
-- inteira, qualquer que seja ela. Número absoluto de migração envelhece;
-- por isso a prova é a igualdade, não o 1.636.
--
-- REVERSÃO: reaplicar o `create or replace` de `…282` (devolve o catálogo de
-- 4 valores). O front precisa sair junto — `com_reuniao` viraria 22023.

do $$
declare v_def text; v_nova text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'gps' and p.proname = 'admin_clientes_lista';

  if v_def is null then
    raise exception 'gps.admin_clientes_lista nao existe -- abortado';
  end if;

  v_nova := replace(v_def,
    'p_reuniao not in (''marcada'', ''para_vencer'', ''vencida'', ''sem'')',
    'p_reuniao not in (''com_reuniao'', ''marcada'', ''para_vencer'', ''vencida'', ''sem'')');
  if v_nova = v_def then
    raise exception 'ancora 1 (catalogo do not in) nao encontrada -- abortado (ja migrada?)';
  end if;

  v_def := v_nova;
  v_nova := replace(v_def,
    '        or (p_reuniao = ''marcada'' and c.data_reuniao_preliminar > current_date + 7)',
    '        or (p_reuniao = ''com_reuniao'' and c.data_reuniao_preliminar is not null)'
    || chr(10) ||
    '        or (p_reuniao = ''marcada'' and c.data_reuniao_preliminar > current_date + 7)');
  if v_nova = v_def then
    raise exception 'ancora 2 (ramo marcada) nao encontrada -- abortado';
  end if;

  execute v_nova;
end $$;

comment on function gps.admin_clientes_lista(integer, integer, text, text, text, text) is
  'Lista consolidada de clientes do programa (todos os ambientes), para /admin/clientes e o export CSV. gp_is_admin() ou 42501. p_limite tem teto 5000. total_linhas e count(*) over() DENTRO do filtro. LEFT JOIN com public.thb_alunos (nao INNER: cliente cujo parceiro sumisse da base compartilhada desapareceria da lista E da contagem, sem erro). p_reuniao (…285, 17/09/2026): com_reuniao|marcada|para_vencer|vencida|sem|null -- com_reuniao = tem data em qualquer prazo (= marcada+para_vencer+vencida, o numero do tile "Total"), marcada = data > hoje+7, para_vencer = hoje..hoje+7, vencida = data < hoje, sem = sem data, null = a base INTEIRA (inclui os sem reuniao). 🔑 com_reuniao NAO e null: o tile diz 42 e null traria 1.650. Compara data_reuniao_preliminar (date) contra current_date, NUNCA now(). Valor fora do catalogo -> 22023. 🔴 DECISAO DE LGPD DO MARCIO: registro_contato, valor_honorarios, contrato_* e problemas NAO entram no retorno -- os terceiros da lista nao deram consentimento para consolidacao.';
