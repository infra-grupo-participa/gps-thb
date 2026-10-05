-- ═══════════════════════════════════════════════════════════════════════════
-- 347 — Google Drive: o sistema cria a pasta do parceiro e a do cliente
-- ═══════════════════════════════════════════════════════════════════════════
-- O banco NÃO fala com o Google. Ele só:
--   1. enfileira o pedido (gps.drive_tarefas), por RPC com guarda de papel;
--   2. cutuca a edge `drive-provisionar` por pg_net (corpo com o id da tarefa,
--      que a edge IGNORA: ela só processa o que a fila devolve);
--   3. entrega à edge, por RPC service_role, o contexto da tarefa e recebe o
--      resultado (pastas criadas, link, estado).
-- A edge usa a conta joao@advmais.com (OAuth Interno, escopo drive) e escreve
-- dentro de "Implementação Assistida — Pastas dos Alunos" (Meu Drive do joao@).
--
-- 🔴 NASCE DESLIGADO: drive_provisionar_ativo = 'false'. Desligado, as RPCs
-- recusam ("A criação automática de pastas está desligada."), o cron retorna
-- na 1ª linha e a edge recebe lote vazio.
-- Ligar (depois de: segredo no Vault `gps_drive_segredo` = env DRIVE_SEGREDO
-- da edge, GDRIVE_* na edge, deploy da edge):
--   update gps.config set valor = 'true' where chave = 'drive_provisionar_ativo';
--
-- Link do parceiro: gravado com pasta_drive_origem = 'equipe' SÓ quando o
-- ambiente não tinha link (NÃO existe origem 'sistema'); link que já aponta
-- para a pasta fica como está — a origem 'parceiro' nunca vira 'equipe'.
-- Link do cliente: gps.cliente_links_drive com origem 'equipe',
-- criado_por_nome 'Equipe' (molde da …333).
--
-- 🔴 Adoção de pasta existente (2ª rodada, achado ALTO do kirad: o parceiro A
-- colava o link da pasta do parceiro B e o sistema a compartilhava com A):
-- só em tarefa provisionar_parceiro pedida por admin, com o link gravado pela
-- equipe (origem 'equipe'); nunca pasta com gps_id de outro aluno, nunca
-- pasta cujo id esteja no link de OUTRO ambiente ou já registrada para outro
-- parceiro, nunca a matriz nem a raiz. Edge E banco (drive_pasta_registrar).
-- criar_pasta_cliente NUNCA provisiona o parceiro: sem raiz organizada pela
-- equipe → "A pasta do parceiro ainda não foi organizada pela equipe.".
--
-- Revogação: gps.drive_permissoes guarda cada permissão que o sistema deu;
-- gatilhos em gps.membros e gps.acessos_log (email_login_alterado) marcam e
-- enfileiram a tarefa 'revogar'. Nenhuma função de acesso foi recriada.
-- LGPD (lacuna registrada no CLAUDE.md): excluir cliente/ambiente NÃO apaga a
-- pasta no Drive.
--
-- DOWN (comentado — rodar à mão; arquivar, nunca dropar tabela com dado):
--   update gps.config set valor = 'false' where chave = 'drive_provisionar_ativo';
--   select cron.unschedule('drive-provisionar-varrer');
--   drop trigger if exists trg_membros_drive_revogar on gps.membros;
--   drop trigger if exists trg_acessos_log_drive_revogar on gps.acessos_log;
--   drop function if exists gps.drive_membros_revogar();
--   drop function if exists gps.drive_email_trocado_revogar();
--   drop function if exists gps.drive_revogar_marcar(uuid, uuid, text, text);
--   drop function if exists gps.drive_revogar_enfileirar();
--   drop function if exists gps.drive_revogacoes_listar(uuid, int);
--   drop function if exists gps.drive_revogacao_resultado(uuid, uuid, text, text);
--   drop function if exists gps.drive_permissao_registrar(uuid, text, text, text, text);
--   alter table gps.drive_permissoes rename to drive_permissoes_arquivo_<data>;
--   drop function if exists gps.drive_provisionar_parceiro(uuid);
--   drop function if exists gps.drive_criar_pasta_cliente(uuid);
--   drop function if exists gps.drive_estado(uuid, uuid);
--   drop function if exists gps.drive_tarefa_pegar(int);
--   drop function if exists gps.drive_pasta_registrar(uuid, text, text, text, boolean);
--   drop function if exists gps.drive_parceiro_link_gravar(uuid, text);
--   drop function if exists gps.drive_cliente_link_gravar(uuid, text);
--   drop function if exists gps.drive_tarefa_concluir(uuid, text, text, text, text);
--   drop function if exists gps.drive_varrer();
--   drop function if exists gps.drive_chamar(uuid);
--   drop function if exists gps.drive_segredo();
--   drop function if exists gps.drive_ativo();
--   alter table gps.drive_tarefas rename to drive_tarefas_arquivo_<data>;
--   alter table gps.drive_pastas  rename to drive_pastas_arquivo_<data>;
--   (links já gravados em ambientes/cliente_links_drive ficam: são links
--    válidos de pastas que existem no Drive)
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '2s';
set local statement_timeout = '20s';

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Config (kill-switch no banco + URL da edge)
-- ═══════════════════════════════════════════════════════════════════════════
insert into gps.config (chave, valor) values
  ('drive_provisionar_ativo', 'false'),
  ('drive_provisionar_url',   'https://mbvybujpkwuorhtdzcde.supabase.co/functions/v1/drive-provisionar')
on conflict (chave) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) gps.drive_tarefas — a fila
-- ═══════════════════════════════════════════════════════════════════════════
-- aluno_id → gps.ambientes ON DELETE CASCADE: gps.admin_excluir_acesso apaga
-- o ambiente; FK restrita quebraria a exclusão. cliente_id idem (excluir
-- cliente leva a tarefa junto; a pasta no Drive fica).
-- 'revogar' é a única tarefa SEM aluno_id: ela varre gps.drive_permissoes
-- marcadas, e precisa sobreviver à exclusão do ambiente (admin_excluir_acesso
-- apaga o ambiente; o CASCADE levaria junto a revogação recém-enfileirada).
-- FK com aluno_id nulo não dispara cascade.
create table gps.drive_tarefas (
  id             uuid        primary key default gen_random_uuid(),
  tipo           text        not null
    constraint drive_tarefas_tipo_check
    check (tipo in ('provisionar_parceiro', 'criar_pasta_cliente', 'compartilhar', 'revogar')),
  aluno_id       uuid        references gps.ambientes(aluno_id) on delete cascade,
  cliente_id     uuid        references gps.etapa1_clientes(id) on delete cascade,
  estado         text        not null default 'pendente'
    constraint drive_tarefas_estado_check
    check (estado in ('pendente', 'rodando', 'feito', 'erro')),
  tentativas     int         not null default 0 constraint drive_tarefas_tentativas_check check (tentativas between 0 and 100),
  erro           text        constraint drive_tarefas_erro_check check (erro is null or char_length(erro) <= 300),
  erro_detalhe   text        constraint drive_tarefas_erro_detalhe_check check (erro_detalhe is null or char_length(erro_detalhe) <= 300),
  -- códigos curtos separados por vírgula: email_nao_google, sem_login, documentos_ausente
  aviso          text        constraint drive_tarefas_aviso_check check (aviso is null or aviso ~ '^[a-z_]{1,40}(,[a-z_]{1,40}){0,5}$'),
  solicitado_por uuid        references auth.users(id) on delete set null,
  proxima_em     timestamptz not null default now(),
  iniciado_em    timestamptz,
  concluido_em   timestamptz,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  constraint drive_tarefas_cliente_coerente
    check ((tipo = 'criar_pasta_cliente') = (cliente_id is not null)),
  constraint drive_tarefas_aluno_coerente
    check ((tipo = 'revogar') = (aluno_id is null))
);

comment on table gps.drive_tarefas is
  'Fila da integracao Google Drive (347). Escrita SO por funcoes SECURITY DEFINER: drive_provisionar_parceiro / drive_criar_pasta_cliente (authenticated, com guarda) e drive_tarefa_* (service_role, chamadas pela edge drive-provisionar). authenticated le so se admin (RLS); o parceiro le o estado por gps.drive_estado. erro = frase para a tela; erro_detalhe = tecnico (status/razao do Google, sem token nem corpo), so admin.';

-- Fila: o cron e o pegar leem só pendente vencida.
create index drive_tarefas_fila_idx
  on gps.drive_tarefas (proxima_em)
  where estado = 'pendente';

-- Rodando: trava "uma por aluno" no pegar e varredura de abandonada.
create index drive_tarefas_rodando_idx
  on gps.drive_tarefas (aluno_id, iniciado_em)
  where estado = 'rodando';

-- No máximo UMA ativa por (tipo, aluno, cliente): clique duplo não duplica.
create unique index drive_tarefas_ativa_uq
  on gps.drive_tarefas (tipo, aluno_id, coalesce(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where estado in ('pendente', 'rodando');

-- 'revogar' (aluno_id nulo escapa do índice acima: nulos são distintos):
-- no máximo UMA ativa (pendente ou rodando). Incluir 'rodando' é o que deixa
-- pausa/transitório/varredura voltarem a tarefa para 'pendente' sem 23505.
-- Marcação que chega durante a execução não se perde: o concluir 'feito'
-- reenfileira se sobrou item (gps.drive_revogar_enfileirar).
create unique index drive_tarefas_revogar_ativa_uq
  on gps.drive_tarefas (tipo)
  where tipo = 'revogar' and estado in ('pendente', 'rodando');

-- Leitura "última tarefa" por aluno e por cliente (gps.drive_estado) e o teto
-- diário de criar_pasta_cliente (drive_criar_pasta_cliente).
create index drive_tarefas_aluno_idx
  on gps.drive_tarefas (aluno_id, criado_em desc);
create index drive_tarefas_cliente_idx
  on gps.drive_tarefas (cliente_id, criado_em desc)
  where cliente_id is not null;

create trigger trg_drive_tarefas_atualizado_em
  before update on gps.drive_tarefas
  for each row execute function gps.touch_atualizado_em();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) gps.drive_pastas — espelho do que o sistema criou (ou adotou) no Drive
-- ═══════════════════════════════════════════════════════════════════════════
create table gps.drive_pastas (
  file_id    text        primary key
    constraint drive_pastas_file_id_formato check (file_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  aluno_id   uuid        not null references gps.ambientes(aluno_id) on delete cascade,
  cliente_id uuid        references gps.etapa1_clientes(id) on delete cascade,
  papel      text        not null
    constraint drive_pastas_papel_check
    check (papel in ('raiz_parceiro', 'documentos', 'clientes', 'raiz_cliente', 'sub_cliente')),
  nome       text        not null
    constraint drive_pastas_nome_check check (char_length(nome) between 1 and 200 and nome !~ '[[:cntrl:]]'),
  adotada    boolean     not null default false,
  criado_em  timestamptz not null default now(),
  constraint drive_pastas_cliente_coerente
    check ((papel in ('raiz_cliente', 'sub_cliente')) = (cliente_id is not null))
);

comment on table gps.drive_pastas is
  'Espelho das pastas do Drive que o sistema criou (adotada=false) ou adotou (adotada=true: pasta-raiz que a equipe ja tinha feito). Escrita SO por gps.drive_pasta_registrar (service_role, edge). Toda pasta criada leva appProperties.gps_id no Drive; este espelho e atalho, a idempotencia mora no Drive.';

create unique index drive_pastas_parceiro_papel_uq
  on gps.drive_pastas (aluno_id, papel)
  where papel in ('raiz_parceiro', 'documentos', 'clientes');

create unique index drive_pastas_raiz_cliente_uq
  on gps.drive_pastas (cliente_id)
  where papel = 'raiz_cliente';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3b) gps.drive_permissoes — o que o SISTEMA concedeu no Drive (para revogar)
-- ═══════════════════════════════════════════════════════════════════════════
-- Uma linha por permissão criada pela edge (raiz reader, DOCUMENTOS e
-- CLIENTES writer). Permissão que já existia (dada à mão pela equipe) NÃO
-- entra: só se revoga o que o sistema deu.
-- aluno_id e user_id SEM FK, de propósito: admin_excluir_acesso apaga o
-- ambiente e pode apagar o login; a linha tem de sobreviver para a revogação
-- acontecer depois. user_id = titular a quem a permissão foi dada (resolvido
-- no banco pelo e-mail, nunca vindo da edge); null = concessão obsoleta
-- (o titular mudou durante a tarefa) e já nasce marcada para revogar.
-- Marcação: gps.drive_revogar_marcar, chamada pelos gatilhos em gps.membros
-- (titular trocado/removido/movido, ambiente excluído) e em gps.acessos_log
-- (email_login_alterado). A tarefa 'revogar' (aluno_id nulo) executa.
create table gps.drive_permissoes (
  id             uuid        primary key default gen_random_uuid(),
  file_id        text        not null
    constraint drive_permissoes_file_id_formato check (file_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  permission_id  text        not null
    constraint drive_permissoes_permission_id_formato check (permission_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  email          text        not null
    constraint drive_permissoes_email_check check (char_length(email) between 3 and 254 and email !~ '[[:cntrl:][:space:]]'),
  papel          text        not null
    constraint drive_permissoes_papel_check check (papel in ('reader', 'writer')),
  aluno_id       uuid        not null,
  user_id        uuid,
  concedido_em   timestamptz not null default now(),
  revogar_desde  timestamptz,
  revogar_motivo text
    constraint drive_permissoes_motivo_check
    check (revogar_motivo is null or revogar_motivo in ('titular_trocado', 'membro_removido', 'email_trocado', 'concessao_obsoleta')),
  revogado_em    timestamptz,
  -- falhas da revogação deste item; 4 = desistiu (1 tentativa + 3 retentativas)
  tentativas     int         not null default 0
    constraint drive_permissoes_tentativas_check check (tentativas between 0 and 4),
  erro_detalhe   text
    constraint drive_permissoes_erro_detalhe_check check (erro_detalhe is null or char_length(erro_detalhe) <= 300),
  constraint drive_permissoes_uq unique (file_id, permission_id),
  constraint drive_permissoes_marcacao_coerente
    check ((revogar_desde is null) = (revogar_motivo is null))
);

comment on table gps.drive_permissoes is
  'Permissoes do Drive que a edge drive-provisionar CONCEDEU (347). Sem FK em aluno_id/user_id: sobrevive a exclusao do ambiente/login para a revogacao acontecer. revogar_desde marcado por gps.drive_revogar_marcar (gatilhos em gps.membros e gps.acessos_log); a tarefa revogar apaga a permissao no Drive e carimba revogado_em. Escrita SO por funcoes SECURITY DEFINER. So admin le.';

-- Marcação pelos gatilhos: (aluno, titular) com permissão viva.
create index drive_permissoes_dono_idx
  on gps.drive_permissoes (aluno_id, user_id)
  where revogado_em is null;

-- Fila da revogação.
create index drive_permissoes_revogar_idx
  on gps.drive_permissoes (revogar_desde)
  where revogar_desde is not null and revogado_em is null;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) RLS + grants: SELECT só admin; escrita nenhuma para ninguém fora das funções
-- ═══════════════════════════════════════════════════════════════════════════
alter table gps.drive_tarefas enable row level security;
alter table gps.drive_pastas  enable row level security;
alter table gps.drive_permissoes enable row level security;

create policy drive_tarefas_admin_select on gps.drive_tarefas
  for select to authenticated
  using (coalesce(public.gp_is_admin(), false));

create policy drive_pastas_admin_select on gps.drive_pastas
  for select to authenticated
  using (coalesce(public.gp_is_admin(), false));

create policy drive_permissoes_admin_select on gps.drive_permissoes
  for select to authenticated
  using (coalesce(public.gp_is_admin(), false));

-- Tabela nova nasce gravável por authenticated (default privileges do schema
-- gps): `grant select` sozinho NÃO tira insert/update/delete, e `revoke from
-- anon` não pega o que vem de PUBLIC. service_role também sai: a edge só
-- passa pelas RPCs (BYPASSRLS leria/escreveria a tabela inteira).
revoke all    on table gps.drive_tarefas from public, anon, authenticated, service_role;
revoke all    on table gps.drive_pastas  from public, anon, authenticated, service_role;
revoke all    on table gps.drive_permissoes from public, anon, authenticated, service_role;
grant  select on table gps.drive_tarefas to authenticated;
grant  select on table gps.drive_pastas  to authenticated;
grant  select on table gps.drive_permissoes to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) Internas: interruptor, segredo (Vault), cutucada
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function gps.drive_ativo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((select btrim(c.valor) = 'true'
                     from gps.config c
                    where c.chave = 'drive_provisionar_ativo'), false);
$function$;

revoke all on function gps.drive_ativo() from public, anon, authenticated, service_role;

-- Porta única do segredo (molde de gps.gcal_espelho_segredo, …325).
create or replace function gps.drive_segredo()
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select nullif(btrim(coalesce((
    select decrypted_secret from vault.decrypted_secrets
     where name = 'gps_drive_segredo' limit 1), '')), '');
$function$;

revoke all on function gps.drive_segredo() from public, anon, authenticated, service_role;

-- Devolve o request_id do pg_net, ou null quando desligado/sem segredo.
-- Corpo só com o id da tarefa (a edge nem usa: processa a fila).
create or replace function gps.drive_chamar(p_tarefa_id uuid default null)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_url     text;
  v_segredo text;
  v_req     bigint;
begin
  if not gps.drive_ativo() then
    return null;
  end if;

  select nullif(btrim(valor), '') into v_url from gps.config where chave = 'drive_provisionar_url';
  v_segredo := gps.drive_segredo();
  if v_url is null or v_segredo is null then
    raise warning 'drive: url ou segredo ausente; tarefa fica para o cron';
    return null;
  end if;

  select net.http_post(
    url     := v_url,
    body    := jsonb_build_object('tarefa_id', p_tarefa_id),
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-drive-segredo', v_segredo),
    timeout_milliseconds := 10000
  ) into v_req;

  return v_req;
end;
$function$;

revoke all on function gps.drive_chamar(uuid) from public, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5b) Revogação: enfileirar e marcar (internas; chamadas por gatilho e RPC)
-- ═══════════════════════════════════════════════════════════════════════════
-- Sem cutucada (pg_net) aqui: o gatilho roda no meio de admin_trocar_titular /
-- admin_excluir_acesso e não deve depender de rede; o cron (1 min) pega.
create or replace function gps.drive_revogar_enfileirar()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if exists (select 1 from gps.drive_permissoes p
              where p.revogar_desde is not null and p.revogado_em is null
                and p.tentativas < 4) then
    insert into gps.drive_tarefas (tipo, aluno_id)
    values ('revogar', null)
    on conflict (tipo) where tipo = 'revogar' and estado in ('pendente', 'rodando') do nothing;
  end if;
end;
$function$;

revoke all on function gps.drive_revogar_enfileirar() from public, anon, authenticated, service_role;

-- Marca para revogar as permissões vivas que o sistema deu a (ambiente, titular).
-- p_email_atual (troca de e-mail): só marca as concedidas a OUTRO e-mail.
-- Devolve quantas marcou. Sem linha = 1 index scan vazio (drive_permissoes_dono_idx).
create or replace function gps.drive_revogar_marcar(
  p_aluno_id    uuid,
  p_user_id     uuid,
  p_motivo      text,
  p_email_atual text default null
)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_n int;
begin
  if p_aluno_id is null or p_user_id is null then
    return 0;
  end if;

  update gps.drive_permissoes p
     set revogar_desde  = now(),
         revogar_motivo = p_motivo,
         tentativas     = 0,
         erro_detalhe   = null
   where p.aluno_id = p_aluno_id
     and p.user_id  = p_user_id
     and p.revogado_em is null
     and p.revogar_desde is null
     and (p_email_atual is null or lower(btrim(p.email)) <> lower(btrim(p_email_atual)));
  get diagnostics v_n = row_count;

  if v_n > 0 then
    perform gps.drive_revogar_enfileirar();
  end if;
  return v_n;
end;
$function$;

revoke all on function gps.drive_revogar_marcar(uuid, uuid, text, text) from public, anon, authenticated, service_role;

-- Gatilho em gps.membros: o titular que perdeu o posto (trocar_titular,
-- converter_titular_em_socio), mudou de login (resgate), foi movido ou
-- apagado (admin_excluir_membro, admin_excluir_acesso — inclusive por
-- cascade) perde o acesso que o sistema deu. Um gatilho cobre TODOS os
-- escritores de gps.membros sem recriar nenhuma função de acesso.
create or replace function gps.drive_membros_revogar()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  -- Falha aqui NUNCA desfaz troca de titular / exclusão (molde das triggers
  -- do diário, …008). Pior caso: a permissão fica viva até o próximo
  -- compartilhar (drive_tarefa_pegar reconcilia pelo e-mail atual).
  begin
    if tg_op = 'UPDATE'
       and new.papel = 'titular'
       and new.user_id is not distinct from old.user_id
       and new.aluno_id is not distinct from old.aluno_id then
      return null;
    end if;
    perform gps.drive_revogar_marcar(
      old.aluno_id, old.user_id,
      case when tg_op = 'DELETE' then 'membro_removido' else 'titular_trocado' end,
      null);
  exception when others then
    raise warning 'drive: revogacao nao marcada (%): %', sqlstate, sqlerrm;
  end;
  return null;
end;
$function$;

revoke all on function gps.drive_membros_revogar() from public, anon, authenticated, service_role;

create trigger trg_membros_drive_revogar
  after update of user_id, papel, aluno_id or delete on gps.membros
  for each row
  when (old.papel = 'titular' and old.user_id is not null)
  execute function gps.drive_membros_revogar();

-- Gatilho em gps.acessos_log: a troca de e-mail do login
-- (gps.admin_trocar_email_login) grava 'email_login_alterado' com o e-mail
-- NOVO em email_alvo. Permissão dada ao e-mail antigo é revogada.
-- Gatilho no log, e não em auth.users: auth.users é dos 7 sistemas do grupo.
create or replace function gps.drive_email_trocado_revogar()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  -- Falha aqui NUNCA desfaz a troca de e-mail nem o log.
  begin
    perform gps.drive_revogar_marcar(new.aluno_id, new.user_id_alvo, 'email_trocado',
                                     coalesce(new.email_alvo, ''));
  exception when others then
    raise warning 'drive: revogacao nao marcada (%): %', sqlstate, sqlerrm;
  end;
  return null;
end;
$function$;

revoke all on function gps.drive_email_trocado_revogar() from public, anon, authenticated, service_role;

-- 🔴 acessos_log tinha INSERT/UPDATE/DELETE concedido a authenticated (medido
-- pelo kirad ao vivo; hoje negado só pela RLS, que não tem policy de escrita).
-- Com este gatilho, um insert de aluno com 'email_login_alterado' forçaria a
-- revogação de outro ambiente no dia em que alguém criar uma policy de insert.
-- Toda escrita legítima é de função SECURITY DEFINER (grep em src: o TS só
-- faz SELECT em acessos_log, src/lib/data/diario.ts).
-- PUBLIC junto: revoke de anon não pega o que vem de PUBLIC.
revoke insert, update, delete on table gps.acessos_log from public, authenticated, anon;

create trigger trg_acessos_log_drive_revogar
  after insert on gps.acessos_log
  for each row
  when (new.acao = 'email_login_alterado')
  execute function gps.drive_email_trocado_revogar();

-- ═══════════════════════════════════════════════════════════════════════════
-- 6) Varredura (cron a cada 1 min): recupera abandonada e cutuca se houver fila
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function gps.drive_varrer()
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_n int;
begin
  if not gps.drive_ativo() then
    return 0;
  end if;

  -- Rodando há mais de 10 min = a edge morreu no meio (limite de parede).
  -- Volta para a fila contando a tentativa. Teto: 1 tentativa + 3
  -- retentativas; a 4ª falha vira erro (mesmo teto de drive_tarefa_concluir).
  update gps.drive_tarefas t
     set tentativas   = t.tentativas + 1,
         estado       = case when t.tentativas + 1 >= 4 then 'erro' else 'pendente' end,
         erro         = case when t.tentativas + 1 >= 4
                             then 'O Google Drive não respondeu a tempo. Tente de novo.'
                             else t.erro end,
         erro_detalhe = 'rodando abandonada (> 10 min)',
         concluido_em = case when t.tentativas + 1 >= 4 then now() else null end,
         proxima_em   = now()
   where t.estado = 'rodando'
     and t.iniciado_em < now() - interval '10 minutes';

  select count(*) into v_n
    from (select 1 from gps.drive_tarefas
           where estado = 'pendente' and proxima_em <= now()
           limit 1) x;

  if v_n > 0 then
    perform gps.drive_chamar(null);
  end if;
  return v_n;
end;
$function$;

revoke all on function gps.drive_varrer() from public, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7) RPCs do usuário (authenticated) — SECURITY DEFINER, guarda com coalesce
-- ═══════════════════════════════════════════════════════════════════════════

-- 7.1) Equipe pede a pasta do parceiro. Já provisionado → reenfileira só o
-- compartilhamento ('compartilhar'), que a edge resolve sem copiar nada.
create or replace function gps.drive_provisionar_parceiro(p_aluno_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_uid   uuid    := auth.uid();
  v_admin boolean := coalesce(public.gp_is_admin(), false);
  v_url   text;
  v_raiz  text;
  v_tipo  text;
  v_id    uuid;
begin
  if v_uid is null then
    raise exception 'Sessão expirada. Entre de novo.' using errcode = '42501';
  end if;
  if not v_admin then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_aluno_id is null then
    raise exception 'Ambiente não informado.' using errcode = '22023';
  end if;
  if not gps.drive_ativo() then
    raise exception 'A criação automática de pastas está desligada.' using errcode = 'P0001';
  end if;

  select a.pasta_drive_url into v_url
    from gps.ambientes a
   where a.aluno_id = p_aluno_id;
  if not found then
    raise exception 'Ambiente não encontrado.' using errcode = 'P0002';
  end if;

  -- Já existe uma ativa (qualquer dos dois tipos do parceiro)? Devolve ela.
  select t.id into v_id
    from gps.drive_tarefas t
   where t.aluno_id = p_aluno_id
     and t.tipo in ('provisionar_parceiro', 'compartilhar')
     and t.estado in ('pendente', 'rodando')
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  select p.file_id into v_raiz
    from gps.drive_pastas p
   where p.aluno_id = p_aluno_id and p.papel = 'raiz_parceiro';

  v_tipo := case
              when v_raiz is not null and v_url is not null
                   and position(v_raiz in v_url) > 0
              then 'compartilhar'
              else 'provisionar_parceiro'
            end;

  begin
    insert into gps.drive_tarefas (tipo, aluno_id, solicitado_por)
    values (v_tipo, p_aluno_id, v_uid)
    returning id into v_id;
  exception when unique_violation then
    select t.id into v_id
      from gps.drive_tarefas t
     where t.aluno_id = p_aluno_id and t.tipo = v_tipo
       and t.estado in ('pendente', 'rodando')
     limit 1;
    return v_id;
  end;

  -- Cutucada nunca derruba o pedido: a tarefa gravada é o que garante; o cron repassa.
  begin
    perform gps.drive_chamar(v_id);
  exception when others then
    raise warning 'drive: cutucada falhou (%); fica para o cron', sqlstate;
  end;

  return v_id;
end;
$function$;

comment on function gps.drive_provisionar_parceiro(uuid) is
  'Enfileira a criacao (ou adocao, so de link com origem equipe; conferida de novo na edge e em drive_pasta_registrar) da pasta-raiz do parceiro no Drive + 5) CLIENTES + compartilhamento com o titular. So admin (coalesce(gp_is_admin(),false)). Desligado (drive_provisionar_ativo) -> P0001. Ja provisionado (raiz em drive_pastas e o link do ambiente aponta para ela) -> enfileira so ''compartilhar''. Tarefa ativa existente -> devolve o id dela (idempotente).';

-- 7.2) Dono do ambiente (titular/sócio) ou equipe pede a pasta do cliente.
create or replace function gps.drive_criar_pasta_cliente(p_cliente_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_uid      uuid    := auth.uid();
  v_admin    boolean := coalesce(public.gp_is_admin(), false);
  v_ambiente uuid    := gps.aluno_atual();
  v_aluno    uuid;
  v_link     text;
  v_pasta    text;
  v_id       uuid;
  v_n        int;
begin
  if v_uid is null then
    raise exception 'Sessão expirada. Entre de novo.' using errcode = '42501';
  end if;
  if p_cliente_id is null then
    raise exception 'Cliente não encontrado.' using errcode = '22023';
  end if;

  select c.aluno_id into v_aluno
    from gps.etapa1_clientes c
   where c.id = p_cliente_id;
  if not found then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;
  if not (v_admin or coalesce(v_ambiente = v_aluno, false)) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if not gps.drive_ativo() then
    raise exception 'A criação automática de pastas está desligada.' using errcode = 'P0001';
  end if;

  select l.url into v_link
    from gps.cliente_links_drive l
   where l.cliente_id = p_cliente_id and l.removido_em is null;
  if v_link is not null then
    select p.file_id into v_pasta
      from gps.drive_pastas p
     where p.cliente_id = p_cliente_id and p.papel = 'raiz_cliente';
    if v_pasta is not null and position(v_pasta in v_link) > 0 then
      raise exception 'A pasta deste cliente já foi criada.' using errcode = 'P0001';
    end if;
    raise exception 'Este cliente já tem uma pasta ligada.' using errcode = 'P0001';
  end if;

  select t.id into v_id
    from gps.drive_tarefas t
   where t.cliente_id = p_cliente_id
     and t.tipo = 'criar_pasta_cliente'
     and t.estado in ('pendente', 'rodando')
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  -- 🔴 Só cria dentro de raiz que a EQUIPE mandou organizar (tarefa
  -- provisionar_parceiro/compartilhar, só admin). Nunca provisiona o parceiro
  -- a partir daqui: era o caminho para adotar pasta alheia colada pelo
  -- parceiro (achado ALTO do kirad). A edge confere de novo.
  if not exists (select 1 from gps.drive_pastas p
                  where p.aluno_id = v_aluno and p.papel = 'raiz_parceiro')
     or not exists (select 1 from gps.drive_pastas p
                     where p.aluno_id = v_aluno and p.papel = 'clientes') then
    raise exception 'A pasta do parceiro ainda não foi organizada pela equipe.' using errcode = 'P0001';
  end if;

  -- Teto: 20 pedidos de pasta de cliente por ambiente em 24 h (janela móvel).
  -- Lock por ambiente: dois cliques simultâneos não furam o teto.
  -- drive_tarefas_aluno_idx (aluno_id, criado_em desc) serve a contagem.
  perform pg_advisory_xact_lock(hashtext('gps.drive_criar_pasta_cliente:' || v_aluno::text));
  select count(*) into v_n
    from gps.drive_tarefas t
   where t.aluno_id = v_aluno
     and t.criado_em >= now() - interval '24 hours'
     and t.tipo = 'criar_pasta_cliente';
  if v_n >= 20 then
    raise exception 'Limite de 20 pastas de cliente por dia atingido. Tente de novo amanhã.' using errcode = 'P0001';
  end if;

  begin
    insert into gps.drive_tarefas (tipo, aluno_id, cliente_id, solicitado_por)
    values ('criar_pasta_cliente', v_aluno, p_cliente_id, v_uid)
    returning id into v_id;
  exception when unique_violation then
    select t.id into v_id
      from gps.drive_tarefas t
     where t.cliente_id = p_cliente_id and t.tipo = 'criar_pasta_cliente'
       and t.estado in ('pendente', 'rodando')
     limit 1;
    return v_id;
  end;

  begin
    perform gps.drive_chamar(v_id);
  exception when others then
    raise warning 'drive: cutucada falhou (%); fica para o cron', sqlstate;
  end;

  return v_id;
end;
$function$;

comment on function gps.drive_criar_pasta_cliente(uuid) is
  'Enfileira a criacao da pasta do cliente dentro de 5) CLIENTES do parceiro. NAO provisiona o parceiro: sem raiz_parceiro + clientes em drive_pastas -> P0001 ''A pasta do parceiro ainda nao foi organizada pela equipe.''. Teto 20 por ambiente em 24 h (P0001, lock consultivo por ambiente). Guarda: admin OU gps.aluno_atual() = aluno_id do cliente, com coalesce. Desligado -> P0001. Cliente com link ativo: pasta criada pelo sistema -> ''A pasta deste cliente ja foi criada.''; link colado -> ''Este cliente ja tem uma pasta ligada.'' (P0001). Tarefa ativa -> devolve o id dela.';

-- 7.3) Estado para a tela (parceiro e equipe). A tabela é só-admin; esta é a
-- porta de leitura do parceiro. erro_detalhe só volta para a equipe.
create or replace function gps.drive_estado(p_aluno_id uuid, p_cliente_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid   uuid    := auth.uid();
  v_admin boolean := coalesce(public.gp_is_admin(), false);
  v_par   jsonb;
  v_cli   jsonb   := null;
  v_url   text;
begin
  if v_uid is null then
    raise exception 'Sessão expirada. Entre de novo.' using errcode = '42501';
  end if;
  if p_aluno_id is null then
    raise exception 'Ambiente não informado.' using errcode = '22023';
  end if;
  if not (v_admin or coalesce(gps.aluno_atual() = p_aluno_id, false)) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_cliente_id is not null and not exists (
    select 1 from gps.etapa1_clientes c
     where c.id = p_cliente_id and c.aluno_id = p_aluno_id
  ) then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;

  select a.pasta_drive_url into v_url from gps.ambientes a where a.aluno_id = p_aluno_id;

  select jsonb_build_object(
           'tarefa_id', t.id, 'tipo', t.tipo, 'estado', t.estado,
           'erro', t.erro,
           'erro_detalhe', case when v_admin then t.erro_detalhe end,
           'aviso', t.aviso, 'atualizado_em', t.atualizado_em)
    into v_par
    from gps.drive_tarefas t
   where t.aluno_id = p_aluno_id
     and t.tipo in ('provisionar_parceiro', 'compartilhar')
   order by t.criado_em desc
   limit 1;

  v_par := coalesce(v_par, '{}'::jsonb) || jsonb_build_object('url', v_url);

  if p_cliente_id is not null then
    select jsonb_build_object(
             'tarefa_id', t.id, 'tipo', t.tipo, 'estado', t.estado,
             'erro', t.erro,
             'erro_detalhe', case when v_admin then t.erro_detalhe end,
             'aviso', t.aviso, 'atualizado_em', t.atualizado_em)
      into v_cli
      from gps.drive_tarefas t
     where t.cliente_id = p_cliente_id
       and t.tipo = 'criar_pasta_cliente'
     order by t.criado_em desc
     limit 1;

    v_cli := coalesce(v_cli, '{}'::jsonb) || jsonb_build_object('url', (
      select l.url from gps.cliente_links_drive l
       where l.cliente_id = p_cliente_id and l.removido_em is null));
  end if;

  return jsonb_build_object('ativo', gps.drive_ativo(), 'parceiro', v_par, 'cliente', v_cli);
end;
$function$;

comment on function gps.drive_estado(uuid, uuid) is
  'Estado da ultima tarefa do Drive do parceiro (provisionar/compartilhar) e, com p_cliente_id, do cliente (criar_pasta_cliente), mais o link atual de cada um e o interruptor. Guarda: admin OU gps.aluno_atual() = p_aluno_id (coalesce). Cliente de outro ambiente -> P0002. erro_detalhe so para admin.';

-- 🔴 Função nova nasce executável por PUBLIC: revoke nomeando PUBLIC.
revoke all     on function gps.drive_provisionar_parceiro(uuid) from public, anon;
revoke all     on function gps.drive_criar_pasta_cliente(uuid) from public, anon;
revoke all     on function gps.drive_estado(uuid, uuid) from public, anon;
grant  execute on function gps.drive_provisionar_parceiro(uuid) to authenticated;
grant  execute on function gps.drive_criar_pasta_cliente(uuid) to authenticated;
grant  execute on function gps.drive_estado(uuid, uuid) to authenticated;

commit;

-- Cron: a cada 1 min. Desligado ou fila vazia = 1 leitura de config + 1 index
-- scan vazio no índice parcial drive_tarefas_fila_idx.
select cron.unschedule('drive-provisionar-varrer')
 where exists (select 1 from cron.job where jobname = 'drive-provisionar-varrer');

select cron.schedule(
  'drive-provisionar-varrer',
  '* * * * *',
  $cron$ select gps.drive_varrer(); $cron$
);

begin;

set local lock_timeout = '2s';
set local statement_timeout = '20s';

-- ═══════════════════════════════════════════════════════════════════════════
-- 8) RPCs da edge — SÓ service_role
-- ═══════════════════════════════════════════════════════════════════════════
grant usage on schema gps to service_role;

-- 8.1) Pega até p_limite pendentes vencidas, no máximo UMA por aluno e nunca
-- de aluno que já tem tarefa rodando (duas execuções da edge criando a mesma
-- raiz ao mesmo tempo duplicariam a pasta). Lock consultivo serializa o pegar.
-- Devolve o CONTEXTO de cada uma: a edge não recebe nada do navegador.
create or replace function gps.drive_tarefa_pegar(p_limite int default 3)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_ids uuid[];
  v_n   int;
begin
  if not gps.drive_ativo() then
    return '[]'::jsonb;
  end if;

  perform pg_advisory_xact_lock(hashtext('gps.drive_tarefa_pegar'));

  with cand as (
    select distinct on (t.aluno_id) t.id, t.proxima_em
      from gps.drive_tarefas t
     where t.estado = 'pendente'
       and t.proxima_em <= now()
       -- 'revogar' tem aluno_id nulo: "is not distinct from" faz duas
       -- revogar nunca rodarem juntas (o conjunto rodando é minúsculo).
       and not exists (
         select 1 from gps.drive_tarefas r
          where r.aluno_id is not distinct from t.aluno_id and r.estado = 'rodando')
     order by t.aluno_id, t.proxima_em
  ), lim as (
    select c.id from cand c
     order by c.proxima_em
     limit least(greatest(coalesce(p_limite, 3), 1), 10)
  ), upd as (
    update gps.drive_tarefas t
       set estado = 'rodando', iniciado_em = now()
      from lim
     where t.id = lim.id
    returning t.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from upd;

  -- E-mail trocado FORA do painel (updateUser, outro portal do grupo): nenhum
  -- gatilho do GPS vê. Ao processar provisionar/compartilhar, toda permissão
  -- viva que o sistema deu a quem não é mais (titular, mesmo e-mail atual)
  -- vira revogação. Aqui e não em drive_revogacoes_listar: a listagem só roda
  -- quando já existe tarefa 'revogar', e a troca externa não cria nenhuma.
  update gps.drive_permissoes p
     set revogar_desde = now(), revogar_motivo = 'email_trocado',
         tentativas = 0, erro_detalhe = null
   where p.revogado_em is null
     and p.revogar_desde is null
     and p.aluno_id in (select t.aluno_id from gps.drive_tarefas t
                         where t.id = any(v_ids)
                           and t.tipo in ('provisionar_parceiro', 'compartilhar'))
     and not exists (select 1
                       from gps.membros m
                       join auth.users u on u.id = m.user_id
                      where m.aluno_id = p.aluno_id
                        and m.user_id = p.user_id
                        and m.papel = 'titular'
                        and lower(btrim(u.email)) = p.email);
  get diagnostics v_n = row_count;
  if v_n > 0 then
    perform gps.drive_revogar_enfileirar();
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',              t.id,
      'tipo',            t.tipo,
      'aluno_id',        t.aluno_id,
      'cliente_id',      t.cliente_id,
      'tentativas',      t.tentativas,
      'parceiro_nome',   (select nullif(btrim(a.nome), '') from public.thb_alunos a where a.id = t.aluno_id),
      'pasta_drive_url', amb.pasta_drive_url,
      -- Adoção de pasta existente exige origem 'equipe' E pedido de admin
      -- (mesmo predicado de public.gp_is_admin, aplicado a quem pediu).
      'pasta_drive_origem', amb.pasta_drive_origem,
      'solicitado_por_admin', coalesce((select true from public.perfis p
                                         where p.id = t.solicitado_por
                                           and p.status = 'ativo'
                                           and p.cargo in ('dev', 'admin')), false),
      'titular_email',   (select lower(btrim(u.email))
                            from gps.membros m
                            join auth.users u on u.id = m.user_id
                           where m.aluno_id = t.aluno_id and m.papel = 'titular'
                           order by m.criado_em
                           limit 1),
      'cliente_nome',    (select nullif(btrim(c.nome), '') from gps.etapa1_clientes c where c.id = t.cliente_id),
      'cliente_link_url',(select l.url from gps.cliente_links_drive l
                           where l.cliente_id = t.cliente_id and l.removido_em is null),
      'pastas',          (select coalesce(jsonb_object_agg(p.papel,
                                   jsonb_build_object('file_id', p.file_id, 'adotada', p.adotada)), '{}'::jsonb)
                            from gps.drive_pastas p
                           where p.aluno_id = t.aluno_id
                             and p.papel in ('raiz_parceiro', 'documentos', 'clientes')),
      'pasta_cliente',   (select p.file_id from gps.drive_pastas p
                           where p.cliente_id = t.cliente_id and p.papel = 'raiz_cliente')
    ))
      from gps.drive_tarefas t
      left join gps.ambientes amb on amb.aluno_id = t.aluno_id
     where t.id = any(v_ids)
  ), '[]'::jsonb);
end;
$function$;

-- 8.2) Registra pasta criada/adotada. aluno_id e cliente_id vêm da TAREFA,
-- não da edge. Pasta do parceiro: 1 por papel (troca o file_id se a antiga
-- foi para a lixeira e a edge recriou).
create or replace function gps.drive_pasta_registrar(
  p_tarefa_id uuid,
  p_file_id   text,
  p_papel     text,
  p_nome      text,
  p_adotada   boolean default false
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_t    record;
  v_orig text;
  v_nome text := left(btrim(regexp_replace(coalesce(p_nome, ''), '[[:cntrl:]]', ' ', 'g')), 200);
begin
  select t.id, t.tipo, t.aluno_id, t.cliente_id, t.solicitado_por into v_t
    from gps.drive_tarefas t
   where t.id = p_tarefa_id and t.estado = 'rodando';
  if not found or v_t.aluno_id is null then
    raise exception 'tarefa nao esta rodando' using errcode = 'P0002';
  end if;
  if p_file_id is null or p_file_id !~ '^[A-Za-z0-9_-]{10,200}$' then
    raise exception 'file_id invalido' using errcode = '22023';
  end if;
  if v_nome = '' then
    v_nome := 'Pasta';
  end if;

  -- 🔴 Pasta de OUTRO parceiro nunca vira deste (achado ALTO do kirad).
  -- Raiz "Pastas dos Alunos" e a matriz nunca são registradas.
  if p_file_id in ('1CRSsOfNm_PO944c3K05Nx0aI2oXehG7N', '1T-EiOQWQgu_qXK8rtbr7BzByNW_jzm3L') then
    raise exception 'Esta pasta não pode ser usada como pasta de parceiro.' using errcode = 'P0001';
  end if;
  if exists (select 1 from gps.drive_pastas p
              where p.file_id = p_file_id and p.aluno_id <> v_t.aluno_id) then
    raise exception 'Esta pasta já pertence a outro parceiro.' using errcode = 'P0001';
  end if;

  if p_papel = 'raiz_parceiro' then
    -- Link de OUTRO ambiente apontando para esta pasta (135 linhas; regex
    -- igual à de drive_parceiro_link_gravar).
    if exists (select 1 from gps.ambientes a
                where a.aluno_id <> v_t.aluno_id
                  and a.pasta_drive_url is not null
                  and (a.pasta_drive_url ~ ('/folders/' || p_file_id || '([/?#]|$)')
                       or a.pasta_drive_url ~ ('[?&]id=' || p_file_id || '(&|#|$)'))) then
      raise exception 'Esta pasta já pertence a outro parceiro.' using errcode = 'P0001';
    end if;
    -- Adotar pasta que o sistema NÃO criou: só pedido de admin, tarefa
    -- provisionar_parceiro e link gravado pela equipe.
    if coalesce(p_adotada, false) then
      select a.pasta_drive_origem into v_orig from gps.ambientes a where a.aluno_id = v_t.aluno_id;
      if v_t.tipo <> 'provisionar_parceiro'
         or v_orig is distinct from 'equipe'
         or not coalesce((select true from public.perfis p
                           where p.id = v_t.solicitado_por
                             and p.status = 'ativo'
                             and p.cargo in ('dev', 'admin')), false) then
        raise exception 'A pasta ligada a este parceiro precisa ser conferida pela equipe antes de ser organizada.' using errcode = 'P0001';
      end if;
    end if;
  end if;

  if p_papel in ('raiz_parceiro', 'documentos', 'clientes') then
    insert into gps.drive_pastas (file_id, aluno_id, papel, nome, adotada)
    values (p_file_id, v_t.aluno_id, p_papel, v_nome, coalesce(p_adotada, false))
    on conflict (aluno_id, papel) where papel in ('raiz_parceiro', 'documentos', 'clientes')
    do update set file_id = excluded.file_id, nome = excluded.nome,
                  adotada = excluded.adotada, criado_em = now()
      where gps.drive_pastas.file_id is distinct from excluded.file_id;
  elsif p_papel = 'raiz_cliente' then
    if v_t.tipo <> 'criar_pasta_cliente' or v_t.cliente_id is null then
      raise exception 'papel incompativel com a tarefa' using errcode = '22023';
    end if;
    insert into gps.drive_pastas (file_id, aluno_id, cliente_id, papel, nome)
    values (p_file_id, v_t.aluno_id, v_t.cliente_id, 'raiz_cliente', v_nome)
    on conflict (cliente_id) where papel = 'raiz_cliente'
    do update set file_id = excluded.file_id, nome = excluded.nome, criado_em = now()
      where gps.drive_pastas.file_id is distinct from excluded.file_id;
  elsif p_papel = 'sub_cliente' then
    if v_t.tipo <> 'criar_pasta_cliente' or v_t.cliente_id is null then
      raise exception 'papel incompativel com a tarefa' using errcode = '22023';
    end if;
    insert into gps.drive_pastas (file_id, aluno_id, cliente_id, papel, nome)
    values (p_file_id, v_t.aluno_id, v_t.cliente_id, 'sub_cliente', v_nome)
    on conflict (file_id) do nothing;
  else
    raise exception 'papel invalido' using errcode = '22023';
  end if;
end;
$function$;

-- 8.3) Grava o link do parceiro em gps.ambientes com origem 'equipe' SÓ
-- quando o ambiente não tem link. Só aceita file_id já registrado como
-- raiz_parceiro DESTE aluno. Link atual de outra pasta → recusa (nunca
-- sobrescreve em silêncio); link atual desta pasta → devolve sem tocar
-- (nunca rebaixa a origem 'parceiro' para 'equipe').
create or replace function gps.drive_parceiro_link_gravar(p_tarefa_id uuid, p_file_id text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_t     record;
  v_url   text;
  v_atual text;
  v_orig  text;
begin
  select t.id, t.aluno_id, t.solicitado_por into v_t
    from gps.drive_tarefas t
   where t.id = p_tarefa_id and t.estado = 'rodando';
  if not found then
    raise exception 'tarefa nao esta rodando' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from gps.drive_pastas p
     where p.file_id = p_file_id and p.aluno_id = v_t.aluno_id and p.papel = 'raiz_parceiro'
  ) then
    raise exception 'pasta nao registrada para este parceiro' using errcode = '22023';
  end if;

  v_url := 'https://drive.google.com/drive/folders/' || p_file_id;

  select a.pasta_drive_url, a.pasta_drive_origem into v_atual, v_orig
    from gps.ambientes a
   where a.aluno_id = v_t.aluno_id
   for update;
  if not found then
    raise exception 'Ambiente não encontrado.' using errcode = 'P0002';
  end if;

  if v_atual is not null
     and v_atual !~ ('/folders/' || p_file_id || '([/?#]|$)')
     and v_atual !~ ('[?&]id=' || p_file_id || '(&|#|$)') then
    raise exception 'Este parceiro já tem outra pasta ligada.' using errcode = 'P0001';
  end if;

  -- Já aponta para esta pasta: NÃO reescreve nada. Em especial, nunca troca
  -- a origem 'parceiro' por 'equipe' (achado do kirad): quem colou continua
  -- dono do link, e a trilha pasta_drive_por/_em fica a dele.
  if v_atual is not null then
    return v_atual;
  end if;

  update gps.ambientes
     set pasta_drive_url      = v_url,
         pasta_drive_por      = v_t.solicitado_por,
         pasta_drive_por_nome = 'Equipe',
         pasta_drive_em       = now(),
         pasta_drive_origem   = 'equipe'
   where aluno_id = v_t.aluno_id
     and pasta_drive_url is null;
  return v_url;
end;
$function$;

-- 8.4) Grava o link da pasta do cliente em gps.cliente_links_drive (um por
-- cliente, …333) como equipe. Link ativo de OUTRA pasta → recusa; nunca troca.
create or replace function gps.drive_cliente_link_gravar(p_tarefa_id uuid, p_file_id text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_t     record;
  v_c     record;
  v_url   text;
  v_atual text;
  v_id    uuid;
begin
  select t.id, t.tipo, t.cliente_id, t.solicitado_por into v_t
    from gps.drive_tarefas t
   where t.id = p_tarefa_id and t.estado = 'rodando';
  if not found or v_t.tipo <> 'criar_pasta_cliente' or v_t.cliente_id is null then
    raise exception 'tarefa nao esta rodando' using errcode = 'P0002';
  end if;

  select c.id, c.aluno_id, c.nome into v_c
    from gps.etapa1_clientes c
   where c.id = v_t.cliente_id
   for no key update;
  if not found then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from gps.drive_pastas p
     where p.file_id = p_file_id and p.cliente_id = v_c.id and p.papel = 'raiz_cliente'
  ) then
    raise exception 'pasta nao registrada para este cliente' using errcode = '22023';
  end if;

  v_url := 'https://drive.google.com/drive/folders/' || p_file_id;

  select l.url into v_atual
    from gps.cliente_links_drive l
   where l.cliente_id = v_c.id and l.removido_em is null
   for update;
  if found then
    if v_atual = v_url then
      return v_url;
    end if;
    raise exception 'Este cliente já tem uma pasta ligada.' using errcode = 'P0001';
  end if;

  insert into gps.cliente_links_drive (cliente_id, aluno_id, nome, url, origem, criado_por, criado_por_nome)
  values (v_c.id, v_c.aluno_id, 'Pasta do Drive do cliente', v_url, 'equipe', v_t.solicitado_por, 'Equipe')
  returning id into v_id;

  -- Mesmo evento da …333, ator 'sistema' (quem gravou foi a integração).
  -- Detalhe {link_id, cliente_id}: NUNCA url nem nome.
  insert into gps.aluno_eventos (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
  values (v_c.aluno_id, now(), 'cliente_link_drive_adicionado', 'cliente', v_c.id,
          left(coalesce(nullif(btrim(v_c.nome), ''), 'Cliente sem nome'), 300),
          jsonb_build_object('link_id', v_id, 'cliente_id', v_c.id),
          'sistema', v_t.solicitado_por, 'app');

  return v_url;
end;
$function$;

-- 8.5) Resultado da tarefa. p_resultado:
--   feito        → estado feito (aviso opcional)
--   erro         → estado erro (frase final para a tela)
--   transitorio  → +1 tentativa; volta à fila com recuo 2^n min (teto 30);
--                  teto de 3 retentativas: a 4ª falha vira erro
-- Tarefa 'revogar' concluída com item ainda pendente → enfileira a próxima.
--   pausa        → acabou o tempo da execução; volta à fila já, sem contar
-- Só mexe em tarefa 'rodando' (se a varredura já a recuperou, ignora).
create or replace function gps.drive_tarefa_concluir(
  p_tarefa_id    uuid,
  p_resultado    text,
  p_erro         text default null,
  p_erro_detalhe text default null,
  p_aviso        text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_erro    text := nullif(left(btrim(regexp_replace(coalesce(p_erro, ''), '[[:cntrl:]]', ' ', 'g')), 300), '');
  v_detalhe text := nullif(left(btrim(regexp_replace(coalesce(p_erro_detalhe, ''), '[[:cntrl:]]', ' ', 'g')), 300), '');
  v_aviso   text := nullif(btrim(coalesce(p_aviso, '')), '');
begin
  if v_aviso is not null and v_aviso !~ '^[a-z_]{1,40}(,[a-z_]{1,40}){0,5}$' then
    v_aviso := null;
  end if;

  if p_resultado = 'feito' then
    update gps.drive_tarefas
       set estado = 'feito', erro = null, erro_detalhe = null, aviso = v_aviso,
           concluido_em = now()
     where id = p_tarefa_id and estado = 'rodando';
  elsif p_resultado = 'erro' then
    update gps.drive_tarefas
       set estado = 'erro',
           erro = coalesce(v_erro, 'Não deu para criar a pasta. Tente de novo.'),
           erro_detalhe = v_detalhe, aviso = v_aviso, concluido_em = now()
     where id = p_tarefa_id and estado = 'rodando';
  elsif p_resultado = 'transitorio' then
    update gps.drive_tarefas t
       set tentativas   = t.tentativas + 1,
           estado       = case when t.tentativas + 1 >= 4 then 'erro' else 'pendente' end,
           erro         = case when t.tentativas + 1 >= 4
                               then coalesce(v_erro, 'O Google Drive não respondeu. Tente de novo mais tarde.')
                               else null end,
           erro_detalhe = v_detalhe,
           concluido_em = case when t.tentativas + 1 >= 4 then now() else null end,
           proxima_em   = now() + least(interval '30 minutes',
                                        interval '1 minute' * power(2, t.tentativas)::int)
     where t.id = p_tarefa_id and t.estado = 'rodando';
  elsif p_resultado = 'pausa' then
    update gps.drive_tarefas
       set estado = 'pendente', proxima_em = now()
     where id = p_tarefa_id and estado = 'rodando';
  else
    raise exception 'resultado invalido' using errcode = '22023';
  end if;

  if exists (select 1 from gps.drive_tarefas t
              where t.id = p_tarefa_id and t.tipo = 'revogar' and t.estado = 'feito') then
    perform gps.drive_revogar_enfileirar();
  end if;
end;
$function$;

-- 8.6) Revogação — a edge lista o que revogar e devolve o resultado item a
-- item. Só com a tarefa 'revogar' RODANDO. A edge recebe file_id e
-- permission_id; nunca o e-mail.
create or replace function gps.drive_revogacoes_listar(p_tarefa_id uuid, p_limite int default 50)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if not exists (select 1 from gps.drive_tarefas t
                  where t.id = p_tarefa_id and t.tipo = 'revogar' and t.estado = 'rodando') then
    raise exception 'tarefa nao esta rodando' using errcode = 'P0002';
  end if;

  -- Quem voltou a ser titular do mesmo ambiente com o mesmo e-mail (trocou
  -- o titular e desfez) não perde o acesso: desmarca antes de revogar.
  update gps.drive_permissoes p
     set revogar_desde = null, revogar_motivo = null, tentativas = 0, erro_detalhe = null
   where p.revogar_desde is not null
     and p.revogado_em is null
     and p.user_id is not null
     and exists (select 1
                   from gps.membros m
                   join auth.users u on u.id = m.user_id
                  where m.aluno_id = p.aluno_id
                    and m.user_id = p.user_id
                    and m.papel = 'titular'
                    and lower(btrim(u.email)) = lower(btrim(p.email)));

  return coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'file_id', x.file_id, 'permission_id', x.permission_id)
                     order by x.revogar_desde)
      from (select p.id, p.file_id, p.permission_id, p.revogar_desde
              from gps.drive_permissoes p
             where p.revogar_desde is not null
               and p.revogado_em is null
               and p.tentativas < 4
             order by p.revogar_desde
             limit least(greatest(coalesce(p_limite, 50), 1), 100)) x
  ), '[]'::jsonb);
end;
$function$;

-- p_resultado: revogada (DELETE ok) | ausente (404: já não existia) |
--   transitorio (+1; na 4ª desiste) | erro (definitivo: desiste já).
create or replace function gps.drive_revogacao_resultado(
  p_tarefa_id uuid,
  p_id        uuid,
  p_resultado text,
  p_detalhe   text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_detalhe text := nullif(left(btrim(regexp_replace(coalesce(p_detalhe, ''), '[[:cntrl:]]', ' ', 'g')), 300), '');
begin
  if not exists (select 1 from gps.drive_tarefas t
                  where t.id = p_tarefa_id and t.tipo = 'revogar' and t.estado = 'rodando') then
    raise exception 'tarefa nao esta rodando' using errcode = 'P0002';
  end if;

  if p_resultado in ('revogada', 'ausente') then
    update gps.drive_permissoes
       set revogado_em = now(), erro_detalhe = null
     where id = p_id and revogar_desde is not null and revogado_em is null;
  elsif p_resultado = 'transitorio' then
    update gps.drive_permissoes
       set tentativas = least(tentativas + 1, 4), erro_detalhe = v_detalhe
     where id = p_id and revogar_desde is not null and revogado_em is null;
  elsif p_resultado = 'erro' then
    update gps.drive_permissoes
       set tentativas = 4, erro_detalhe = v_detalhe
     where id = p_id and revogar_desde is not null and revogado_em is null;
  else
    raise exception 'resultado invalido' using errcode = '22023';
  end if;
end;
$function$;

-- 8.7) Registra a permissão que a edge acabou de CRIAR. O titular (user_id)
-- é resolvido aqui, pelo e-mail, entre os titulares do ambiente da tarefa —
-- nunca vem da edge. Sem titular com esse e-mail (trocou no meio da tarefa)
-- = concessão obsoleta: nasce marcada e a revogação é enfileirada.
create or replace function gps.drive_permissao_registrar(
  p_tarefa_id     uuid,
  p_file_id       text,
  p_permission_id text,
  p_email         text,
  p_papel         text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_t     record;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_user  uuid;
begin
  select t.id, t.tipo, t.aluno_id into v_t
    from gps.drive_tarefas t
   where t.id = p_tarefa_id and t.estado = 'rodando'
     and t.tipo in ('provisionar_parceiro', 'compartilhar');
  if not found then
    raise exception 'tarefa nao esta rodando' using errcode = 'P0002';
  end if;
  if p_permission_id is null or p_permission_id !~ '^[A-Za-z0-9_-]{1,200}$'
     or p_papel is null or p_papel not in ('reader', 'writer')
     or v_email = '' then
    raise exception 'permissao invalida' using errcode = '22023';
  end if;
  if not exists (select 1 from gps.drive_pastas p
                  where p.file_id = p_file_id and p.aluno_id = v_t.aluno_id
                    and p.papel in ('raiz_parceiro', 'documentos', 'clientes')) then
    raise exception 'pasta nao registrada para este parceiro' using errcode = '22023';
  end if;

  select m.user_id into v_user
    from gps.membros m
    join auth.users u on u.id = m.user_id
   where m.aluno_id = v_t.aluno_id
     and m.papel = 'titular'
     and lower(btrim(u.email)) = v_email
   limit 1;

  insert into gps.drive_permissoes
    (file_id, permission_id, email, papel, aluno_id, user_id, revogar_desde, revogar_motivo)
  values
    (p_file_id, p_permission_id, v_email, p_papel, v_t.aluno_id, v_user,
     case when v_user is null then now() end,
     case when v_user is null then 'concessao_obsoleta' end)
  on conflict (file_id, permission_id) do update
     set email = excluded.email, papel = excluded.papel,
         aluno_id = excluded.aluno_id, user_id = excluded.user_id,
         concedido_em = now(),
         revogar_desde = excluded.revogar_desde, revogar_motivo = excluded.revogar_motivo,
         revogado_em = null, tentativas = 0, erro_detalhe = null;

  if v_user is null then
    perform gps.drive_revogar_enfileirar();
  end if;
end;
$function$;

revoke all on function gps.drive_tarefa_pegar(int) from public, anon, authenticated;
revoke all on function gps.drive_pasta_registrar(uuid, text, text, text, boolean) from public, anon, authenticated;
revoke all on function gps.drive_parceiro_link_gravar(uuid, text) from public, anon, authenticated;
revoke all on function gps.drive_cliente_link_gravar(uuid, text) from public, anon, authenticated;
revoke all on function gps.drive_tarefa_concluir(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function gps.drive_revogacoes_listar(uuid, int) from public, anon, authenticated;
revoke all on function gps.drive_revogacao_resultado(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function gps.drive_permissao_registrar(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function gps.drive_tarefa_pegar(int) to service_role;
grant execute on function gps.drive_pasta_registrar(uuid, text, text, text, boolean) to service_role;
grant execute on function gps.drive_parceiro_link_gravar(uuid, text) to service_role;
grant execute on function gps.drive_cliente_link_gravar(uuid, text) to service_role;
grant execute on function gps.drive_tarefa_concluir(uuid, text, text, text, text) to service_role;
grant execute on function gps.drive_revogacoes_listar(uuid, int) to service_role;
grant execute on function gps.drive_revogacao_resultado(uuid, uuid, text, text) to service_role;
grant execute on function gps.drive_permissao_registrar(uuid, text, text, text, text) to service_role;

commit;
