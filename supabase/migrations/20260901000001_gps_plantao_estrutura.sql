-- Plantão de Dúvidas — Acelera Holding — estrutura de tabelas.
--
-- ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
-- (commit b457005) e PROIBIDO de reconstruir. As tabelas `gps.reuniao_*`
-- ficam órfãs e intocadas — esta migration não as toca.
--
-- Identidade PRÓPRIA do plantão, ISOLADA de `auth.users`: nenhuma tabela
-- aqui referencia `auth.users`. RLS habilitada em todas; policy de admin via
-- `public.gp_is_admin()`; ZERO policy para `anon`; ZERO grant de tabela para
-- `anon` — todo acesso público passa pelas funções SECURITY DEFINER da
-- migration `gps_plantao_funcoes`.

-- ─────────────────────────────────────────────────────────────────────────
-- plantao_mentoras
-- ─────────────────────────────────────────────────────────────────────────
create table gps.plantao_mentoras (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text,
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);

comment on table gps.plantao_mentoras is
  'Mentoras do Plantão de Dúvidas (Acelera Holding). Poucas linhas — Seq Scan é a escolha correta do planner, sem índice além da PK.';

alter table gps.plantao_mentoras enable row level security;

create policy gps_plantao_mentoras_admin on gps.plantao_mentoras
  for all
  using (public.gp_is_admin())
  with check (public.gp_is_admin());

insert into gps.plantao_mentoras (nome) values
  ('Isabela'),
  ('Elaine'),
  ('Cristiane');

-- ─────────────────────────────────────────────────────────────────────────
-- plantao_slots
-- ─────────────────────────────────────────────────────────────────────────
create table gps.plantao_slots (
  id uuid primary key default gen_random_uuid(),
  mentora_id uuid not null references gps.plantao_mentoras(id) on delete restrict,
  data date not null,
  hora_inicio time not null,
  duracao_min integer not null default 60
    check (duracao_min between 15 and 480),
  zoom_url text,
  publicado boolean not null default false,
  gravacao_url text,
  observacao text,
  -- TODA comparação com now() usa esta coluna, nunca `data` isolada — é o
  -- que evita a lição "hojeISO é UTC e mente o prazo das 21h à meia-noite".
  inicio_em timestamptz generated always as
    ((data + hora_inicio) at time zone 'America/Sao_Paulo') stored,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (mentora_id, data, hora_inicio)
);

comment on column gps.plantao_slots.inicio_em is
  'Instante absoluto do início, derivado de (data + hora_inicio) no fuso America/Sao_Paulo. Toda comparação com now() (janela do Zoom, encerramento, calendário) usa esta coluna — nunca comparar `data` isolada com now(), que mentiria o prazo entre 21h e meia-noite (fuso UTC do servidor).';

comment on table gps.plantao_slots is
  'Horários do plantão. SEM coluna capacidade — decisão do Marcio: não há limite de vagas, não há "vagas restantes".';

create index idx_plantao_slots_agenda
  on gps.plantao_slots (inicio_em)
  where publicado;

comment on index gps.idx_plantao_slots_agenda is
  'Serve o calendário mensal: `where publicado and inicio_em >= $1 and inicio_em < $2 order by inicio_em`. Índice parcial correto porque a query SEMPRE filtra por `publicado` (aluno nunca vê rascunho).';

alter table gps.plantao_slots enable row level security;

create policy gps_plantao_slots_admin on gps.plantao_slots
  for all
  using (public.gp_is_admin())
  with check (public.gp_is_admin());

create trigger trg_plantao_slots_atualizado_em
  before update on gps.plantao_slots
  for each row execute function gps.touch_atualizado_em();

-- ─────────────────────────────────────────────────────────────────────────
-- plantao_alunos
-- ─────────────────────────────────────────────────────────────────────────
create table gps.plantao_alunos (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  nome text not null,
  documento text,
  telefone text,
  origem text not null default 'acelera_csv',
  lote text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (email)
);

comment on table gps.plantao_alunos is
  'Identidade dos alunos do plantão, ISOLADA de `auth.users` e de `thb_alunos` — nenhum fluxo público deste módulo escreve em `auth.users`. E-mail gravado JÁ normalizado (lower/trim) pela camada de aplicação; o unique é sobre a coluna crua — a query de login é `where email = $1`, coluna nua, sem função em volta.';

alter table gps.plantao_alunos enable row level security;

create policy gps_plantao_alunos_admin on gps.plantao_alunos
  for all
  using (public.gp_is_admin())
  with check (public.gp_is_admin());

create trigger trg_plantao_alunos_atualizado_em
  before update on gps.plantao_alunos
  for each row execute function gps.touch_atualizado_em();

-- ─────────────────────────────────────────────────────────────────────────
-- plantao_acessos
-- ─────────────────────────────────────────────────────────────────────────
create table gps.plantao_acessos (
  aluno_plantao_id uuid primary key
    references gps.plantao_alunos(id) on delete cascade,
  senha_hash text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  ultimo_login_em timestamptz,
  falhas smallint not null default 0,
  bloqueado_ate timestamptz
);

comment on table gps.plantao_acessos is
  'Credencial do plantão (bcrypt via extensions.crypt). Credencial não expira; revogação manual pelo admin (revogarAcessoPlantao). 5 falhas seguidas → bloqueado_ate = now() + 15 min.';

alter table gps.plantao_acessos enable row level security;

create policy gps_plantao_acessos_admin on gps.plantao_acessos
  for all
  using (public.gp_is_admin())
  with check (public.gp_is_admin());

create trigger trg_plantao_acessos_atualizado_em
  before update on gps.plantao_acessos
  for each row execute function gps.touch_atualizado_em();

-- ─────────────────────────────────────────────────────────────────────────
-- plantao_sessoes
-- ─────────────────────────────────────────────────────────────────────────
create table gps.plantao_sessoes (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  aluno_plantao_id uuid not null
    references gps.plantao_alunos(id) on delete cascade,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  ultimo_uso_em timestamptz,
  ip_hash text,
  user_agent text
);

comment on table gps.plantao_sessoes is
  'Sessão do plantão (token opaco de 90 dias, cookie gps_plantao_sessao). Guarda-se só o HASH do token — nunca o token em claro.';

create index idx_plantao_sessoes_aluno on gps.plantao_sessoes (aluno_plantao_id);
create index idx_plantao_sessoes_expira on gps.plantao_sessoes (expira_em);

comment on index gps.idx_plantao_sessoes_expira is
  'Serve o expurgo diário: `delete from gps.plantao_sessoes where expira_em < now()`.';

alter table gps.plantao_sessoes enable row level security;

create policy gps_plantao_sessoes_admin on gps.plantao_sessoes
  for all
  using (public.gp_is_admin())
  with check (public.gp_is_admin());

-- ─────────────────────────────────────────────────────────────────────────
-- plantao_inscricoes
-- ─────────────────────────────────────────────────────────────────────────
create table gps.plantao_inscricoes (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references gps.plantao_slots(id) on delete cascade,
  aluno_plantao_id uuid not null
    references gps.plantao_alunos(id) on delete cascade,
  inscrito_em timestamptz not null default now(),
  cancelado_em timestamptz,
  presenca_em timestamptz,
  nps_nota smallint check (nps_nota between 0 and 10),
  nps_comentario text,
  nps_em timestamptz,
  nps_email_em timestamptz,
  unique (slot_id, aluno_plantao_id)
);

comment on table gps.plantao_inscricoes is
  'Inscrições no plantão. A trava "1 inscrição ativa por vez" NÃO é um índice único — depende de now() (slot ainda não começou), que não é imutável, então não pode virar predicado de índice único. A trava vive DENTRO de gps.plantao_inscrever, em transação, que verifica se o aluno já tem alguma inscrição com cancelado_em is null cujo slot.inicio_em > now(). NÃO recriar como unique constraint.';

create index idx_plantao_inscricoes_slot_ativa
  on gps.plantao_inscricoes (slot_id)
  where cancelado_em is null;

comment on index gps.idx_plantao_inscricoes_slot_ativa is
  'Serve `inscritos_qtd` do calendário (contagem agregada por slot) e a verificação "aluno já inscrito neste slot" em gps.plantao_inscrever — ambas filtram por cancelado_em is null.';

create index idx_plantao_inscricoes_aluno
  on gps.plantao_inscricoes (aluno_plantao_id, inscrito_em desc);

comment on index gps.idx_plantao_inscricoes_aluno is
  'Serve "minha inscrição ativa" e o histórico do aluno, ordenado do mais recente.';

alter table gps.plantao_inscricoes enable row level security;

create policy gps_plantao_inscricoes_admin on gps.plantao_inscricoes
  for all
  using (public.gp_is_admin())
  with check (public.gp_is_admin());

-- ─────────────────────────────────────────────────────────────────────────
-- plantao_eventos
-- ─────────────────────────────────────────────────────────────────────────
create table gps.plantao_eventos (
  id bigserial primary key,
  aluno_plantao_id uuid,
  acao text not null,
  slot_id uuid,
  criado_em timestamptz not null default now(),
  ip_hash text
);

comment on table gps.plantao_eventos is
  'Trilha de auditoria/rate-limit do plantão (login, inscrição, cancelamento, etc). Retenção de 90 dias com expurgo no job diário (`/api/plantao/manutencao`). `aluno_plantao_id` sem FK: tentativa de login com e-mail inexistente não tem aluno para referenciar, e o registro precisa sobreviver mesmo que o aluno seja depois excluído.';

create index idx_plantao_eventos_aluno on gps.plantao_eventos (aluno_plantao_id, criado_em desc);
create index idx_plantao_eventos_criado on gps.plantao_eventos (criado_em);

comment on index gps.idx_plantao_eventos_criado is
  'Serve o expurgo diário: `delete from gps.plantao_eventos where criado_em < now() - interval ''90 days''` e o rate limit por ip_hash (`where acao = ''login_falha'' and ip_hash = $1 and criado_em > now() - interval ''15 minutes''`).';

alter table gps.plantao_eventos enable row level security;

create policy gps_plantao_eventos_admin on gps.plantao_eventos
  for all
  using (public.gp_is_admin())
  with check (public.gp_is_admin());

-- ─────────────────────────────────────────────────────────────────────────
-- GRANT — service_role não dispensa GRANT explícito de tabela.
-- `anon` NÃO recebe grant nenhum nestas tabelas. `authenticated` recebe
-- GRANT completo (exigido pelo PostgREST para resolver a permissão de
-- baixo nível), mas RLS (policy só-admin, acima) é quem decide de fato —
-- um aluno autenticado via Supabase Auth não tem policy própria aqui.
-- Todo acesso público do plantão (aluno sem Supabase Auth, só com o cookie
-- de sessão do plantão) passa pelas funções SECURITY DEFINER da migration
-- gps_plantao_funcoes, nunca por SELECT/INSERT direto nestas tabelas.
-- ─────────────────────────────────────────────────────────────────────────
grant select, insert, update, delete on
  gps.plantao_mentoras,
  gps.plantao_slots,
  gps.plantao_alunos,
  gps.plantao_acessos,
  gps.plantao_sessoes,
  gps.plantao_inscricoes,
  gps.plantao_eventos
to service_role;

grant select, insert, update, delete on
  gps.plantao_mentoras,
  gps.plantao_slots,
  gps.plantao_alunos,
  gps.plantao_acessos,
  gps.plantao_sessoes,
  gps.plantao_inscricoes,
  gps.plantao_eventos
to authenticated;

-- Nota (não sobrescrever o `comment on schema gps`, já documentado por
-- outras migrations): GRANT a `authenticated` nas tabelas plantao_* é
-- necessário para o PostgREST resolver a permissão de baixo nível, mas RLS
-- (policy só-admin) é quem decide de fato — um aluno autenticado (Supabase
-- Auth) não tem policy de SELECT/INSERT direta nessas tabelas; o acesso
-- público do plantão passa pelas funções SECURITY DEFINER.

grant usage on sequence gps.plantao_eventos_id_seq to service_role, authenticated;
