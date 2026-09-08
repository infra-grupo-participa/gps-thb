-- Diário do aluno — Fase 2: índice de leitura em `gps.acessos_log`.
--
-- `getAcoesAdministrativasDoAluno` (src/lib/data.ts) roda:
--
--   select * from gps.acessos_log
--   where aluno_id = $1 [and criado_em >= $2]
--   order by criado_em desc limit N
--
-- `gps.acessos_log` só tinha a PK (`acessos_log_pkey` em `id`). Plano medido
-- em produção ANTES deste índice:
--
--   Seq Scan on acessos_log ... Rows Removed by Filter: 34
--   -> Sort (Sort Key: criado_em DESC)
--
-- Ou seja: varredura da tabela inteira + sort em memória, a cada abertura da
-- aba Diário de qualquer aluno. Hoje são 34 linhas e o custo é irrelevante —
-- e é exatamente por isso que passa despercebido. `acessos_log` é tabela de
-- AUDITORIA append-only: nunca encolhe, só cresce, uma linha por ação
-- administrativa (senha definida, acesso excluído, sócio adicionado...) de
-- TODOS os alunos. A leitura, porém, é sempre de UM aluno. Sem índice, o
-- custo de cada leitura cresce com o total do sistema, não com o histórico
-- do aluno lido.
--
-- Deixar para "quando doer" é o padrão que travou produção em 19/08. O índice
-- entra agora, com o plano medido, enquanto é barato criá-lo.
--
-- `(aluno_id, criado_em desc)` casa com o WHERE (igualdade na 1ª coluna) e
-- com o `order by criado_em desc` (2ª coluna já na ordem pedida), então o
-- Sort à parte desaparece — o mesmo formato de `idx_aluno_eventos_timeline`,
-- que é a query irmã desta tela.
--
-- Reversão: `drop index gps.idx_acessos_log_aluno;`
create index idx_acessos_log_aluno
  on gps.acessos_log (aluno_id, criado_em desc);

comment on index gps.idx_acessos_log_aluno is
  'Serve getAcoesAdministrativasDoAluno (src/lib/data.ts): where aluno_id = $1 order by criado_em desc. Antes deste indice a query era Seq Scan + Sort na tabela inteira de auditoria (medido: Rows Removed by Filter 34 de 34). acessos_log e append-only e so cresce, entao o custo por leitura crescia com o total do sistema em vez de com o historico do aluno lido.';
