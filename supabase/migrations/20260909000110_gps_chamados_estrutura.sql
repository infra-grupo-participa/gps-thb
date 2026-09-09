-- Chamados (suporte) do portal — tabela + thread + interruptor.
--
-- MOTIVAÇÃO (feature 10 do Marcio): hoje o aluno NÃO TEM canal dentro do portal.
-- Medido em 08/09: `rg -in "suporte|mailto" src/` devolve ZERO. Não estamos
-- substituindo um e-mail de suporte -- não existe nenhum na UI. A copy da tela
-- diz "Fale com a equipe por aqui", nunca "no lugar do e-mail".
--
-- POR QUE TABELA NOVA (e não central.chamados / sip.ticket_messages): os dois
-- sistemas existem no mesmo banco e usam `aluno_id = auth.uid()` +
-- `central.is_admin()`. No GPS `aluno_id` é o AMBIENTE, não o usuário. Reusar
-- exigiria alterar a RLS de um sistema em produção que este repo nem versiona.
--
-- ANEXO ≠ DOCUMENTO DO CLIENTE (C4). A decisão de 07/2026 tirou documento do
-- cliente do GPS e mandou para o Drive, e ela CONTINUA VALENDO. O anexo de
-- chamado é prova de um problema no portal (print de erro, comprovante),
-- efêmero, com retenção de 180 dias e expurgo. Bucket próprio, limite de 5 MB e
-- allowlist de 4 MIMEs -- ver migração ...112.
--
-- APPEND-ONLY POR CONSTRUÇÃO: `grant select` e nada mais; nenhuma policy de
-- insert/update/delete. Toda escrita passa pelas RPCs SECURITY DEFINER da
-- migração ...111. Assunto imutável, thread não editável, `status` derivado.
--   🔴 `revoke all` ANTES do grant, e não só `grant select`: o schema gps tem
--   ALTER DEFAULT PRIVILEGES que concede DELETE a `authenticated` em TABELA
--   NOVA (conferido no banco em 08/09, ver migração ...070). Sem o revoke, a
--   tabela nasceria com um caminho de apagar thread que ninguém escreveu.
--
-- FKs para auth.users são `on delete set null`, NÃO `restrict`:
--   🔴 gps.admin_excluir_acesso() APAGA a linha de auth.users do aluno. Com
--   `restrict`, excluir o acesso de qualquer aluno que já tenha aberto chamado
--   passaria a falhar com 23503 -- e essa função é o caminho oficial de
--   destravar gente. A migração ...114 acrescenta a limpeza dos chamados lá.
--   `aluno_id` continua SEM FK para thb_alunos (mesma razão de gps.aluno_notas:
--   a tabela é compartilhada com o sip ao vivo).
--
-- O QUE ESTA MIGRAÇÃO NÃO FAZ: não cria bucket (é a ...112), não cria RPC (é a
-- ...111), não manda e-mail (é a aplicação), não toca central.* nem sip.*, não
-- escreve nenhuma linha de dado de aluno (só as 2 chaves de configuração).
--
-- REVERSÃO (nesta ordem):
--   drop table gps.chamado_mensagens;
--   drop table gps.chamados;
--   drop function gps.pode_ver_chamado(uuid);
--   drop function gps.chamados_abertos();
--   delete from gps.config where chave like 'chamados_%';
--   -- gps.config só sai (drop table) se nenhuma outra feature já estiver usando.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Tabelas
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists gps.chamados (
  id                 uuid primary key default gen_random_uuid(),
  aluno_id           uuid not null,
  aberto_por         uuid references auth.users(id) on delete set null,
  assunto            text not null check (length(btrim(assunto)) between 3 and 120),
  status             text not null default 'aberto'
                       check (status in ('aberto','respondido','fechado')),
  criado_em          timestamptz not null default now(),
  ultima_mensagem_em timestamptz not null default now(),
  fechado_em         timestamptz,
  fechado_por        uuid references auth.users(id) on delete set null,
  constraint chk_chamado_fechado_tem_data
    check (status <> 'fechado' or fechado_em is not null)
);

comment on table gps.chamados is
  'Chamado de suporte do portal. aluno_id e o AMBIENTE (titular), como em gps.etapa1_clientes. status e DERIVADO de quem escreveu por ultimo (aberto = a bola esta com a equipe; respondido = com o aluno) e so muda por RPC. Append-only: nenhuma policy de insert/update/delete, so `grant select`.';
comment on column gps.chamados.aluno_id is
  'AMBIENTE dono do chamado (thb_alunos.id do titular). SEM FK de proposito: public.thb_alunos e compartilhada com o sip ao vivo, mesma razao de gps.aluno_notas.';
comment on column gps.chamados.aberto_por is
  'Quem abriu (titular OU socio). `on delete set null` porque gps.admin_excluir_acesso apaga a linha de auth.users -- com restrict, excluir acesso de quem ja abriu chamado falharia com 23503.';
comment on column gps.chamados.status is
  'aberto = esperando a equipe | respondido = esperando o aluno | fechado. A transicao e o que dispara e-mail: mensagem que NAO muda o status nao avisa ninguem (trava anti-flood embutida no modelo).';
comment on column gps.chamados.ultima_mensagem_em is
  'Ordena a lista do aluno e a fila do admin. Atualizado so por gps.chamado_gravar_mensagem.';

create table if not exists gps.chamado_mensagens (
  id                 uuid primary key default gen_random_uuid(),
  chamado_id         uuid not null references gps.chamados(id) on delete cascade,
  autor_id           uuid references auth.users(id) on delete set null,
  autor_papel        text not null check (autor_papel in ('aluno','equipe')),
  criado_em          timestamptz not null default now(),
  texto              text not null check (length(btrim(texto)) between 1 and 4000),
  anexo_path         text
    check (anexo_path is null or anexo_path ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|webp|pdf)$'),
  anexo_nome         text
    check (anexo_nome is null or (length(anexo_nome) between 1 and 120 and anexo_nome !~ '[/\\]')),
  anexo_mime         text
    check (anexo_mime is null or anexo_mime in ('image/png','image/jpeg','image/webp','application/pdf')),
  anexo_tamanho      integer check (anexo_tamanho is null or anexo_tamanho between 1 and 5242880),
  anexo_expurgado_em timestamptz,
  constraint chk_anexo_completo check (
    (anexo_path is null and anexo_nome is null and anexo_mime is null and anexo_tamanho is null)
    or
    (anexo_path is not null and anexo_nome is not null and anexo_mime is not null and anexo_tamanho is not null)
  ),
  constraint chk_expurgo_so_com_anexo
    check (anexo_expurgado_em is null or anexo_path is not null)
);

comment on table gps.chamado_mensagens is
  'Thread do chamado, append-only. autor_papel e DERIVADO no servidor (gp_is_admin() -> equipe; membro do ambiente -> aluno): o cliente nunca informa quem e.';
comment on column gps.chamado_mensagens.anexo_path is
  'Caminho no bucket gps-chamados, no formato <aluno_id>/<uuid>.<ext>. O aluno_id no caminho e o que as policies de storage.objects usam para decidir quem le -- por isso o CHECK exige o formato exato (sem isso, `../` e nome arbitrario chegariam ate a policy). O prefixo ser MESMO o aluno_id do chamado e conferido na RPC, que a constraint nao tem como saber.';
comment on column gps.chamado_mensagens.anexo_nome is
  'Nome ORIGINAL do arquivo, so para exibir e para o `download=` da URL assinada. Proibido conter / ou \ -- e texto vindo do usuario.';
comment on column gps.chamado_mensagens.anexo_expurgado_em is
  'Carimbo do expurgo de retencao (180 dias apos o fechamento). O caminho e o nome FICAM: a tela mostra "arquivo removido por retencao em dd/mm" em vez de fingir que nunca houve anexo.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Índices (cada um com a query que ele serve escrita ao lado)
-- ─────────────────────────────────────────────────────────────────────────

create index if not exists idx_chamados_ambiente
  on gps.chamados (aluno_id, ultima_mensagem_em desc);
comment on index gps.idx_chamados_ambiente is
  'Serve a lista do aluno e a do admin dentro do ambiente: select ... where aluno_id = $1 order by ultima_mensagem_em desc (getChamadosDoAmbiente).';

create index if not exists idx_chamados_fila
  on gps.chamados (ultima_mensagem_em) where status <> 'fechado';
comment on index gps.idx_chamados_fila is
  'Serve a fila de /admin/chamados: select ... where status <> ''fechado'' order by ultima_mensagem_em (getFilaChamados), a contagem do badge e o limite de 5 abertos por ambiente. PARCIAL de proposito: a fila cresce so com o que esta aberto; o historico de fechados nao entra no indice nem no custo de escrita.';

create index if not exists idx_chamado_mensagens_thread
  on gps.chamado_mensagens (chamado_id, criado_em);
comment on index gps.idx_chamado_mensagens_thread is
  'Serve a thread: select ... where chamado_id = $1 order by criado_em (getChamado) e a contagem do limite de 20 mensagens nas RPCs.';

-- NÃO existe índice para o expurgo (`where status='fechado' and fechado_em < ...`)
-- nem para `anexo_path`: a consulta roda sob demanda, ao abrir a tela de
-- retenção, sobre uma tabela da ordem de centenas de linhas. Índice ali seria
-- peso morto de escrita sem plano que o justifique. Se a tabela passar de ~50
-- mil linhas, medir com explain e ENTÃO criar.

-- ─────────────────────────────────────────────────────────────────────────
-- 3. RLS: SELECT e mais nada
-- ─────────────────────────────────────────────────────────────────────────

alter table gps.chamados          enable row level security;
alter table gps.chamado_mensagens enable row level security;

create or replace function gps.pode_ver_chamado(p_chamado_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from gps.chamados c
     where c.id = p_chamado_id
       and (public.gp_is_admin() or c.aluno_id = gps.aluno_atual())
  );
$$;

comment on function gps.pode_ver_chamado(uuid) is
  'Quem enxerga um chamado: admin ou qualquer membro do ambiente dono. SECURITY INVOKER de proposito -- a RLS de gps.chamados ja e a fonte de verdade, e um DEFINER teria de reimplementar a mesma regra (segundo lugar para esquecer de manter). Usada pela policy de gps.chamado_mensagens e pelas RPCs de escrita.';

revoke execute on function gps.pode_ver_chamado(uuid) from public, anon;
grant  execute on function gps.pode_ver_chamado(uuid) to authenticated;

drop policy if exists gps_chamados_select on gps.chamados;
create policy gps_chamados_select on gps.chamados
  for select to authenticated
  using (public.gp_is_admin() or aluno_id = gps.aluno_atual());

drop policy if exists gps_chamado_mensagens_select on gps.chamado_mensagens;
create policy gps_chamado_mensagens_select on gps.chamado_mensagens
  for select to authenticated
  using (gps.pode_ver_chamado(chamado_id));

-- NENHUMA policy de insert/update/delete nas duas tabelas: é isto que torna a
-- thread append-only mesmo para quem chamar o PostgREST direto.
revoke all on gps.chamados          from anon, public;
revoke all on gps.chamado_mensagens from anon, public;
revoke all on gps.chamados          from authenticated;
revoke all on gps.chamado_mensagens from authenticated;
grant select on gps.chamados          to authenticated;
grant select on gps.chamado_mensagens to authenticated;
-- ZERO grant para anon, em qualquer verbo.

-- ─────────────────────────────────────────────────────────────────────────
-- 4. gps.config — interruptor + configuração da equipe
-- ─────────────────────────────────────────────────────────────────────────
-- Mesmo padrão de gps.plantao_config (migração ...070), mas GENÉRICA: chave de
-- qualquer feature do GPS. `plantao_config` FICA como está -- migrar as chaves
-- dela para cá é tarefa à parte (uma migração de 2 linhas + trocar a leitura de
-- gps.plantao_escrita_liberada), e fazer isso agora misturaria uma feature nova
-- com a mudança de um interruptor em produção.

create table if not exists gps.config (
  chave          text primary key check (length(chave) between 1 and 64),
  -- `<= 2000` e sem CR/LF: `chamados_email_equipe` guarda endereços que a
  -- aplicação usa para montar cabeçalho de e-mail. CRLF aqui seria injeção de
  -- cabeçalho na Resend -- barrado na origem, além do saneamento no TS.
  -- Vazio é válido de propósito (é o estado inicial de `chamados_email_equipe`,
  -- e a tela avisa em destaque que ninguém está sendo avisado).
  valor          text not null check (length(valor) <= 2000 and valor !~ '[\r\n]'),
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null
);

comment on table gps.config is
  'Configuracao do GPS editavel pela equipe SEM DEPLOY, no mesmo padrao de gps.plantao_config (que pode migrar para ca depois, em tarefa propria). So-admin; anon nao tem grant nenhum. Quem precisa ler sem ser admin le por funcao SECURITY DEFINER (gps.chamados_abertos).';
comment on column gps.config.valor is
  'Texto, nao boolean: a tabela e generica de proposito. Proibido CR/LF (injecao de cabecalho de e-mail) e limitado a 2000 caracteres.';
comment on column gps.config.atualizado_por is
  '`on delete set null` explicito: sem ele a FK impediria a exclusao de um auth.users que um dia tocou a config (gps.admin_excluir_acesso apaga linha de auth.users). Quem mexeu e rastro util, nao pode virar tranca.';

alter table gps.config enable row level security;

drop policy if exists gps_config_admin on gps.config;
create policy gps_config_admin on gps.config
  for all to authenticated
  using (public.gp_is_admin()) with check (public.gp_is_admin());

revoke all on gps.config from anon, public;
revoke all on gps.config from authenticated;
grant select, insert, update on gps.config to authenticated;
-- Sem DELETE: chave de config não se apaga pela UI (apagar é passo de reversão,
-- do dono do banco). O revoke all acima já derruba o DELETE que o ALTER DEFAULT
-- PRIVILEGES do schema gps concede a `authenticated` em tabela nova.

drop trigger if exists trg_config_atualizado_em on gps.config;
create trigger trg_config_atualizado_em
  before update on gps.config
  for each row execute function gps.touch_atualizado_em();

-- Estado inicial explícito. `on conflict do nothing` para a migração ser
-- reaplicável sem sobrescrever uma pausa que a equipe tenha ligado.
insert into gps.config (chave, valor) values
  ('chamados_aberto',       'true'),
  ('chamados_email_equipe', '')
on conflict (chave) do nothing;

create or replace function gps.chamados_abertos()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
           (select c.valor from gps.config c where c.chave = 'chamados_aberto'),
           current_setting('app.gps_chamados_aberto', true),
           'true'
         ) <> 'false';
$$;

comment on function gps.chamados_abertos() is
  'Interruptor de ENTRADA do suporte. A tabela manda; o setting app.gps_chamados_aberto e o segundo degrau (emergencia sem deploy) e AUSENTE = ABERTO -- o default tem de ser funcionar, senao o canal morre no dia em que alguem esquecer de popular a linha. Fecha so a entrada do ALUNO: a equipe continua respondendo e fechando (desligar nao pode deixar ninguem no meio do caminho). SECURITY DEFINER porque o aluno nao le gps.config.';

revoke execute on function gps.chamados_abertos() from public, anon;
grant  execute on function gps.chamados_abertos() to authenticated;
