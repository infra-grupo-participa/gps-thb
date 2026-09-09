-- ═══════════════════════════════════════════════════════════════════════════
-- RETRATO do núcleo do schema `gps` — este arquivo NÃO ALTERA NADA.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 🔴 ESTA MIGRATION NÃO SERÁ APLICADA NO BANCO DE PRODUÇÃO. Tudo o que está
--    aqui JÁ EXISTE em `mbvybujpkwuorhtdzcde` desde antes de o repo ter
--    `supabase/migrations/`. Ela existe para que o REPO saiba recriar o banco
--    e para que as policies do núcleo possam ser lidas em code review. É
--    idempotente de ponta a ponta (`if not exists`, `create or replace`,
--    policy dentro de `do $$ ... exception when duplicate_object`), então
--    rodá-la contra o banco atual seria no-op — mas o caminho normal é ela
--    nunca rodar em produção.
--
-- POR QUE EXISTE
--   As tabelas do núcleo (`etapas`, `membros`, `ambientes`, `etapa1_clientes`,
--   `progresso`, `tarefa_enfase`, `solicitacoes_acesso`, `acessos_log`,
--   `etapa3_*`, `agenda`, `reuniao_*`) foram criadas direto no banco, sem DDL
--   versionada. Consequência já medida: `gps.admin_adotar_login_existente`
--   ficou QUEBRADA de 25/08 a 08/09/2026 (15 dias) por um erro de precedência
--   de operadores (`||` vs `->>`) que nenhum code review pegou — porque a
--   função não estava em lugar nenhum do repo. Sem baseline também não dá
--   para responder em revisão perguntas como "`etapa1_clientes(aluno_id)` tem
--   índice?" ou "`progresso` tem policy de aluno?".
--
-- COMO FOI EXTRAÍDO
--   09/09/2026, ~02:40 UTC, pelo orquestrador, consultando o banco real via
--   MCP: `pg_attribute` (colunas/defaults), `pg_constraint`, `pg_indexes`,
--   `pg_policy`, grants de tabela E DE COLUNA (`membros`), `pg_trigger` e o
--   `pg_get_functiondef` das funções do núcleo. Retrato bruto preservado em
--   `tmp/squad/schema-gps-dump.md`. NADA aqui foi escrito de cabeça; o que o
--   dump não registrou está marcado com ⚠️ e repetido no rodapé do arquivo.
--
-- O QUE FICOU DE FORA, DE PROPÓSITO
--   1) Objetos que uma migration POSTERIOR do repo já cria. Este arquivo tem
--      timestamp zero, então roda ANTES de todas. Duplicar aqui um `add
--      column` / `create index` / `create trigger` NÃO-idempotente de outra
--      migration faria a reconstrução do zero explodir exatamente onde
--      ninguém espera. São eles:
--        · `etapa1_clientes.fase` + `chk_etapa1_clientes_fase` → ...0060
--        · `etapa1_clientes.valor_honorarios` / `.contrato_url` → ...0090
--        · trigger `trg_aluno_eventos_etapa1_clientes`          → ...0002
--        · trigger `trg_aluno_eventos_progresso`                → ...0002
--        · trigger `trg_etapa1_clientes_status_congelado` + fn  → ...0062
--        · índice `idx_acessos_log_aluno`                       → ...0009
--   2) `gps.senhas_bkp_20260810` (cópia de hashes bcrypt de `auth.users`, RLS
--      OFF, sem grant nenhum) e `gps.bak_socios_migracao_20260908` (backup da
--      migração de sócios de 08/09). São BACKUPS operacionais, não schema:
--      recriar tabela de backup vazia num banco novo não faz sentido, e a
--      primeira é dado sensível parado — a decisão sobre apagá-la é do João.
--   3) As triggers `reuniao_guardar_status` e `reuniao_registrar_evento` das
--      `gps.reuniao_*`: o CORPO dessas funções não está no dump. Recriar a
--      trigger sem a função quebraria a reconstrução, e escrever a função de
--      cabeça seria inventar regra de negócio de um fluxo REMOVIDO e proibido
--      de reconstruir. Ver o bloco das `reuniao_*` no fim do arquivo.
--   4) DADOS. `gps.etapas` precisa das 6 linhas de configuração para o portal
--      funcionar; elas não são schema e não estão neste retrato.
--   5) `alter role authenticator set pgrst.db_schemas = 'public, graphql_public, gps'`
--      — expor o schema ao PostgREST é config de role no cluster, não do
--      schema, e sobrescrever a lista aqui derrubaria os outros schemas. Fica
--      como passo manual (está no CLAUDE.md).
--
-- REVERSÃO: nenhuma. Não há o que reverter — o arquivo não muda estado.
-- ═══════════════════════════════════════════════════════════════════════════

create schema if not exists gps;

-- ⚠️ Não veio do dump (que cobriu tabelas, não o schema): sem USAGE, toda
-- policy do núcleo devolve 42501 e o portal fica de pé com todas as telas
-- vazias. Explicitado aqui porque essa pegadinha já mordeu outro sistema do
-- grupo — "build verde" não prova que o banco responde.
grant usage on schema gps to authenticated, service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- FUNÇÕES DO NÚCLEO
--
-- Corpo VIGENTE, copiado do `pg_get_functiondef` de 09/09/2026. Precisam
-- existir antes de qualquer policy/trigger: as migrations ...0001 em diante JÁ
-- USAM as três (`gp_is_admin()` em toda policy de admin,
-- `touch_atualizado_em()` em 5 triggers, `aluno_atual()` nas policies de
-- chamados) e NENHUMA delas as define. Este arquivo é o dono.
-- ═══════════════════════════════════════════════════════════════════════════

-- Quem é da EQUIPE interna. `public.perfis` é a tabela da equipe, não do aluno
-- (limpeza de 31/07/2026, 1.245 linhas de aluno removidas): o gate exige
-- perfil `ativo` com cargo dev/admin, e não só "existe em perfis".
create or replace function public.gp_is_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
      from public.perfis p
     where p.id = auth.uid()
       and p.status = 'ativo'
       and p.cargo in ('dev', 'admin')
  );
$$;

-- O ambiente (aluno_id) do usuário logado. Um `auth.users` pode ser membro de
-- mais de um ambiente (titular no próprio, sócio no de outro): o
-- `order by (papel = 'titular') desc` garante que o ambiente próprio ganha.
create or replace function gps.aluno_atual()
returns uuid
language sql
stable
security definer
set search_path to 'gps', 'public'
as $$
  select m.aluno_id
    from gps.membros m
   where m.user_id = auth.uid()
   order by (m.papel = 'titular') desc, m.criado_em asc
   limit 1;
$$;

create or replace function gps.touch_atualizado_em()
returns trigger
language plpgsql
set search_path to 'gps', 'public'
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- gps.etapas — configuração de liberação das 6 etapas do programa
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists gps.etapas (
  id            smallint primary key,
  nome          text     not null,
  descricao     text,
  ordem         smallint not null,
  liberada      boolean  not null default false,
  atualizado_em timestamptz default now()
);

alter table gps.etapas enable row level security;

do $$ begin
  create policy etapas_admin_write on gps.etapas
    for all to authenticated
    using (public.gp_is_admin())
    with check (public.gp_is_admin());
exception when duplicate_object then null; end $$;

-- Catálogo legível por qualquer logado: o aluno precisa saber quais etapas
-- existem para ver as bloqueadas na home.
do $$ begin
  create policy etapas_select on gps.etapas
    for select to authenticated
    using (true);
exception when duplicate_object then null; end $$;

grant delete, insert, select, update on gps.etapas to authenticated;
grant all on gps.etapas to service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- gps.membros — vínculo auth.users ⇄ thb_alunos (o "ambiente" do aluno)
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists gps.membros (
  id                          uuid primary key default gen_random_uuid(),
  aluno_id                    uuid not null
                                references public.thb_alunos(id) on delete cascade,
  -- on delete set null: apagar o login não pode apagar o ambiente. É o que
  -- permite "excluir acesso" preservando clientes/progresso do aluno.
  user_id                     uuid unique
                                references auth.users(id) on delete set null,
  data_agendamento_disponivel date,
  criado_em                   timestamptz default now(),
  atualizado_em               timestamptz default now(),
  pasta_drive_url             text,
  perfil                      jsonb not null default '{}'::jsonb,
  papel                       text  not null default 'titular'
);

-- Colunas que entraram DEPOIS da criação da tabela — atestado pela ordem de
-- `attnum` no dump (vêm atrás de criado_em/atualizado_em). Redundante num
-- banco novo; necessário num banco que já tenha a tabela na forma antiga.
alter table gps.membros add column if not exists pasta_drive_url text;
alter table gps.membros add column if not exists perfil jsonb not null default '{}'::jsonb;
alter table gps.membros add column if not exists papel  text  not null default 'titular';

do $$ begin
  alter table gps.membros
    add constraint membros_papel_check check (papel in ('titular', 'socio'));
exception when duplicate_object then null; end $$;

create index if not exists membros_aluno_id_idx on gps.membros (aluno_id);
create index if not exists membros_user_id_idx  on gps.membros (user_id);
create unique index if not exists membros_aluno_user_uk
  on gps.membros (aluno_id, user_id);
-- No máximo um membro órfão (sem login) por ambiente: é o registro criado por
-- "Só criar ambiente", que o signUp do aluno depois adota.
create unique index if not exists membros_um_orfao_por_ambiente
  on gps.membros (aluno_id) where user_id is null;
create unique index if not exists membros_um_titular_por_ambiente
  on gps.membros (aluno_id) where papel = 'titular';

alter table gps.membros enable row level security;

do $$ begin
  create policy membros_admin_all on gps.membros
    for all to authenticated
    using (public.gp_is_admin())
    with check (public.gp_is_admin());
exception when duplicate_object then null; end $$;

-- Enxerga a própria linha E as dos outros membros do mesmo ambiente (o sócio
-- precisa ver o titular).
do $$ begin
  create policy membros_self_select on gps.membros
    for select
    using (user_id = auth.uid() or aluno_id = gps.aluno_atual());
exception when duplicate_object then null; end $$;

-- O `with check` recopia aluno_id e papel da PRÓPRIA linha: sem isso o membro
-- se moveria para outro ambiente ou se promoveria a titular editando o próprio
-- perfil. É a trava de escalada de privilégio desta tabela.
do $$ begin
  create policy membros_self_update on gps.membros
    for update
    using (user_id = auth.uid())
    with check (
      user_id = auth.uid()
      and aluno_id = (select m.aluno_id from gps.membros m where m.id = membros.id)
      and papel    = (select m.papel    from gps.membros m where m.id = membros.id)
    );
exception when duplicate_object then null; end $$;

-- 🔑 GRANT POR COLUNA. `authenticated` NÃO tem `update` na tabela: tem update
-- só em (perfil, atualizado_em). Consequência real: `salvarPerfilAluno`
-- funciona, mas QUALQUER update de admin em `pasta_drive_url`, `papel` ou
-- `user_id` pela API PostgREST recusa com 42501 — mesmo com a policy
-- `membros_admin_all` permitindo. O caminho de admin para essas colunas é RPC
-- SECURITY DEFINER, nunca `.from("membros").update()`.
grant select, insert, delete on gps.membros to authenticated;
grant update (perfil, atualizado_em) on gps.membros to authenticated;
grant all on gps.membros to service_role;

drop trigger if exists trg_membros_touch on gps.membros;
create trigger trg_membros_touch
  before update on gps.membros
  for each row execute function gps.touch_atualizado_em();


-- ═══════════════════════════════════════════════════════════════════════════
-- gps.ambientes — 1 linha por aluno (pasta do Drive + data de agendamento)
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists gps.ambientes (
  aluno_id                    uuid primary key
                                references public.thb_alunos(id) on delete cascade,
  pasta_drive_url             text,
  data_agendamento_disponivel date,
  criado_em                   timestamptz default now(),
  atualizado_em               timestamptz default now()
);

alter table gps.ambientes enable row level security;

do $$ begin
  create policy ambientes_admin_all on gps.ambientes
    for all
    using (public.gp_is_admin())
    with check (public.gp_is_admin());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy ambientes_owner_select on gps.ambientes
    for select
    using (aluno_id = gps.aluno_atual());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy ambientes_owner_update on gps.ambientes
    for update
    using (aluno_id = gps.aluno_atual())
    with check (aluno_id = gps.aluno_atual());
exception when duplicate_object then null; end $$;

-- Sem INSERT para `authenticated`: a linha nasce por caminho administrativo.
grant delete, select, update on gps.ambientes to authenticated;
grant all on gps.ambientes to service_role;

drop trigger if exists ambientes_touch on gps.ambientes;
create trigger ambientes_touch
  before update on gps.ambientes
  for each row execute function gps.touch_atualizado_em();


-- ═══════════════════════════════════════════════════════════════════════════
-- gps.etapa1_clientes — os 30 clientes potenciais do aluno (tabela larga e
-- mais lida do sistema)
--
-- ⚠️ `fase`, `valor_honorarios` e `contrato_url` EXISTEM no banco hoje e NÃO
--    entram aqui: são criadas por ...0060 e ...0090 com `add column` simples.
--    Duplicá-las neste arquivo faria a reconstrução do zero abortar com 42701
--    (`column already exists`) naquelas migrations.
-- ⚠️ `status` está DEPRECADO e CONGELADO por trigger (...0062). Continua na
--    tabela de propósito: é o caminho de volta de `fase` sem restore.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists gps.etapa1_clientes (
  id                        uuid primary key default gen_random_uuid(),
  aluno_id                  uuid not null
                              references public.thb_alunos(id) on delete cascade,
  nome                      text not null default '',
  telefone                  text,
  nivel_relacionamento      text,
  problemas                 text[] not null default '{}',
  perda_inercia             numeric(14,2),
  registro_contato          text,
  mensagem_padrao_enviada   boolean not null default false,
  estudo_caso_enviado       boolean not null default false,
  ligacao_realizada         boolean not null default false,
  status                    text not null default 'pendente',
  data_reuniao_preliminar   date,
  aderiu_reuniao            boolean not null default false,
  perfil_disc               text,
  ordem                     integer not null default 0,
  criado_em                 timestamptz default now(),
  atualizado_em             timestamptz default now(),
  acompanhado_equipe        boolean not null default false
);

-- Entrou depois (último `attnum` antes de `fase`): é o "favorito", o cliente
-- que a equipe acompanha.
alter table gps.etapa1_clientes
  add column if not exists acompanhado_equipe boolean not null default false;

-- O índice da coluna mais quente do sistema: TODA leitura do aluno filtra por
-- aluno_id (home, Etapa 01, aba Clientes, RPC do painel).
create index if not exists etapa1_clientes_aluno_idx
  on gps.etapa1_clientes (aluno_id);

-- UM favorito por ambiente. Índice único PARCIAL, não constraint: só as linhas
-- com `acompanhado_equipe` disputam — as outras 878 ficam livres.
create unique index if not exists etapa1_clientes_unico_equipe
  on gps.etapa1_clientes (aluno_id) where acompanhado_equipe;

alter table gps.etapa1_clientes enable row level security;

do $$ begin
  create policy clientes_admin_all on gps.etapa1_clientes
    for all to authenticated
    using (public.gp_is_admin())
    with check (public.gp_is_admin());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy clientes_owner_select on gps.etapa1_clientes
    for select to authenticated
    using (aluno_id = gps.aluno_atual());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy clientes_owner_insert on gps.etapa1_clientes
    for insert to authenticated
    with check (aluno_id = gps.aluno_atual());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy clientes_owner_update on gps.etapa1_clientes
    for update to authenticated
    using (aluno_id = gps.aluno_atual())
    with check (aluno_id = gps.aluno_atual());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy clientes_owner_delete on gps.etapa1_clientes
    for delete to authenticated
    using (aluno_id = gps.aluno_atual());
exception when duplicate_object then null; end $$;

grant delete, insert, select, update on gps.etapa1_clientes to authenticated;
grant all on gps.etapa1_clientes to service_role;

drop trigger if exists trg_etapa1_clientes_touch on gps.etapa1_clientes;
create trigger trg_etapa1_clientes_touch
  before update on gps.etapa1_clientes
  for each row execute function gps.touch_atualizado_em();

-- ⚠️ As outras DUAS triggers desta tabela NÃO entram aqui:
--    · `trg_aluno_eventos_etapa1_clientes`     → migration ...0002
--    · `trg_etapa1_clientes_status_congelado`  → migration ...0062
--    As funções delas nascem nessas migrations, que rodam DEPOIS deste
--    arquivo. Criar a trigger antes da função é erro na reconstrução.


-- ═══════════════════════════════════════════════════════════════════════════
-- gps.progresso — conclusão de tarefa manual por aluno/etapa/tarefa
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists gps.progresso (
  id            uuid primary key default gen_random_uuid(),
  aluno_id      uuid     not null
                  references public.thb_alunos(id) on delete cascade,
  etapa         smallint not null,
  tarefa        smallint not null,
  concluida     boolean  not null default false,
  concluida_em  timestamptz,
  atualizado_em timestamptz default now(),
  constraint progresso_aluno_id_etapa_tarefa_key unique (aluno_id, etapa, tarefa)
);

-- Serve `where aluno_id = ? and etapa = ?` (o guia de uma etapa). O unique
-- acima serve o upsert por (aluno, etapa, tarefa); este serve a listagem.
create index if not exists progresso_aluno_idx on gps.progresso (aluno_id, etapa);

alter table gps.progresso enable row level security;

do $$ begin
  create policy progresso_admin_all on gps.progresso
    for all to authenticated
    using (public.gp_is_admin())
    with check (public.gp_is_admin());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy progresso_owner_select on gps.progresso
    for select to authenticated
    using (aluno_id = gps.aluno_atual());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy progresso_owner_insert on gps.progresso
    for insert to authenticated
    with check (aluno_id = gps.aluno_atual());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy progresso_owner_update on gps.progresso
    for update to authenticated
    using (aluno_id = gps.aluno_atual())
    with check (aluno_id = gps.aluno_atual());
exception when duplicate_object then null; end $$;

-- Sem policy de DELETE: desmarcar tarefa é update de `concluida`, não delete.

grant delete, insert, select, update on gps.progresso to authenticated;
grant all on gps.progresso to service_role;

drop trigger if exists trg_progresso_touch on gps.progresso;
create trigger trg_progresso_touch
  before update on gps.progresso
  for each row execute function gps.touch_atualizado_em();

-- ⚠️ `trg_aluno_eventos_progresso` NÃO entra aqui → migration ...0002.


-- ═══════════════════════════════════════════════════════════════════════════
-- gps.tarefa_enfase — override de destaque/esmaecimento de tarefa pelo admin
--
-- A PK (aluno_id, etapa, tarefa) já é o índice de `where aluno_id = ? and
-- etapa = ?` (prefixo à esquerda). Não há índice adicional, e não precisa.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists gps.tarefa_enfase (
  aluno_id      uuid     not null
                  references public.thb_alunos(id) on delete cascade,
  etapa         smallint not null,
  tarefa        smallint not null,
  modo          text,
  atualizado_em timestamptz,
  primary key (aluno_id, etapa, tarefa)
);

do $$ begin
  alter table gps.tarefa_enfase
    add constraint tarefa_enfase_modo_check check (modo in ('realce', 'esmaecer'));
exception when duplicate_object then null; end $$;

alter table gps.tarefa_enfase enable row level security;

do $$ begin
  create policy tarefa_enfase_admin_all on gps.tarefa_enfase
    for all
    using (public.gp_is_admin())
    with check (public.gp_is_admin());
exception when duplicate_object then null; end $$;

-- Só SELECT para o dono: a ênfase é decisão da EQUIPE sobre o aluno; ele lê,
-- não escreve.
do $$ begin
  create policy tarefa_enfase_owner_select on gps.tarefa_enfase
    for select
    using (aluno_id = gps.aluno_atual());
exception when duplicate_object then null; end $$;

grant delete, insert, select, update on gps.tarefa_enfase to authenticated;

drop trigger if exists tarefa_enfase_touch on gps.tarefa_enfase;
create trigger tarefa_enfase_touch
  before update on gps.tarefa_enfase
  for each row execute function gps.touch_atualizado_em();


-- ═══════════════════════════════════════════════════════════════════════════
-- gps.solicitacoes_acesso — fila de quem se cadastrou e não casou com a base
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists gps.solicitacoes_acesso (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null unique
                 references auth.users(id) on delete cascade,
  nome         text,
  email        text,
  telefone     text,
  status       text default 'pendente',
  aluno_id     uuid references public.thb_alunos(id) on delete set null,
  observacao   text,
  criado_em    timestamptz default now(),
  decidido_em  timestamptz,
  decidido_por uuid references auth.users(id) on delete set null
);

do $$ begin
  alter table gps.solicitacoes_acesso
    add constraint solicitacoes_acesso_status_check
      check (status in ('pendente', 'aprovada', 'recusada'));
exception when duplicate_object then null; end $$;

-- Serve a fila do painel: `where status = 'pendente' order by criado_em`.
create index if not exists solicitacoes_status_idx
  on gps.solicitacoes_acesso (status, criado_em);

alter table gps.solicitacoes_acesso enable row level security;

do $$ begin
  create policy solicitacoes_admin_all on gps.solicitacoes_acesso
    for all to authenticated
    using (public.gp_is_admin())
    with check (public.gp_is_admin());
exception when duplicate_object then null; end $$;

-- O solicitante abre e acompanha a PRÓPRIA solicitação — e só ela. Não pode
-- editar (sem policy de update): decidir é ato da equipe.
do $$ begin
  create policy solicitacoes_self_insert on gps.solicitacoes_acesso
    for insert to authenticated
    with check (user_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy solicitacoes_self_select on gps.solicitacoes_acesso
    for select to authenticated
    using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

grant delete, insert, select, update on gps.solicitacoes_acesso to authenticated;
grant all on gps.solicitacoes_acesso to service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- gps.acessos_log — auditoria de AÇÃO ADMINISTRATIVA sobre o acesso do aluno
--
-- 🔑 Não é "último acesso do aluno". Último acesso vem de
--    `auth.users.last_sign_in_at`; confundir os dois já produziu métrica
--    errada no painel. Aqui só entra o que a EQUIPE fez.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists gps.acessos_log (
  id            uuid primary key default gen_random_uuid(),
  acao          text not null,
  aluno_id      uuid,
  user_id_alvo  uuid,
  email_alvo    text,
  detalhe       text,
  feito_por     uuid,
  criado_em     timestamptz not null default now()
);

-- Sem FK em aluno_id/user_id_alvo/feito_por de propósito: a linha de auditoria
-- tem de sobreviver à exclusão do alvo — é justamente o caso que se audita.
do $$ begin
  alter table gps.acessos_log
    add constraint acessos_log_acao_check
      check (acao = any (array[
        'senha_definida',
        'acesso_excluido',
        'socio_adicionado',
        'membro_excluido',
        'ambiente_ambiguo'
      ]));
exception when duplicate_object then null; end $$;

alter table gps.acessos_log enable row level security;

-- Só leitura, e só de admin. Sem policy de insert/update/delete: a escrita é
-- feita pelas RPCs SECURITY DEFINER de gestão de acesso, que ignoram RLS.
do $$ begin
  create policy acessos_log_admin_select on gps.acessos_log
    for select to authenticated
    using (public.gp_is_admin());
exception when duplicate_object then null; end $$;

-- ⚠️ Os grants abaixo são MAIS LARGOS que as policies (INSERT/UPDATE/DELETE
--    concedidos sem policy correspondente). Na prática o RLS nega tudo isso —
--    grant sem policy não escreve nada. Está no retrato porque é o estado
--    real do banco; apertar para `grant select` é mudança de comportamento e
--    entra por migration própria, não por baseline.
grant delete, insert, select, update on gps.acessos_log to authenticated;

-- ⚠️ `idx_acessos_log_aluno (aluno_id, criado_em desc)` NÃO entra aqui →
--    migration ...0009 o cria com `create index` simples.


-- ═══════════════════════════════════════════════════════════════════════════
-- gps.etapa3_agendamentos — lista livre de apresentações do Croqui
--
-- ⚠️ NÃO é agendamento de reunião com a equipe (removido em 10/08/2026 e
--    proibido de reconstruir). É organização pessoal do aluno com os clientes
--    dele; `equipe_participa` marca a "apresentação principal".
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists gps.etapa3_agendamentos (
  id               uuid primary key default gen_random_uuid(),
  aluno_id         uuid not null
                     references public.thb_alunos(id) on delete cascade,
  cliente_id       uuid references gps.etapa1_clientes(id) on delete set null,
  descricao        text,
  data             date,
  horario          text,
  equipe_participa boolean not null default false,
  criado_em        timestamptz default now()
);

create index if not exists etapa3_agendamentos_aluno_idx
  on gps.etapa3_agendamentos (aluno_id);

alter table gps.etapa3_agendamentos enable row level security;

do $$ begin
  create policy etapa3_ag_admin_all on gps.etapa3_agendamentos
    for all to authenticated
    using (public.gp_is_admin())
    with check (public.gp_is_admin());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy etapa3_ag_owner_select on gps.etapa3_agendamentos
    for select to authenticated
    using (aluno_id = gps.aluno_atual());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy etapa3_ag_owner_insert on gps.etapa3_agendamentos
    for insert to authenticated
    with check (aluno_id = gps.aluno_atual());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy etapa3_ag_owner_update on gps.etapa3_agendamentos
    for update to authenticated
    using (aluno_id = gps.aluno_atual())
    with check (aluno_id = gps.aluno_atual());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy etapa3_ag_owner_delete on gps.etapa3_agendamentos
    for delete to authenticated
    using (aluno_id = gps.aluno_atual());
exception when duplicate_object then null; end $$;

grant delete, insert, select, update on gps.etapa3_agendamentos to authenticated;
grant all on gps.etapa3_agendamentos to service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- gps.etapa3_revisao — 1 linha por aluno: dúvidas dele + correções da equipe
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists gps.etapa3_revisao (
  aluno_id      uuid primary key
                  references public.thb_alunos(id) on delete cascade,
  duvidas       text,
  correcoes     text,
  atualizado_em timestamptz default now()
);

alter table gps.etapa3_revisao enable row level security;

do $$ begin
  create policy etapa3_rev_admin_all on gps.etapa3_revisao
    for all to authenticated
    using (public.gp_is_admin())
    with check (public.gp_is_admin());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy etapa3_rev_owner_select on gps.etapa3_revisao
    for select to authenticated
    using (aluno_id = gps.aluno_atual());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy etapa3_rev_owner_insert on gps.etapa3_revisao
    for insert to authenticated
    with check (aluno_id = gps.aluno_atual());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy etapa3_rev_owner_update on gps.etapa3_revisao
    for update to authenticated
    using (aluno_id = gps.aluno_atual())
    with check (aluno_id = gps.aluno_atual());
exception when duplicate_object then null; end $$;

-- Sem policy de DELETE para o dono: apagar a revisão apagaria a correção da
-- equipe junto.

grant delete, insert, select, update on gps.etapa3_revisao to authenticated;
grant all on gps.etapa3_revisao to service_role;

drop trigger if exists trg_etapa3_revisao_touch on gps.etapa3_revisao;
create trigger trg_etapa3_revisao_touch
  before update on gps.etapa3_revisao
  for each row execute function gps.touch_atualizado_em();


-- ═══════════════════════════════════════════════════════════════════════════
-- gps.agenda — ÓRFÃ. Nenhum código lê ou escreve.
--
-- O caminho de código morreu com a remoção do agendamento (10/08/2026) e a
-- pasta `src/app/agenda/` saiu na Onda 1 do polimento (09/09/2026). A TABELA
-- fica de pé, como as `reuniao_*`: preservar histórico é decisão do projeto.
-- Está no retrato para o baseline não mentir sobre o que existe no banco.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists gps.agenda (
  id            uuid primary key default gen_random_uuid(),
  aluno_id      uuid not null references public.thb_alunos(id),
  titulo        text not null,
  data          date not null,
  horario       time,
  nota          text,
  criado_em     timestamptz default now(),
  atualizado_em timestamptz default now()
);

create index if not exists agenda_aluno_data_idx on gps.agenda (aluno_id, data);
create index if not exists agenda_data_idx       on gps.agenda (data);

alter table gps.agenda enable row level security;

do $$ begin
  create policy agenda_admin_select on gps.agenda
    for select using (public.gp_is_admin());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy agenda_owner_select on gps.agenda
    for select using (aluno_id = gps.aluno_atual());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy agenda_owner_insert on gps.agenda
    for insert with check (aluno_id = gps.aluno_atual());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy agenda_owner_update on gps.agenda
    for update
    using (aluno_id = gps.aluno_atual())
    with check (aluno_id = gps.aluno_atual());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy agenda_owner_delete on gps.agenda
    for delete using (aluno_id = gps.aluno_atual());
exception when duplicate_object then null; end $$;

grant delete, insert, select, update on gps.agenda to authenticated;

drop trigger if exists agenda_touch on gps.agenda;
create trigger agenda_touch
  before update on gps.agenda
  for each row execute function gps.touch_atualizado_em();


-- ═══════════════════════════════════════════════════════════════════════════
-- gps.reuniao_* — ÓRFÃS E PROIBIDAS. SÓ RETRATO.
--
-- 🔴 O agendamento de reunião com a equipe foi REMOVIDO em 10/08/2026 por
--    decisão OPERACIONAL do Marcio (a equipe não comparecia). Já voltou uma
--    vez por engano. Estas 4 tabelas são HISTÓRICO PRESERVADO DE PROPÓSITO —
--    não são "feature pela metade". Não ler, não escrever, não reconstruir o
--    fluxo sem decisão explícita dele.
--
-- ⚠️ AS TRIGGERS DESTAS TABELAS FICARAM DE FORA DO RETRATO, DE PROPÓSITO.
--    `reuniao_agendamentos` tem no banco as triggers `reuniao_guardar_status`
--    (before insert/update), um touch e `reuniao_registrar_evento` (after
--    insert/update/delete). O CORPO das funções `gps.reuniao_guardar_status()`
--    e `gps.reuniao_registrar_evento()` NÃO está no dump — e escrever de
--    cabeça a regra de transição de status de um fluxo proibido seria inventar
--    produto e chamar de baseline. Criar a trigger sem a função quebraria a
--    reconstrução. Se um dia o banco precisar ser recriado de verdade, extrair
--    as duas funções com `pg_get_functiondef` ANTES.
--
-- ⚠️ O dump também não registrou os NOMES das policies nem os nomes dos
--    CHECKs destas 4 tabelas — só os predicados. Os nomes abaixo são
--    reconstruídos pelo padrão do resto do schema. O predicado é retrato; o
--    nome é convenção.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists gps.reuniao_horarios (
  horario   time primary key,
  ativo     boolean default true,
  criado_em timestamptz default now()
);

alter table gps.reuniao_horarios enable row level security;

do $$ begin
  create policy reuniao_horarios_admin_all on gps.reuniao_horarios
    for all
    using (public.gp_is_admin())
    with check (public.gp_is_admin());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy reuniao_horarios_select on gps.reuniao_horarios
    for select using (true);
exception when duplicate_object then null; end $$;

grant delete, insert, select, update on gps.reuniao_horarios to authenticated;


create table if not exists gps.reuniao_bloqueios (
  data      date not null,
  motivo    text,
  criado_em timestamptz default now(),
  horario   time references gps.reuniao_horarios(horario)
              on update cascade on delete cascade
);

do $$ begin
  alter table gps.reuniao_bloqueios
    add constraint reuniao_bloqueios_horario_check
      check (horario is null
             or horario in (time '10:00', time '13:00', time '16:00'));
exception when duplicate_object then null; end $$;

-- Só quarta-feira (dow = 3) — era o dia fixo do fluxo removido.
do $$ begin
  alter table gps.reuniao_bloqueios
    add constraint reuniao_bloqueios_dow_check
      check (extract(dow from data) = 3);
exception when duplicate_object then null; end $$;

-- Bloqueio do DIA inteiro é único; bloqueio de horário é único por (data,hora).
create unique index if not exists reuniao_bloqueios_dia_uk
  on gps.reuniao_bloqueios (data) where horario is null;
create unique index if not exists reuniao_bloqueios_data_horario_uk
  on gps.reuniao_bloqueios (data, horario) where horario is not null;

alter table gps.reuniao_bloqueios enable row level security;

do $$ begin
  create policy reuniao_bloqueios_admin_all on gps.reuniao_bloqueios
    for all
    using (public.gp_is_admin())
    with check (public.gp_is_admin());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy reuniao_bloqueios_select on gps.reuniao_bloqueios
    for select using (true);
exception when duplicate_object then null; end $$;

grant delete, insert, select, update on gps.reuniao_bloqueios to authenticated;


create table if not exists gps.reuniao_agendamentos (
  id             uuid primary key default gen_random_uuid(),
  aluno_id       uuid not null unique
                   references public.thb_alunos(id) on delete cascade,
  cliente_id     uuid references gps.etapa1_clientes(id) on delete cascade,
  data           date not null,
  horario        time not null references gps.reuniao_horarios(horario),
  link_live      text,
  criado_em      timestamptz default now(),
  atualizado_em  timestamptz default now(),
  status         text default 'pendente',
  pauta          text,
  motivo_recusa  text,
  solicitado_em  timestamptz default now(),
  respondido_em  timestamptz,
  respondido_por uuid references auth.users(id) on delete set null
);

do $$ begin
  alter table gps.reuniao_agendamentos
    add constraint reuniao_agendamentos_dow_check
      check (extract(dow from data) = 3);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table gps.reuniao_agendamentos
    add constraint reuniao_agendamentos_status_check
      check (status in ('pendente', 'confirmada', 'recusada'));
exception when duplicate_object then null; end $$;

-- Motivo de recusa só existe em recusa.
do $$ begin
  alter table gps.reuniao_agendamentos
    add constraint reuniao_agendamentos_motivo_recusa_check
      check (motivo_recusa is null or status = 'recusada');
exception when duplicate_object then null; end $$;

create index if not exists reuniao_agendamentos_data_horario_idx
  on gps.reuniao_agendamentos (data, horario);
create index if not exists reuniao_agendamentos_status_data_idx
  on gps.reuniao_agendamentos (status, data);
-- Um agendamento vivo por slot: a recusada libera o horário.
create unique index if not exists reuniao_agendamentos_slot_uk
  on gps.reuniao_agendamentos (data, horario) where status <> 'recusada';

alter table gps.reuniao_agendamentos enable row level security;

do $$ begin
  create policy reuniao_agendamentos_admin_all on gps.reuniao_agendamentos
    for all
    using (public.gp_is_admin())
    with check (public.gp_is_admin());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy reuniao_agendamentos_owner_select on gps.reuniao_agendamentos
    for select using (aluno_id = gps.aluno_atual());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy reuniao_agendamentos_owner_insert on gps.reuniao_agendamentos
    for insert with check (aluno_id = gps.aluno_atual());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy reuniao_agendamentos_owner_update on gps.reuniao_agendamentos
    for update
    using (aluno_id = gps.aluno_atual())
    with check (aluno_id = gps.aluno_atual());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy reuniao_agendamentos_owner_delete on gps.reuniao_agendamentos
    for delete using (aluno_id = gps.aluno_atual());
exception when duplicate_object then null; end $$;

grant delete, insert, select, update on gps.reuniao_agendamentos to authenticated;


create table if not exists gps.reuniao_eventos (
  id            uuid primary key default gen_random_uuid(),
  aluno_id      uuid references public.thb_alunos(id) on delete cascade,
  tipo          text,
  data          date,
  horario       time,
  motivo        text,
  autor         uuid,
  autor_equipe  boolean default false,
  criado_em     timestamptz default now()
);

do $$ begin
  alter table gps.reuniao_eventos
    add constraint reuniao_eventos_tipo_check
      check (tipo in ('solicitada', 'remarcada', 'confirmada', 'recusada', 'cancelada'));
exception when duplicate_object then null; end $$;

create index if not exists reuniao_eventos_aluno_idx
  on gps.reuniao_eventos (aluno_id, criado_em desc);

alter table gps.reuniao_eventos enable row level security;

do $$ begin
  create policy reuniao_eventos_admin_select on gps.reuniao_eventos
    for select using (public.gp_is_admin());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy reuniao_eventos_owner_select on gps.reuniao_eventos
    for select using (aluno_id = gps.aluno_atual());
exception when duplicate_object then null; end $$;

grant delete, insert, select, update on gps.reuniao_eventos to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- GRANTS PARA `disparos_app`
--
-- Role de LEITURA do sistema de disparos (outro sistema do grupo, mesmo
-- banco). SELECT em duas tabelas do GPS e nada mais. Guardado por `if exists`
-- porque num banco novo (local, CI) a role não existe e o baseline não pode
-- abortar por causa de uma integração externa.
-- ═══════════════════════════════════════════════════════════════════════════
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'disparos_app') then
    grant usage  on schema gps                 to disparos_app;
    grant select on gps.etapa1_clientes        to disparos_app;
    grant select on gps.membros                to disparos_app;
  end if;
end $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ LACUNAS CONHECIDAS DESTE RETRATO (o dump não registrou; NÃO foram
--    inventadas — estão aqui para quem for usar o arquivo para recriar)
--
--   a) DEFAULT de `id` em `progresso`, `solicitacoes_acesso`,
--      `etapa3_agendamentos`, `acessos_log`, `agenda` e `reuniao_*`: o dump
--      só anotou `default gen_random_uuid()` em `etapa1_clientes` e `membros`.
--      Assumido `gen_random_uuid()` nas demais porque a aplicação insere sem
--      informar `id` (ex.: `src/app/etapa/actions.ts:18`,
--      `.insert({ aluno_id })` em `etapa3_agendamentos`) — sem default, esse
--      caminho falharia em produção, e não falha.
--
--   b) `with check` das policies owner de UPDATE: o dump anotou os dois lados
--      só em `ambientes_owner_update` e `membros_self_update`. Nas demais
--      (`clientes_owner_update`, `progresso_owner_update`,
--      `etapa3_*_owner_update`, `agenda_owner_update`) foi escrito
--      `using` + `with check` com o mesmo predicado. Se o banco tiver só
--      `using`, este retrato é MAIS restritivo que a realidade — falha
--      segura, mas é divergência. Conferir com:
--        select polname,
--               pg_get_expr(polqual,      polrelid) as usando,
--               pg_get_expr(polwithcheck, polrelid) as com_check
--          from pg_policy
--         where polrelid = 'gps.etapa1_clientes'::regclass;
--
--   c) NOMES de constraint gerados pelo Postgres: `membros_user_id_key`,
--      `tarefa_enfase_modo_check`, `solicitacoes_acesso_status_check` e todos
--      os `reuniao_*_check`. O dump trouxe o predicado, não o nome. Só
--      `acessos_log_acao_check`, `chk_etapa1_clientes_fase`,
--      `membros_papel_check` e `progresso_aluno_id_etapa_tarefa_key` vieram
--      nomeados.
--
--   d) NOMES das policies das 4 `reuniao_*` — ver o bloco delas.
-- ═══════════════════════════════════════════════════════════════════════════
