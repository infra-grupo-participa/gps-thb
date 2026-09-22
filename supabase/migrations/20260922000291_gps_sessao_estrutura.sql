-- ═══════════════════════════════════════════════════════════════════════════
-- Agenda de Sessões com a Equipe Jurídica — FATIA 1: estrutura de dados.
-- PRD: docs/specs/2026-09-22-agenda-sessoes-equipe-PRD.md (§6 modelo de dados,
-- §9b medições, §9-ter B2/B3 decisões finais do Marcio).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 O QUE ESTA MIGRAÇÃO **NÃO** TOCA (e por quê)
-- ═══════════════════════════════════════════════════════════════════════════
-- `gps.reuniao_agendamentos`, `gps.reuniao_horarios`, `gps.reuniao_bloqueios`,
-- `gps.reuniao_eventos` e `gps.agenda` seguem ÓRFÃS e PROIBIDAS. A decisão do
-- Marcio de 22/09/2026 revogou a remoção de 10/08 e autorizou `gps.sessao_*`,
-- e SÓ isso (CLAUDE.md, seção "✅ Agendamento — decisão de 2026-08-10
-- REVOGADA"). Nenhum dado daquelas tabelas é migrado para cá: as 6 reuniões
-- de agosto ficam onde estão, como histórico. Nomes novos justamente para não
-- ressuscitar o modelo queimado.
--
-- `gps.plantao_*` fica INTOCADO — escopo fechado pelo Marcio. Copiamos o
-- PADRÃO do Plantão (coluna gerada `inicio_em`, RLS, índice único parcial),
-- nunca as tabelas dele.
--
-- `gps.operadores`, `public.perfis` e `public.gp_is_admin()` são CONSUMIDOS,
-- nunca alterados — `gp_is_admin()` é lida por policies de 50 tabelas em 3
-- schemas.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 A DURAÇÃO (150 min) VIVE **SÓ** EM `gps.sessao_tipos.duracao_min`
-- ═══════════════════════════════════════════════════════════════════════════
-- §5.4: bloco único de 2h30 = 30 min falando do cliente + 2h de sessão. Um
-- agendamento só. A GRADE É DERIVADA, NUNCA GRAVADA: `sessao_disponibilidade`
-- guarda a JANELA da doutora (hora_inicio/hora_fim), e quantos blocos cabem
-- nela é conta de leitura, feita na fatia 2 (`sessao_horarios_livres`).
--
-- Consequência prática: ajustar a duração é `update gps.sessao_tipos set
-- duracao_min = X where id = N` — uma linha, sem migration e sem deploy.
-- Nenhuma outra tabela, default, CHECK ou comentário desta migração escreve
-- a duração como valor de regra. `sessao_agendamentos.duracao_min` é CÓPIA
-- CONGELADA do tipo no ato do agendamento (a RPC copia), com CHECK de FAIXA
-- (15..480), nunca de valor — mudar o tipo amanhã não pode reescrever o
-- passado de quem já agendou.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 ÍNDICES: o que existe e por que NÃO existe mais nada
-- ═══════════════════════════════════════════════════════════════════════════
-- §9b.1 mediu `explain (analyze, buffers)` da consulta crítica (horários de
-- uma doutora nas próximas 8 semanas), em transação revertida:
--
--   Cenário real (8 linhas):
--     Seq Scan on t_agend (cost=0.00..1.22 rows=8) (actual time=0.010..0.013 rows=8)
--       Buffers: local hit=1
--     Execution Time: 0.033 ms
--
--   Cenário 10 anos (4.160 linhas):
--     Seq Scan on t10 (cost=0.00..157.40 rows=1) (actual time=0.812..0.812 rows=0)
--       Rows Removed by Filter: 4160 · Buffers: local hit=43
--     Execution Time: 0.833 ms
--
-- 🔴 DECISÃO: **NÃO criar** `sessao_agend_responsavel_janela`. O planner
-- escolhe Seq Scan nos dois cenários e está certo — a tabela é pequena demais
-- (4 sessões/semana por doutora, §5.4) para o índice compensar. Criá-lo
-- custaria escrita em todo agendamento sem mudar o plano. Mesma conclusão já
-- medida em `etapa1_clientes(fase)` (Seq 0,686 ms × Index 0,809 ms), em
-- `cs.estagios` e na `…282`.
--
-- Os únicos índices criados aqui são os que NÃO existem para acelerar
-- leitura, e sim para IMPEDIR ESTADO INVÁLIDO (2 únicos parciais de §6.4 + a
-- exclusão de sobreposição). Esses se pagam pela correção, não pelo plano.
--
-- 🔴 Índice novo nesta feature exige `explain (analyze)` MEDIDO e colado no
-- arquivo (~/.claude/PROTOCOLO-SUSTENTABILIDADE.md). Sem plano medido,
-- reprova em otimização.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- REVERSÃO (nesta ordem)
-- ═══════════════════════════════════════════════════════════════════════════
--   drop table if exists gps.sessao_eventos;
--   drop table if exists gps.sessao_agendamentos;
--   drop table if exists gps.sessao_bloqueios;
--   drop table if exists gps.sessao_disponibilidade;
--   drop table if exists gps.sessao_tipos;
--   delete from gps.config where chave = 'sessoes_exige_confirmacao';
--   -- `btree_gist` NÃO se dropa na reversão: é extensão de cluster e outra
--   -- coisa pode passar a usá-la. Deixar instalada não custa nada.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 0) btree_gist — pré-requisito da constraint de exclusão
-- ═══════════════════════════════════════════════════════════════════════════
-- §9b.2: `pg_available_extensions` reporta versão 1.7 disponível,
-- `installed_version = null`. Sem ela, `exclude using gist` não consegue
-- comparar `responsavel_id` (uuid, operador `=`) na mesma constraint que o
-- intervalo (`&&`) — GiST só conhece `=` para tipos escalares com btree_gist.
create extension if not exists btree_gist;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) gps.sessao_tipos (§6.1) — catálogo. A ÚNICA casa da duração.
-- ═══════════════════════════════════════════════════════════════════════════
-- Por que tabela e não enum/CHECK: a duração muda (§5.3 registra que o Marcio
-- já deu três números diferentes antes de fechar em 2h30) e ele sinalizou que
-- vai mandar mais informação. Enum em CHECK exigiria migration a cada ajuste;
-- aqui é UPDATE de uma linha.
create table gps.sessao_tipos (
  id             smallint primary key,
  nome           text     not null,
  duracao_min    smallint not null check (duracao_min between 15 and 480),
  intervalo_min  smallint not null default 10 check (intervalo_min between 0 and 120),
  exige_briefing boolean  not null default true,
  ativo          boolean  not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  constraint chk_sessao_tipos_nome
    check (length(btrim(nome)) between 3 and 80)
);

comment on table gps.sessao_tipos is
  'Catalogo dos tipos de sessao com a equipe juridica (Entrevista Previa, Reuniao Preliminar). 🔴 E A UNICA CASA DA DURACAO: duracao_min vale para a grade inteira e a grade e DERIVADA na leitura, nunca gravada (PRD §5.4). Ajustar a duracao = update de UMA linha, sem migration e sem deploy. Nenhuma outra tabela, funcao ou componente pode ter a duracao escrita como valor.';

comment on column gps.sessao_tipos.duracao_min is
  'Duracao TOTAL do bloco em minutos. Decisao do Marcio (22/09/2026, D1): bloco unico de 2h30 = 30 min falando do cliente + 2h de sessao -- os 30 min NAO sao agendamento separado nem formulario, sao fase interna do mesmo compromisso (D2). O CHECK e de FAIXA (15..480), nunca de valor: travar o valor aqui transformaria o ajuste de um UPDATE em uma migration.';

comment on column gps.sessao_tipos.intervalo_min is
  'Folga entre sessoes consecutivas, em minutos (Cristiane pediu 10). Consumido pela derivacao da grade na fatia 2 -- nao e gravado em agendamento nenhum.';

comment on column gps.sessao_tipos.exige_briefing is
  'true = a doutora recebe o briefing consolidado do cliente antes da sessao (PRD §2). Ortogonal a RLS: QUEM ve briefing e decidido por policy (§9-ter B2); ESTE campo diz se o snapshot e montado no ato do agendamento.';

alter table gps.sessao_tipos enable row level security;

-- Leitura aberta a todo `authenticated`: o aluno precisa saber o nome e a
-- duracao do tipo para a tela de agendamento fazer sentido. Nao ha dado
-- pessoal aqui -- e catalogo.
create policy gps_sessao_tipos_select on gps.sessao_tipos
  for select to authenticated
  using (true);

create policy gps_sessao_tipos_admin on gps.sessao_tipos
  for all to authenticated
  using (public.gp_is_admin())
  with check (public.gp_is_admin());

create trigger trg_sessao_tipos_atualizado_em
  before update on gps.sessao_tipos
  for each row execute function gps.touch_atualizado_em();

-- SEED. Bloco único de 2h30 nos dois tipos (D1, §5.4). Este é o ÚNICO lugar
-- do repositório onde esse número aparece como valor.
insert into gps.sessao_tipos (id, nome, duracao_min, intervalo_min, exige_briefing) values
  (1, 'Entrevista Prévia',  150, 10, true),
  (2, 'Reunião Preliminar', 150, 10, true)
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) gps.sessao_disponibilidade (§6.2) — a regra semanal
-- ═══════════════════════════════════════════════════════════════════════════
-- Por que REGRA e não slot solto: foi pedido "horários fixos por semana"
-- (§5.1). O Plantão gera slot no clique com `repetirSemanas` (0-12) --
-- funciona, mas obriga o admin a reabrir a tela a cada 3 meses. Regra semanal
-- não expira; `vigencia_fim` null = vale até alguém dizer o contrário.
--
-- 🔴 A LINHA GUARDA A JANELA, NÃO OS BLOCOS. `09:30-12:00` é uma faixa; que
-- ela comporta 1 bloco de 2h30 é conta derivada na leitura, usando
-- `sessao_tipos.duracao_min`. Gravar os blocos aqui duplicaria a duração e
-- quebraria a regra de §5.4.
create table gps.sessao_disponibilidade (
  id               uuid primary key default gen_random_uuid(),
  -- auth.users, não gps.operadores: §9b.3 mediu que `gps.operadores` tem 1
  -- linha (Ana Camila) e as doutoras NÃO estão lá. A elegibilidade é
  -- conferida por `gps.eh_equipe()` na RPC de escrita (fatia 2), não por FK.
  responsavel_id   uuid not null references auth.users(id) on delete cascade,
  dia_semana       smallint not null check (dia_semana between 0 and 6),
  hora_inicio      time not null,
  hora_fim         time not null,
  -- null = a janela serve para qualquer tipo de sessão.
  tipo_id          smallint references gps.sessao_tipos(id) on delete restrict,
  vigencia_inicio  date not null default current_date,
  vigencia_fim     date,
  ativo            boolean not null default true,
  criado_por       uuid references auth.users(id) on delete set null,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  constraint chk_sessao_disp_janela
    check (hora_fim > hora_inicio),
  constraint chk_sessao_disp_vigencia
    check (vigencia_fim is null or vigencia_fim >= vigencia_inicio)
);

comment on table gps.sessao_disponibilidade is
  'Grade SEMANAL declarada pela propria doutora (decisao do Marcio 22/09/2026 que revogou a remocao de 10/08: "agora a disponibilidade parte delas"). Uma linha = uma FAIXA de um dia da semana, nao um horario de sessao. Quantos blocos cabem na faixa e DERIVADO na leitura a partir de gps.sessao_tipos.duracao_min -- nunca gravado (PRD §5.4). O almoco nao e linha: e o VAO entre a faixa da manha e a da tarde.';

comment on column gps.sessao_disponibilidade.responsavel_id is
  'auth.users da doutora. NAO aponta para gps.operadores: medido em 22/09 (PRD §9b.3), operadores tem 1 linha (Ana Camila) e as doutoras nao estao la. 🔴 O vinculo das doutoras e pelo dominio @advmais.com (cristiane@advmais.com admin, elaine@advmais.com dev), NUNCA pelo primeiro nome -- ha dezenas de alunas Elaine/Cristiane em auth.users e casar por nome pegaria aluna. A elegibilidade (so equipe publica grade) e conferida por gps.eh_equipe() na RPC de escrita da fatia 2.';

comment on column gps.sessao_disponibilidade.dia_semana is
  '0=domingo .. 6=sabado, mesma convencao de extract(dow). Cristiane: 3 (quarta) e 5 (sexta).';

comment on column gps.sessao_disponibilidade.tipo_id is
  'null = faixa vale para qualquer tipo de sessao. O seed da Cristiane nasce null: ela atende os dois tipos nas mesmas faixas. Preencher restringe a faixa a um tipo so, sem migration.';

comment on column gps.sessao_disponibilidade.vigencia_fim is
  'null = sem prazo. E o que faz a regra semanal NAO expirar -- diferente do Plantao, onde o admin tem de reabrir a tela a cada 3 meses para repetir slots.';

-- Leitura por aluno: para montar a tela ele precisa saber quais faixas
-- existem. Não há dado pessoal na grade (é o horário de trabalho publicado).
alter table gps.sessao_disponibilidade enable row level security;

create policy gps_sessao_disp_select on gps.sessao_disponibilidade
  for select to authenticated
  using (true);

create policy gps_sessao_disp_admin on gps.sessao_disponibilidade
  for all to authenticated
  using (public.gp_is_admin())
  with check (public.gp_is_admin());

create trigger trg_sessao_disp_atualizado_em
  before update on gps.sessao_disponibilidade
  for each row execute function gps.touch_atualizado_em();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) gps.sessao_bloqueios (§6.3) — as exceções
-- ═══════════════════════════════════════════════════════════════════════════
-- Sem isto a regra semanal não tem como ser furada e a doutora aparece
-- disponível no Natal.
create table gps.sessao_bloqueios (
  id             uuid primary key default gen_random_uuid(),
  responsavel_id uuid not null references auth.users(id) on delete cascade,
  inicio         timestamptz not null,
  fim            timestamptz not null,
  motivo         text not null,
  criado_por     uuid references auth.users(id) on delete set null,
  criado_em      timestamptz not null default now(),
  constraint chk_sessao_bloqueios_intervalo
    check (fim > inicio),
  constraint chk_sessao_bloqueios_motivo
    check (length(btrim(motivo)) between 3 and 300)
);

comment on table gps.sessao_bloqueios is
  'Excecoes a grade semanal: feriado, ferias, imprevisto. Instante absoluto (timestamptz), nao data+hora local, porque o bloqueio e comparado contra sessao_agendamentos.inicio_em, que tambem e timestamptz. Sem esta tabela a doutora apareceria disponivel no Natal.';

comment on column gps.sessao_bloqueios.motivo is
  'Obrigatorio, 3..300 caracteres depois de btrim -- mesmo teto do motivo de cancelamento e da Central de resolucao. Bloqueio sem motivo vira misterio quando alguem pergunta por que nao havia horario naquela semana.';

alter table gps.sessao_bloqueios enable row level security;

-- Leitura por aluno: a tela precisa descontar o bloqueio da grade. O motivo é
-- da equipe, mas não é dado pessoal de terceiro — e esconder o bloqueio faria
-- a tela oferecer horário que a RPC recusaria.
create policy gps_sessao_bloqueios_select on gps.sessao_bloqueios
  for select to authenticated
  using (true);

create policy gps_sessao_bloqueios_admin on gps.sessao_bloqueios
  for all to authenticated
  using (public.gp_is_admin())
  with check (public.gp_is_admin());

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) gps.sessao_agendamentos (§6.4) — o compromisso
-- ═══════════════════════════════════════════════════════════════════════════
create table gps.sessao_agendamentos (
  id                uuid primary key default gen_random_uuid(),
  tipo_id           smallint not null references gps.sessao_tipos(id) on delete restrict,
  responsavel_id    uuid not null references auth.users(id) on delete restrict,
  -- O AMBIENTE. Mesma chave de gps.etapa1_clientes.aluno_id e do que
  -- gps.aluno_atual() devolve: public.thb_alunos(id). (O PRD §6.4 escreve
  -- "→ gps.membros (ambiente)"; no banco o ambiente é identificado por
  -- thb_alunos.id, que é o que `gps.membros.aluno_id` guarda. Apontar para
  -- `gps.membros.id` amarraria o agendamento a UMA PESSOA do ambiente e o
  -- perderia na troca de titular.)
  aluno_id          uuid not null references public.thb_alunos(id) on delete cascade,
  cliente_id        uuid not null references gps.etapa1_clientes(id) on delete restrict,
  data              date not null,
  hora_inicio       time not null,
  -- 🔴 Coluna GERADA, igual a gps.plantao_slots.inicio_em. TODA comparação
  -- com now() usa esta coluna, nunca `data` isolada -- que mentiria o prazo
  -- entre 21h e meia-noite (servidor em UTC). Lição já paga neste projeto.
  inicio_em         timestamptz generated always as
                      ((data + hora_inicio) at time zone 'America/Sao_Paulo') stored,
  -- 🔴 Fim do bloco, GERADO. A soma acontece no `timestamp` LOCAL e só depois
  -- converte para timestamptz -- a ordem importa e foi medida:
  --   `timestamptz + interval` é STABLE (depende de TimeZone da sessão)
  --   `timestamp   + interval` é IMMUTABLE
  -- Expressão de índice exige IMMUTABLE, então somar DEPOIS do `at time zone`
  -- levanta 42P17 e a constraint de exclusão abaixo não chega a ser criada.
  -- Medido em 22/09/2026 contra o banco, em transação revertida.
  fim_em            timestamptz generated always as
                      (((data + hora_inicio) + make_interval(mins => duracao_min))
                        at time zone 'America/Sao_Paulo') stored,
  -- CÓPIA CONGELADA de sessao_tipos.duracao_min no ato do agendamento (a RPC
  -- da fatia 2 copia). CHECK de FAIXA, nunca de valor: mudar o tipo amanhã
  -- não pode reescrever o passado de quem já agendou.
  duracao_min       smallint not null check (duracao_min between 15 and 480),
  estado            text not null default 'agendado',
  link_reuniao      text,
  briefing_snapshot jsonb,
  cancelado_em      timestamptz,
  cancelado_por     uuid references auth.users(id) on delete set null,
  cancelado_motivo  text,
  criado_por        uuid references auth.users(id) on delete set null,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  constraint chk_sessao_agend_estado
    check (estado in ('agendado', 'realizado', 'cancelado', 'falta')),
  -- Coerência cancelamento <-> estado, SEM subquery (0A000): as duas juntas
  -- dizem "cancelado tem motivo e carimbo; nenhum outro estado tem". A
  -- comparação contra now() NÃO cabe em CHECK (não é IMMUTABLE) -- o prazo de
  -- 24h do aluno (§9 D7) é validado na RPC da fatia 2, com 22023.
  constraint chk_sessao_agend_cancelado_tem_motivo
    check (estado <> 'cancelado'
           or (cancelado_em is not null
               and length(btrim(coalesce(cancelado_motivo, ''))) between 3 and 300)),
  constraint chk_sessao_agend_so_cancelado_tem_carimbo
    check (estado = 'cancelado'
           or (cancelado_em is null and cancelado_motivo is null)),
  constraint chk_sessao_agend_link
    check (link_reuniao is null or link_reuniao ~ '^https://')
);

comment on table gps.sessao_agendamentos is
  'O compromisso: 1 aluno, 1 cliente, 1 doutora, 1 bloco. Diferente do Plantao (mentoria coletiva, sem capacidade), aqui e 1 aluno por horario -- por isso os dois indices unicos parciais e a constraint de exclusao abaixo. Duracao e COPIA CONGELADA de gps.sessao_tipos no ato do agendamento; a grade de horarios oferecidos e DERIVADA na leitura, nunca gravada (PRD §5.4).';

comment on column gps.sessao_agendamentos.inicio_em is
  'Instante absoluto do inicio, derivado de (data + hora_inicio) no fuso America/Sao_Paulo -- mesmo padrao de gps.plantao_slots.inicio_em. 🔴 TODA comparacao com now() (janela de cancelamento, "proximas sessoes", e-mail de 24h/1h antes) usa esta coluna. NUNCA comparar `data` isolada com now(): o servidor roda em UTC e o prazo mentiria das 21h a meia-noite. Coluna GERADA -- nao aceita valor no insert.';

comment on column gps.sessao_agendamentos.duracao_min is
  'Copia CONGELADA de gps.sessao_tipos.duracao_min no ato do agendamento. CHECK e de FAIXA (15..480), NUNCA de valor: a duracao vigente vive so em sessao_tipos (PRD §5.4) e mudar o tipo amanha nao pode reescrever o compromisso de quem ja agendou. E tambem o que a constraint de exclusao usa para montar o intervalo ocupado.';

comment on column gps.sessao_agendamentos.aluno_id is
  'O AMBIENTE (public.thb_alunos.id) -- a mesma chave de gps.etapa1_clientes.aluno_id e o que gps.aluno_atual() devolve. Titular e socio do mesmo ambiente veem o mesmo agendamento, e trocar o titular nao perde a sessao. Apontar para gps.membros.id amarraria o compromisso a uma PESSOA.';

comment on column gps.sessao_agendamentos.briefing_snapshot is
  'Briefing CONGELADO no ato do agendamento (PRD §6.5). As 5 fontes (etapa1_clientes, onboarding_respostas, entrevista_tentativas, cliente_decisores, cliente_minutas) continuam mudando depois; montar por JOIN ao vivo faria a doutora abrir 10 min antes e ver algo diferente do que foi agendado. 🔴 LGPD: carrega dado pessoal de cliente de terceiro -- por isso a policy de SELECT da doutora exige responsavel_id = auth.uid() (§9-ter B2), esta coluna fica FORA do grant de coluna de authenticated, e o e-mail leva so data/hora/nome/link, NUNCA o briefing (§7.3).';

comment on column gps.sessao_agendamentos.estado is
  'agendado | realizado | cancelado | falta. `falta` e marcada pela doutora DEPOIS do horario (§9 D7). O prazo de cancelamento do aluno (ate 24h antes) e validado na RPC, nao aqui: CHECK nao compara contra now().';

comment on column gps.sessao_agendamentos.link_reuniao is
  'Link da sala (https obrigatorio pelo CHECK). Visivel ao aluno de proposito -- e o que ele precisa para entrar. Geracao automatica de Meet/Google Calendar esta FORA de escopo na v1 (PRD §8): a equipe cola o link.';

-- ── As 2 travas de índice único parcial (§6.4) ────────────────────────────
-- Estes índices NÃO existem para acelerar leitura (§9b.1 mediu Seq Scan e
-- decidiu não criar índice de leitura). Existem para IMPEDIR ESTADO INVÁLIDO
-- de forma ATÔMICA -- que é o que a checagem lógica em transação não faz.
-- 🔴 Copiada a versão NOVA da trava anti-corrida (migrações …278/…279, de
-- 17/09), nunca a antiga: a versão anterior do teto do Plantão era só
-- checagem lógica e tinha corrida entre dois cliques simultâneos. A RPC da
-- fatia 2 trata a 23505 e devolve a frase em português.

create unique index sessao_slot_unico
  on gps.sessao_agendamentos (responsavel_id, inicio_em)
  where estado in ('agendado', 'realizado');

comment on index gps.sessao_slot_unico is
  'Uma sessao por doutora por horario de INICIO. Parcial: cancelado/falta liberam o horario. 🔴 NAO cobre sobreposicao parcial -- ver a constraint sessao_sem_sobreposicao. Trava ATOMICA (23505); a mensagem legivel vem da RPC gps.sessao_agendar (fatia 2), no molde da …279.';

create unique index sessao_aluno_tipo_viva
  on gps.sessao_agendamentos (aluno_id, tipo_id)
  where estado = 'agendado';

comment on index gps.sessao_aluno_tipo_viva is
  'Uma sessao VIVA por ambiente por tipo. Parcial em estado=agendado: realizada/cancelada/falta nao contam, entao o aluno pode agendar a Reuniao Preliminar depois de realizar a Entrevista Previa, e remarcar depois de cancelar. E POR TIPO de proposito (PRD §9 D3, premissa "alternativas independentes"): nao trava a 2a antes da 1a. Trava ATOMICA (23505).';

-- ── A trava de SOBREPOSIÇÃO PARCIAL ──────────────────────────────────────
-- 🔴 §6.4 alerta: índice único NÃO impede sobreposição parcial. 14h00 e
-- 15h00, com blocos de 2h30, são `inicio_em` DISTINTOS -- os dois passam em
-- `sessao_slot_unico` -- mas a segunda invade a primeira. A doutora ficaria
-- com dois compromissos ao mesmo tempo, e o banco diria que está tudo bem.
--
-- A checagem por intervalo dentro da RPC (sob `for update`) continua sendo
-- feita na fatia 2, para a mensagem ser legível; mas ela NÃO serializa
-- sozinha entre transações concorrentes em horários diferentes. Quem recusa
-- de fato é esta constraint -- mesma lição da …279, onde a checagem lógica
-- passava e o índice único é que barrava.
--
-- O intervalo é [início, início + duração) -- `'[)'` fecha no início e abre
-- no fim, então 09:30-12:00 e 12:00-14:30 NÃO colidem (encostam). O
-- `intervalo_min` da folga não entra aqui de propósito: folga é conforto de
-- agenda (derivado na oferta de horários), não invalidade de dado -- travar
-- a folga no banco impediria a equipe de encaixar uma sessão colada, que é
-- decisão dela.
--
-- Usa as DUAS colunas geradas (inicio_em, fim_em), não uma soma inline.
-- 🔴 Por quê: `tstzrange(inicio_em, inicio_em + make_interval(...))` levanta
-- 42P17 "functions in index expression must be marked IMMUTABLE". A causa não
-- é o make_interval (que é IMMUTABLE, provolatile='i'): é o operador
-- `timestamptz + interval`, STABLE porque depende do TimeZone da sessão. O
-- irmão `timestamp + interval` é IMMUTABLE -- por isso fim_em soma no
-- timestamp local ANTES do `at time zone`.
-- Medido contra o banco em 22/09/2026 (pg_operator/pg_proc + prova em
-- transação revertida). `make_interval(mins => <smallint>)` resolve a
-- sobrecarga integer sem cast explícito -- também confirmado na prova.
alter table gps.sessao_agendamentos
  add constraint sessao_sem_sobreposicao
  exclude using gist (
    responsavel_id with =,
    tstzrange(inicio_em, fim_em, '[)') with &&
  )
  where (estado in ('agendado', 'realizado'));

comment on constraint sessao_sem_sobreposicao on gps.sessao_agendamentos is
  '🔴 Impede que duas sessoes da MESMA doutora se invadam no tempo. Indice unico NAO cobre isto: 14h e 15h com blocos de 2h30 tem inicio_em distintos, passam no unico e se sobrepoem (PRD §6.4). Usa btree_gist (uuid com =) + tstzrange [inicio, inicio+duracao) com &&. Parcial em agendado/realizado: cancelado e falta liberam o tempo. Intervalo semiaberto de proposito -- 09:30-12:00 e 12:00-14:30 encostam, nao colidem. A folga (intervalo_min) NAO entra: e conforto de agenda, derivado na oferta de horarios, nao invalidade de dado. Violacao levanta 23P01 (exclusion_violation), tratada pela RPC da fatia 2.';

alter table gps.sessao_agendamentos enable row level security;

-- ── RLS (§9-ter B2) — a tabela de 4 papéis ────────────────────────────────
--   Aluno (titular/sócio)  → sessões do próprio ambiente        · SEM briefing
--   Doutora                → SÓ onde responsavel_id = auth.uid() · COM briefing
--   Admin (gp_is_admin())  → todas                               · COM briefing
--   anon                   → NADA, e nenhum grant
--
-- 🔴 "Sem briefing" NÃO é entregue por policy: RLS decide LINHAS, não
-- colunas. Quem tira `briefing_snapshot` do alcance do aluno é o GRANT DE
-- COLUNA da seção 6. Sem ele, o aluno pediria `?select=briefing_snapshot` ao
-- PostgREST e a policy de linha deixaria passar -- o briefing é do CLIENTE
-- dele, mas carrega o que a EQUIPE consolidou (entrevista, decisores,
-- observações), que não é tela do aluno.
--
-- 🔴 Doutora sem sessão marcada NÃO lê o caso do cliente de outra: a policy
-- é `responsavel_id = auth.uid()`, não `gps.eh_equipe()`. Briefing carrega
-- dado pessoal de cliente de terceiro.

create policy gps_sessao_agend_aluno_select on gps.sessao_agendamentos
  for select to authenticated
  using (aluno_id = gps.aluno_atual());

comment on policy gps_sessao_agend_aluno_select on gps.sessao_agendamentos is
  'Aluno (titular ou socio) le as sessoes do PROPRIO ambiente. gps.aluno_atual() devolve o aluno_id do membro logado -- a mesma funcao que as policies de etapa1_clientes usam. O briefing NAO vem junto: e bloqueado por GRANT DE COLUNA (§9-ter B2), porque RLS decide linha, nao coluna.';

create policy gps_sessao_agend_responsavel_select on gps.sessao_agendamentos
  for select to authenticated
  using (responsavel_id = auth.uid());

comment on policy gps_sessao_agend_responsavel_select on gps.sessao_agendamentos is
  'Piso de leitura para quem RESPONDE pela sessao: responsavel_id = auth.uid(). NAO usa gps.eh_equipe() -- operador da esteira nao le sessao nenhuma.

🔴 ATENCAO AO EFEITO REAL (medido no banco em 22/09, nao deduzido): esta policy e HOJE letra morta para as duas doutoras. cristiane@advmais.com tem cargo "admin" e elaine@advmais.com tem cargo "dev" em public.perfis -- as duas dao gp_is_admin() = true e entram pela policy gps_sessao_agend_admin, que devolve TODAS as sessoes e TODOS os briefings.

O PRD §9-ter B2 dizia "doutora ve SO as proprias". 🔴 REVOGADO pelo Marcio em 22/09/2026: "as dras podem ver os atendimento uma das outras". Fica como esta -- custo zero, nenhuma linha muda, e e coerente com o fato de que como admins elas ja leem gps.dossie_do_cliente de qualquer cliente.

Esta policy continua existindo e NAO e decorativa: no dia em que entrar uma responsavel que NAO seja admin/dev em perfis, ela cai aqui e ve so as proprias sessoes -- sem migration, sem deploy. E o piso que sustenta o caso futuro.';

create policy gps_sessao_agend_admin on gps.sessao_agendamentos
  for all to authenticated
  using (public.gp_is_admin())
  with check (public.gp_is_admin());

create trigger trg_sessao_agend_atualizado_em
  before update on gps.sessao_agendamentos
  for each row execute function gps.touch_atualizado_em();

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) gps.sessao_eventos (§6.6) — trilha append-only
-- ═══════════════════════════════════════════════════════════════════════════
-- Espelha gps.aluno_eventos: é o que permite responder "quem cancelou e
-- quando". Append-only DE VERDADE: uma policy de SELECT, nenhuma de
-- insert/update/delete -- a única escrita é pelas RPCs SECURITY DEFINER da
-- fatia 2, que rodam como owner e não dependem de grant.
create table gps.sessao_eventos (
  id             bigserial primary key,
  agendamento_id uuid references gps.sessao_agendamentos(id) on delete set null,
  acao           text not null,
  ator_id        uuid references auth.users(id) on delete set null,
  detalhe        jsonb,
  criado_em      timestamptz not null default now(),
  constraint chk_sessao_eventos_acao
    check (length(btrim(acao)) between 3 and 60)
);

comment on table gps.sessao_eventos is
  'Trilha append-only das sessoes (agendada, cancelada, remarcada, falta, briefing gerado). Espelha gps.aluno_eventos. 🔴 Sem policy de insert/update/delete: a unica escrita sao as RPCs SECURITY DEFINER da fatia 2. `on delete set null` no agendamento_id: apagar um agendamento nao pode apagar a prova de que ele existiu -- a trilha sobrevive ao fato.';

comment on column gps.sessao_eventos.acao is
  'Texto livre com teto 3..60, NAO catalogo fechado por CHECK: acrescentar uma acao nova nesta trilha viraria migration, e a …260 ja mostrou o custo disso (o CHECK de acessos_log.acao precisa ser lido com pg_get_constraintdef e reescrito inteiro a cada valor novo). O catalogo vive na fatia 2, onde as RPCs escrevem.';

comment on column gps.sessao_eventos.detalhe is
  '🔴 LGPD: NUNCA gravar aqui o briefing nem trecho de descricao_caso/observacoes. So identificadores e o delta (de/para de estado, motivo do cancelamento ja limitado a 300).';

-- Sem índice: a trilha é lida por agendamento (poucas linhas por
-- agendamento, e 4 sessões/semana por doutora) e o volume nasce em ordem de
-- criado_em, que é a ordem da PK bigserial. Criar índice agora seria escrita
-- em toda ação sem plano medido que o justifique (§9b.1 / protocolo).
alter table gps.sessao_eventos enable row level security;

create policy gps_sessao_eventos_select on gps.sessao_eventos
  for select to authenticated
  using (
    public.gp_is_admin()
    or exists (
      select 1 from gps.sessao_agendamentos a
       where a.id = gps.sessao_eventos.agendamento_id
         and a.responsavel_id = auth.uid()
    )
  );

comment on policy gps_sessao_eventos_select on gps.sessao_eventos is
  'Admin le tudo; doutora le a trilha das PROPRIAS sessoes (mesmo recorte da policy de agendamentos, §9-ter B2). O ALUNO NAO LE a trilha: ela registra acao da equipe (quem cancelou, por que, quando marcou falta) e e material de auditoria interna, nao tela de aluno. O que o aluno precisa saber do proprio agendamento esta na propria linha de sessao_agendamentos.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 6) GRANTS
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 TRÊS lições deste projeto, todas aplicadas aqui:
--
-- (a) `grant select` NÃO revoga escrita. O schema `gps` tem ALTER DEFAULT
--     PRIVILEGES concedendo DELETE/INSERT/SELECT/UPDATE a `authenticated` em
--     TODA TABELA NOVA -- prova: `gps.etapa1_clientes` dá os quatro. Tabela
--     nova NASCE GRAVÁVEL. Foi o achado do pentester em 16/09 sobre
--     `gps.entrevista_tentativas` (…266). Por isso: `revoke all` primeiro,
--     inclusive de `authenticated`, e só então o grant mínimo.
--
-- (b) `revoke from anon` não pega quando a permissão vem de `PUBLIC`. Por
--     isso o revoke nomeia `public` explicitamente, além de `anon`.
--
-- (c) `anon` não recebe GRANT nenhum nestas 5 tabelas. Não há rota pública
--     nesta feature -- o aluno é logado (§4.1), diferente do Plantão.

revoke all on gps.sessao_tipos            from public, anon, authenticated;
revoke all on gps.sessao_disponibilidade  from public, anon, authenticated;
revoke all on gps.sessao_bloqueios        from public, anon, authenticated;
revoke all on gps.sessao_agendamentos     from public, anon, authenticated;
revoke all on gps.sessao_eventos          from public, anon, authenticated;
revoke all on sequence gps.sessao_eventos_id_seq from public, anon, authenticated;

-- Leitura. Escrita NENHUMA para `authenticated`: toda escrita passa pelas
-- RPCs SECURITY DEFINER da fatia 2, que rodam como owner.
grant select on gps.sessao_tipos           to authenticated;
grant select on gps.sessao_disponibilidade to authenticated;
grant select on gps.sessao_bloqueios       to authenticated;
grant select on gps.sessao_eventos         to authenticated;

-- 🔴 GRANT DE COLUNA em sessao_agendamentos: é assim que "o aluno vê a
-- sessão mas NÃO vê o briefing" (§9-ter B2) vira realidade. RLS decide
-- LINHA; coluna é grant. `briefing_snapshot` fica DE FORA da lista --
-- portanto fora do alcance do PostgREST para `authenticated`, inclusive para
-- a doutora e para o admin por SELECT direto.
--
-- A doutora e o admin leem o briefing pela RPC SECURITY DEFINER da fatia 2,
-- que aplica o recorte de §9-ter B2 e deixa trilha -- mesmo padrão de
-- `gps.dossie_do_cliente` (…264), onde a trilha É a guarda em leitura de dado
-- pessoal. Dar a coluna a `authenticated` aqui deixaria a defesa por conta só
-- da RLS de linha; o padrão deste projeto é não depender de camada única.
--
-- Precedente no repo: `gps.membros` já usa grant por coluna
-- (`grant update (perfil, atualizado_em)`), e o baseline registra que é
-- assim que se impede escrita/leitura de coluna sensível pelo PostgREST.
grant select (
  id, tipo_id, responsavel_id, aluno_id, cliente_id,
  data, hora_inicio, inicio_em, fim_em, duracao_min, estado, link_reuniao,
  cancelado_em, cancelado_por, cancelado_motivo,
  criado_por, criado_em, atualizado_em
) on gps.sessao_agendamentos to authenticated;

-- service_role: mesmo tratamento do Plantão. Não dispensa GRANT explícito.
grant select, insert, update, delete on
  gps.sessao_tipos,
  gps.sessao_disponibilidade,
  gps.sessao_bloqueios,
  gps.sessao_agendamentos,
  gps.sessao_eventos
to service_role;

grant usage on sequence gps.sessao_eventos_id_seq to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7) SEED da grade da Dra. Cristiane (§5.4) — É DADO, NÃO CÓDIGO
-- ═══════════════════════════════════════════════════════════════════════════
-- Quartas (3) e sextas (5), 2 faixas por dia:
--   09:30 – 12:00   faixa da manhã  → comporta 1 bloco (sessão 1)
--   12:30 – 14:00   ALMOÇO          → NÃO é linha, é o VÃO entre as faixas
--   14:00 – 16:30   faixa da tarde  → comporta 1 bloco (sessão 2)
--
-- ⚠️ O slot das 17h NÃO EXISTE. O Marcio disse "17h liberado", mas 17h mais o
-- bloco terminaria às 19h30, estourando a janela declarada (9h30-17h).
-- Premissa registrada em §5.4: não criar. Reversível POR DADO se ele aceitar
-- terminar mais tarde -- bastaria esticar `hora_fim` da faixa da tarde.
--
-- Resultado: 2 sessões/dia × 2 dias = 4 por semana com a Cristiane.
--
-- 🔴 O e-mail é resolvido POR DOMÍNIO (@advmais.com), NUNCA por primeiro
-- nome: §9b.3 alerta que há DEZENAS de alunas chamadas Cristiane em
-- auth.users, e casar por nome pegaria aluna.
--
-- 🔴 Se o login não existir, a migração NÃO aborta e NÃO inventa linha: ela
-- avisa e segue. A feature entra no ar com a grade vazia (a tela diz a
-- verdade: "a equipe não tem horário nas próximas N semanas", §7.1) e a
-- grade entra depois por INSERT, sem deploy.
--
-- ⏳ Dra. Elaine (elaine@advmais.com) NÃO entra agora: D8 é PENDENTE e é
-- DADO, não código. Ela entra depois com INSERTs idênticos aos de baixo,
-- trocando só o e-mail e as faixas -- sem migration e sem deploy. Modelo:
--
--   insert into gps.sessao_disponibilidade
--     (responsavel_id, dia_semana, hora_inicio, hora_fim, tipo_id)
--   select u.id, d.dia, d.ini, d.fim, null::smallint
--     from auth.users u
--    cross join (values (2::smallint, time '09:30', time '12:00'),
--                       (4::smallint, time '14:00', time '16:30')) as d(dia, ini, fim)
--    where lower(btrim(u.email)) = 'elaine@advmais.com';
--
-- Com ela, 8 sessões/semana. Havendo 34 alunos elegíveis (§9-ter B3), a fila
-- é estrutural -- a tela precisa dizer a verdade quando não houver horário.
do $$
declare
  v_user uuid;
  v_inseridas int;
begin
  select u.id into v_user
    from auth.users u
   where lower(btrim(u.email)) = 'cristiane@advmais.com'
   limit 1;

  if v_user is null then
    raise warning 'Seed da grade da Dra. Cristiane NAO aplicado: nao existe auth.users com e-mail cristiane@advmais.com. A feature sobe com a grade VAZIA (a tela diz que nao ha horario) e a grade entra depois por INSERT em gps.sessao_disponibilidade, sem deploy. 🔴 NAO casar por primeiro nome para contornar: ha dezenas de alunas Cristiane em auth.users (PRD §9b.3).';
    return;
  end if;

  -- tipo_id null: as faixas valem para os DOIS tipos de sessão.
  insert into gps.sessao_disponibilidade
    (responsavel_id, dia_semana, hora_inicio, hora_fim, tipo_id)
  select v_user, d.dia, d.ini, d.fim, null::smallint
    from (values
      -- quarta
      (3::smallint, time '09:30', time '12:00'),
      (3::smallint, time '14:00', time '16:30'),
      -- sexta
      (5::smallint, time '09:30', time '12:00'),
      (5::smallint, time '14:00', time '16:30')
    ) as d(dia, ini, fim)
   where not exists (
     select 1 from gps.sessao_disponibilidade s
      where s.responsavel_id = v_user
        and s.dia_semana  = d.dia
        and s.hora_inicio = d.ini
        and s.hora_fim    = d.fim
   );

  get diagnostics v_inseridas = row_count;
  raise notice 'Seed da grade da Dra. Cristiane: % faixa(s) inserida(s) (esperado 4 na primeira aplicacao, 0 se reaplicada).', v_inseridas;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8) gps.config.sessoes_exige_confirmacao (§9-ter B3) — nasce `false`
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 A recomendação original ("só quem tem favorito CONFIRMADO pela equipe")
-- foi MEDIDA em 22/09 e daria ZERO alunos: `acompanhamento_confirmado_em`
-- nunca foi preenchida -- o ritual existe no schema e não acontece na
-- operação. Uma tela que recusa 100% carrega sem erro nenhum e parece certa.
--
-- Regra adotada: pode agendar quem tem cliente FAVORITADO
-- (`acompanhado_equipe = true`) e a etapa do tipo liberada por
-- `gps.etapa_liberada_para()` → 34 elegíveis para 4 slots/semana.
--
-- Quando a equipe começar a confirmar favoritos, isto vira `true` por UPDATE.
-- É DADO, não código: nenhuma migration, nenhum deploy.
--
-- ⚠️ Esta migração NÃO acrescenta a chave à allowlist de `gps.config_definir`
-- nem à `INTERRUPTORES_CONFIG` do TS: mexer naquela RPC é fora do escopo da
-- fatia 1, e acrescentar só de um lado produz interruptor que a tela oferece
-- e a RPC recusa (ou o inverso) -- exatamente o que a …260 adverte. Hoje a
-- chave se muda por UPDATE direto, como as outras 4 que o CLAUDE.md já
-- registra nessa situação.
insert into gps.config (chave, valor) values
  ('sessoes_exige_confirmacao', 'false')
on conflict (chave) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONFERÊNCIA (rodar como `postgres` depois do apply; leitura pura)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1) A duração mora em UM lugar só (esperado: 2 linhas, os dois tipos):
--    select id, nome, duracao_min, intervalo_min from gps.sessao_tipos order by id;
--
-- 2) A grade da Cristiane (esperado: 4 faixas, dias 3 e 5):
--    select d.dia_semana, d.hora_inicio, d.hora_fim, u.email
--      from gps.sessao_disponibilidade d
--      join auth.users u on u.id = d.responsavel_id
--     order by d.dia_semana, d.hora_inicio;
--
-- 3) `anon` e `PUBLIC` não têm grant nenhum (esperado: 0 linhas):
--    select table_name, grantee, privilege_type
--      from information_schema.role_table_grants
--     where table_schema = 'gps' and table_name like 'sessao%'
--       and grantee in ('anon', 'PUBLIC');
--
-- 4) `authenticated` não tem escrita (esperado: só SELECT):
--    select table_name, privilege_type
--      from information_schema.role_table_grants
--     where table_schema = 'gps' and table_name like 'sessao%'
--       and grantee = 'authenticated'
--     order by table_name, privilege_type;
--
-- 5) `briefing_snapshot` NÃO está nos grants de coluna (esperado: 0 linhas):
--    select column_name from information_schema.column_privileges
--     where table_schema = 'gps' and table_name = 'sessao_agendamentos'
--       and grantee = 'authenticated' and column_name = 'briefing_snapshot';
--
-- 6) A sobreposição é recusada de fato — em transação REVERTIDA. 🔴 Rodar
--    dentro de `begin … rollback`: `explain analyze` em INSERT/UPDATE/DELETE
--    EXECUTA o comando, e aqui há INSERT de verdade.
--
--    begin;
--      -- grava 14:00 (bloco vai até 16:30) e tenta 15:00 no mesmo dia: os
--      -- inicio_em são distintos, os dois passam em sessao_slot_unico;
--      -- sessao_sem_sobreposicao é quem recusa, com 23P01.
--      insert into gps.sessao_agendamentos
--        (tipo_id, responsavel_id, aluno_id, cliente_id, data, hora_inicio, duracao_min)
--      select 1, d.responsavel_id, c.aluno_id, c.id, current_date + 30, time '14:00',
--             t.duracao_min
--        from gps.sessao_disponibilidade d
--        cross join lateral (select * from gps.etapa1_clientes limit 1) c
--        cross join (select duracao_min from gps.sessao_tipos where id = 1) t
--       limit 1;
--
--      insert into gps.sessao_agendamentos
--        (tipo_id, responsavel_id, aluno_id, cliente_id, data, hora_inicio, duracao_min)
--      select 1, a.responsavel_id, a.aluno_id, a.cliente_id, a.data, time '15:00',
--             a.duracao_min
--        from gps.sessao_agendamentos a limit 1;
--      -- esperado: ERROR 23P01 conflicting key value violates exclusion
--      --           constraint "sessao_sem_sobreposicao"
--    rollback;
