-- Mega feature — `grau_relacao` em gps.etapa1_clientes (pedido literal do João:
-- "o cliente deveria poder descrever qual o grau de relação com a pessoa —
-- parente, amigo, lead normal, etc").
--
-- POR QUE COLUNA NOVA E NÃO REAPROVEITAR `nivel_relacionamento`
--   `nivel_relacionamento` (frio/morno/quente) é TEMPERATURA: o quanto aquela
--   conversa está madura. O pedido é TIPO DE VÍNCULO. São eixos ortogonais —
--   existe parente frio e lead quente. Reaproveitar a coluna destruiria 664
--   valores já preenchidos (medido em 10/09: quente 200 · morno 231 · frio 233
--   · null 214) para responder outra pergunta.
--
-- POR QUE ENUM FECHADO E NÃO TEXTO LIVRE
--   O pedido é explicitamente de VISÃO MACRO ("bater o olho e saber onde
--   atacar"). Texto livre não agrega: viraria "amigo", "Amigo", "amigo do pai",
--   e a fatia do dashboard morre. Os 6 valores cobrem os 3 exemplos do João
--   mais os 2 óbvios do negócio. Um 7º valor é UMA linha aqui e UMA em
--   `GRAUS_RELACAO` (src/lib/types.ts) — decisão B-G1, respondida com os 6.
--
-- BACKFILL: ZERO. As ~878 linhas nascem `null` = NÃO INFORMADO, e a UI é
--   proibida de exibir isso como "Lead": o padrão não pode ser um palpite
--   sobre a vida de um terceiro. É a lição "campo novo nasce vazio" —
--   preencher com o valor mais comum creditaria a resposta errada a 878
--   pessoas que nunca responderam.
--
-- ⚠️ NÃO ENTRA em `comDados` (src/lib/etapa1.ts) nem em `tarefaConcluida`.
--   `comDados` é nome + telefone + nível de relacionamento, e é o que a tarefa
--   1 cobra. Acrescentar `grau_relacao` à regra REABRIRIA a tarefa 1 de quem
--   já a concluiu — proibido nesta rodada (§H.8 item 4).
--
-- O QUE NÃO FAZ
--   * não escreve em nenhuma linha (add column com default NULL é instantâneo,
--     sem rewrite de tabela — a tabela mais quente do sistema não é reescrita);
--   * não cria índice: nenhuma consulta filtra POR grau hoje. O dashboard
--     agrega a tabela inteira (`group by grau_relacao`), plano em que um índice
--     não entra, e o filtro da aba Clientes é em memória, sobre os clientes de
--     UM ambiente (teto natural de dezenas de linhas). Índice aqui seria peso
--     morto de escrita na tabela mais escrita do sistema;
--   * não toca `nivel_relacionamento`, `fase` nem o `status` congelado.
--
-- REVERSÃO: alter table gps.etapa1_clientes drop column grau_relacao;
--   (nenhum outro objeto depende dela — o CHECK sai junto com a coluna).

alter table gps.etapa1_clientes
  add column if not exists grau_relacao text;

do $$ begin
  alter table gps.etapa1_clientes
    add constraint chk_etapa1_clientes_grau_relacao
      check (grau_relacao is null or grau_relacao in
        ('parente','amigo','conhecido','indicacao','cliente_atual','lead'));
exception when duplicate_object then null; end $$;

comment on column gps.etapa1_clientes.grau_relacao is
  'TIPO DE VINCULO do aluno com o cliente (parente | amigo | conhecido | indicacao | cliente_atual | lead). Eixo ORTOGONAL a nivel_relacionamento, que e TEMPERATURA (frio/morno/quente): existe parente frio e lead quente. NULL = nao informado, o estado de nascimento das ~878 linhas -- a UI NUNCA pode exibir NULL como "Lead". Enum fechado de proposito: o pedido e de visao macro (filtro e fatia no dashboard), e texto livre nao agrega. Espelha GRAUS_RELACAO em src/lib/types.ts e GRAUS_RELACAO_UI em src/lib/etapa1.ts. NAO entra em comDados/tarefaConcluida: isso reabriria a tarefa 1 de quem ja a concluiu.';
