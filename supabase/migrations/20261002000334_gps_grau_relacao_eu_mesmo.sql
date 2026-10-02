-- 20261002000334 — grau de relação ganha 'eu_mesmo' (parceiro que é o próprio cliente).
--
-- Valores ANTES (lidos de 20260910000202, única migration que define o CHECK;
-- grep por grau_relacao nas demais não o altera):
--   parente, amigo, conhecido, indicacao, cliente_atual, lead
-- DEPOIS: os 6 acima + eu_mesmo.
--
-- Só AMPLIA o conjunto: nenhuma linha existente pode violar o novo CHECK.
-- NÃO toca gps.onboarding_respostas.cliente_grau_relacao nem a RPC do
-- onboarding (…260) — o passo do onboarding não oferece eu_mesmo.
--
-- PROVA ANTES DE APLICAR (somente leitura):
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'chk_etapa1_clientes_grau_relacao'
--      and conrelid = 'gps.etapa1_clientes'::regclass;
--   select grau_relacao, count(*) from gps.etapa1_clientes group by 1 order by 2 desc;
--   -- esperado: só null + os 6 valores antigos.
-- PROVA DEPOIS:
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'chk_etapa1_clientes_grau_relacao'
--      and conrelid = 'gps.etapa1_clientes'::regclass;  -- contém 'eu_mesmo'
--   begin;
--     update gps.etapa1_clientes set grau_relacao = 'xx' where id = (select id from gps.etapa1_clientes limit 1);
--   rollback;  -- esperado: 23514 check_violation
--
-- REVERSÃO (só se nenhuma linha tiver eu_mesmo): recriar o CHECK com os 6 antigos.

begin;

alter table gps.etapa1_clientes
  drop constraint if exists chk_etapa1_clientes_grau_relacao;

alter table gps.etapa1_clientes
  add constraint chk_etapa1_clientes_grau_relacao
    check (grau_relacao is null or grau_relacao in
      ('parente','amigo','conhecido','indicacao','cliente_atual','lead','eu_mesmo'));

comment on column gps.etapa1_clientes.grau_relacao is
  'TIPO DE VINCULO do aluno com o cliente (parente | amigo | conhecido | indicacao | cliente_atual | lead | eu_mesmo). Eixo ORTOGONAL a nivel_relacionamento, que e TEMPERATURA (frio/morno/quente). NULL = nao informado -- a UI NUNCA pode exibir NULL como "Lead". eu_mesmo (…334): o parceiro e o proprio cliente (holding da propria familia); nao entra no onboarding. Enum fechado de proposito. Espelha GRAUS_RELACAO em src/lib/types.ts e GRAUS_RELACAO_UI em src/lib/etapa1.ts. NAO entra em comDados/tarefaConcluida.';

commit;
