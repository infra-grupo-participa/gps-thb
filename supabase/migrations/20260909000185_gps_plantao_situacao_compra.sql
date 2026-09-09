-- Plantão — o mapa da situação comercial de cada pessoa do Acelera.
--
-- 🔑 POR QUE EXISTE (decisão do Marcio, 09/09/2026)
--
--   A base era BINÁRIA: a pessoa estava na lista ou não estava. Quando
--   alguém procurava a equipe — *"comprei e não consigo entrar"* — não havia
--   como responder sem SQL. E, pior, os casos de hoje mostraram que "não
--   está na lista" esconde situações muito diferentes:
--
--     • Bianca  — comprou depois da carga de 01/09 (a lista é congelada)
--     • Ademir  — está na lista, mas o CSV da Hotmart traz o e-mail com typo
--     • Daniel  — estava liberado o tempo todo; nunca chegou a tentar
--     • 65 pessoas — geraram cobrança e NÃO pagaram (cancelado/expirado)
--     • 20 pessoas — pagaram e foram REEMBOLSADAS
--
--   Sem o mapa, todas essas viram "não está na lista" e caem no colo de uma
--   pessoa só. Com ele, a equipe abre a aba Alunos e lê a situação.
--
-- O QUE AS COLUNAS SÃO — E O QUE NÃO SÃO
--
--   `situacao_compra` NÃO controla acesso. Quem controla continua sendo
--   `ativo` (+ `bloqueado_por_programa`). A situação EXPLICA o porquê. Essa
--   separação é deliberada: misturar as duas faria uma reimportação de CSV
--   silenciosamente devolver ou tirar acesso de gente.
--
--     pago       → Completo / Aprovado
--     nao_pago   → Cancelado / Expirado / Boleto impresso / Aguardando
--     devolvido  → Reembolsado / Chargeback / Reclamado
--
--   `situacao_detalhe` guarda os status CRUS, separados por vírgula
--   ("Cancelado, Completo") — a equipe responde ao aluno com precisão, sem
--   abrir planilha. Uma pessoa pode ter várias transações: quem tem
--   Reembolsado E Completo é `devolvido`, porque o dinheiro voltou.
--
--   `situacao_em` é a data do export que gerou a situação. **Mapa sem data
--   envelhece sem ninguém perceber — foi exatamente o que aconteceu com o
--   CSV de 01/09**, que só encolhia e nunca crescia.
--
-- 🔴 A REGRA DA REIMPORTAÇÃO
--
--   Ao reimportar o histórico de vendas, `ativo` e `bloqueado_por_programa`
--   **NÃO entram no `on conflict do update`**. Quem já existe tem só a
--   situação atualizada. Sem essa trava, subir um CSV novo:
--     • reativaria quem a equipe revogou de propósito;
--     • desbloquearia quem migrou para o Programa de Implementação.
--   Pessoa NOVA nasce `ativo = false` — entrar no mapa é ganhar consulta,
--   nunca acesso. Liberar é ato deliberado da equipe ("Liberar aluno").
--
-- REVERSÃO
--   alter table gps.plantao_alunos
--     drop column situacao_compra, drop column situacao_detalhe,
--     drop column situacao_em;

begin;

alter table gps.plantao_alunos
  add column if not exists situacao_compra text
    check (situacao_compra in ('pago','nao_pago','devolvido')),
  add column if not exists situacao_detalhe text,
  add column if not exists situacao_em timestamptz;

comment on column gps.plantao_alunos.situacao_compra is
  'Situacao comercial vinda do historico de vendas da Hotmart: pago (Completo/Aprovado) | nao_pago (Cancelado/Expirado/Boleto impresso -- gerou cobranca e nao pagou) | devolvido (Reembolsado/Chargeback/Reclamado). NULL = pessoa que nunca apareceu num export (ex.: liberacao manual). NAO controla acesso -- quem controla e `ativo`; esta coluna EXPLICA o porque.';

comment on column gps.plantao_alunos.situacao_detalhe is
  'Os status crus da Hotmart que geraram a situacao, separados por virgula (ex.: "Cancelado, Completo"). Serve para a equipe responder ao aluno com precisao, sem abrir o CSV.';

comment on column gps.plantao_alunos.situacao_em is
  'Quando o export que gerou esta situacao foi importado. Mapa sem data envelhece sem ninguem perceber -- foi o que aconteceu com o CSV de 01/09.';

commit;
