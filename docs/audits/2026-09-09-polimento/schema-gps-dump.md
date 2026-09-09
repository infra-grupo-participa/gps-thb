# Retrato do schema `gps` (banco real `mbvybujpkwuorhtdzcde`, 09/09/2026 ~02:40 UTC)

Extraído pelo orquestrador via MCP (pg_attribute/pg_constraint/pg_indexes/pg_policy/grants/triggers)
para as tabelas SEM `create table` no repo. Excluídas: `plantao_*`, `aluno_eventos`, `aluno_notas`
(já versionadas). Formato: colunas → constraints → índices (fora de constraint) → RLS → policies → grants → triggers.
`to` vazio numa policy = `to public`.

## acessos_log
```
id uuid not null default gen_random_uuid(), acao text not null, aluno_id uuid, user_id_alvo uuid, email_alvo text, detalhe text, feito_por uuid, criado_em timestamptz not null default now()
constraint acessos_log_pkey primary key (id)
constraint acessos_log_acao_check check (acao = any (array['senha_definida','acesso_excluido','socio_adicionado','membro_excluido','ambiente_ambiguo']))
index idx_acessos_log_aluno (aluno_id, criado_em desc)
rls enabled
policy acessos_log_admin_select for select to authenticated using (gp_is_admin())
grants authenticated: DELETE,INSERT,SELECT,UPDATE
```

## agenda  (ÓRFÃ — código removido; manter como as reuniao_*)
```
id uuid pk default gen_random_uuid(), aluno_id uuid not null fk thb_alunos(id), titulo text not null, data date not null, horario time, nota text, criado_em timestamptz default now(), atualizado_em timestamptz default now()
index agenda_aluno_data_idx (aluno_id, data); agenda_data_idx (data)
rls enabled
policies (to public): agenda_admin_select select using (gp_is_admin()); agenda_owner_{select,insert,update,delete} por aluno_id = gps.aluno_atual()
grants authenticated: DELETE,INSERT,SELECT,UPDATE
trigger agenda_touch before update → gps.touch_atualizado_em()
```

## ambientes
```
aluno_id uuid pk fk thb_alunos(id) on delete cascade, pasta_drive_url text, data_agendamento_disponivel date, criado_em timestamptz default now(), atualizado_em timestamptz default now()
rls enabled
policies (to public): ambientes_admin_all for all using/with check (gp_is_admin()); ambientes_owner_select using (aluno_id = gps.aluno_atual()); ambientes_owner_update using/with check (aluno_id = gps.aluno_atual())
grants authenticated: DELETE,SELECT,UPDATE; service_role: ALL
trigger ambientes_touch before update → touch_atualizado_em()
```

## bak_socios_migracao_20260908  (backup; RLS on, sem policy, só postgres)
```
membro_id uuid, aluno_id_antigo uuid, user_id uuid, papel_antigo text, criado_em timestamptz, atualizado_em timestamptz, salvo_em timestamptz
comment: Backup da migracao de socios 08/09/2026. RLS ligada SEM policy e sem grant.
```

## etapa1_clientes
```
id uuid pk default gen_random_uuid(), aluno_id uuid not null fk thb_alunos(id) on delete cascade, nome text not null default '', telefone text, nivel_relacionamento text, problemas text[] not null default '{}', perda_inercia numeric(14,2), registro_contato text, mensagem_padrao_enviada bool not null default false, estudo_caso_enviado bool not null default false, ligacao_realizada bool not null default false, status text not null default 'pendente', data_reuniao_preliminar date, aderiu_reuniao bool not null default false, perfil_disc text, ordem int not null default 0, criado_em timestamptz default now(), atualizado_em timestamptz default now(), acompanhado_equipe bool not null default false, fase text not null default 'prospeccao'
constraint chk_etapa1_clientes_fase check (fase in ('prospeccao','fechamento','contratado'))
index etapa1_clientes_aluno_idx (aluno_id); unique etapa1_clientes_unico_equipe (aluno_id) where acompanhado_equipe
rls enabled
policies (to authenticated): clientes_admin_all for all using/with check (gp_is_admin()); clientes_owner_{select,insert,update,delete} por aluno_id = gps.aluno_atual()
grants authenticated: DELETE,INSERT,SELECT,UPDATE; disparos_app: SELECT; service_role: ALL
triggers: trg_aluno_eventos_etapa1_clientes after insert/update/delete → aluno_eventos_capturar_etapa1_clientes(); trg_etapa1_clientes_status_congelado before update of status → etapa1_clientes_status_congelado(); trg_etapa1_clientes_touch before update → touch_atualizado_em()
```

## etapa3_agendamentos
```
id uuid pk, aluno_id uuid not null fk thb_alunos on delete cascade, cliente_id uuid fk gps.etapa1_clientes(id) on delete set null, descricao text, data date, horario text, equipe_participa bool not null default false, criado_em timestamptz default now()
index etapa3_agendamentos_aluno_idx (aluno_id)
rls enabled; policies (to authenticated): etapa3_ag_admin_all; etapa3_ag_owner_{select,insert,update,delete} por aluno_atual()
grants authenticated: DELETE,INSERT,SELECT,UPDATE; service_role: ALL
```

## etapa3_revisao
```
aluno_id uuid pk fk thb_alunos on delete cascade, duvidas text, correcoes text, atualizado_em timestamptz default now()
rls enabled; policies (to authenticated): etapa3_rev_admin_all; etapa3_rev_owner_{select,insert,update} por aluno_atual()  (sem delete)
grants authenticated: DELETE,INSERT,SELECT,UPDATE; service_role: ALL
trigger trg_etapa3_revisao_touch before update → touch_atualizado_em()
```

## etapas
```
id smallint pk, nome text not null, descricao text, ordem smallint not null, liberada bool not null default false, atualizado_em timestamptz default now()
rls enabled; policies (to authenticated): etapas_admin_write for all (gp_is_admin()); etapas_select for select using (true)
grants authenticated: DELETE,INSERT,SELECT,UPDATE; service_role: ALL
```

## membros
```
id uuid pk default gen_random_uuid(), aluno_id uuid not null fk thb_alunos on delete cascade, user_id uuid unique fk auth.users(id) on delete set null, data_agendamento_disponivel date, criado_em timestamptz default now(), atualizado_em timestamptz default now(), pasta_drive_url text, perfil jsonb not null default '{}', papel text not null default 'titular'
constraint membros_papel_check check (papel in ('titular','socio'))
index membros_aluno_id_idx (aluno_id); unique membros_aluno_user_uk (aluno_id, user_id); unique membros_um_orfao_por_ambiente (aluno_id) where user_id is null; unique membros_um_titular_por_ambiente (aluno_id) where papel='titular'; membros_user_id_idx (user_id)
rls enabled
policies: membros_admin_all (to authenticated) for all gp_is_admin(); membros_self_select (to public) using (user_id = auth.uid() or aluno_id = gps.aluno_atual()); membros_self_update (to public) using (user_id = auth.uid()) with check (user_id = auth.uid() and aluno_id = (select m.aluno_id from gps.membros m where m.id = membros.id) and papel = (select m.papel from gps.membros m where m.id = membros.id))
grants authenticated: DELETE,INSERT,SELECT (SEM UPDATE!); disparos_app: SELECT; service_role: ALL
trigger trg_membros_touch before update → touch_atualizado_em()
```
> Conferido: o UPDATE de `membros` para `authenticated` é POR COLUNA — só `perfil` e `atualizado_em` (grant de coluna). `salvarPerfilAluno` funciona; qualquer UPDATE de admin em outra coluna de `membros` (`pasta_drive_url`, `papel`, `user_id`) pela API recusa com 42501 mesmo com `membros_admin_all`. Baseline tem de registrar o grant de coluna, não `grant update` na tabela.

## progresso
```
id uuid pk, aluno_id uuid not null fk thb_alunos on delete cascade, etapa smallint not null, tarefa smallint not null, concluida bool not null default false, concluida_em timestamptz, atualizado_em timestamptz default now()
constraint progresso_aluno_id_etapa_tarefa_key unique (aluno_id, etapa, tarefa)
index progresso_aluno_idx (aluno_id, etapa)
rls enabled; policies (to authenticated): progresso_admin_all; progresso_owner_{select,insert,update} por aluno_atual() (sem delete)
grants authenticated: DELETE,INSERT,SELECT,UPDATE; service_role: ALL
triggers: trg_aluno_eventos_progresso after i/u/d → aluno_eventos_capturar_progresso(); trg_progresso_touch
```

## reuniao_agendamentos / reuniao_bloqueios / reuniao_eventos / reuniao_horarios  (ÓRFÃS, proibidas — só retrato)
```
reuniao_horarios: horario time pk, ativo bool default true, criado_em. RLS; admin_all + select using(true).
reuniao_bloqueios: data date not null, motivo text, criado_em, horario time fk reuniao_horarios on update cascade on delete cascade; check horario in (10:00,13:00,16:00) or null; check dow=3; unique (data) where horario is null; unique (data,horario) where horario not null. RLS; admin_all + select using(true).
reuniao_agendamentos: id uuid pk, aluno_id uuid not null unique fk thb_alunos cascade, cliente_id uuid fk etapa1_clientes cascade, data date not null (check dow=3), horario time not null fk reuniao_horarios, link_live text, criado_em, atualizado_em, status text default 'pendente' check in (pendente,confirmada,recusada), pauta text, motivo_recusa text (check null or status='recusada'), solicitado_em timestamptz default now(), respondido_em, respondido_por uuid fk auth.users set null. Índices: (data,horario); unique (data,horario) where status<>'recusada'; (status,data). RLS; admin_all + owner_{select,insert,update,delete}. Triggers: reuniao_guardar_status (before i/u), touch, reuniao_registrar_evento (after i/u/d).
reuniao_eventos: id uuid pk, aluno_id fk cascade, tipo text check in (solicitada,remarcada,confirmada,recusada,cancelada), data, horario, motivo, autor uuid, autor_equipe bool default false, criado_em. Índice (aluno_id, criado_em desc). RLS; admin_select + owner_select.
grants em todas: authenticated DELETE,INSERT,SELECT,UPDATE.
```

## senhas_bkp_20260810  🔴 ATENÇÃO
```
id uuid, email varchar(255), encrypted_password varchar(255), last_sign_in_at timestamptz, copiado_em timestamptz
rls DISABLED; grants só postgres (não exposta pela API)
```
> Cópia de hashes bcrypt de `auth.users` feita em 10/08/2026 (época da remoção do agendamento). Não está exposta via PostgREST (sem grant), mas é dado sensível parado há 1 mês sem finalidade. **Recomendação: `drop table gps.senhas_bkp_20260810`** — decisão do João (irreversível).

## solicitacoes_acesso
```
id uuid pk, user_id uuid not null unique fk auth.users cascade, nome text, email text, telefone text, status text default 'pendente' check in (pendente,aprovada,recusada), aluno_id uuid fk thb_alunos set null, observacao text, criado_em, decidido_em, decidido_por uuid fk auth.users set null
index solicitacoes_status_idx (status, criado_em)
rls enabled; policies (to authenticated): solicitacoes_admin_all; solicitacoes_self_insert with check (user_id = auth.uid()); solicitacoes_self_select using (user_id = auth.uid())
grants authenticated: DELETE,INSERT,SELECT,UPDATE; service_role: ALL
```

## tarefa_enfase
```
aluno_id uuid fk thb_alunos cascade, etapa smallint, tarefa smallint, modo text check in (realce,esmaecer), atualizado_em; pk (aluno_id, etapa, tarefa)
rls enabled; policies (to public): tarefa_enfase_admin_all; tarefa_enfase_owner_select
grants authenticated: DELETE,INSERT,SELECT,UPDATE
trigger tarefa_enfase_touch
```

## Funções do núcleo (corpo vigente)
```sql
create or replace function gps.aluno_atual() returns uuid language sql stable security definer set search_path to 'gps','public' as $$
  select m.aluno_id from gps.membros m where m.user_id = auth.uid()
   order by (m.papel = 'titular') desc, m.criado_em asc limit 1;
$$;
create or replace function gps.touch_atualizado_em() returns trigger language plpgsql set search_path to 'gps','public' as $$
begin new.atualizado_em := now(); return new; end; $$;
create or replace function public.gp_is_admin() returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.perfis p where p.id = auth.uid() and p.status = 'ativo' and p.cargo in ('dev','admin'));
$$;
-- gps.etapa1_clientes_status_congelado(): já versionada em 20260909000062.
```
