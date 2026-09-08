-- Diário do aluno — Fase 2: índice parcial para o corte de backfill.
--
-- `getMarcosDeTrilha` (src/lib/data.ts) roda, entre outras, esta query para
-- achar quando o log detalhado passou a existir:
--
--   select ocorrido_em from gps.aluno_eventos
--   where aluno_id = $1 and origem = 'backfill' and tipo <> 'primeiro_acesso'
--   order by ocorrido_em asc limit 1
--
-- O único índice hoje é `idx_aluno_eventos_timeline (aluno_id, ocorrido_em
-- desc)` — cobre `aluno_id`, mas não `origem`. Para um aluno que ENTROU
-- DEPOIS do backfill (migração ...04), nenhuma linha dele tem
-- `origem='backfill'`: o planner varre TODAS as linhas desse aluno (Index
-- Scan em `idx_aluno_eventos_timeline`, filtro residual em cada uma) até
-- esgotar o range e concluir "vazio" — o trabalho cresce com o histórico do
-- aluno, sem teto, para devolver nada. Mesma classe de problema do
-- `btrim(lower())` vs `lower(btrim())` que travou produção em 19/08: um
-- predicado que não está no índice vira varredura completa.
--
-- Índice parcial em `origem = 'backfill'`: prova do WHERE — a cláusula
-- `origem = 'backfill'` do índice é EXATAMENTE a cláusula `origem =
-- 'backfill'` da query (não uma aproximação). Para o aluno pós-backfill, o
-- Index Scan não encontra nenhuma entrada e retorna imediato — sem varrer as
-- linhas `origem='app'` dele. Para o aluno coberto pelo backfill, o índice
-- restringe ao subconjunto (tipicamente 1-6 linhas por aluno: uma por tipo
-- de marco reconstruído — ver migração ...04), e o filtro residual `tipo <>
-- 'primeiro_acesso'` sobra para recheck em memória sobre esse punhado, não
-- sobre a tabela inteira.
--
-- `ocorrido_em` (sem `desc`) casa com `order by ocorrido_em asc limit 1` da
-- query — Index Scan direto na primeira entrada, sem sort à parte.
--
-- Reversão: `drop index gps.idx_aluno_eventos_backfill_corte;`
create index idx_aluno_eventos_backfill_corte
  on gps.aluno_eventos (aluno_id, ocorrido_em)
  where origem = 'backfill';

comment on index gps.idx_aluno_eventos_backfill_corte is
  'Serve getMarcosDeTrilha (src/lib/data.ts): select ocorrido_em from gps.aluno_eventos where aluno_id = $1 and origem = ''backfill'' and tipo <> ''primeiro_acesso'' order by ocorrido_em asc limit 1. Parcial em origem=''backfill'' — prova do WHERE: sem ele, aluno que entrou depois do backfill (0 linhas backfill) fazia o planner varrer TODO o histórico do aluno em idx_aluno_eventos_timeline só para concluir vazio.';
