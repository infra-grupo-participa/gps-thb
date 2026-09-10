-- Onboarding -- enxuto, obrigatorio e com os dados que a equipe precisa.
--
-- Nove pedidos do Marcio em 10/09/2026, todos aplicados juntos porque mexem
-- na mesma maquina de passos:
--
--   1. PAIS do lead (coluna nova `cliente_pais`, ISO-3166 alpha-2).
--   2. "Telefone" vira "Numero de WhatsApp" -- e por ali que a equipe fala
--      com o lead. A COLUNA manteve o nome (`cliente_telefone`) para nao
--      quebrar o historico; so o rotulo mudou.
--   3. Onboarding OBRIGATORIO: nome e WhatsApp do cliente sao exigidos.
--   4. "Nao informar agora" sai do grau de relacao -- passa a ser exigido.
--   5. Quem vai CAPTAR nao tem cliente: fase, dados e honorarios sao
--      zerados ("se ele nao fez sessao de viabilidade, ele nao tem cliente").
--   6. Fase nova `agendado`: "Sessao de viabilidade ja agendada ou Reuniao
--      preliminar ja agendada, aguardando realizacao".
--   7. Honorarios viram PERGUNTA (`honorarios_pactuados`), nao consequencia
--      da fase: quem responde "sim" informa o valor, em qualquer fase.
--   8. ANEXO do contrato SAI do onboarding (segue na ficha do cliente).
--   9. Saem os passos de anexo de documentos e o TOUR do portal; e a
--      pergunta "descreva o seu caso" sai para todo mundo.
--
-- O FLUXO FINAL
--   TEM cliente: 0 senha | 1 abertura | 2 origem | 3 cliente
--                4 honorarios | 5 ajuda | 6 pronto
--   VAI CAPTAR:  0 senha | 1 abertura | 2 origem | 6 pronto
--
--   A faixa aceita passou de 0..9 para 0..6, nas tres camadas (tela, action
--   e banco). `onboarding_concluir` carimba 6.
--
-- 🔑 `agendado` -> `prospeccao`, nao `fechamento`: a reuniao ainda NAO
--    aconteceu. Se o Marcio quiser que ja conte como fechamento, e uma linha
--    no `case` de `onboarding_concluir`.
--
-- ⚠️ O CHECK da coluna `fase_cliente1` precisou ser recriado -- ele nao
--    conhecia `agendado` e recusava a gravacao com 23514 mesmo depois de a
--    RPC aceitar. Pego pela prova em rollback; um build verde nunca veria.
--
-- PROVA (em rollback, com a conta de teste e JWT real):
--   A) tem cliente -> cliente criado como prospeccao, WhatsApp e grau
--      gravados, honorarios 15000, favoritado; passo 8 recusado.
--   B) vai captar  -> 0 clientes criados, cliente_id null, favoritado false.
--
-- REVERSAO
--   As colunas novas podem ficar (sao nullable). Para voltar o fluxo antigo:
--   restaurar a faixa 0..9 nas tres camadas e reintroduzir os componentes
--   `passo-tour.tsx` e `rever-apresentacao.tsx`, que foram APAGADOS.

alter table gps.onboarding_respostas
  add column if not exists cliente_pais text,
  add column if not exists honorarios_pactuados boolean;

comment on column gps.onboarding_respostas.cliente_pais is
  'Pais de origem do cliente 1 (lead). Pedido do Marcio em 10/09/2026: saber de onde vem o lead. ISO-3166 alpha-2 (BR, PT, US...); NULL para quem respondeu antes desta coluna existir.';

comment on column gps.onboarding_respostas.honorarios_pactuados is
  'O aluno ja pactuou honorarios com o cliente 1? Pergunta do passo 4. `true` abre o campo de valor; `false`/NULL nao. Antes desta coluna o valor era pedido sempre que a fase fosse execucao.';

comment on column gps.onboarding_respostas.cliente_telefone is
  'Numero de WhatsApp do cliente 1. O rotulo na tela mudou de "Telefone" para "Numero de WhatsApp" em 10/09/2026 -- e por ali que a equipe fala com o lead. A coluna manteve o nome para nao quebrar o historico.';

-- O CHECK nao conhecia `agendado`: recusava com 23514 mesmo com a RPC
-- aceitando. Recriado com os quatro valores.
alter table gps.onboarding_respostas
  drop constraint if exists onboarding_respostas_fase_cliente1_check;

alter table gps.onboarding_respostas
  add constraint onboarding_respostas_fase_cliente1_check
  check (fase_cliente1 is null or fase_cliente1 in
         ('agendado','viabilidade_feita','croqui_apresentado','execucao_andamento'));

-- As duas RPCs abaixo foram reescritas a partir do corpo VIGENTE lido de
-- `pg_get_functiondef` (regra do projeto). O que mudou em cada uma:
--
--   onboarding_salvar_passo
--     • faixa 0..6 (era 0..9)
--     • allowlist ganha `cliente_pais` e `honorarios_pactuados`
--     • allowlist perde `descricao_caso` (a pergunta saiu)
--     • `agendado` entra na lista de fases aceitas
--     • origem != 'ja_tenho' zera fase, nome, telefone, grau, pais,
--       pactuados e valor -- quem vai captar nao tem cliente
--     • pactuados != true zera o valor
--     • mensagem do telefone vira "Numero de WhatsApp invalido."
--
--   onboarding_concluir
--     • exige nome E WhatsApp E grau quando ha cliente
--     • honorarios dependem de `honorarios_pactuados`, nao da fase
--     • NAO exige mais o anexo do contrato, e nao copia contrato para o
--       cliente criado
--     • `agendado` -> `prospeccao` no mapa de fases
--     • carimba `passo_atual = 6`
--
-- Corpos completos: `select pg_get_functiondef(p.oid) from pg_proc p join
-- pg_namespace n on n.oid = p.pronamespace where n.nspname = 'gps' and
-- p.proname in ('onboarding_salvar_passo','onboarding_concluir');
