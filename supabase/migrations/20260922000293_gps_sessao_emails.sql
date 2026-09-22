-- Agenda de Sessões — os e-mails, PELO BANCO (PRD §7.3, fatia 6).
--
-- Replica o molde vivo do Plantão (…170 → …173 → …174 → …186 → …272), sem
-- tocar em uma linha de `gps.plantao_*`: escopo fechado pelo Marcio.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- O QUE ENTREGA (§7.3) — 5 gatilhos, 8 envios possíveis por sessão
-- ═══════════════════════════════════════════════════════════════════════════
--   agendou   → doutora   (e-mail + sistema*)   carimbo email_agendou_dra_em
--   agendou   → aluno     (confirmação + link)  carimbo email_agendou_aluno_em
--   24h antes → doutora                         carimbo email_24h_dra_em
--   24h antes → aluno                           carimbo email_24h_aluno_em
--   1h  antes → doutora                         carimbo email_1h_dra_em
--   1h  antes → aluno                           carimbo email_1h_aluno_em
--   cancelou  → doutora                         carimbo email_cancel_dra_em
--   cancelou  → aluno                           carimbo email_cancel_aluno_em
--
--   * o canal "sistema" é a tela `/admin/sessoes` (fatia 5) somada à trilha
--     `gps.sessao_eventos` (…291/…292). NÃO existe tabela de notificação
--     in-app neste sistema — conferido: nenhuma migração cria uma. Esta
--     fatia NÃO inventa uma; escopo dela é e-mail.
--
-- 🔴 OITO CARIMBOS, OITO `request_id`. Nenhum é reusado. A lição é da …174:
-- `email_abertura_em` teve de ser separado de `email_sala_em` porque reusar
-- o carimbo faz um envio CANCELAR o outro — o segundo encontra o campo já
-- preenchido e nunca sai, em silêncio.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔑 AS TRÊS ARMADILHAS JÁ PAGAS — e o que esta migration faz com cada uma
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. RESEND LIMITA 10 req/s. Em 09/09/2026 um lote sem pausa devolveu 429 em
--    11 de 20. Aqui: `pg_sleep(0.15)` entre envios (≈6,7 req/s) e TETO de 8
--    por passada. O teto também protege o `statement_timeout` de 8s — 8
--    envios × 0,15s = 1,2s de sono + o tempo dos posts.
--
-- 2. `net.http_post` É ASSÍNCRONO: devolve o id do pedido, não o resultado.
--    Carimbar "enviado" logo após o post marca como avisado quem levou 429.
--    Aqui: o carimbo guarda o `request_id`, e `gps.sessao_reconciliar_envios()`
--    roda no INÍCIO de cada passada, procura carimbo cujo request não teve
--    2xx e LIMPA o par (carimbo + req), devolvendo a pessoa para a fila.
--    ⚠️ `http_collect_response(async := false)` resolveria na hora, mas
--    BLOQUEIA até a resposta chegar e estoura o `statement_timeout` de 8s —
--    testado na …174, a transação morreu. Não use.
--
-- 3. A ARITMÉTICA `teto × intervalo × janela`. Na …174 ela quase falhou de
--    novo: teto 8 × cron 10min × janela 15min = 16 alcançáveis com 19
--    inscritos — 3 ficariam de fora SEM ERRO NENHUM.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔑 A CONTA DESTA FEATURE — escrita aqui porque é o que reprova em silêncio
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Volume real (PRD §5.3/§5.4 e capacidade informada): 4 sessões/semana por
-- doutora × 2 doutoras = **8 sessões/semana**, ~1,6 por dia útil.
--
-- Cada gatilho e sua janela:
--
--   • CONFIRMAÇÃO (agendou): janela = `criado_em >= now() - 24h`.
--     Larguíssima de propósito — não há hora marcada a perder, e 24h cobre
--     qualquer parada do cron de até um dia. 2 e-mails por sessão nova.
--
--   • 24h ANTES: janela `inicio_em between now() + 23h e now() + 24h`
--     = 60 minutos de largura.
--
--   • 1h ANTES:  janela `inicio_em between now() e now() + 1h`
--     = 60 minutos de largura.
--     🔴 A janela do lembrete de 1h NÃO pode terminar em `now()`: se o cron
--     falhar na última passada, mandar "começa em 1 hora" depois do começo
--     seria mentira. Por isso `inicio_em > now()` fecha a janela — quem
--     passou do horário não recebe nada, que é o comportamento honesto.
--
--   • CANCELOU: janela = `cancelado_em >= now() - 24h`. Mesma lógica da
--     confirmação.
--
-- ALCANCE POR JANELA, com teto 8 e cron de 5 em 5 minutos:
--
--     janela 60 min ÷ cron 5 min = 12 passadas
--     12 passadas × 8 envios     = 96 envios alcançáveis por janela
--
--   Pior caso realista: as 8 sessões da semana empilhadas no MESMO bloco de
--   60 minutos (que a constraint de exclusão da …291 nem permite para a
--   mesma doutora, mas suponhamos 2 doutoras × 4 blocos consecutivos) =
--   8 sessões × 2 destinatários = **16 envios**. Contra 96 alcançáveis:
--   folga de 6×. Na 1ª passada saem 8, na 2ª (5 min depois) os outros 8 —
--   ambos ainda dentro da janela de 60 min, com 50 minutos sobrando.
--
--   Para a conta APERTAR seria preciso 96 envios numa janela de 60 min = 48
--   sessões simultâneas, **6× a capacidade semanal inteira num só bloco**.
--   Se um dia isso acontecer, o remédio é subir `c_teto` (a Resend aguenta
--   10/s; 0,15s de pausa dá margem), NUNCA encurtar a janela.
--
--   ⚠️ A janela de 24h dos dois gatilhos de confirmação/cancelamento dá
--   288 passadas × 8 = 2.304 envios alcançáveis. Não é o gargalo.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 LGPD — INEGOCIÁVEL (PRD §4.3 e §7.3)
-- ═══════════════════════════════════════════════════════════════════════════
-- O e-mail leva **data, hora, nome do aluno, nome do cliente, nome da
-- doutora e o LINK**. NUNCA `briefing_snapshot`, `descricao_caso`,
-- `observacoes` nem `cliente_decisores` — esses são marcados no código como
-- proibidos em lista consolidada, CSV, Slack e e-mail. O briefing fica no
-- sistema; o e-mail leva a porta para ele (`/admin/sessoes`).
--
-- ⚠️ O NOME DO CLIENTE (`gps.etapa1_clientes.nome`) vai no e-mail da
-- DOUTORA e no do ALUNO — e só. Justificativa: a doutora precisa saber de
-- quem é a reunião para se preparar, e o aluno é quem cadastrou o cliente
-- (é dado dele). Nenhum dos dois recebe dado de cliente de TERCEIRO. Isso é
-- o mesmo recorte de `gps.sessao_responsaveis` (…292): identificador e nome,
-- mais nada.
--
-- ⚠️ A função de disparo é `SECURITY DEFINER` e lê `gps.sessao_agendamentos`
-- INTEIRA, inclusive `briefing_snapshot` — que fica fora do grant de coluna
-- de `authenticated` (…291). Por isso ela NÃO tem `grant execute` para
-- ninguém: quem a chama é o `pg_cron`, de dentro do banco. Não é endpoint.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔑 A CHAVE — `gps.resend_api_key()` e NADA MAIS
-- ═══════════════════════════════════════════════════════════════════════════
-- Porta única criada pela …272: lê `vault.decrypted_secrets` (nome
-- `gps_resend_api_key`) com fallback de transição para `gps.config`.
-- NUNCA escrever a chave no corpo (`pg_get_functiondef` é legível) e NUNCA
-- ler `gps.config.resend_api_key` direto — a linha antiga ainda tem valor e
-- entra na rotação já pendente (PRD §9b.4).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔑 MARCA — Programa (Time Holding Brasil), NÃO Acelera
-- ═══════════════════════════════════════════════════════════════════════════
-- O Plantão é produto do Acelera (…173: cabeçalho ESCURO #180B00 porque a
-- logo Acelera é branco→prata e some sobre claro). Esta feature é o
-- **Programa de Implementação Assistida**, então usa o equivalente do THB,
-- copiado de `src/lib/email.ts:layout({marca:"thb"})`:
--   • cabeçalho LARANJA #C74600 — medido 4,88:1 com branco (WCAG AA). O
--     #EA580C antigo dava 3,56:1 e foi REPROVADO como texto de botão no
--     war-room de 10/09. Não voltar para ele.
--   • título "Programa de Implementação Assistida" + "Time Holding Brasil"
--   • rodapé "…porque faz parte do Programa de Implementação Assistida"
-- ⚠️ O ENDEREÇO do remetente continua `@programa.timeholdingbrasil.com.br`
-- — é o único domínio verificado na Resend. Trocar o domínio sem verificar
-- lá derrubaria TODO o envio, não só a estética (lição da …173).
-- Só o NOME de exibição muda, e ele vem de `gps.config.email_sessoes_from`
-- (DADO), com default no corpo se a chave não existir.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔑 QUEM RECEBE — as 3 decisões de destinatário
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. DOUTORA: `public.perfis.email` por `p.id = responsavel_id` (uuid), com
--    fallback para `auth.users.email`. NUNCA por primeiro nome — há dezenas
--    de alunas Elaine/Cristiane em `auth.users` (PRD §9b.3). `perfis.email`
--    primeiro porque é o e-mail de TRABALHO cadastrado pela equipe; o de
--    `auth.users` é o de login, que pode divergir (a lição dos TRÊS e-mails,
--    …241). Se os dois faltarem, a sessão é PULADA e nada é carimbado — ela
--    volta na passada seguinte, sem virar "avisada" em silêncio.
--    O NOME sai de `public.perfis.nome`, mesmo vínculo por uuid.
--
-- 2. ALUNO: `auth.users.email` de `criado_por` (quem agendou), com fallback
--    para `public.thb_alunos.email` do ambiente (`aluno_id`).
--    🔴 Nessa ordem, e não o contrário: um SÓCIO que agenda receberia a
--    confirmação no e-mail do TITULAR, que não agendou nada — e ficaria sem
--    o link da própria sessão. `criado_por` é quem clicou. O fallback cobre
--    o agendamento feito pela equipe em nome do ambiente e o caso de
--    `criado_por` ter sido apagado (`on delete set null`, …291).
--
-- 3. NOME DO ALUNO no corpo: `public.thb_alunos.nome` do ambiente. É o nome
--    que o PRD §7.3 manda levar.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ÍNDICE: NENHUM CRIADO — e a decisão é medida, não suposta
-- ═══════════════════════════════════════════════════════════════════════════
-- O PRD §10 já fecha: "explain analyze já medido (§9b.1) — NÃO criar
-- índice". A fila desta feature é de 8 sessões/semana; as quatro consultas
-- de fila varrem `gps.sessao_agendamentos` com filtro de janela e carimbo
-- nulo. Em 2.080 linhas (10 anos projetados, medição da …292) o planner
-- escolhe `Seq Scan` — e já houve neste banco caso MEDIDO de índice deixar
-- mais lento (`etapa1_clientes(fase)`: Seq Scan 0,686 ms × Index Scan
-- 0,809 ms em 1.222 linhas). Um índice aqui custaria escrita em TODO
-- agendamento para servir 288 consultas/dia de milissegundos.
-- 🔴 O roteiro do fim deste arquivo tem o `explain (analyze, buffers)` da
-- consulta de fila para o Marcio colar o plano REAL. O plano não está
-- escrito aqui de cabeça: prever plano de cabeça já errou o TIPO de scan
-- neste projeto (previ Index Scan, era Seq Scan numa tabela de 4 linhas).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- REVERSÃO (como desligo — pergunta 5 do protocolo)
-- ═══════════════════════════════════════════════════════════════════════════
--   -- 1. desligar SEM perder o histórico dos carimbos:
--   update gps.config set valor = 'false' where chave = 'sessoes_email_ativo';
--   -- (o interruptor é lido a cada passada; a função retorna na hora)
--
--   -- 2. desligar o cron por completo:
--   select cron.unschedule('sessao-emails');
--
--   -- 3. desfazer tudo:
--   select cron.unschedule('sessao-emails');
--   drop function if exists gps.sessao_disparar_emails();
--   drop function if exists gps.sessao_reconciliar_envios();
--   drop function if exists gps.sessao_verificar_saude_envio();
--   alter table gps.sessao_agendamentos
--     drop column if exists email_agendou_dra_em,   drop column if exists email_agendou_dra_req,
--     drop column if exists email_agendou_aluno_em, drop column if exists email_agendou_aluno_req,
--     drop column if exists email_24h_dra_em,       drop column if exists email_24h_dra_req,
--     drop column if exists email_24h_aluno_em,     drop column if exists email_24h_aluno_req,
--     drop column if exists email_1h_dra_em,        drop column if exists email_1h_dra_req,
--     drop column if exists email_1h_aluno_em,      drop column if exists email_1h_aluno_req,
--     drop column if exists email_cancel_dra_em,    drop column if exists email_cancel_dra_req,
--     drop column if exists email_cancel_aluno_em,  drop column if exists email_cancel_aluno_req;
--   delete from gps.config where chave in
--     ('sessoes_email_ativo','email_sessoes_from','sessoes_alarme_enviado_em');

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) OS CARIMBOS — 8 pares (carimbo + request_id)
-- ═══════════════════════════════════════════════════════════════════════════
begin;

alter table gps.sessao_agendamentos
  add column if not exists email_agendou_dra_em    timestamptz,
  add column if not exists email_agendou_dra_req   bigint,
  add column if not exists email_agendou_aluno_em  timestamptz,
  add column if not exists email_agendou_aluno_req bigint,
  add column if not exists email_24h_dra_em        timestamptz,
  add column if not exists email_24h_dra_req       bigint,
  add column if not exists email_24h_aluno_em      timestamptz,
  add column if not exists email_24h_aluno_req     bigint,
  add column if not exists email_1h_dra_em         timestamptz,
  add column if not exists email_1h_dra_req        bigint,
  add column if not exists email_1h_aluno_em       timestamptz,
  add column if not exists email_1h_aluno_req      bigint,
  add column if not exists email_cancel_dra_em     timestamptz,
  add column if not exists email_cancel_dra_req    bigint,
  add column if not exists email_cancel_aluno_em   timestamptz,
  add column if not exists email_cancel_aluno_req  bigint;

comment on column gps.sessao_agendamentos.email_agendou_dra_em is
  'Carimbo do e-mail de CONFIRMACAO para a doutora (PRD §7.3). 🔴 Carimbo PROPRIO, nunca compartilhado com os outros 7 envios: reusar um carimbo faz um envio cancelar o outro em silencio (licao da …174, onde email_abertura_em teve de ser separado de email_sala_em). Nulo = na fila. Limpo por gps.sessao_reconciliar_envios quando o request nao teve 2xx.';
comment on column gps.sessao_agendamentos.email_agendou_dra_req is
  'request_id do pg_net do e-mail de confirmacao da doutora. net.http_post e ASSINCRONO: sem guardar o id nao ha como saber se a Resend devolveu 429 (11 de 20 em 09/09/2026). Conferido em net._http_response pela reconciliacao.';
comment on column gps.sessao_agendamentos.email_agendou_aluno_em is
  'Carimbo do e-mail de confirmacao para o ALUNO (quem agendou -- criado_por, com fallback no e-mail do ambiente). Carimbo proprio; ver email_agendou_dra_em.';
comment on column gps.sessao_agendamentos.email_agendou_aluno_req is
  'request_id do pg_net da confirmacao do aluno.';
comment on column gps.sessao_agendamentos.email_24h_dra_em is
  'Carimbo do lembrete de 24h da doutora. Janela: inicio_em entre now()+23h e now()+24h -- comparada sempre contra inicio_em (coluna GERADA), nunca contra `data` isolada: o servidor roda em UTC e `data` mentiria das 21h a meia-noite.';
comment on column gps.sessao_agendamentos.email_24h_dra_req is
  'request_id do pg_net do lembrete de 24h da doutora.';
comment on column gps.sessao_agendamentos.email_24h_aluno_em is
  'Carimbo do lembrete de 24h do aluno. Ver email_24h_dra_em.';
comment on column gps.sessao_agendamentos.email_24h_aluno_req is
  'request_id do pg_net do lembrete de 24h do aluno.';
comment on column gps.sessao_agendamentos.email_1h_dra_em is
  'Carimbo do lembrete de 1h da doutora. Janela: inicio_em > now() e <= now()+1h. 🔴 A janela FECHA em now(): mandar "comeca em 1 hora" depois do horario seria mentira, entao quem passou do inicio nao recebe nada.';
comment on column gps.sessao_agendamentos.email_1h_dra_req is
  'request_id do pg_net do lembrete de 1h da doutora.';
comment on column gps.sessao_agendamentos.email_1h_aluno_em is
  'Carimbo do lembrete de 1h do aluno. Ver email_1h_dra_em.';
comment on column gps.sessao_agendamentos.email_1h_aluno_req is
  'request_id do pg_net do lembrete de 1h do aluno.';
comment on column gps.sessao_agendamentos.email_cancel_dra_em is
  'Carimbo do aviso de CANCELAMENTO para a doutora. Janela: cancelado_em >= now()-24h e estado = cancelado.';
comment on column gps.sessao_agendamentos.email_cancel_dra_req is
  'request_id do pg_net do aviso de cancelamento da doutora.';
comment on column gps.sessao_agendamentos.email_cancel_aluno_em is
  'Carimbo do aviso de cancelamento para o aluno. Ver email_cancel_dra_em.';
comment on column gps.sessao_agendamentos.email_cancel_aluno_req is
  'request_id do pg_net do aviso de cancelamento do aluno.';

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) GRANT DAS COLUNAS NOVAS — 🔴 a armadilha que já custou achado de pentest
-- ═══════════════════════════════════════════════════════════════════════════
-- `grant select (col_a, col_b)` da …291 é grant POR COLUNA. Coluna nova
-- NASCE FORA dele — o que é o comportamento desejado aqui e está sendo
-- declarado de propósito, não por esquecimento:
--
--   • `authenticated` NÃO precisa ver carimbo de e-mail. A tela do aluno
--     mostra a sessão, não a telemetria de envio; a tela da doutora idem.
--   • Se um dia precisar, o certo é `grant select (email_1h_aluno_em)` —
--     coluna a coluna, nunca `grant select on gps.sessao_agendamentos`, que
--     abriria `briefing_snapshot` junto (LGPD, …291).
--
-- ⚠️ Duas lições que se aplicam e foram conferidas:
--   (a) `grant select` NÃO revoga escrita — tabela/coluna no schema `gps`
--       nasce gravável por herança do default do schema (achado do pentest
--       em `gps.entrevista_tentativas`, …266). Por isso o revoke abaixo
--       nomeia `authenticated` também, não só `public`/`anon`.
--   (b) `revoke from anon` não pega quando a permissão vem de `PUBLIC` —
--       toda role herda de PUBLIC e o revoke "funciona" sem efeito. Por isso
--       `public` é nomeado explicitamente.
--
-- Este revoke é IDEMPOTENTE e repete o da …291 de propósito: se alguém
-- rodar um `grant all` de emergência entre as duas migrations, a reaplicação
-- desta fecha a porta de novo.
begin;

revoke insert, update, delete, truncate, references, trigger
  on gps.sessao_agendamentos from public, anon, authenticated;

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) CONFIG — interruptor + remetente (DADO, nunca código)
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 `sessoes_email_ativo` nasce **'false'**. Deliberado:
--   • a fatia 6 entra antes do pentest (§10: 6 → 7 → 8). Cron ligado com
--     código não auditado dispara e-mail real para aluno e doutora;
--   • a reversão pedida pelo protocolo (pergunta 5) precisa de um
--     interruptor que já EXISTA no pânico — "só se liga por SQL" já é
--     problema conhecido deste sistema (4 interruptores do GPS sem tela);
--   • ligar é `update gps.config set valor='true' where chave='sessoes_email_ativo';`
--     — uma linha, sem deploy e sem migration.
--
-- ⚠️ ESTE INTERRUPTOR NÃO ESTÁ NA ALLOWLIST de `gps.config_definir` (…260) e
-- NÃO deve estar sem decisão: aquela allowlist é espelhada em
-- `src/lib/config-tipos.ts` e acrescentar chave só de um lado deixa a tela
-- oferecendo um botão que a RPC recusa. Registrado como item para a tela de
-- interruptores, não feito aqui (fatia 6 é migration, não TypeScript).
--
-- 🔴 ACHADO, registrado e NÃO corrigido aqui: `gps.config` tem
-- `grant select, insert, update to authenticated` com policy `gp_is_admin()`
-- (…110). Ou seja, os ~16 admins podem ligar/desligar `sessoes_email_ativo`
-- pelo PostgREST direto, SEM passar por `gps.config_definir` e portanto SEM
-- deixar rastro em `gps.acessos_log`. Isso vale para TODAS as chaves de
-- `gps.config`, não é dívida desta fatia — mas esta fatia acrescenta uma
-- chave que dispara e-mail para aluno, então fica anotado para o pentest.
-- Corrigir seria tirar o `update` direto de `authenticated` e deixar só a
-- RPC: mudança de superfície de TODA a tabela, fora do escopo da fatia 6.
begin;

insert into gps.config (chave, valor) values
  ('sessoes_email_ativo', 'false'),
  ('email_sessoes_from',  'Time Holding Brasil <acesso@programa.timeholdingbrasil.com.br>')
on conflict (chave) do nothing;

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) gps.sessao_reconciliar_envios — a rede de segurança do 429
-- ═══════════════════════════════════════════════════════════════════════════
-- Molde: `gps.plantao_reconciliar_envios` (…174/…186). Diferença: lá são 3
-- pares escritos à mão em 3 blocos; aqui são 8, e escrever 8 blocos copiados
-- é onde se perde um par sem perceber (foi exatamente o que aconteceu com
-- `email_nps_req`, esquecido da reconciliação até a …186). Por isso o corpo
-- é um LAÇO sobre a lista de pares, com os identificadores passados por
-- `quote_ident`.
--
-- ⚠️ Por que `quote_ident` e concatenação em vez de `format('%1$I', ...)`:
-- a sintaxe posicional do `format` (`%1$I`, `%2$I`) coloca um `$` no meio de
-- um literal dollar-quoted, e o parser do PL/pgSQL procura abertura de tag
-- ali. Com `%I` não-posicional seria preciso repetir o argumento; com
-- `quote_ident` some a ambiguidade e o SQL montado fica legível no erro.
-- Os nomes vêm do array escrito AQUI, no corpo, nunca de parâmetro — não há
-- superfície de injeção; o `quote_ident` fica porque a regra não tem exceção.
begin;

create or replace function gps.sessao_reconciliar_envios()
returns table(agendamento_id uuid, qual text, status integer)
language plpgsql
security definer
set search_path to ''
as $recon$
declare
  v_par  text;
  v_em   text;
  v_req  text;
  v_sql  text;
begin
  foreach v_par in array array[
    'email_agendou_dra',   'email_agendou_aluno',
    'email_24h_dra',       'email_24h_aluno',
    'email_1h_dra',        'email_1h_aluno',
    'email_cancel_dra',    'email_cancel_aluno'
  ]
  loop
    v_em  := quote_ident(v_par || '_em');
    v_req := quote_ident(v_par || '_req');

    -- 🔑 O CTE `limpo` é de ESCRITA e não é referenciado pelo select final --
    -- de propósito. CTE de escrita no Postgres executa sempre, referenciada
    -- ou não; referenciá-la no select devolveria as linhas DEPOIS do update
    -- (ou seja, já limpas) e a função reportaria carimbo nulo. `falhos` é
    -- lido antes, num único snapshot, e é ele quem sai no retorno.
    v_sql :=
      'with falhos as ('
      '  select a.id, rsp.status_code as st'
      '    from gps.sessao_agendamentos a'
      '    join net._http_response rsp on rsp.id = a.' || v_req ||
      '   where a.' || v_em  || ' is not null'
      '     and a.' || v_req || ' is not null'
      '     and coalesce(rsp.status_code, 0) not between 200 and 299'
      '), limpo as ('
      '  update gps.sessao_agendamentos a'
      '     set ' || v_em || ' = null, ' || v_req || ' = null'
      '    from falhos f'
      '   where f.id = a.id'
      '  returning a.id'
      ') select f.id, ' || quote_literal(v_par) || '::text, f.st from falhos f';

    return query execute v_sql;
  end loop;
end;
$recon$;

-- Não é endpoint: quem chama é gps.sessao_disparar_emails, de dentro do banco.
revoke all on function gps.sessao_reconciliar_envios() from public, anon, authenticated;

comment on function gps.sessao_reconciliar_envios() is
  'Devolve para a fila todo envio de sessao carimbado cujo request do pg_net NAO teve 2xx -- os 8 pares (carimbo, request_id). Chamada no INICIO de cada passada de gps.sessao_disparar_emails. 🔴 Existe porque net.http_post e ASSINCRONO: carimbar logo apos o post marca como avisado quem levou 429 (11 de 20 em 09/09/2026). ⚠️ NAO usar http_collect_response(async := false): bloqueia e estoura o statement_timeout de 8s (testado na …174). Laco sobre a lista de pares em vez de 8 blocos copiados -- na …174 um par (nps) ficou de fora da copia e so foi descoberto na …186.';

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) gps.sessao_verificar_saude_envio — o alarme de falha sistêmica
-- ═══════════════════════════════════════════════════════════════════════════
-- Molde: `gps.plantao_verificar_saude_envio` (…186). Se a Resend recusar
-- TUDO (chave revogada, domínio suspenso, saldo zerado), a função de disparo
-- continua devolvendo `succeeded` para o `pg_cron` — `net.http_post` sempre
-- aceita o pedido. "O cron disse que rodou" NÃO prova que o e-mail saiu.
--
-- LIMIAR = 3 na última hora, o mesmo da …186: 1 ou 2 falhas isoladas a
-- própria reconciliação resolve na passada seguinte; 3+ em 1h é recusa
-- sistêmica.
-- ⚠️ Com 8 sessões/semana este limiar é alto em termos relativos — 3 falhas
-- podem ser TODOS os envios de um dia. Deliberado mesmo assim: baixar para 1
-- transformaria qualquer 429 pontual (que a reconciliação já cura em 5 min)
-- em e-mail de alarme, e alarme que toca à toa é alarme que se ignora.
--
-- TRAVA CONTRA LAÇO: carimbo em `gps.config.sessoes_alarme_enviado_em` limita
-- a 1 alerta/hora. Sem ele, falha persistente mandaria 12 alertas por hora.
-- `exception when others` no fim: o alarme NUNCA pode derrubar o disparo.
begin;

insert into gps.config (chave, valor) values ('sessoes_alarme_enviado_em', '')
on conflict (chave) do nothing;

create or replace function gps.sessao_verificar_saude_envio()
returns void
language plpgsql
security definer
set search_path to ''
as $saude$
declare
  v_falhas  int;
  v_ultimo  text;
  v_chave   text;
  v_from    text;
  v_dest    text;
  v_html    text;
  c_limiar  constant int := 3;
begin
  -- Quantos envios de sessao, carimbados na ultima hora, tiveram resposta
  -- sem 2xx. Os 8 request_id num `in` -- a tabela tem 8 sessoes/semana, e
  -- `net._http_response` e varrida pelo id (primary key).
  select count(*) into v_falhas
    from gps.sessao_agendamentos a
    join net._http_response rsp
      on rsp.id in (a.email_agendou_dra_req, a.email_agendou_aluno_req,
                    a.email_24h_dra_req,     a.email_24h_aluno_req,
                    a.email_1h_dra_req,      a.email_1h_aluno_req,
                    a.email_cancel_dra_req,  a.email_cancel_aluno_req)
   where greatest(
           coalesce(a.email_agendou_dra_em,   '-infinity'::timestamptz),
           coalesce(a.email_agendou_aluno_em, '-infinity'::timestamptz),
           coalesce(a.email_24h_dra_em,       '-infinity'::timestamptz),
           coalesce(a.email_24h_aluno_em,     '-infinity'::timestamptz),
           coalesce(a.email_1h_dra_em,        '-infinity'::timestamptz),
           coalesce(a.email_1h_aluno_em,      '-infinity'::timestamptz),
           coalesce(a.email_cancel_dra_em,    '-infinity'::timestamptz),
           coalesce(a.email_cancel_aluno_em,  '-infinity'::timestamptz)
         ) >= now() - interval '1 hour'
     and coalesce(rsp.status_code, 0) not between 200 and 299;

  if v_falhas < c_limiar then
    return;
  end if;

  -- Trava de laco: no maximo 1 alerta por hora.
  select valor into v_ultimo from gps.config where chave = 'sessoes_alarme_enviado_em';
  if v_ultimo is not null and btrim(v_ultimo) <> ''
     and v_ultimo::timestamptz >= now() - interval '1 hour' then
    return;
  end if;

  -- 🔴 A chave SEMPRE pela porta unica (…272). Nunca gps.config direto.
  v_chave := gps.resend_api_key();
  select valor into v_from from gps.config where chave = 'email_sessoes_from';
  select valor into v_dest from gps.config where chave = 'chamados_email_fallback';

  if v_chave is null or btrim(v_chave) = ''
     or v_dest is null or btrim(v_dest) = '' then
    return;  -- sem chave ou sem destinatario nao ha como alertar por e-mail
  end if;
  v_from := coalesce(nullif(btrim(v_from), ''),
                     'Time Holding Brasil <acesso@programa.timeholdingbrasil.com.br>');

  v_html :=
    '<div style="font-family:Arial,Helvetica,sans-serif;padding:20px;color:#1c1917;">'
    '<h1 style="font-size:18px;color:#b91c1c;">Agenda de Sessões: falha de envio</h1>'
    '<p style="font-size:14px;line-height:1.6;">' || v_falhas || ' e-mail(s) da Agenda de '
    'Sessões falharam (status fora de 2xx) na última hora. Pode indicar chave da Resend '
    'revogada, domínio suspenso ou saldo esgotado.</p>'
    '<p style="font-size:14px;line-height:1.6;">Confira <code>gps.sessao_reconciliar_envios()</code> '
    'e o painel da Resend. Os envios voltam para a fila sozinhos; se a causa for a chave, '
    'eles ficarão girando sem sair.</p></div>';

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Content-Type','application/json',
                                  'Authorization','Bearer ' || v_chave),
    body := jsonb_build_object(
      'from', v_from, 'to', jsonb_build_array(v_dest),
      'subject', 'ALERTA: falha de envio na Agenda de Sessões',
      'html', v_html,
      'text', v_falhas || ' e-mail(s) da Agenda de Sessoes falharam na ultima hora. Confira a Resend.'));

  -- `atualizado_em` NÃO é setado à mão: `gps.config` tem o trigger
  -- `trg_config_atualizado_em` (…110) que já o faz em todo update. A …186
  -- seta os dois; aqui fica só o valor, para não haver duas fontes.
  update gps.config set valor = now()::text
   where chave = 'sessoes_alarme_enviado_em';
exception
  when others then
    -- Nunca deixar o alarme derrubar o disparo normal de e-mails.
    return;
end;
$saude$;

revoke all on function gps.sessao_verificar_saude_envio() from public, anon, authenticated;

comment on function gps.sessao_verificar_saude_envio() is
  'Se 3+ envios da Agenda de Sessoes falharam (sem 2xx) na ultima hora, avisa gps.config.chamados_email_fallback. No maximo 1 alerta/hora (carimbo em gps.config.sessoes_alarme_enviado_em). Exception-safe: nunca derruba o disparo. 🔴 Existe porque net.http_post sempre devolve request_id -- o cron marca `succeeded` mesmo com a Resend recusando tudo.';

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6) gps.sessao_disparar_emails — a passada do cron
-- ═══════════════════════════════════════════════════════════════════════════
-- Um único laço sobre uma consulta que já traz, por agendamento, QUAL envio
-- está pendente. Um agendamento pode ter mais de um pendente na mesma
-- passada (ex.: agendado com 40 min de antecedência dispara confirmação E
-- lembrete de 1h) — por isso a consulta é um `union all` de 8 ramos, cada um
-- com a própria janela, e não um `case`.
--
-- 🔴 TODA comparação de tempo usa `inicio_em`/`cancelado_em`/`criado_em`
-- (timestamptz), NUNCA `data` isolada: o servidor roda em UTC e `data`
-- mentiria o prazo das 21h à meia-noite. Lição já paga neste projeto.
--
-- 🔴 O e-mail NÃO lê `briefing_snapshot`. A consulta nem seleciona a coluna.
begin;

create or replace function gps.sessao_disparar_emails()
returns table(destinatario text, tipo text, request_id bigint)
language plpgsql
security definer
set search_path to ''
as $disparo$
declare
  r          record;
  v_chave    text;
  v_from     text;
  v_ativo    text;
  v_req      bigint;
  v_html     text;
  v_texto    text;
  v_ola      text;
  v_data_br  text;
  v_hora     text;
  v_assunto  text;
  v_titulo   text;
  v_frase    text;
  v_url      text;
  v_rotulo   text;
  -- 🔴 Nomes NORMALIZADOS uma vez por linha, não `coalesce` espalhado em 15
  -- concatenações. Motivo, medido no próprio PL/pgSQL: `null || ' texto'` é
  -- NULL -- UM nome nulo (doutora sem linha em `public.perfis`, aluno sem
  -- `nome` em `thb_alunos`) zeraria a FRASE INTEIRA, e o e-mail sairia com
  -- corpo vazio sem erro nenhum. Falha silenciosa, a espécie que ninguém
  -- investiga porque "deu certo".
  v_aluno_nm text;
  v_dra_nm   text;
  v_cli_nm   text;
  v_tipo_nm  text;
  v_enviados int := 0;
  -- Marca THB (src/lib/email.ts). #C74600 = 4,88:1 com branco (WCAG AA).
  -- O #EA580C antigo dava 3,56:1 e foi reprovado no war-room de 10/09.
  c_laranja  constant text := '#C74600';
  c_portal   constant text := 'https://programa.timeholdingbrasil.com.br';
  c_teto     constant int := 8;         -- envios por passada (ver aritmética no cabeçalho)
  c_pausa    constant numeric := 0.15;  -- ~6,7 req/s (a Resend permite 10)
begin
  -- 🔴 INTERRUPTOR primeiro, antes de qualquer trabalho. Nasce 'false'.
  select valor into v_ativo from gps.config where chave = 'sessoes_email_ativo';
  if coalesce(btrim(v_ativo), 'false') <> 'true' then
    return;
  end if;

  -- Alarme antes da reconciliação (pega a falha da passada anterior o quanto
  -- antes), e reconciliação antes do envio (devolve para a fila quem levou
  -- 429 e foi carimbado como avisado).
  perform gps.sessao_verificar_saude_envio();
  perform gps.sessao_reconciliar_envios();

  -- 🔴 A chave SEMPRE pela porta única (…272): Vault, com fallback de
  -- transição para gps.config. NUNCA escrita no corpo (pg_get_functiondef é
  -- legível) e NUNCA lida de gps.config direto.
  v_chave := gps.resend_api_key();
  if v_chave is null or btrim(v_chave) = '' then
    raise exception 'chave da Resend indisponivel (gps.resend_api_key devolveu vazio)'
      using errcode = '42501';
  end if;

  select valor into v_from from gps.config where chave = 'email_sessoes_from';
  -- Só o NOME de exibição muda. O ENDEREÇO fica no único domínio verificado
  -- na Resend — trocá-lo sem verificar derrubaria TODO o envio (…173).
  v_from := coalesce(nullif(btrim(v_from), ''),
                     'Time Holding Brasil <acesso@programa.timeholdingbrasil.com.br>');

  for r in
    with fila as (
      ----------------------------------------------------------- confirmação
      select a.id, 'agendou_dra'::text as gatilho,
             'email_agendou_dra_em'::text as col_em, 'email_agendou_dra_req'::text as col_req,
             'dra'::text as publico
        from gps.sessao_agendamentos a
       where a.estado = 'agendado'
         and a.email_agendou_dra_em is null
         and a.criado_em >= now() - interval '24 hours'
      union all
      select a.id, 'agendou_aluno', 'email_agendou_aluno_em', 'email_agendou_aluno_req', 'aluno'
        from gps.sessao_agendamentos a
       where a.estado = 'agendado'
         and a.email_agendou_aluno_em is null
         and a.criado_em >= now() - interval '24 hours'
      ------------------------------------------------------------- 24h antes
      -- Janela de 60 min de largura. Com cron de 5 min e teto 8 = 96 envios
      -- alcançáveis; o pior caso realista é 16. Ver a aritmética no cabeçalho.
      union all
      select a.id, '24h_dra', 'email_24h_dra_em', 'email_24h_dra_req', 'dra'
        from gps.sessao_agendamentos a
       where a.estado = 'agendado'
         and a.email_24h_dra_em is null
         and a.inicio_em >  now() + interval '23 hours'
         and a.inicio_em <= now() + interval '24 hours'
      union all
      select a.id, '24h_aluno', 'email_24h_aluno_em', 'email_24h_aluno_req', 'aluno'
        from gps.sessao_agendamentos a
       where a.estado = 'agendado'
         and a.email_24h_aluno_em is null
         and a.inicio_em >  now() + interval '23 hours'
         and a.inicio_em <= now() + interval '24 hours'
      -------------------------------------------------------------- 1h antes
      -- 🔴 Fecha em now(): "começa em 1 hora" depois do começo é mentira.
      union all
      select a.id, '1h_dra', 'email_1h_dra_em', 'email_1h_dra_req', 'dra'
        from gps.sessao_agendamentos a
       where a.estado = 'agendado'
         and a.email_1h_dra_em is null
         and a.inicio_em >  now()
         and a.inicio_em <= now() + interval '1 hour'
      union all
      select a.id, '1h_aluno', 'email_1h_aluno_em', 'email_1h_aluno_req', 'aluno'
        from gps.sessao_agendamentos a
       where a.estado = 'agendado'
         and a.email_1h_aluno_em is null
         and a.inicio_em >  now()
         and a.inicio_em <= now() + interval '1 hour'
      ----------------------------------------------------------- cancelamento
      union all
      select a.id, 'cancel_dra', 'email_cancel_dra_em', 'email_cancel_dra_req', 'dra'
        from gps.sessao_agendamentos a
       where a.estado = 'cancelado'
         and a.email_cancel_dra_em is null
         and a.cancelado_em >= now() - interval '24 hours'
      union all
      select a.id, 'cancel_aluno', 'email_cancel_aluno_em', 'email_cancel_aluno_req', 'aluno'
        from gps.sessao_agendamentos a
       where a.estado = 'cancelado'
         and a.email_cancel_aluno_em is null
         and a.cancelado_em >= now() - interval '24 hours'
    )
    select f.id, f.gatilho, f.col_em, f.col_req, f.publico,
           a.data, a.hora_inicio, a.inicio_em, a.duracao_min,
           a.cancelado_motivo, a.link_reuniao,
           t.nome  as tipo_nome,
           c.nome  as cliente_nome,
           al.nome as aluno_nome,
           -- 🔴 DOUTORA: nome e e-mail por uuid (perfis.id = responsavel_id),
           -- NUNCA por primeiro nome -- há dezenas de alunas Elaine/Cristiane
           -- em auth.users (PRD §9b.3). perfis.email primeiro (e-mail de
           -- trabalho); auth.users.email de reserva (os TRÊS e-mails, …241).
           p.nome  as dra_nome,
           nullif(btrim(coalesce(p.email, u_dra.email, '')), '') as dra_email,
           -- 🔴 ALUNO: quem AGENDOU (criado_por), com o e-mail do ambiente de
           -- reserva. Nessa ordem: sócio que agenda receberia a confirmação
           -- no e-mail do titular e ficaria sem o link da própria sessão.
           nullif(btrim(coalesce(u_al.email, al.email, '')), '') as aluno_email
      from fila f
      join gps.sessao_agendamentos a  on a.id = f.id
      join gps.sessao_tipos        t  on t.id = a.tipo_id
      join gps.etapa1_clientes     c  on c.id = a.cliente_id
      join public.thb_alunos       al on al.id = a.aluno_id
      left join public.perfis      p     on p.id     = a.responsavel_id
      left join auth.users         u_dra on u_dra.id = a.responsavel_id
      left join auth.users         u_al  on u_al.id  = a.criado_por
     -- Ordem: o mais urgente primeiro. Quando o teto corta a passada, quem
     -- fica para a seguinte é quem tem mais tempo sobrando -- nunca o
     -- lembrete de 1h, que tem 60 minutos de janela e não pode esperar.
     order by case f.gatilho
                when '1h_dra' then 1 when '1h_aluno' then 1
                when 'cancel_dra' then 2 when 'cancel_aluno' then 2
                when 'agendou_dra' then 3 when 'agendou_aluno' then 3
                else 4
              end,
              a.inicio_em
  loop
    exit when v_enviados >= c_teto;

    -- Destinatário indisponível: PULA sem carimbar. Carimbar aqui marcaria
    -- como avisado quem nunca recebeu -- a mesma falha silenciosa do 429.
    -- Sem carimbo, a sessão volta na próxima passada; se a causa for
    -- permanente (doutora sem e-mail em lugar nenhum), o alarme não pega
    -- isso, mas a tela `/admin/sessoes` mostra a sessão normalmente.
    if r.publico = 'dra' and r.dra_email is null then
      continue;
    end if;
    if r.publico = 'aluno' and r.aluno_email is null then
      continue;
    end if;

    v_data_br := to_char(r.data, 'DD/MM/YYYY');
    v_hora    := to_char(r.hora_inicio, 'HH24:MI');

    -- Nenhum nome chega nulo às frases abaixo. Os rótulos de reserva são
    -- genéricos de propósito: "o aluno" e "a equipe jurídica" são verdade em
    -- qualquer caso, e melhor que um e-mail vazio ou com a palavra "null".
    v_aluno_nm := coalesce(nullif(btrim(coalesce(r.aluno_nome,   '')), ''), 'o aluno');
    v_dra_nm   := coalesce(nullif(btrim(coalesce(r.dra_nome,     '')), ''), 'a equipe jurídica');
    v_cli_nm   := coalesce(nullif(btrim(coalesce(r.cliente_nome, '')), ''), 'o cliente cadastrado');
    v_tipo_nm  := coalesce(nullif(btrim(coalesce(r.tipo_nome,    '')), ''), 'sessão');

    -- 🔴 LGPD: daqui para baixo entram só data, hora, nomes e LINK. Nenhuma
    -- linha lê briefing_snapshot, descricao_caso, observacoes ou decisores.
    if r.publico = 'dra' then
      -- Primeiro nome só quando ele EXISTE; sem nome, "Olá!" seco. Nunca
      -- "Olá, a equipe jurídica!".
      v_ola    := case when nullif(btrim(coalesce(r.dra_nome, '')), '') is not null
                       then 'Olá, ' || split_part(btrim(r.dra_nome), ' ', 1) || '!'
                       else 'Olá!' end;
      v_url    := c_portal || '/admin/sessoes';
      v_rotulo := 'Abrir no sistema';
    else
      v_ola    := case when nullif(btrim(coalesce(r.aluno_nome, '')), '') is not null
                       then 'Olá, ' || split_part(btrim(r.aluno_nome), ' ', 1) || '!'
                       else 'Olá!' end;
      v_url    := c_portal || '/sessoes';
      v_rotulo := 'Ver minha sessão';
    end if;

    -- Cada gatilho: assunto, título e a frase de contexto. Todos os nomes
    -- vêm das variáveis normalizadas acima -- nenhum `r.*_nome` cru entra em
    -- concatenação, pelo motivo do bloco `declare`.
    case r.gatilho
      when 'agendou_dra' then
        v_assunto := 'Nova sessão marcada — ' || v_data_br || ' às ' || v_hora;
        v_titulo  := 'Uma sessão foi marcada com você';
        v_frase   := v_aluno_nm || ' marcou uma <strong>' || v_tipo_nm ||
                     '</strong> para <strong>' || v_data_br || '</strong>, às <strong>' ||
                     v_hora || '</strong> (' || r.duracao_min ||
                     ' minutos), sobre o cliente <strong>' || v_cli_nm || '</strong>.';
      when 'agendou_aluno' then
        v_assunto := 'Sessão confirmada — ' || v_data_br || ' às ' || v_hora;
        v_titulo  := 'Sua sessão está marcada';
        v_frase   := 'Sua <strong>' || v_tipo_nm || '</strong> com <strong>' || v_dra_nm ||
                     '</strong> está confirmada para <strong>' || v_data_br ||
                     '</strong>, às <strong>' || v_hora || '</strong> (' || r.duracao_min ||
                     ' minutos), sobre o cliente <strong>' || v_cli_nm || '</strong>.';
      when '24h_dra' then
        v_assunto := 'Amanhã, ' || v_hora || ': sessão com ' || v_aluno_nm;
        v_titulo  := 'Sua sessão é amanhã';
        v_frase   := 'Amanhã, <strong>' || v_data_br || '</strong>, às <strong>' || v_hora ||
                     '</strong>: <strong>' || v_tipo_nm || '</strong> com <strong>' ||
                     v_aluno_nm || '</strong>, sobre o cliente <strong>' ||
                     v_cli_nm || '</strong>.';
      when '24h_aluno' then
        v_assunto := 'Amanhã, ' || v_hora || ': sua sessão com a equipe jurídica';
        v_titulo  := 'Sua sessão é amanhã';
        v_frase   := 'Amanhã, <strong>' || v_data_br || '</strong>, às <strong>' || v_hora ||
                     '</strong>: sua <strong>' || v_tipo_nm || '</strong> com <strong>' ||
                     v_dra_nm || '</strong>, sobre o cliente <strong>' || v_cli_nm || '</strong>.';
      when '1h_dra' then
        v_assunto := 'Em 1 hora: sessão com ' || v_aluno_nm;
        v_titulo  := 'Sua sessão começa em 1 hora';
        v_frase   := 'Hoje às <strong>' || v_hora || '</strong>: <strong>' || v_tipo_nm ||
                     '</strong> com <strong>' || v_aluno_nm ||
                     '</strong>, sobre o cliente <strong>' || v_cli_nm || '</strong>.';
      when '1h_aluno' then
        v_assunto := 'Em 1 hora: sua sessão com a equipe jurídica';
        v_titulo  := 'Sua sessão começa em 1 hora';
        v_frase   := 'Hoje às <strong>' || v_hora || '</strong>: sua <strong>' || v_tipo_nm ||
                     '</strong> com <strong>' || v_dra_nm ||
                     '</strong>, sobre o cliente <strong>' || v_cli_nm || '</strong>.';
      when 'cancel_dra' then
        v_assunto := 'Sessão cancelada — ' || v_data_br || ' às ' || v_hora;
        v_titulo  := 'Uma sessão foi cancelada';
        v_frase   := 'A <strong>' || v_tipo_nm || '</strong> com <strong>' || v_aluno_nm ||
                     '</strong> em <strong>' || v_data_br || '</strong>, às <strong>' ||
                     v_hora || '</strong>, foi cancelada. O horário está livre de novo.';
      else  -- cancel_aluno
        v_assunto := 'Sessão cancelada — ' || v_data_br || ' às ' || v_hora;
        v_titulo  := 'Sua sessão foi cancelada';
        v_frase   := 'Sua <strong>' || v_tipo_nm || '</strong> de <strong>' || v_data_br ||
                     '</strong>, às <strong>' || v_hora ||
                     '</strong>, foi cancelada. Você pode marcar outra pelo portal.';
    end case;

    -- ⚠️ O MOTIVO do cancelamento NÃO entra no e-mail. Ele é texto livre
    -- 3..300 escrito por quem cancelou (…291) e pode conter dado do caso;
    -- fica na tela e na trilha. O e-mail diz QUE cancelou, não POR QUÊ.

    v_html :=
      '<div style="background:#f5f5f4;padding:24px 0;font-family:Arial,Helvetica,sans-serif;">'
      '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;'
      'overflow:hidden;border:1px solid #e7e5e4;">'
      -- Cabeçalho da marca do PROGRAMA (não Acelera): laranja #C74600.
      '<div style="background:' || c_laranja || ';padding:20px 28px;">'
      '<div style="color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:.3px;">'
      'Programa de Implementação Assistida</div>'
      '<div style="color:#ffe4d1;font-size:12px;margin-top:2px;">Time Holding Brasil</div>'
      '</div>'
      '<div style="padding:28px;color:#1c1917;">'
      '<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">' || v_titulo || '</h1>'
      '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">' || v_ola || '</p>'
      '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">' || v_frase || '</p>'
      || case when r.link_reuniao is not null and r.gatilho like '1h%'
              then '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">'
                   'Sala da reunião: <a href="' || r.link_reuniao ||
                   '" style="color:#9a3412;font-weight:bold;word-break:break-all;">'
                   || r.link_reuniao || '</a></p>'
              else '' end ||
      '<p style="margin:8px 0 20px;"><a href="' || v_url || '" '
      'style="display:inline-block;padding:12px 22px;background:' || c_laranja || ';'
      'color:#fff;font-size:15px;font-weight:bold;text-decoration:none;border-radius:8px;">'
      || v_rotulo || '</a></p>'
      '<p style="font-size:13px;line-height:1.6;color:#78716c;margin:0;">'
      'Se o botão não funcionar, copie e cole este endereço no navegador:<br>'
      '<span style="word-break:break-all;">' || v_url || '</span></p>'
      '</div>'
      '<div style="padding:18px 28px;border-top:1px solid #e7e5e4;background:#fafaf9;'
      'font-size:12px;color:#78716c;line-height:1.5;">'
      'Você recebeu este e-mail porque faz parte do Programa de Implementação '
      'Assistida do Time Holding Brasil.'
      '</div></div></div>';

    -- Versão texto: mesma informação, sem HTML. `regexp_replace` tira as
    -- tags <strong> da frase -- ela é montada uma vez só, em HTML.
    v_texto := v_ola || E'\n\n'
      || regexp_replace(v_frase, '<[^>]+>', '', 'g') || E'\n\n'
      || case when r.link_reuniao is not null and r.gatilho like '1h%'
              then 'Sala da reuniao: ' || r.link_reuniao || E'\n\n' else '' end
      || v_rotulo || ': ' || v_url;

    select net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Content-Type','application/json',
                                    'Authorization','Bearer ' || v_chave),
      body := jsonb_build_object(
        'from', v_from,
        'to',   jsonb_build_array(case when r.publico = 'dra' then r.dra_email
                                       else r.aluno_email end),
        'subject', v_assunto,
        'html', v_html,
        'text', v_texto)
    ) into v_req;

    -- 🔴 Carimbo + request_id na MESMA linha. O request_id é o que permite a
    -- reconciliação descobrir o 429 -- sem ele o carimbo é uma afirmação sem
    -- prova (a falha de 09/09/2026).
    --
    -- ⚠️ Este UPDATE escreve na MESMA tabela que o `for` está varrendo. É
    -- seguro: o cursor implícito do `for ... in <query>` trabalha sobre o
    -- snapshot do início do comando, então a linha carimbada não reaparece
    -- nesta passada nem desaparece dela. Na passada SEGUINTE ela já não
    -- entra, porque o carimbo deixou de ser nulo -- que é a idempotência.
    execute format(
      'update gps.sessao_agendamentos set %I = now(), %I = $1 where id = $2',
      r.col_em, r.col_req)
      using v_req, r.id;

    v_enviados := v_enviados + 1;
    perform pg_sleep(c_pausa);  -- ~6,7 req/s; a Resend corta em 10

    destinatario := case when r.publico = 'dra' then r.dra_email else r.aluno_email end;
    tipo := r.gatilho;
    request_id := v_req;
    return next;
  end loop;
end;
$disparo$;

-- 🔴 NÃO é endpoint: quem chama é o pg_cron, de dentro do banco. Sem
-- `grant execute` para `authenticated` -- a função lê a tabela inteira como
-- owner, inclusive `briefing_snapshot`, que está FORA do grant de coluna.
-- `public` nomeado explicitamente: revoke de `anon` não pega quando a
-- permissão vem de PUBLIC (toda role herda de PUBLIC).
revoke all on function gps.sessao_disparar_emails() from public, anon, authenticated;

comment on function gps.sessao_disparar_emails() is
  'Os 5 gatilhos de e-mail da Agenda de Sessoes (PRD §7.3): confirmacao para doutora e aluno, lembretes de 24h e de 1h para ambos, aviso de cancelamento para ambos. 8 carimbos independentes, 8 request_id. 🔴 Idempotente pelo carimbo + reconciliacao do 429 (net.http_post e ASSINCRONO). Teto de 8 por passada e pg_sleep(0.15) -- a Resend corta em 10 req/s e o statement_timeout e de 8s. Cron sessao-emails, de 5 em 5 min: janela de 60 min / 5 = 12 passadas x 8 = 96 envios alcancaveis, contra 16 no pior caso realista (8 sessoes/semana x 2 destinatarios). 🔴 LGPD: leva data, hora, nomes e LINK -- NUNCA briefing_snapshot, descricao_caso, observacoes, decisores nem o motivo do cancelamento. 🔴 Chave sempre por gps.resend_api_key() (Vault), nunca gps.config direto nem escrita no corpo. Desliga por gps.config.sessoes_email_ativo, que nasce false.';

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7) CRON — de 5 em 5 minutos
-- ═══════════════════════════════════════════════════════════════════════════
-- 5 minutos, não 10: a aritmética do cabeçalho (janela de 60 min ÷ intervalo
-- × teto) é o que decide, e foi com 10 min que a …174 quase deixou 3 pessoas
-- sem e-mail. Com 5 min há 12 passadas por janela.
--
-- ⚠️ NÃO é de minuto em minuto como `plantao-emails-sala`: aquele tem janela
-- de abertura de 30 min e 20+ inscritos por slot. Aqui são 8 sessões por
-- SEMANA — rodar 1.440 vezes/dia para 16 envios/semana é gastar passada à
-- toa. 288 passadas/dia já dão 6× de folga.
--
-- 🔴 O cron fica AGENDADO mas o disparo nasce DESLIGADO
-- (`gps.config.sessoes_email_ativo = 'false'`): a função retorna na primeira
-- linha. Agendar agora e ligar depois é melhor do que agendar depois, porque
-- `cron.schedule` por migration é o que fica versionado -- o Plantão levou um
-- incidente justamente por o cron nunca ter sido agendado (…170).
--
-- `cron.schedule` com nome existente faz UPDATE: rodar de novo é seguro.
select cron.schedule(
  'sessao-emails',
  '*/5 * * * *',
  $cron$ select gps.sessao_disparar_emails(); $cron$
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 🔬 ROTEIRO DE PROVA — para rodar por MCP em `begin … rollback`
-- ═══════════════════════════════════════════════════════════════════════════
-- Nenhum passo abaixo dispara e-mail de verdade: o interruptor
-- `sessoes_email_ativo` nasce **'false'** e os passos 1 a 6 nunca o ligam.
-- O passo 7 é o ÚNICO que liga — e ele está isolado, marcado, e NÃO deve ser
-- rodado sem o Marcio querer enviar de fato.
--
-- ───────────────────────────────────────────────────────────────────────────
-- 0) ESTADO INICIAL — o interruptor nasceu desligado
-- ───────────────────────────────────────────────────────────────────────────
--   select chave, valor from gps.config
--    where chave in ('sessoes_email_ativo','email_sessoes_from','sessoes_alarme_enviado_em')
--    order by chave;
--   -- esperado: sessoes_email_ativo = 'false'
--
--   select gps.sessao_disparar_emails();
--   -- esperado: 0 linhas, SEM tocar na Resend (retorna na 1a linha do corpo)
--
-- ───────────────────────────────────────────────────────────────────────────
-- 1) GRANTS — anon e PUBLIC não alcançam nada (as duas lições de GRANT)
-- ───────────────────────────────────────────────────────────────────────────
--   -- (a) nenhuma das 3 funções é executável por public/anon/authenticated:
--   select p.proname,
--          has_function_privilege('anon',          p.oid, 'EXECUTE') as anon,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth,
--          p.proacl::text
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'gps'
--      and p.proname in ('sessao_disparar_emails','sessao_reconciliar_envios',
--                        'sessao_verificar_saude_envio');
--   -- esperado: anon = false e auth = false nas 3
--
--   -- (b) 🔴 ACL, não só has_privilege: entrada que começa com '=' é PUBLIC,
--   --     e revoke de anon NÃO pega quando a permissão vem de PUBLIC.
--   select p.proname
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'gps'
--      and p.proname like 'sessao_%'
--      and exists (select 1 from unnest(p.proacl) a where a::text like '=%');
--   -- esperado: 0 linhas   (⚠️ `proacl::text like '%=X/%'` dá falso positivo
--   --                        -- casa 'postgres=X/' também. Use o unnest.)
--
--   -- (c) as 16 colunas novas NÃO estão no grant de coluna de authenticated:
--   select column_name from information_schema.column_privileges
--    where table_schema='gps' and table_name='sessao_agendamentos'
--      and grantee='authenticated' and column_name like 'email_%';
--   -- esperado: 0 linhas
--
--   -- (d) authenticated não ganhou escrita na tabela:
--   select grantee, string_agg(privilege_type, ', ' order by privilege_type)
--     from information_schema.role_table_grants
--    where table_schema='gps' and table_name='sessao_agendamentos'
--    group by grantee;
--   -- esperado: authenticated = SELECT e mais nada; anon/PUBLIC ausentes
--
-- ───────────────────────────────────────────────────────────────────────────
-- 2) A ARITMÉTICA DO TETO — conferir que o teto existe e onde ele corta
-- ───────────────────────────────────────────────────────────────────────────
--   -- O teto está no corpo, não em config (é constante de proteção do
--   -- statement_timeout, não parâmetro de negócio). Conferir que está lá:
--   select (pg_get_functiondef(p.oid) ~ 'c_teto\s+constant int := 8')        as tem_teto,
--          (pg_get_functiondef(p.oid) like '%pg_sleep(c_pausa)%')             as tem_pausa,
--          (pg_get_functiondef(p.oid) like '%gps.resend_api_key()%')          as usa_vault,
--          (pg_get_functiondef(p.oid) like '%gps.config where chave = ''resend_api_key''%')
--                                                                             as le_config_cru
--     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='gps' and p.proname='sessao_disparar_emails';
--   -- esperado: true, true, true, FALSE
--
--   -- A conta escrita no cabeçalho, conferida contra a realidade da tabela:
--   --   janela 60 min ÷ cron 5 min = 12 passadas × teto 8 = 96 alcançáveis
--   -- Quantos envios a janela mais apertada (1h antes) chegaria a demandar
--   -- no pior dia já registrado na agenda:
--   select date_trunc('hour', inicio_em) as hora, count(*) * 2 as envios_1h
--     from gps.sessao_agendamentos
--    where estado = 'agendado'
--    group by 1 having count(*) * 2 > 96
--    order by 2 desc;
--   -- esperado: 0 linhas (nenhuma hora demanda mais que os 96 alcançáveis)
--
-- ───────────────────────────────────────────────────────────────────────────
-- 3) IDEMPOTÊNCIA — a 2ª passada não repete envio
-- ───────────────────────────────────────────────────────────────────────────
--   begin;
--     -- Liga o interruptor DENTRO da transação. ⚠️ Isto faria e-mail sair de
--     -- verdade se houvesse fila -- então o passo abaixo NEUTRALIZA a chave
--     -- antes, fazendo a função abortar com 42501 em vez de postar.
--     -- Para provar a IDEMPOTÊNCIA sem rede, simulamos os carimbos à mão:
--
--     -- pega uma sessão agendada qualquer e a joga na janela de 1h:
--     select id, inicio_em, email_1h_aluno_em, email_1h_dra_em
--       from gps.sessao_agendamentos where estado='agendado' limit 1;
--
--     -- 1a passada simulada: carimba os dois envios de 1h
--     update gps.sessao_agendamentos
--        set email_1h_aluno_em = now(), email_1h_aluno_req = 999999001,
--            email_1h_dra_em   = now(), email_1h_dra_req   = 999999002
--      where id = '<o id acima>';
--
--     -- 2a passada: a fila não devolve mais esses dois gatilhos
--     select gatilho, count(*) from (
--       select '1h_aluno' as gatilho from gps.sessao_agendamentos a
--        where a.estado='agendado' and a.email_1h_aluno_em is null
--          and a.inicio_em > now() and a.inicio_em <= now() + interval '1 hour'
--          and a.id = '<o id acima>'
--       union all
--       select '1h_dra' from gps.sessao_agendamentos a
--        where a.estado='agendado' and a.email_1h_dra_em is null
--          and a.inicio_em > now() and a.inicio_em <= now() + interval '1 hour'
--          and a.id = '<o id acima>'
--     ) q group by 1;
--     -- esperado: 0 linhas  ← quem já recebeu saiu do filtro
--   rollback;
--
-- ───────────────────────────────────────────────────────────────────────────
-- 4) RECONCILIAÇÃO DE UM 429 SIMULADO — sem rede
-- ───────────────────────────────────────────────────────────────────────────
--   begin;
--     -- Um agendamento qualquer, carimbado como "enviado" apontando para um
--     -- request que respondeu 429. `net._http_response` é tabela comum: dá
--     -- para inserir a resposta falsa dentro da transação.
--     insert into net._http_response (id, status_code, content_type, headers, content, timed_out, error_msg)
--     values (999999429, 429, 'application/json', null,
--             '{"message":"Too many requests"}', false, null);
--
--     update gps.sessao_agendamentos
--        set email_24h_aluno_em = now(), email_24h_aluno_req = 999999429
--      where id = (select id from gps.sessao_agendamentos where estado='agendado' limit 1);
--
--     select * from gps.sessao_reconciliar_envios();
--     -- esperado: 1 linha, qual = 'email_24h_aluno', status = 429
--
--     select email_24h_aluno_em, email_24h_aluno_req
--       from gps.sessao_agendamentos where email_24h_aluno_req = 999999429;
--     -- esperado: 0 linhas ← o par foi LIMPO e a pessoa voltou para a fila
--
--     -- contraprova: um 200 NÃO é limpo
--     insert into net._http_response (id, status_code, content_type, headers, content, timed_out, error_msg)
--     values (999999200, 200, 'application/json', null, '{"id":"fake"}', false, null);
--     update gps.sessao_agendamentos
--        set email_24h_dra_em = now(), email_24h_dra_req = 999999200
--      where id = (select id from gps.sessao_agendamentos where estado='agendado' limit 1);
--     select * from gps.sessao_reconciliar_envios();
--     -- esperado: 0 linhas para 'email_24h_dra'
--     select count(*) from gps.sessao_agendamentos where email_24h_dra_req = 999999200;
--     -- esperado: 1 ← o carimbo do 2xx permanece
--   rollback;
--
--   ⚠️ Se o `insert` em `net._http_response` for recusado por permissão,
--   substitua por um id que JÁ EXISTA lá com status fora de 2xx:
--     select id, status_code from net._http_response
--      where status_code not between 200 and 299 order by id desc limit 3;
--   e use esse id nos updates acima. A prova é a mesma.
--
-- ───────────────────────────────────────────────────────────────────────────
-- 5) 🔴 NENHUM PAYLOAD LEVA BRIEFING — a prova de LGPD
-- ───────────────────────────────────────────────────────────────────────────
--   -- (a) o corpo da função não menciona nenhuma das fontes proibidas:
--   select p.proname,
--          pg_get_functiondef(p.oid) ilike '%briefing_snapshot%'  as cita_briefing,
--          pg_get_functiondef(p.oid) ilike '%descricao_caso%'     as cita_descricao,
--          pg_get_functiondef(p.oid) ilike '%observacoes%'        as cita_observacoes,
--          pg_get_functiondef(p.oid) ilike '%cliente_decisores%'  as cita_decisores,
--          pg_get_functiondef(p.oid) ilike '%cancelado_motivo%'   as cita_motivo
--     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='gps' and p.proname='sessao_disparar_emails';
--   -- esperado: cita_briefing/descricao/observacoes/decisores = FALSE.
--   --   ⚠️ cita_motivo sai TRUE: `cancelado_motivo` está na lista do SELECT
--   --   da fila, mas NÃO é usado em nenhum html/texto. A prova (b) fecha isso.
--
--   -- (b) o corpo não concatena o motivo em nenhum payload:
--   select (pg_get_functiondef(p.oid) like '%r.cancelado_motivo%') as usa_motivo
--     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='gps' and p.proname='sessao_disparar_emails';
--   -- esperado: FALSE
--
--   -- (c) PROVA VIVA, com o payload REAL montado e sem postar nada: rode o
--   --     mesmo SELECT da fila e inspecione o que ele traz. Se o briefing
--   --     estivesse no e-mail, estaria aqui.
--   select a.id, t.nome as tipo, c.nome as cliente, al.nome as aluno,
--          p.nome as dra, a.data, a.hora_inicio, a.link_reuniao
--     from gps.sessao_agendamentos a
--     join gps.sessao_tipos    t  on t.id = a.tipo_id
--     join gps.etapa1_clientes c  on c.id = a.cliente_id
--     join public.thb_alunos   al on al.id = a.aluno_id
--     left join public.perfis  p  on p.id = a.responsavel_id
--    limit 3;
--   -- esperado: só data, hora, nomes e link. Nenhuma coluna de briefing.
--
-- ───────────────────────────────────────────────────────────────────────────
-- 6) ÍNDICE — o plano medido da consulta de fila (a trava obrigatória)
-- ───────────────────────────────────────────────────────────────────────────
--   🔴 `explain analyze` em UPDATE/DELETE EXECUTA o comando. O que segue é
--   SELECT puro -- mesmo assim vai dentro de begin/rollback, por regra.
--
--   begin;
--     explain (analyze, buffers)
--     select a.id
--       from gps.sessao_agendamentos a
--      where a.estado = 'agendado'
--        and a.email_1h_aluno_em is null
--        and a.inicio_em >  now()
--        and a.inicio_em <= now() + interval '1 hour';
--   rollback;
--   -- 🔴 COLAR O PLANO REAL no relatório. Não escrevi plano previsto neste
--   -- arquivo de propósito: prever plano de cabeça já errou o TIPO de scan
--   -- neste projeto (previ Index Scan, era Seq Scan numa tabela de 4 linhas),
--   -- e plano fabricado contamina a leitura do plano verdadeiro.
--   -- DECISÃO: nenhum índice foi criado. Se o plano mostrar Seq Scan em
--   -- milissegundos (o esperado numa tabela desta ordem), está certo assim --
--   -- o PRD §10 já fechou "não criar índice", e `etapa1_clientes(fase)` já
--   -- provou neste banco que índice pode deixar MAIS LENTO.
--
--   -- Escala: o mesmo plano com 10 anos de acervo. `generate_series` numa
--   -- temp table espelho, porque não dá para inflar a tabela real:
--   begin;
--     create temp table _fila_teste on commit drop as
--       select a.* from gps.sessao_agendamentos a where false;
--     insert into _fila_teste (id, tipo_id, responsavel_id, aluno_id, cliente_id,
--                              data, hora_inicio, duracao_min, estado, criado_em)
--     select gen_random_uuid(),
--            (select min(id) from gps.sessao_tipos),
--            (select min(responsavel_id) from gps.sessao_disponibilidade),
--            (select min(aluno_id) from gps.sessao_agendamentos),
--            (select min(cliente_id) from gps.sessao_agendamentos),
--            current_date + (g % 3650), '09:00'::time, 30, 'agendado', now()
--       from generate_series(1, 4160) g;
--     analyze _fila_teste;
--     explain (analyze, buffers)
--     select id from _fila_teste
--      where estado = 'agendado' and email_1h_aluno_em is null
--        and inicio_em > now() and inicio_em <= now() + interval '1 hour';
--   rollback;
--   -- ⚠️ Se a temp table não aceitar as colunas geradas (inicio_em/fim_em são
--   -- `generated always`), o `create table as ... where false` as copia como
--   -- colunas COMUNS -- então preencha-as no insert:
--   --   (data + hora_inicio) at time zone 'America/Sao_Paulo'
--   -- Isto é aceitável para MEDIR PLANO (é a mesma expressão da …291), mas o
--   -- número só vale como ordem de grandeza: a temp table não tem os índices
--   -- nem a constraint de exclusão da tabela real.
--
-- ───────────────────────────────────────────────────────────────────────────
-- 7) ⚠️ ENVIO REAL — SÓ com o Marcio querendo. NÃO rodar na verificação.
-- ───────────────────────────────────────────────────────────────────────────
--   -- Este é o único passo que faz e-mail sair. Fora de transação, porque
--   -- net.http_post enfileira e o rollback NÃO desfaz o pedido já postado.
--   -- Recomendado: fazer o primeiro com UMA sessão de teste, cujo aluno e
--   -- responsável sejam e-mails da própria equipe.
--   update gps.config set valor = 'true' where chave = 'sessoes_email_ativo';
--   select * from gps.sessao_disparar_emails();
--   -- e 30s depois, o status REAL de cada um:
--   select a.id, r.status_code, r.content
--     from gps.sessao_agendamentos a
--     join net._http_response r on r.id in (a.email_agendou_dra_req, a.email_agendou_aluno_req,
--                                           a.email_24h_dra_req, a.email_24h_aluno_req,
--                                           a.email_1h_dra_req,  a.email_1h_aluno_req,
--                                           a.email_cancel_dra_req, a.email_cancel_aluno_req)
--    order by r.id desc limit 20;
--   -- 429 em qualquer linha: a reconciliação já devolve à fila na passada
--   -- seguinte. Não carimbar à mão.
--
-- ───────────────────────────────────────────────────────────────────────────
-- 8) O CRON está agendado (mas o disparo, desligado)
-- ───────────────────────────────────────────────────────────────────────────
--   select jobname, schedule, active, command from cron.job
--    where jobname in ('sessao-emails','plantao-emails-sala','plantao-reconciliar-elegibilidade')
--    order by jobname;
--   -- esperado: sessao-emails */5, E os dois do plantao INTOCADOS
--   --   (plantao-emails-sala continua como estava -- escopo fechado)
