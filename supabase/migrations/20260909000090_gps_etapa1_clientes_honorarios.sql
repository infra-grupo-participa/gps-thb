-- Cliente contratado passa a registrar HONORÁRIOS e o LINK do contrato.
--
-- MOTIVAÇÃO (feature 6 do Marcio): comprovação de faturamento. A meta é
-- R$ 150.000 por AMBIENTE, somando `valor_honorarios` dos clientes em
-- fase='contratado' -- programa inteiro, valor CONTRATADO, não recebido (B8).
--
-- LINK, NÃO UPLOAD: o contrato do cliente é documento do cliente e continua no
-- Drive (decisão de 07/2026, que o fichário quebrou). `contrato_url` guarda o
-- endereço; nenhum byte entra no GPS por aqui. O anexo da Fase 6 é outra coisa
-- (prova de problema no portal) e mora em bucket separado.
--
-- BACKFILL: NENHUM. As duas colunas nascem NULL nas 879 linhas; zero linha muda
-- de valor; ninguém é promovido nem rebaixado. Uma consequência disso é de
-- TELA, não de banco: um KPI sobre coluna recém-criada mostra vazio como se
-- fosse resultado. A UI é obrigada a distinguir "nenhum honorário registrado
-- ainda" de "R$ 0,00" -- ver o plano da Fase 7-B, item 2.4, e o tipo
-- `ResumoHonorarios` (total: number | null) em src/lib/etapa1.ts.
--
-- SEM CHECK LIGANDO `valor_honorarios` A `fase='contratado'` (B9-b): seria uma
-- catraca. Mover o cliente de volta para fechamento passaria a falhar até
-- alguém apagar o valor, e apagar dado por mudança de estado é perda
-- silenciosa. A regra "só contratado conta" vive na SOMA
-- (gps.admin_painel_alunos, migração ...091, e resumoHonorarios em
-- src/lib/etapa1.ts), NÃO na constraint.
--
-- URL: o CHECK exige https e proíbe espaço em branco. É o que impede
-- `javascript:`, `data:` e `http://` de entrarem na coluna -- a validação em
-- src/app/etapa-1/actions.ts é conveniência (erro em português em vez de
-- 23514), esta é a garantia. O teto de 2000 é o limite prático de URL que a
-- maioria dos navegadores/proxies aceita; o piso de 12 recusa 'https://a'
-- e afins, que não endereçam nada.
--
-- GRANTS: `gps.etapa1_clientes` tem privilégio de TABELA (não de coluna) --
-- provado pela migração ...060, que acrescentou `fase` e o aluno passou a
-- escrever nela sem nenhum `grant` novo. Coluna nova herda. Se algum dia
-- houver grant por coluna, a escrita falha com 42501 e a feature nasce morta:
-- por isso o bloco de conferência checa information_schema.column_privileges.
--
-- ÍNDICE: NENHUM. Toda leitura de cliente é `where aluno_id = $1` e devolve
-- <= 30 linhas (já servida por etapa1_clientes_aluno_idx); a agregação do
-- painel varre a tabela inteira de propósito (raciocínio no cabeçalho da
-- ...050). Índice em valor_honorarios/fase seria peso morto de escrita.
--
-- O QUE ESTA MIGRAÇÃO NÃO FAZ:
--   * não escreve em nenhuma linha (0 UPDATE, 0 INSERT);
--   * não muda a soma do painel -- isso é a migração ...091;
--   * não audita nada no diário -- isso é a migração ...092;
--   * não audita `contrato_url` em lugar nenhum (link muda por manutenção; a
--     disputa é sempre sobre o valor).
--
-- REVERSÃO:
--   alter table gps.etapa1_clientes
--     drop column contrato_url,
--     drop column valor_honorarios;
--   ⚠️ perde os valores digitados desde a aplicação. Antes de reverter:
--   create table gps.honorarios_backup as
--     select id, aluno_id, valor_honorarios, contrato_url
--       from gps.etapa1_clientes
--      where valor_honorarios is not null or contrato_url is not null;

alter table gps.etapa1_clientes
  add column valor_honorarios numeric(12,2)
    constraint chk_etapa1_clientes_honorarios_nao_negativo
      check (valor_honorarios is null or valor_honorarios >= 0),
  add column contrato_url text
    constraint chk_etapa1_clientes_contrato_url
      check (contrato_url is null
             or (contrato_url ~ '^https://[^[:space:]]+$'
                 and length(contrato_url) between 12 and 2000));

comment on column gps.etapa1_clientes.valor_honorarios is
  'Honorarios CONTRATADOS do aluno com este cliente, em reais. Soma dos clientes em fase=contratado e a comprovacao de faturamento do ambiente (meta de R$ 150.000, B8). Valor CONTRATADO, nao recebido -- o portal nao sabe o que ja entrou no caixa do aluno. Preenchido pelo proprio aluno; visivel ao aluno e ao admin (B9). NAO ha constraint ligando a coluna a `fase`: o valor sobrevive a volta de fase e simplesmente deixa de contar na meta. NULL = nao informado, que a UI NUNCA pode exibir como R$ 0,00.';

comment on column gps.etapa1_clientes.contrato_url is
  'Link (https) do contrato no Google Drive. LINK, nao upload: documento do cliente continua fora do GPS (decisao de 07/2026). O CHECK exige https e proibe espaco -- e o que barra javascript:/data:/http:. Nao e auditado no diario: link muda por manutencao, a disputa e sempre sobre o valor.';
