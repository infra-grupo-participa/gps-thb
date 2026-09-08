-- Diário do aluno — Fase 2: LOG DE AÇÕES DO ALUNO.
--
-- Fase 1 (`gps.aluno_notas`, migração 20260908000001) é a voz da EQUIPE.
-- Esta tabela é a voz DO SISTEMA: micro-eventos que o próprio aluno (ou a
-- equipe, em modo assistência) dispara ao usar o portal — cadastrar cliente,
-- mudar status, concluir tarefa, entrar pela primeira vez. As duas trilhas se
-- fundem na mesma tela (`ItemTrilha`, ver `src/lib/log-agregacao.ts`).
--
-- Mesma trava LGPD da Fase 1: SÓ ADMIN VÊ. O aluno nunca vê o próprio log
-- (ver comentário completo na 20260908000001 — o motivo é dado pessoal de
-- TERCEIROS embutido em `rotulo`, ex. nome do cliente do aluno).
--
-- UMA tabela de MICRO-eventos, de propósito. "Listou 15 clientes" é uma
-- MACRO derivada por AGREGAÇÃO NA LEITURA (agrupando por aluno/tipo/dia
-- local), não um evento gravado nem um `evento_pai_id`. Gravar a macro
-- exigiria decidir o corte (fim do dia? fim da sessão?) na hora da escrita,
-- quando ainda não se sabe se o aluno vai listar mais 5 depois — a leitura é
-- o único momento em que o corte é conhecido.
--
-- Reversão: `drop table gps.aluno_eventos cascade`.
create table gps.aluno_eventos (
  id            uuid primary key default gen_random_uuid(),

  -- aluno_id do AMBIENTE (titular), igual a etapa1_clientes/progresso/
  -- aluno_notas. SEM foreign key de propósito: `public.thb_alunos` é
  -- compartilhada com o `sip` ao vivo, e um FK com restrict aqui impediria
  -- exclusão feita por outro sistema que nem sabe que este schema existe.
  aluno_id      uuid not null,

  -- Quando o evento OCORREU de fato. No backfill (migração ...04) é o
  -- `criado_em`/`concluida_em`/timestamp original da linha de origem — NUNCA
  -- `now()`, senão a trilha histórica mentiria a data de tudo que já
  -- aconteceu antes de a Fase 2 existir.
  ocorrido_em   timestamptz not null,

  tipo          text not null check (tipo in (
    'cliente_cadastrado',
    'cliente_favoritado',
    'cliente_desfavoritado',
    'cliente_status_mudou',
    'cliente_mensagem_padrao',
    'cliente_estudo_caso',
    'cliente_ligacao',
    'cliente_aderiu_reuniao',
    'cliente_reuniao_agendada',
    'cliente_excluido',
    'tarefa_concluida',
    'tarefa_reaberta',
    'conta_criada',
    'email_confirmado',
    'primeiro_acesso',
    'entrou_no_programa'
  )),

  entidade      text not null check (entidade in ('cliente', 'tarefa', 'conta')),

  -- Nulo nos marcos de conta (conta_criada, email_confirmado, primeiro_acesso,
  -- entrou_no_programa) — não há uma linha de cliente/tarefa para apontar.
  entidade_id   uuid,

  -- Nome legível JÁ RESOLVIDO NA ESCRITA (ex.: nome do cliente no momento do
  -- evento) — de propósito, para a leitura da trilha não precisar de join
  -- nem depender do estado ATUAL da linha de origem (que pode ter mudado ou
  -- sido apagada depois). É também o que viabiliza a anonimização do cliente
  -- excluído (ver trigger de DELETE na migração ...02): o rótulo grava
  -- "Cliente removido" em vez do nome, e não há como recuperar o nome depois
  -- porque ele nunca foi salvo.
  rotulo        text not null check (length(btrim(rotulo)) between 1 and 300),

  -- Mínimo de estrutura para a UI mostrar "de → para" sem re-parsear texto
  -- livre, ex. {"de":"pendente","para":"agendado"} em cliente_status_mudou.
  detalhe       jsonb,

  -- Quem agiu, em duas camadas: `ator` é o papel (a trilha mostra "você"
  -- para o aluno x "equipe" quando o admin mexeu no ambiente em nome dele —
  -- Modo Assistência) e `ator_user_id` é a pessoa exata, resolvida na
  -- LEITURA (join com auth.users/perfis/thb_alunos) — não duplicamos nome
  -- aqui porque, ao contrário do `rotulo` do cliente, a identidade de quem
  -- agiu não é dado de terceiro descartável: é auditoria.
  ator          text not null check (ator in ('aluno', 'equipe', 'sistema')),
  ator_user_id  uuid,

  -- 'app' = capturado ao vivo pela trigger (migração ...02).
  -- 'backfill' = reconstruído uma vez, na migração ...04, a partir do estado
  -- que já existia no banco antes desta tabela nascer.
  origem        text not null check (origem in ('app', 'backfill'))
);

comment on table gps.aluno_eventos is
  'Diário do aluno — Fase 2: log de MICRO-eventos que o sistema captura ao vivo (triggers) ou reconstrói por backfill. Visualização EXCLUSIVA do admin (mesma trava LGPD da gps.aluno_notas — ver 20260908000001). Macro ("Listou N clientes") é agregação em memória na leitura, SEM tabela própria. Append-only por design: nenhuma policy de insert/update/delete concedida — a única escrita é via trigger SECURITY DEFINER (migração ...02) e o backfill/job (migrações ...04/...06).';

comment on column gps.aluno_eventos.aluno_id is
  'aluno_id do AMBIENTE (titular), igual a gps.etapa1_clientes/progresso/aluno_notas. SEM foreign key de propósito: thb_alunos é compartilhada com o sip ao vivo.';

comment on column gps.aluno_eventos.ocorrido_em is
  'Quando o evento OCORREU (não quando foi gravado). No backfill é o timestamp original da linha de origem, nunca now() — ver migração ...04.';

comment on column gps.aluno_eventos.entidade_id is
  'Nulo nos marcos de conta (conta_criada, email_confirmado, primeiro_acesso, entrou_no_programa) — não existe uma linha de cliente/tarefa para apontar.';

comment on column gps.aluno_eventos.rotulo is
  'Rótulo legível já resolvido NA ESCRITA — evita join na leitura e permite anonimizar o cliente excluído ("Cliente removido") sem reter o nome de um terceiro apagado.';

comment on column gps.aluno_eventos.ator is
  'Papel de quem disparou o evento: aluno (ação própria), equipe (admin agindo no ambiente do aluno, Modo Assistência) ou sistema (backfill/job automático).';

comment on column gps.aluno_eventos.ator_user_id is
  'auth.users.id de quem agiu, resolvido na LEITURA (não duplicamos nome aqui — ao contrário do rotulo, identidade de quem agiu é auditoria, não dado de terceiro descartável). Pode ser nulo no backfill de marcos onde não há um autor identificável no auth.users.';

comment on column gps.aluno_eventos.origem is
  'app = capturado ao vivo pela trigger. backfill = reconstruído uma única vez a partir do estado que já existia no banco (migração ...04), idempotente via NOT EXISTS.';

-- ─────────────────────────────────────────────────────────────────────────
-- Índice — serve a trilha (aluno_id, janela de tempo, mais recente primeiro,
-- limit) e a agregação em memória por dia local, que reagrupa o resultado
-- já trazido por este índice (ver src/lib/data.ts e log-agregacao.ts:
-- o filtro no SQL é sempre por ocorrido_em cru, nunca por expressão de fuso).
-- ─────────────────────────────────────────────────────────────────────────
create index idx_aluno_eventos_timeline on gps.aluno_eventos (aluno_id, ocorrido_em desc);

comment on index gps.idx_aluno_eventos_timeline is
  'Serve a trilha do diário: select ... from gps.aluno_eventos where aluno_id = $1 [and ocorrido_em >= $2] order by ocorrido_em desc limit 300 (getEventosDoAluno). O filtro de dia local (America/Sao_Paulo) acontece em memória DEPOIS desta query — nunca where date(ocorrido_em at time zone ...) = $1, que não bate com este índice e vira Seq Scan.';

-- ─────────────────────────────────────────────────────────────────────────
-- RLS — só admin, e SEM NENHUMA policy de insert/update/delete.
-- A única escrita autorizada é a trigger SECURITY DEFINER (migração ...02) e
-- as funções SECURITY DEFINER de backfill/job, que rodam como owner e por
-- isso não dependem de policy nenhuma. Um `insert`/`update`/`delete` feito
-- pelo PostgREST (como o próprio usuário, invoker-rights) é negado mesmo
-- para admin — de propósito: log não se edita, nem por quem o vê.
-- ─────────────────────────────────────────────────────────────────────────
alter table gps.aluno_eventos enable row level security;

create policy gps_aluno_eventos_admin_select on gps.aluno_eventos
  for select
  using (public.gp_is_admin());

-- NENHUMA policy de insert/update/delete: sem policy, a operação é negada
-- para todo mundo (inclusive admin) via PostgREST. A escrita só acontece
-- dentro de funções SECURITY DEFINER, que ignoram RLS por rodar como owner.

grant select on gps.aluno_eventos to authenticated;
-- ZERO grant para anon.
