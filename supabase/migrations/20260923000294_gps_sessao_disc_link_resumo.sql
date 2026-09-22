-- ═══════════════════════════════════════════════════════════════════════════
-- Evolução da Agenda de Sessões — FATIA A: DISC rico, resumo, dono do link,
-- interruptor `sessoes_exige_disc` e o DISC saindo do snapshot congelado.
--
-- PRD: docs/specs/2026-09-23-sessoes-disc-link-resumo-PRD.md
--      (§2.2 o DISC ao vivo · §3 fatia A · §4 P1 · §5.2 índices · §6.2)
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 ESTA MIGRAÇÃO ENTRA POR CIMA DE ESTRUTURA VIVA
-- ═══════════════════════════════════════════════════════════════════════════
-- As migrações …291/…292/…293 JÁ ESTÃO EM PRODUÇÃO (23/09/2026): as 5 tabelas,
-- as 14 funções e o cron `sessao-emails` (*/5) estão no ar, com a grade da
-- Dra. Cristiane semeada. Consequências que governam TODO este arquivo:
--
--   · toda coluna nova é `add column if not exists` — nenhuma reescrita
--     destrutiva, nenhum `drop column` de coluna existente;
--   · todo CHECK novo é `drop constraint if exists` + `add constraint`, com
--     NOME PRÓPRIO, nunca reescrevendo CHECK alheio;
--   · nenhum backfill: medido em 23/09, há **0 sessões agendadas** e as
--     colunas novas de `etapa1_clientes` nascem NULL em todos os clientes;
--   · `briefing_snapshot` de linha existente NÃO é reescrito (§6.6 do PRD).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 REVERSÃO — o caminho de volta de CADA objeto novo, NESTA ORDEM
-- ═══════════════════════════════════════════════════════════════════════════
-- A ordem importa: a função de leitura é o objeto mais externo (só consome),
-- depois os CHECKs (que dependem das colunas), depois as colunas, e por
-- último a linha de config (que nada referencia).
--
--   -- 1) O bloco `disc_ao_vivo` sai da RPC de leitura do briefing.
--   --    🔴 NÃO é `drop function`: `gps.sessao_briefing_ler` EXISTE desde a
--   --    …292 e é a única porta do briefing. Dropá-la derrubaria a tela da
--   --    doutora. Reverter = reaplicar o corpo da …292 (seção 8) com
--   --    `create or replace`, idêntico ao que está lá.
--
--   -- 2) CHECKs novos de gps.sessao_agendamentos:
--   alter table gps.sessao_agendamentos
--     drop constraint if exists chk_sessao_agend_resumo_tamanho,
--     drop constraint if exists chk_sessao_agend_resumo_so_realizado,
--     drop constraint if exists chk_sessao_agend_link_dono;
--
--   -- 3) CHECKs novos de gps.etapa1_clientes:
--   alter table gps.etapa1_clientes
--     drop constraint if exists chk_etapa1_clientes_disc_consciencia_tamanho,
--     drop constraint if exists chk_etapa1_clientes_disc_gatilhos_tamanho,
--     drop constraint if exists chk_etapa1_clientes_disc_relacionamento_tamanho;
--
--   -- 4) Grants de coluna novos (o revoke é por coluna; a tabela segue viva):
--   revoke select (resumo_em, resumo_por, link_definido_por, link_em)
--     on gps.sessao_agendamentos from authenticated;
--
--   -- 5) As 5 colunas de gps.sessao_agendamentos:
--   alter table gps.sessao_agendamentos
--     drop column if exists resumo,
--     drop column if exists resumo_em,
--     drop column if exists resumo_por,
--     drop column if exists link_definido_por,
--     drop column if exists link_em;
--
--   -- 6) As 5 colunas de gps.etapa1_clientes:
--   --    🔴 `perfil_disc` NÃO entra nesta lista. Ela existe desde o baseline
--   --    e tem 127 linhas preenchidas REAIS. Esta migração não a toca.
--   alter table gps.etapa1_clientes
--     drop column if exists disc_consciencia,
--     drop column if exists disc_gatilhos,
--     drop column if exists disc_relacionamento,
--     drop column if exists disc_atualizado_em,
--     drop column if exists disc_atualizado_por;
--
--   -- 7) O interruptor:
--   delete from gps.config where chave = 'sessoes_exige_disc';
--
-- ⚠️ Passos 5 e 6 APAGAM DADO se alguém já tiver preenchido. Reverter depois
-- de a feature ter uso exige export antes. Passos 1–4 e 7 são reversíveis sem
-- perda: desligar por GRANT/CHECK/config não toca em byte nenhum, e é o
-- botão de pânico preferido (§5.5 do PRD).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 O QUE ESTA MIGRAÇÃO **NÃO** TOCA
-- ═══════════════════════════════════════════════════════════════════════════
-- `gps.reuniao_*`, `gps.agenda`, `gps.plantao_*`, `public.gp_is_admin()`,
-- `gps.eh_equipe()`, `gps.entrevista_gravar`, `gps.fila_de_ligacoes`,
-- `gps.sessao_horarios_livres`, `sessao_agendar`, `sessao_cancelar`,
-- `sessao_marcar_falta`, `sessao_pode_agendar`, `sessao_disparar_emails` e o
-- cron, `sessao_tipos.duracao_min` (a duração vive SÓ ali), e
-- `briefing_snapshot` de linhas existentes.
--
-- Também NÃO toca:
--   · `gps.config_definir` e `INTERRUPTORES_CONFIG` (§3 fatia A item 5) —
--     mexer naquela RPC é escopo próprio, e acrescentar só de um lado produz
--     interruptor que a tela oferece e a RPC recusa. Mesma decisão que a …291
--     tomou para `sessoes_exige_confirmacao`.
--   · `gps.acessos_log.acao` — o CHECK dele tem 32 valores vivos (31 + o
--     `sessao_briefing_acessado` que a …292 acrescentou). ESTA FATIA NÃO
--     ACRESCENTA NENHUM VALOR, logo o CHECK não é reescrito. Reescrever CHECK
--     de memória apaga valor em silêncio — a conferência P0-a existe para
--     PROVAR que os 32 continuam lá depois desta migração.
--   · `gps.aluno_eventos.tipo` — idem, nenhum tipo novo aqui.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 ÍNDICES: NENHUM ÍNDICE NOVO NESTA MIGRAÇÃO
-- ═══════════════════════════════════════════════════════════════════════════
-- §5.2 do PRD pede medição antes de criar. Eu NÃO tenho `psql` nem Docker
-- nesta máquina e NÃO busco credencial de produção — portanto NÃO MEDI, e
-- por isso NÃO CRIO. Afirmar plano sem `explain analyze` é o erro de 18/09
-- (previ `Index Scan`, era `Seq Scan` numa tabela de 4 linhas).
--
-- O raciocínio estrutural que sustenta a decisão de não criar (a ser
-- CONFIRMADO por M1/M2 do roteiro no fim deste arquivo):
--   · esta fatia acrescenta SÓ COLUNAS. Nenhum predicado novo de `where`
--     nasce aqui — `resumo`, `disc_*`, `link_em` são lidos junto com a linha
--     que já se buscava por outra chave, nunca filtrados por.
--   · o que cresce é o PESO DA LINHA, não a contagem (§5.1): até 10 KB a
--     mais. Acima de ~2 KB o Postgres manda para TOAST, e a leitura que não
--     PEDE a coluna não paga o custo — o que reforça a regra de coluna
--     explícita, não a criação de índice.
--   · três precedentes medidos neste banco dizem Seq Scan: `etapa1_clientes
--     (fase)` (Seq 0,686 ms × Index 0,809 ms em 1.222 linhas), `cs.estagios`
--     (41 linhas) e §9b.1 da v1 (Seq Scan em 4.160 linhas simuladas, 0,833 ms).
--
-- 🔴 Se M1 ou M2 vier com `Rows Removed by Filter` ALTO, aí há caso para
-- índice — e ele nasce em migração PRÓPRIA, com o plano medido colado. Não
-- se cria índice "por precaução" numa tabela que recebe escrita a cada
-- agendamento.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- 1) gps.etapa1_clientes — as colunas do DISC RICO (pedido 5)
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 `perfil_disc` NÃO É TOCADA. É `text` com D/I/S/C desde o baseline e tem
-- 127 linhas preenchidas REAIS (medido em 23/09), TODAS vindas da FICHA do
-- cliente e nenhuma da entrevista (`entrevista_em` nulo nos 127). Mudar tipo,
-- CHECK ou semântica dela apagaria dado de gente real. As colunas abaixo
-- ACRESCENTAM contexto à letra; não a substituem.
--
-- 🔴 NENHUMA É `not null`, e isso é medição, não cautela: dos 34 favoritos,
-- **7 têm `perfil_disc` e 27 não têm** (medido 23/09). No dia do deploy,
-- **34 de 34** estarão sem os campos ricos. Uma coluna `not null` aqui
-- quebraria todo UPDATE de ficha de cliente do sistema inteiro — a tabela
-- mais quente do produto, com 4 triggers de trava no caminho de escrita.
--
-- 🔴 NULO = "não informado". NUNCA string vazia: o CHECK exige piso de 3
-- caracteres quando não nulo, então `''` é RECUSADO pelo banco. A camada TS
-- (fatia B) tem de converter campo vazio do formulário em NULL antes de
-- enviar, senão o parceiro recebe 23514 ao limpar um campo.
--
-- ⚠️ POR QUE ESTA TABELA E NÃO UMA NOVA: `perfil_disc` já mora aqui, a ficha
-- já lê e escreve esta linha (`clientes_owner_update` + `grant update`), e o
-- saldo de queries da feature tem de ser ZERO (§5.4). Tabela nova custaria um
-- JOIN em 3 telas para guardar 3 campos que são 1:1 com o cliente.
--
-- ⚠️ AS 4 TRIGGERS VIVAS DESTA TABELA — conferidas antes de acrescentar
-- coluna, porque todas rodam no UPDATE que a ficha faz:
--   · trg_etapa1_clientes_touch                  (baseline)  — só `atualizado_em`
--   · trg_etapa1_clientes_status_congelado       (…062)      — recusa escrita em `status`
--   · trg_etapa1_clientes_acompanhamento_travado (…203/…215) — protege o favorito
--   · trg_etapa1_clientes_contrato_travado       (…214)      — protege o anexo
--   · trg_etapa1_clientes_perda_nivel_congelados (…239)      — congela 2 colunas
--   · trg_aluno_eventos_etapa1_clientes          (…008/…092) — captura do diário
-- NENHUMA delas olha coluna por nome de forma que uma coluna NOVA a dispare:
-- as de congelamento comparam `old.<coluna> is distinct from new.<coluna>` em
-- colunas NOMEADAS, e a de captura audita uma lista FECHADA de campos. Coluna
-- nova não entra em nenhuma dessas listas, logo não dispara nada e não precisa
-- de tipo novo em `aluno_eventos.tipo` (que também não é tocado aqui).
alter table gps.etapa1_clientes
  add column if not exists disc_consciencia     text,
  add column if not exists disc_gatilhos        text,
  add column if not exists disc_relacionamento  text,
  add column if not exists disc_atualizado_em   timestamptz,
  add column if not exists disc_atualizado_por  uuid references auth.users(id) on delete set null;

-- ── CHECKs de tamanho ─────────────────────────────────────────────────────
-- 🔴 TETO DE 2000, o mesmo de `entrevista_observacoes` (…262:217) e de
-- `cliente_minutas.notas` (…273). NÃO se inventa régua nova: três tetos
-- diferentes para "texto livre da equipe sobre um cliente" viram três regras
-- que ninguém lembra, e a tela teria de escolher uma.
--
-- 🔴 PISO DE 3, não 1: campo de contexto com 1 caractere é ruído ocupando o
-- lugar de informação — e, mais importante, é o que impede `''` de entrar
-- disfarçado de "informado". A distinção "não informado" × "informado" tem de
-- ser legível por `is null`, e só é se a string vazia for impossível.
--
-- ⚠️ `btrim` no CHECK de propósito: "   " (3 espaços) passaria num
-- `char_length >= 3` cru e apareceria como "informado" na tela, em branco.
-- Mesma trava que `chk_sessao_agend_cancelado_tem_motivo` (…291) usa.
--
-- ⚠️ Sem subquery (0A000) e sem `now()` — os dois só falham AO APLICAR.
alter table gps.etapa1_clientes
  drop constraint if exists chk_etapa1_clientes_disc_consciencia_tamanho;
alter table gps.etapa1_clientes
  add  constraint chk_etapa1_clientes_disc_consciencia_tamanho
  check (disc_consciencia is null
         or char_length(btrim(disc_consciencia)) between 3 and 2000);

alter table gps.etapa1_clientes
  drop constraint if exists chk_etapa1_clientes_disc_gatilhos_tamanho;
alter table gps.etapa1_clientes
  add  constraint chk_etapa1_clientes_disc_gatilhos_tamanho
  check (disc_gatilhos is null
         or char_length(btrim(disc_gatilhos)) between 3 and 2000);

alter table gps.etapa1_clientes
  drop constraint if exists chk_etapa1_clientes_disc_relacionamento_tamanho;
alter table gps.etapa1_clientes
  add  constraint chk_etapa1_clientes_disc_relacionamento_tamanho
  check (disc_relacionamento is null
         or char_length(btrim(disc_relacionamento)) between 3 and 2000);

-- 🔴 NÃO EXISTE CHECK amarrando `disc_atualizado_em`/`_por` ao conteúdo dos
-- 3 campos ricos, e isso é DECISÃO, não esquecimento. Um CHECK "tudo ou nada"
-- (como o do contrato, …214) recusaria o caso mais comum do dia 1: alguém
-- preenche SÓ `perfil_disc` na ficha, e a camada TS carimba
-- `disc_atualizado_em` porque o bloco DISC foi salvo. Amarrar o carimbo aos
-- 3 ricos transformaria "salvei só a letra" em erro de banco na ficha do
-- cliente — a tela mais usada do produto. O carimbo descreve a ÚLTIMA
-- ESCRITA NO BLOCO DISC, não a existência dos campos ricos.

comment on column gps.etapa1_clientes.disc_consciencia is
  'NIVEL DE CONSCIENCIA do cliente sobre o proprio problema patrimonial -- quanto ele ja sabe que precisa de holding (pedido 5 do Marcio, 23/09/2026). Texto livre, 3..2000 caracteres quando nao nulo (mesmo teto de entrevista_observacoes e cliente_minutas.notas -- nao se inventa regua nova). NULL = nao informado; string vazia e IMPOSSIVEL (piso de 3 sobre btrim). Escrita pela ficha do cliente (allowlist de PatchCliente, fatia B) -- MESMA porta, MESMA policy (clientes_owner_update) e MESMO grant que perfil_disc usa desde 07/2026: nenhuma fronteira nova se abre aqui. 🔴 LGPD: descreve uma PESSOA FISICA que nunca ouviu falar do portal. FORA do returns table de gps.admin_clientes_lista, FORA do CSV, FORA de gps.fila_de_ligacoes, FORA do detalhe de sessao_eventos e FORA de qualquer e-mail -- herda a regra de registro_contato (…255) e de entrevista_observacoes (…262).';

comment on column gps.etapa1_clientes.disc_gatilhos is
  'GATILHOS EMOCIONAIS do cliente -- o que o move e o que o trava na decisao (pedido 5 do Marcio, 23/09/2026). Mesmas regras de disc_consciencia: 3..2000, NULL = nao informado, escrita pela ficha do cliente pela mesma porta de perfil_disc, e a MESMA trava de LGPD (fora de lista consolidada, CSV, trilha e e-mail).';

comment on column gps.etapa1_clientes.disc_relacionamento is
  'TUDO DE RELACIONAMENTO ligado ao perfil DISC: como abordar, o que evitar, como a pessoa decide junto com familia/socios (pedido 5 do Marcio, 23/09/2026). 🔴 NAO confundir com `grau_relacao`, que e o vinculo do PARCEIRO com o cliente (catalogo fechado de 6 valores: parente/amigo/conhecido/indicacao/cliente atual/lead), nem com `nivel_relacionamento`, CONGELADO em 10/09, que era temperatura comercial. Este campo e sobre COMO SE RELACIONAR com o cliente dado o perfil dele -- os tres respondem perguntas diferentes e nenhum substitui o outro. Mesmas regras: 3..2000, NULL = nao informado, mesma trava de LGPD.';

comment on column gps.etapa1_clientes.disc_atualizado_em is
  'Quando o bloco DISC (a letra e/ou os 3 campos ricos) foi gravado pela ultima vez. 🔴 NAO ha CHECK amarrando este carimbo ao conteudo dos 3 campos ricos, de proposito: no dia 1, 34 de 34 favoritos tem so a letra (ou nem isso -- 27 de 34 nao tem nem perfil_disc), e um CHECK "tudo ou nada" transformaria "salvei so a letra" em 23514 na ficha do cliente, a tela mais usada do produto. Este carimbo descreve a ULTIMA ESCRITA NO BLOCO, nao a existencia dos campos ricos. E o que gps.sessao_briefing_ler usa para a tela dizer "atualizado depois do agendamento" (§2.2 do PRD).';

comment on column gps.etapa1_clientes.disc_atualizado_por is
  'Quem (auth.users) gravou o bloco DISC por ultimo -- serve para a tela distinguir "preenchido pelo parceiro" de "preenchido pela equipe", que e o pedido 4 do Marcio (admin E parceiro preenchem, livre e visivel). `on delete set null`: apagar um login da equipe nao pode quebrar o historico do cliente, mesma regra de entrevista_por (…262) e de resumo_por abaixo.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 2) gps.sessao_agendamentos — o DESFECHO da sessão (pedido 8) e o dono do link
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 ANTES DE MEXER NOS CHECKS DESTA TABELA: ela tem 4 CHECKs vivos, criados
-- pela …291. CHECK reescrito de memória apaga valor em silêncio. Esta
-- migração NÃO REESCREVE NENHUM DELES — cria CHECKs de NOME PRÓPRIO, novos,
-- e os 4 antigos ficam byte a byte como estão. Os nomes, para a conferência
-- P0-b provar que continuam:
--   chk_sessao_agend_estado
--   chk_sessao_agend_cancelado_tem_motivo
--   chk_sessao_agend_so_cancelado_tem_carimbo
--   chk_sessao_agend_link                      (o `~ '^https://'` do link)
alter table gps.sessao_agendamentos
  add column if not exists resumo            text,
  add column if not exists resumo_em         timestamptz,
  add column if not exists resumo_por        uuid references auth.users(id) on delete set null,
  add column if not exists link_definido_por uuid references auth.users(id) on delete set null,
  add column if not exists link_em           timestamptz;

-- ── Tamanho do resumo ─────────────────────────────────────────────────────
-- 🔴 PISO DE 10, não 3: resumo de uma reunião de 2h30 com 3 caracteres é
-- ruído ocupando o lugar de informação — e a tela do aluno vai DIZER que
-- houve resumo (§4 P4). "ok" como resumo é pior que resumo nenhum, porque
-- afirma que a equipe registrou o desfecho.
-- Teto 4000 espelha `onboarding_respostas.descricao_caso` (…204:152), que é o
-- outro texto longo de caso desta base.
-- `btrim` pelo mesmo motivo dos CHECKs acima: 10 espaços não são um resumo.
alter table gps.sessao_agendamentos
  drop constraint if exists chk_sessao_agend_resumo_tamanho;
alter table gps.sessao_agendamentos
  add  constraint chk_sessao_agend_resumo_tamanho
  check (resumo is null
         or char_length(btrim(resumo)) between 10 and 4000);

-- ── Resumo só existe em sessão REALIZADA ──────────────────────────────────
-- 🔴 SEM SUBQUERY (0A000) e SEM `now()`: a regra compara colunas da PRÓPRIA
-- linha, que é tudo que CHECK aceita. A lição de 09/09 é que um
-- `not exists (select …)` passa no tsc, no build, no pentest e em 3 leituras,
-- e **só o `alter table` pega**.
--
-- A direção da implicação importa: "se tem resumo, o estado é realizado" —
-- e NÃO o inverso. Sessão realizada SEM resumo é estado legítimo (a doutora
-- conclui e escreve depois). Exigir o inverso travaria a conclusão, que é da
-- fatia C.
--
-- ⚠️ Os carimbos acompanham o texto: `resumo_em` sem `resumo` seria afirmação
-- de que alguém resumiu sem ter resumido. Tudo-ou-nada, no molde de
-- `chk_etapa1_clientes_contrato_anexo_completo` (…214).
--
-- ⚠️ `resumo_por` NÃO entra no ramo `not null`: a FK é `on delete set null`.
-- Apagar o login da doutora zeraria a coluna e transformaria uma linha VÁLIDA
-- em linha que viola o CHECK — e o Postgres não revalida CHECK no `set null`
-- da FK, então a tabela ficaria com dado que o próprio CHECK recusa. Bomba
-- silenciosa, que só aparece no próximo UPDATE daquela linha.
alter table gps.sessao_agendamentos
  drop constraint if exists chk_sessao_agend_resumo_so_realizado;
alter table gps.sessao_agendamentos
  add  constraint chk_sessao_agend_resumo_so_realizado
  check (
    (resumo is null and resumo_em is null and resumo_por is null)
    or (resumo is not null and resumo_em is not null and estado = 'realizado')
  );

comment on constraint chk_sessao_agend_resumo_so_realizado on gps.sessao_agendamentos is
  'Resumo so existe em sessao realizada, e os carimbos andam com o texto. Implicacao em UMA direcao de proposito: "tem resumo => estado=realizado". O INVERSO NAO e exigido -- sessao realizada SEM resumo e legitima (a doutora conclui e escreve depois); exigir os dois lados travaria a conclusao, que e da fatia C. `resumo_por` fica FORA do ramo "not null" porque a FK e `on delete set null`: apagar o login da doutora zeraria a coluna e transformaria linha VALIDA em linha que viola o CHECK -- e o Postgres nao revalida CHECK no set null da FK, entao a tabela ficaria com dado que o proprio CHECK recusa, bomba que so aparece no UPDATE seguinte. Sem subquery (0A000) e sem now(): CHECK nao aceita nenhum dos dois, e os dois so falham AO APLICAR.';

comment on column gps.sessao_agendamentos.resumo is
  'O que aconteceu na sessao, escrito pela EQUIPE depois da reuniao (pedido 8 do Marcio, 23/09/2026). 10..4000 caracteres; teto espelha onboarding_respostas.descricao_caso. Escrita so por RPC (gps.sessao_concluir / gps.sessao_resumo_editar, fatia C) -- `authenticated` nao tem UPDATE nesta tabela.

🔴 FORA DO GRANT DE COLUNA de `authenticated`, por DUAS razoes independentes: (1) LGPD/§4 P4 do PRD -- e texto livre da equipe sobre uma reuniao com cliente de terceiro, mesma familia do Diario (gps.aluno_notas), que o aluno nunca ve; o aluno ve QUE houve resumo, nao o texto. (2) PESO -- 4 KB por linha: §5.1 proibe declarar `resumo` na constante de colunas de QUALQUER lista; resumo se le UMA LINHA POR VEZ, ao abrir. O egress do Supabase e teto da ORGANIZACAO, dividido com o sip.
⚠️ Abrir ao aluno depois e barato; fechar depois de ter mostrado NAO se desfaz -- P4 e a unica premissa assimetrica do PRD.';

comment on column gps.sessao_agendamentos.resumo_em is
  'Quando o resumo foi gravado. Anda junto com `resumo` (chk_sessao_agend_resumo_so_realizado). DENTRO do grant de coluna de authenticated de proposito: e o que permite a tela do aluno dizer "a equipe registrou o desfecho em <data>" sem entregar o TEXTO (§4 P4 do PRD). Metadado nao e conteudo -- e sem ele a fatia H nao teria como saber que o resumo existe.';

comment on column gps.sessao_agendamentos.resumo_por is
  'Quem (auth.users) gravou o resumo. `on delete set null` -- por isso NAO entra no ramo `not null` do CHECK. DENTRO do grant de coluna: e uuid, nao conteudo, e a tela da equipe precisa dele para atribuir autoria.';

-- ── Dono do link (pedido 6 / premissa P3) ─────────────────────────────────
-- 🔴 A PRECEDÊNCIA EM SI (equipe vence parceiro) É DA FATIA D, NÃO DESTA.
-- Esta fatia entrega só o DADO que torna a precedência auditável e a tela
-- capaz de dizer "colado pela equipe" contra "colado por você".
--
-- ⚠️ O CHECK de https JÁ EXISTE na coluna (`chk_sessao_agend_link`, …291:315)
-- e NÃO é tocado. O teto de 500 caracteres e a recusa de CR/LF são da RPC da
-- fatia D — validação de forma de ENTRADA é da fronteira, não do CHECK.
alter table gps.sessao_agendamentos
  drop constraint if exists chk_sessao_agend_link_dono;
alter table gps.sessao_agendamentos
  add  constraint chk_sessao_agend_link_dono
  check (
    (link_definido_por is null and link_em is null)
    or link_em is not null
  );

comment on constraint chk_sessao_agend_link_dono on gps.sessao_agendamentos is
  'Se ha dono do link, ha carimbo de quando. O INVERSO e permitido de proposito: `link_em` sem `link_definido_por` e o estado legitimo depois de o login de quem colou ser apagado (a FK e `on delete set null`) -- a hora sobrevive a pessoa, e amarrar os dois faria o `set null` da FK deixar para tras linha que viola CHECK. NAO amarra ao `link_reuniao` em si: a fatia D pode limpar o link mantendo o rastro de quem o tinha posto, e travar isso aqui recusaria o caminho sem ganho nenhum.';

comment on column gps.sessao_agendamentos.link_definido_por is
  'Quem (auth.users) colou o link vigente da sala. E o que torna a precedencia P3 do PRD AUDITAVEL: a RPC da fatia D compara o papel de quem colou com o de quem esta tentando colar, e a tela diz "colado pela equipe" x "colado por voce". `on delete set null`: apagar o login nao apaga o link nem o carimbo. DENTRO do grant de coluna de authenticated -- o aluno precisa saber se pode trocar o link ANTES de tentar; sem essa coluna ele so descobriria no 22023 da RPC, e a regra viraria surpresa em vez de informacao.';

comment on column gps.sessao_agendamentos.link_em is
  'Quando o link vigente foi colado. DENTRO do grant de coluna (a tela diz "colado ha 2 dias pela equipe"). Sobrevive a exclusao do login de quem colou -- ver chk_sessao_agend_link_dono.';

-- ── GRANT DE COLUNA — decisão explícita sobre cada coluna nova ────────────
-- 🔴 `gps.sessao_agendamentos` tem grant POR COLUNA (…291 seção 6), não por
-- tabela. Consequência que reprova quem esquece: **coluna nova NÃO entra
-- sozinha no grant** — ela nasce invisível para `authenticated`. É o oposto
-- de `gps.etapa1_clientes`, que tem grant de TABELA INTEIRA
-- (baseline:387, `grant delete, insert, select, update`) e onde as 5 colunas
-- do DISC entram automaticamente pela mesma porta de `perfil_disc` — que é
-- exatamente o que §2.1 do PRD quer: ZERO fronteira nova.
--
-- Decisão, coluna a coluna:
--
--   resumo             → FORA. Conteúdo, não metadado. LGPD (texto sobre
--                        reunião com cliente de terceiro, família do Diário)
--                        + peso de 4 KB por linha numa lista (§5.1). O aluno
--                        vê QUE houve resumo, não o texto (§4 P4). A equipe
--                        lê por RPC, uma linha por vez.
--   resumo_em          → DENTRO. É o que permite a fatia H dizer "a equipe
--                        registrou o desfecho" sem entregar o texto. Sem ela,
--                        a tela do aluno não teria como saber que existe.
--   resumo_por         → DENTRO. uuid, não conteúdo; a tela da equipe atribui
--                        autoria, e o aluno vendo um uuid não aprende nada
--                        que a linha já não diga.
--   link_definido_por  → DENTRO. Faz o aluno saber, ANTES de tentar, se pode
--                        trocar o link (precedência P3).
--   link_em            → DENTRO. Idem: "colado há 2 dias pela equipe".
--
-- ⚠️ `briefing_snapshot` continua FORA, como está desde a …291. Este comando
-- NÃO a menciona e portanto não a altera: `grant select (col)` é ADITIVO por
-- coluna, não substitui a lista anterior. A prova P3 confere.
grant select (resumo_em, resumo_por, link_definido_por, link_em)
  on gps.sessao_agendamentos to authenticated;

-- 🔴 NENHUM GRANT DE UPDATE/INSERT/DELETE. Toda escrita nesta tabela passa
-- por RPC SECURITY DEFINER (fatias C e D). `grant select` NÃO revoga escrita
-- — mas aqui não há escrita a revogar: a …291 já fez
-- `revoke all ... from public, anon, authenticated` ANTES de qualquer grant,
-- e concedeu só SELECT por coluna. Esta migração não reabre nada, e a prova
-- P3 existe para confirmar em vez de confiar.
--
-- ⚠️ `anon` e `public` não são renomeados aqui porque nenhum grant desta
-- migração os menciona — mas a prova P3 confere assim mesmo: `revoke from
-- anon` não pega quando a permissão vem de `PUBLIC`, e a única forma de
-- saber o estado real é olhar `information_schema`, nunca deduzir.


-- ═══════════════════════════════════════════════════════════════════════════
-- 3) gps.config.sessoes_exige_disc — o interruptor da P1, NASCENDO DESLIGADO
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 NASCE `false`, e isto é MEDIÇÃO, não opinião: dos 34 favoritos elegíveis,
-- **7 têm `perfil_disc` e 27 NÃO TÊM** (medido pelo Marcio em 23/09). Uma
-- trava dura recusaria **79% dos elegíveis** — e a tela carregaria **sem erro
-- nenhum**, que é o modo de falha mais caro que existe.
--
-- Isto não é hipótese. Em 22/09, neste mesmo pacote, foi recomendado
-- "favorito confirmado pela equipe" como filtro de elegibilidade, o Marcio
-- aprovou, e a medição FEITA DEPOIS deu **0 alunos**
-- (`acompanhamento_confirmado_em` nunca foi preenchida). Filtro de
-- elegibilidade tem de ser CONTADO antes de escolhido.
--
-- A chave entra AGORA, desligada, para a REVERSÃO EXISTIR no dia em que o
-- Marcio quiser ligar: `update gps.config set valor='true' where
-- chave='sessoes_exige_disc'` — uma linha, sem migration e sem deploy.
--
-- 🔴 QUEM LÊ ESTA CHAVE HOJE: **ninguém**. `gps.sessao_pode_agendar` NÃO é
-- alterada por esta fatia — está na lista do §7 do PRD ("a v1 funciona; esta
-- v2 acrescenta, não reescreve"). Ligar a chave hoje NÃO MUDA COMPORTAMENTO
-- NENHUM: ela é o PONTO DE ENGATE para quando a trava for implementada. Está
-- escrito aqui de propósito — interruptor que não desliga nada é PIOR que
-- interruptor nenhum se alguém acreditar que desliga.
--
-- ⚠️ NÃO entra na allowlist de `gps.config_definir` nem em
-- `INTERRUPTORES_CONFIG` (§3 fatia A item 5). Mexer naquela RPC é escopo
-- próprio, e acrescentar só de um lado produz interruptor que a tela oferece
-- e a RPC recusa. Mesma decisão que a …291 tomou para
-- `sessoes_exige_confirmacao`. Consequência declarada (§5.5 do PRD): nasce
-- com o mesmo defeito dos 4 interruptores existentes do GPS — só se liga por
-- SQL. Defeito CONHECIDO do sistema, não introduzido aqui.
--
-- `on conflict do nothing`: reaplicar a migração não reseta um valor que a
-- equipe já tenha mudado. Migração idempotente não pode desfazer operação.
insert into gps.config (chave, valor) values
  ('sessoes_exige_disc', 'false')
on conflict (chave) do nothing;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4) gps.sessao_briefing_ler — O DISC SAI DO SNAPSHOT CONGELADO (§2.2)
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 POR QUE CONGELAR O DISC ESTAVA ERRADO — e por que só agora aparece.
--
-- O `briefing_snapshot` congela 5 fontes no ato do agendamento (…292:1018), e
-- para 4 delas isso é CORRETO: onboarding, entrevista, decisores e minutas
-- respondem *"o que se sabia quando marcamos"*. São EVENTOS DATADOS, e o
-- valor deles está justamente em não mudar depois — reescrevê-los apagaria o
-- que o snapshot existe para preservar.
--
-- O DISC é de OUTRA NATUREZA. Ele responde **"quem é essa pessoa"** — é
-- ATRIBUTO ESTÁVEL DO CLIENTE, não evento. Um atributo estável não tem versão
-- "de quando marcamos": tem a versão CERTA e a DESATUALIZADA. Congelar um
-- atributo estável é guardar deliberadamente a resposta mais velha a uma
-- pergunta que tem resposta única. Nunca foi correto; só não doía porque
-- ninguém tinha preenchido nada.
--
-- 🔴 E o defeito é PIOR que o enunciado. Medido em 23/09: **27 dos 34
-- favoritos não têm nem a letra**. Quem agendar com esses 27 hoje congela
-- `perfil_disc: null` — e a tela da doutora mostraria vazio **para sempre**,
-- mesmo depois de alguém preencher. Sem erro, sem aviso: a tela sabendo MENOS
-- que o banco. E os 3 campos ricos desta migração serão preenchidos DEPOIS do
-- agendamento POR CONSTRUÇÃO (inclusive pela doutora, minutos antes da
-- sessão) — o snapshot nunca os teria.
--
-- ── O QUE MUDA E O QUE NÃO MUDA ──────────────────────────────────────────
-- `briefing_snapshot` CONTINUA EXISTINDO e CONTINUA CONGELADO. Nenhuma linha
-- existente é reescrita (§6.6: reescrever briefing congelado apagaria
-- justamente o que ele preserva). `gps.sessao_briefing_montar` NÃO é alterada
-- — ela segue copiando `perfil_disc` para o snapshot, e isso agora é
-- HISTÓRICO (`disc_ao_vivo.congelado_era`), não fonte de verdade.
--
-- Muda SÓ a RPC de LEITURA: ela passa a devolver, ao lado do `briefing`
-- congelado, um bloco `disc_ao_vivo` lido de `etapa1_clientes` NO MOMENTO DA
-- CHAMADA. A tela mostra o bloco ao vivo; se divergir do congelado, diz
-- "atualizado depois do agendamento" (regra de tela: fatia F).
--
-- ⚠️ `divergiu` é calculado AQUI, no banco, e NÃO na tela. Duas razões: a
-- comparação precisa do valor congelado, que está numa coluna que a tela NÃO
-- PODE LER (`briefing_snapshot` está fora do grant); e deixar a tela comparar
-- produziria a mesma regra em dois lugares, que é como ela fica
-- meia-aplicada.
--
-- ⚠️ SALDO DE QUERIES: +1 SELECT POR PK DENTRO de uma RPC que o caller já
-- chamava uma vez. Não é query nova na TELA — §5.4 conta o saldo por tela, e
-- por tela é ZERO. M3/M3-bis do roteiro medem o custo real.
--
-- 🔴 VOLATILE (o padrão), NÃO `stable`: esta função ESCREVE a trilha de
-- acesso. `stable` faz o Postgres recusar o INSERT em execução ("INSERT is
-- not allowed in a non-volatile function"). Herdado da …292 e mantido de
-- propósito — trocar para `stable` aqui mataria a trilha de LGPD.
--
-- 🔴 REVERSÃO desta seção: reaplicar o corpo da …292 (seção 8) com
-- `create or replace`. NÃO dropar — é a única porta do briefing, e dropá-la
-- derruba a tela da doutora.
--
-- ⚠️ MESMA ASSINATURA da …292, de propósito: `create or replace` com
-- assinatura DIFERENTE cria SOBRECARGA em vez de substituir, e o caller
-- antigo continuaria chamando a versão velha. Foi o que a …282 evitou
-- dropando `admin_registrar_export_clientes` de 4 args, e a …273 dropando
-- `cliente_minuta_anexar` de 5 args, antes de recriar.
create or replace function gps.sessao_briefing_ler(p_agendamento_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin     boolean := coalesce(public.gp_is_admin(), false);
  v_a         record;
  -- 🔴 ESCALARES, NÃO um `record` — mesma construção que a …292 já escolheu
  -- para o bloco do onboarding, e pela mesma razão. Com `record`, o
  -- comportamento quando o select não casa linha depende da FORMA do select:
  -- a …213 documenta que um caminho deixa os campos NULL e outro deixa o
  -- record "not assigned", e ler um campo dele levanta **55000 record is not
  -- assigned yet**. Escalar tem um modo só: vira NULL. Numa função que a
  -- doutora abre 10 min antes da sessão, escolher a construção sem modo
  -- ambíguo é barato.
  v_disc_letra        text;
  v_disc_consciencia  text;
  v_disc_gatilhos     text;
  v_disc_relac        text;
  v_disc_em           timestamptz;
  v_disc_por          uuid;
  v_congelado text;
begin
  if p_agendamento_id is null then
    raise exception 'sessao nao informada' using errcode = '22023';
  end if;

  select a.id, a.aluno_id, a.responsavel_id, a.cliente_id, a.estado,
         a.inicio_em, a.briefing_snapshot
    into v_a
    from gps.sessao_agendamentos a
   where a.id = p_agendamento_id;

  if v_a.id is null then
    raise exception 'Sessão não encontrada.' using errcode = 'P0002';
  end if;

  -- §9-ter B2 da v1. O aluno NÃO entra aqui, de propósito.
  -- 🔴 `coalesce(..., false)` OBRIGATÓRIO e INALTERADO da …292. Sem ele,
  -- `auth.uid()` NULL (sem JWT) faz `v_a.responsavel_id = auth.uid()` virar
  -- NULL, `false or NULL` é NULL, e `if not NULL then raise` **NÃO DISPARA**
  -- — a guarda falharia ABERTA e entregaria dado pessoal de cliente de
  -- terceiro a quem não tem sessão. Mesma classe do achado ALTO explorado e
  -- CONFIRMADO em 22/09 em `sessao_pode_agendar`, neste mesmo pacote.
  -- NULO EM GUARDA LIBERA, NÃO BLOQUEIA.
  if not coalesce(v_admin or v_a.responsavel_id = auth.uid(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  -- 🔴 TRILHA, sempre — inclusive quando o snapshot está vazio. `aluno_id` é
  -- o do ambiente DONO do cliente, não o de quem abriu.
  -- ⚠️ Fica ANTES do bloco novo, e é o mesmo INSERT da …292: a trilha não
  -- pode depender de o DISC existir nem da ordem do código que veio depois.
  insert into gps.acessos_log (acao, aluno_id, feito_por, detalhe)
  values ('sessao_briefing_acessado', v_a.aluno_id, auth.uid(),
          'agendamento_id=' || p_agendamento_id::text);

  -- ── O BLOCO NOVO: DISC AO VIVO (§2.2) ─────────────────────────────────
  -- Leitura por PK, dentro de uma RPC que o caller já chamava uma vez.
  --
  -- ⚠️ O select pode não casar linha (cliente apagado depois do agendamento;
  -- a FK é `on delete restrict`, então é improvável, mas não impossível por
  -- caminho administrativo). Com escalares, os campos ficam NULL e o jsonb
  -- sai com nulos — exatamente o que a tela já tem de saber tratar ("Perfil
  -- DISC ainda não informado", que é o estado de 27 dos 34 favoritos hoje).
  -- NENHUM `raise` aqui: o briefing não pode deixar de abrir porque um bloco
  -- acessório não casou linha. A doutora abre 10 min antes da sessão.
  select c.perfil_disc, c.disc_consciencia, c.disc_gatilhos,
         c.disc_relacionamento, c.disc_atualizado_em, c.disc_atualizado_por
    into v_disc_letra, v_disc_consciencia, v_disc_gatilhos,
         v_disc_relac, v_disc_em, v_disc_por
    from gps.etapa1_clientes c
   where c.id = v_a.cliente_id;

  -- O congelado, só para a comparação. `#>>` devolve text ou NULL; snapshot
  -- ausente (linha sem snapshot) vira NULL sem erro — diferente de `->>`
  -- encadeado, que exigiria o objeto intermediário existir.
  v_congelado := v_a.briefing_snapshot #>> '{cliente,perfil_disc}';

  return jsonb_build_object(
    'agendamento_id', v_a.id,
    'estado', v_a.estado,
    'inicio_em', v_a.inicio_em,
    'cliente_id', v_a.cliente_id,
    -- O congelado continua indo INTEIRO. É histórico, e as 4 outras fontes
    -- (onboarding, entrevista, decisores, minutas) dependem dele.
    'briefing', v_a.briefing_snapshot,
    -- 🔴 O BLOCO NOVO. A tela mostra ESTE, nunca o `perfil_disc` de dentro de
    -- `briefing`. Fatia F: "não mostrar os dois lado a lado" — dois valores
    -- para a mesma pergunta é justamente o defeito que se quer evitar.
    'disc_ao_vivo', jsonb_build_object(
      'lido_em', now(),
      'perfil_disc', v_disc_letra,
      'consciencia', v_disc_consciencia,
      'gatilhos', v_disc_gatilhos,
      'relacionamento', v_disc_relac,
      'atualizado_em', v_disc_em,
      'atualizado_por', v_disc_por,
      'congelado_era', v_congelado,
      -- 🔴 `is distinct from`, NUNCA `<>`. Com `<>`, NULL contra 'D' devolve
      -- NULL, e a tela receberia `divergiu: null` justamente no caso MAIS
      -- COMUM do dia 1 — 27 de 34 congelaram NULL e alguém preenche depois,
      -- que é exatamente o caso que este bloco existe para mostrar.
      -- `is distinct from` trata NULL como valor e devolve true/false sempre.
      'divergiu', (v_disc_letra is distinct from v_congelado)
    ));
end;
$function$;

comment on function gps.sessao_briefing_ler(uuid) is
  'A UNICA porta para o briefing_snapshot -- a coluna esta FORA do grant de coluna de authenticated (…291 secao 6), entao select direto devolve 42501 ate para a doutora e o admin. Recorte de §9-ter B2 da v1: admin ve todas, doutora ve SO onde responsavel_id = auth.uid(), o ALUNO NAO VE. 🔴 Cada chamada grava 1 linha em gps.acessos_log (sessao_briefing_acessado): LGPD, a trilha E a guarda em leitura de dado pessoal. VOLATILE de proposito -- `stable` faria o Postgres recusar o INSERT da trilha em execucao.

🔴 MUDANCA DA …294 (§2.2 do PRD, 23/09/2026): devolve `disc_ao_vivo`, lido de gps.etapa1_clientes NO MOMENTO DA CHAMADA, ao lado do `briefing` congelado. POR QUE: congelar o DISC sempre foi errado. As outras 4 fontes do snapshot (onboarding, entrevista, decisores, minutas) sao EVENTOS DATADOS e respondem "o que se sabia quando marcamos" -- congelar E o valor delas. O DISC responde "QUEM E ESSA PESSOA": e atributo ESTAVEL do cliente, nao evento. Atributo estavel nao tem versao historica util -- tem a versao certa e a desatualizada, e congela-lo e guardar de proposito a resposta mais velha a uma pergunta de resposta unica. Medido em 23/09: 27 dos 34 favoritos nao tinham nem a letra, entao o snapshot congelava NULL e a tela da doutora mostraria vazio PARA SEMPRE, mesmo depois de alguem preencher -- sem erro e sem aviso, a tela sabendo MENOS que o banco. E os 3 campos ricos da …294 sao preenchidos DEPOIS do agendamento por construcao. O defeito so nao aparecia porque ninguem tinha preenchido nada.

O snapshot CONTINUA congelado e NENHUMA linha existente e reescrita (§6.6): reescrever briefing congelado apagaria justamente o que ele preserva. gps.sessao_briefing_montar NAO foi alterada -- ela segue copiando perfil_disc, e isso agora e HISTORICO (`disc_ao_vivo.congelado_era`), nao fonte de verdade. `divergiu` usa `is distinct from`, NUNCA `<>`: com `<>`, NULL x D devolveria NULL e a tela receberia divergiu=null no caso mais comum do dia 1. REVERSAO: reaplicar o corpo da …292 secao 8 com create or replace -- NAO dropar (e a unica porta do briefing).';

-- ⚠️ OS GRANTS NÃO SÃO RECONCEDIDOS AQUI, de propósito: `create or replace`
-- PRESERVA o ACL da função existente, e a …292 já fez
-- `revoke all ... from public, anon` + `grant execute to authenticated`.
-- Escrever os dois de novo seria inofensivo, mas daria a impressão de que a
-- função está NASCENDO agora — e ela não está, está sendo substituída em
-- produção. A prova P4 confere que o ACL continua `authenticated=X` sem
-- `anon=X`, em vez de confiar na preservação.
--
-- 🔴 Se algum dia esta função for DROPADA e recriada, os dois comandos voltam
-- a ser OBRIGATÓRIOS: neste projeto toda função nova nasce com `execute` para
-- `authenticated` (ALTER DEFAULT PRIVILEGES do schema `gps`), e `revoke from
-- anon` sozinho NÃO pega quando a permissão vem de `PUBLIC` — por isso todo
-- revoke deste pacote nomeia `public` explicitamente.


-- ═══════════════════════════════════════════════════════════════════════════
-- 🧪 ROTEIRO DE PROVA — para o Marcio rodar pelo MCP DEPOIS do apply
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ EU NÃO RODEI NADA DISTO. Não há `psql` nem Docker nesta máquina e eu não
-- busco credencial de produção. Tudo abaixo é conferência estática virada em
-- roteiro para quem TEM o acesso.
--
-- 🔴 NENHUM NÚMERO DE PLANO ESTÁ PRÉ-PREENCHIDO. Plano de `explain` previsto
-- de cabeça erra o TIPO de scan (18/09: previ `Index Scan`, era `Seq Scan`
-- numa tabela de 4 linhas), e colar plano fabricado como "expectativa"
-- contamina a leitura seguinte. Onde há número esperado, ele veio de MEDIÇÃO
-- (as contagens do Marcio de 23/09), nunca de dedução.
--
-- 🔴 `explain (analyze)` em UPDATE/DELETE **EXECUTA o comando**. Os blocos P2,
-- P5, P6 e M3-bis ESCREVEM: rodar SEMPRE dentro de `begin … rollback`. Nunca
-- cru em produção.
--
-- ── P0 — OS CHECKS QUE ESTA MIGRAÇÃO **NÃO** DEVIA TOCAR ─────────────────
-- Esta é a prova mais importante do arquivo. CHECK reescrito de memória apaga
-- valor em silêncio, e essa falha não levanta erro: ela some com um valor
-- válido e só aparece quando alguém tenta gravá-lo, meses depois.
--
--   -- (a) acessos_log.acao tem de continuar com os 32 valores (31 + o
--   --     `sessao_briefing_acessado` que a …292 acrescentou). Esta migração
--   --     NÃO acrescenta valor nenhum, logo NÃO reescreve este CHECK.
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'gps.acessos_log'::regclass
--      and conname  = 'acessos_log_acao_check';
--   -- 🔴 ESPERADO: exatamente os 32 de antes. NENHUM a menos.
--
--   -- (b) sessao_agendamentos: os 4 CHECKs da …291 intactos + os 3 novos.
--   --     🔴 FILTRAR POR conname -- esta tabela tem vários.
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'gps.sessao_agendamentos'::regclass and contype = 'c'
--    order by conname;
--   -- ESPERADO 7 linhas: os 4 antigos (chk_sessao_agend_estado,
--   --   _cancelado_tem_motivo, _so_cancelado_tem_carimbo, _link) com a
--   --   definição IDÊNTICA à de antes do apply, mais
--   --   chk_sessao_agend_resumo_tamanho, _resumo_so_realizado, _link_dono.
--   -- 🔴 Se a definição de QUALQUER um dos 4 antigos mudou, reverter.
--
--   -- (c) etapa1_clientes: os CHECKs antigos intactos + os 3 novos.
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'gps.etapa1_clientes'::regclass and contype = 'c'
--    order by conname;
--   -- 🔴 Conferir em especial que chk_etapa1_clientes_entrevista_resultado e
--   --   _entrevista_observacoes_tamanho continuam como estavam.
--
--   -- (d) as 6 triggers desta tabela continuam as mesmas (coluna nova não
--   --     pode ter criado nem removido gatilho):
--   select tgname, tgenabled from pg_trigger
--    where tgrelid = 'gps.etapa1_clientes'::regclass and not tgisinternal
--    order by tgname;
--
-- ── P1 — ESTA FATIA NÃO TOCA DADO ────────────────────────────────────────
-- Rodar ANTES e DEPOIS do apply. Os números têm de ser IGUAIS.
--
--   select count(*) filter (where perfil_disc is not null) as com_disc,
--          count(*) filter (where acompanhado_equipe)      as favoritos,
--          count(*) filter (where acompanhado_equipe
--                             and perfil_disc is not null) as favoritos_com_disc,
--          count(*)                                        as clientes
--     from gps.etapa1_clientes;
--   -- ESPERADO (medido pelo Marcio em 23/09, ANTES do apply):
--   --   com_disc = 127 · favoritos = 34 · favoritos_com_disc = 7
--   -- DEPOIS: os mesmos 3 números.
--   -- 🔴 Se `com_disc` mudar, esta migração fez algo que não devia. Reverter.
--
--   -- E as colunas novas nascem TODAS vazias (zero backfill):
--   select count(*) filter (where disc_consciencia    is not null) as c1,
--          count(*) filter (where disc_gatilhos       is not null) as c2,
--          count(*) filter (where disc_relacionamento is not null) as c3,
--          count(*) filter (where disc_atualizado_em  is not null) as c4,
--          count(*) filter (where disc_atualizado_por is not null) as c5
--     from gps.etapa1_clientes;
--   -- ESPERADO: 0, 0, 0, 0, 0.
--
--   select count(*)                                          as sessoes,
--          count(*) filter (where resumo is not null)        as com_resumo,
--          count(*) filter (where resumo_em is not null)     as com_resumo_em,
--          count(*) filter (where link_definido_por is not null) as com_dono_link
--     from gps.sessao_agendamentos;
--   -- ESPERADO: sessoes = 0 (o Marcio limpou o teste em 23/09) e 0 nos outros.
--
-- ── P2 — OS CHECKS NOVOS RECUSAM DE FATO ─────────────────────────────────
-- 🔴 `begin … rollback` OBRIGATÓRIO: isto ESCREVE em etapa1_clientes, que tem
-- trigger de captura do diário no caminho.
--
--   begin;
--   -- Escolher um cliente qualquer e guardar o id. Depois:
--   -- (a) string vazia, espaço e 2 caracteres são RECUSADOS (23514) -- é o que
--   --     garante que "informado" e "não informado" sejam distinguíveis por
--   --     `is null`:
--   --   update gps.etapa1_clientes set disc_gatilhos = ''    where id = '<cliente>';
--   --   update gps.etapa1_clientes set disc_gatilhos = '   ' where id = '<cliente>';
--   --   update gps.etapa1_clientes set disc_gatilhos = 'ab'  where id = '<cliente>';
--   -- 🔴 ESPERADO nos três: 23514, constraint
--   --   chk_etapa1_clientes_disc_gatilhos_tamanho.
--
--   -- (b) 3 caracteres passam; 2000 passam; 2001 é recusado:
--   --   update gps.etapa1_clientes set disc_gatilhos = 'abc'
--   --    where id = '<cliente>';                                        -- OK
--   --   update gps.etapa1_clientes set disc_gatilhos = repeat('x', 2000)
--   --    where id = '<cliente>';                                        -- OK
--   --   update gps.etapa1_clientes set disc_gatilhos = repeat('x', 2001)
--   --    where id = '<cliente>';                                        -- 23514
--
--   -- (c) NULL continua aceito nas 5 colunas (é o estado de 34 de 34 hoje):
--   --   update gps.etapa1_clientes
--   --      set disc_consciencia = null, disc_gatilhos = null,
--   --          disc_relacionamento = null, disc_atualizado_em = null,
--   --          disc_atualizado_por = null
--   --    where id = '<cliente>';                                        -- OK
--
--   -- (d) carimbo SEM os campos ricos é ACEITO -- é o caso "salvei só a
--   --     letra", que é o mais comum do dia 1 e NÃO pode virar erro:
--   --   update gps.etapa1_clientes
--   --      set perfil_disc = 'D', disc_atualizado_em = now(),
--   --          disc_atualizado_por = auth.uid()
--   --    where id = '<cliente>';                                        -- OK
--   rollback;
--
--   -- (e) O CHECK do resumo não dá para provar com UPDATE hoje: há 0 sessões.
--   --     Provar a LÓGICA isoladamente, sem escrever (leitura pura):
--   select (char_length(btrim('ok'))                 between 10 and 4000) as curto_deve_ser_false,
--          (char_length(btrim('resumo ok'))          between 10 and 4000) as nove_deve_ser_false,
--          (char_length(btrim('resumo bom'))         between 10 and 4000) as dez_deve_ser_true,
--          (char_length(btrim(repeat('x', 4000)))    between 10 and 4000) as teto_deve_ser_true,
--          (char_length(btrim(repeat('x', 4001)))    between 10 and 4000) as acima_deve_ser_false,
--          (char_length(btrim('          '))         between 10 and 4000) as so_espaco_deve_ser_false;
--   -- ESPERADO: false, false, true, true, false, false.
--
-- ── P3 — GRANTS: o que `authenticated` pode ler, COLUNA A COLUNA ─────────
--   select column_name, privilege_type
--     from information_schema.column_privileges
--    where table_schema = 'gps' and table_name = 'sessao_agendamentos'
--      and grantee = 'authenticated'
--    order by column_name;
--   -- ESPERADO: as 18 colunas da …291 + resumo_em, resumo_por,
--   --   link_definido_por, link_em = 22 linhas, TODAS `SELECT`.
--   -- 🔴 `briefing_snapshot` NÃO PODE APARECER.
--   -- 🔴 `resumo`            NÃO PODE APARECER.
--   -- 🔴 NENHUMA linha com privilege_type UPDATE / INSERT / DELETE.
--
--   -- `anon`/`PUBLIC` continuam sem nada nas 5 tabelas (esperado: 0 linhas):
--   select table_name, grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_schema = 'gps' and table_name like 'sessao%'
--      and grantee in ('anon', 'PUBLIC');
--
--   -- ⚠️ E o contraste DELIBERADO: etapa1_clientes tem grant de TABELA, então
--   --   as 5 colunas novas do DISC entram sozinhas -- que é o DESEJADO
--   --   (§2.1: mesma porta de perfil_disc, zero fronteira nova). Confirmar
--   --   que isso não veio acompanhado de nada a mais:
--   select grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_schema = 'gps' and table_name = 'etapa1_clientes'
--      and grantee in ('authenticated', 'anon', 'PUBLIC')
--    order by grantee, privilege_type;
--   -- ESPERADO: authenticated com DELETE/INSERT/SELECT/UPDATE (como já era
--   --   desde o baseline); anon e PUBLIC com NADA.
--
-- ── P4 — A FUNÇÃO SUBSTITUÍDA MANTEVE O ACL E NÃO VIROU SOBRECARGA ───────
--   select p.proname,
--          pg_get_function_identity_arguments(p.oid) as args,
--          p.provolatile,   -- 'v' (volatile): ela ESCREVE a trilha
--          p.prosecdef,     -- true
--          p.proconfig,     -- {search_path=}
--          pg_catalog.array_to_string(p.proacl, E'\n') as acl
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'gps' and p.proname = 'sessao_briefing_ler';
--   -- 🔴 ESPERADO: **1 LINHA SÓ**. `create or replace` com a mesma assinatura
--   --   não cria sobrecarga -- mas conferir é barato, e sobrecarga ambígua já
--   --   quebrou em runtime nos sistemas deste grupo.
--   --   args = 'p_agendamento_id uuid' · provolatile = 'v' · prosecdef = true
--   --   acl com `authenticated=X` e SEM `anon=X`.
--
--   -- E as outras funções da feature, intactas:
--   select p.proname, pg_catalog.array_to_string(p.proacl, E'\n') as acl
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'gps' and p.proname like 'sessao_%'
--    order by p.proname;
--   -- ESPERADO: nenhuma com `anon=X`; `sessao_briefing_montar` SEM
--   --   `authenticated=X` (é peça interna, sem grant por design).
--
-- ── P5 — A GUARDA DA RPC CONTINUA FECHANDO SEM JWT ───────────────────────
-- 🔴 `begin … rollback`: a RPC ESCREVE em gps.acessos_log a cada chamada.
-- ⚠️ Precisa de pelo menos 1 sessão agendada. Hoje há 0 — então ou se cria
-- uma DENTRO da transação revertida, ou este bloco fica para depois do 1º
-- agendamento real. 🔴 NÃO PULAR: é exatamente a guarda que já falhou aberta
-- neste pacote, em 22/09, e foi explorada e confirmada pelo pentester.
--
--   begin;
--   set local role authenticated;  -- sem JWT: auth.uid() = NULL
--   -- select gps.sessao_briefing_ler('<agendamento_id>');
--   -- 🔴 ESPERADO: 42501 "Sem permissão."
--   -- Se devolver o jsonb, a guarda falhou ABERTA -- é o achado ALTO de 22/09
--   -- reaberto, e a migração tem de ser revertida na hora.
--   rollback;
--
--   -- E com JWT de ALUNO titular real (não admin, não responsável):
--   --   também tem de dar 42501. O aluno NÃO vê briefing (§9-ter B2 da v1).
--
-- ── P6 — O BLOCO `disc_ao_vivo` DIZ A VERDADE (o caso dos 27 de 34) ──────
-- 🔴 `begin … rollback`. Este é o teste que PROVA §2.2 e é a razão de a RPC
-- ter sido tocada.
--
--   begin;
--   -- 1. escolher um agendamento cujo cliente tinha perfil_disc NULL no ato
--   --    (o caso de 27 dos 34). Ler o congelado:
--   --   select briefing_snapshot #>> '{cliente,perfil_disc}' as congelado
--   --     from gps.sessao_agendamentos where id = '<agendamento>';
--   --   -- provavelmente NULL
--   --
--   -- 2. preencher o DISC AGORA, como a doutora faria minutos antes:
--   --   update gps.etapa1_clientes
--   --      set perfil_disc = 'D',
--   --          disc_consciencia = 'Sabe que precisa, nao sabe por onde comecar.',
--   --          disc_atualizado_em = now()
--   --    where id = '<cliente do agendamento>';
--   --
--   -- 3. ler o briefing como admin e conferir o bloco novo:
--   --   select jsonb_pretty(gps.sessao_briefing_ler('<agendamento>')
--   --                       -> 'disc_ao_vivo');
--   -- 🔴 ESPERADO: perfil_disc = 'D' · consciencia com o texto ·
--   --    congelado_era = null · divergiu = **true**.
--   --    Se `divergiu` vier NULL, o `is distinct from` virou `<>` em algum
--   --    lugar -- e a tela deixaria de avisar exatamente no caso mais comum.
--   --
--   -- 4. e o congelado NÃO foi reescrito (§6.6):
--   --   select briefing_snapshot #>> '{cliente,perfil_disc}'
--   --     from gps.sessao_agendamentos where id = '<agendamento>';
--   -- 🔴 ESPERADO: ainda NULL. Se mudou, algo reescreveu snapshot -- proibido.
--   --
--   -- 5. e a trilha foi gravada (1 linha por chamada de 3):
--   --   select count(*) from gps.acessos_log
--   --    where acao = 'sessao_briefing_acessado'
--   --      and criado_em > now() - interval '1 minute';
--   rollback;
--
-- ── M1 / M2 / M3 — OS PLANOS (§5.2). LEITURA PURA, pode rodar cru ────────
-- 🔴 Estes são `select`: `explain (analyze)` aqui NÃO escreve. M3-bis escreve
-- e tem transação própria.
-- 🔴 NENHUM ÍNDICE FOI CRIADO nesta migração. Estes planos existem para
-- DECIDIR se algum deve existir; se a resposta for sim, ele nasce em migração
-- PRÓPRIA com o plano medido colado.
--
--   -- M1 — a leitura mais quente: o card do aluno.
--   explain (analyze, buffers)
--   select id, tipo_id, responsavel_id, aluno_id, cliente_id, data, hora_inicio,
--          inicio_em, fim_em, duracao_min, estado, link_reuniao,
--          link_definido_por, link_em, resumo_em
--     from gps.sessao_agendamentos
--    where aluno_id = '<um thb_alunos.id com sessao>'
--      and estado in ('agendado', 'realizado')
--    order by inicio_em
--    limit 20;
--   -- 🔴 `resumo` NÃO está na lista, de propósito (§5.1: 4 KB por linha).
--
--   -- M2 — a lista da doutora, a tela que mais cresce.
--   explain (analyze, buffers)
--   select id, tipo_id, aluno_id, cliente_id, data, hora_inicio, inicio_em,
--          fim_em, duracao_min, estado, link_reuniao,
--          link_definido_por, link_em, resumo_em, resumo_por
--     from gps.sessao_agendamentos
--    where responsavel_id = '<uuid da Cristiane>'
--      and inicio_em >= now() - interval '30 days'
--    order by inicio_em
--    limit 50;
--   -- 🔴 `resumo` fora, mesmo motivo.
--
--   -- M3 — o DISC ao vivo, o select interno isolado:
--   explain (analyze, buffers)
--   select perfil_disc, disc_consciencia, disc_gatilhos, disc_relacionamento,
--          disc_atualizado_em, disc_atualizado_por
--     from gps.etapa1_clientes where id = '<um cliente favoritado>';
--
--   -- M3-bis — A RPC INTEIRA. 🔴 É ESTE o número que a tela paga.
--   --   Lição de 17/09: o select interno isolado deu 0,66 ms e a RPC
--   --   (`Function Scan`) deu 2,7 ms. MEDIR A RPC, NÃO O CORPO DELA.
--   --   🔴 ESCREVE trilha -> transação revertida:
--   --   begin;
--   --   explain (analyze, buffers)
--   --     select gps.sessao_briefing_ler('<agendamento>');
--   --   rollback;
--   --   ⚠️ Comparar com o número da MESMA chamada ANTES do apply, se houver
--   --   registro. A diferença é o custo do +1 SELECT por PK.
--
-- 🔴 COMO LER O RESULTADO (o critério, decidido ANTES de ver o número):
--   · `Seq Scan` com `Rows Removed by Filter` BAIXO → **NÃO criar índice**.
--     Criá-lo custaria escrita em todo agendamento sem mudar o plano. É o que
--     três precedentes deste banco já mediram.
--   · `Rows Removed by Filter` ALTO → há caso. O índice nasce em migração
--     própria, com ESTE plano colado.
--   · Qualquer plano previsto de cabeça é inválido.
--
-- ── M4 — o interruptor entrou desligado ──────────────────────────────────
--   select chave, valor from gps.config
--    where chave in ('sessoes_exige_disc', 'sessoes_exige_confirmacao',
--                    'sessoes_email_ativo')
--    order by chave;
--   -- ESPERADO: sessoes_exige_disc = 'false'.
--   -- ⚠️ E lembrar: NINGUÉM LÊ essa chave ainda (`sessao_pode_agendar` não foi
--   --   alterada). Ligá-la hoje não muda comportamento nenhum -- ela é o
--   --   ponto de engate para quando a trava for implementada.
-- ═══════════════════════════════════════════════════════════════════════════
