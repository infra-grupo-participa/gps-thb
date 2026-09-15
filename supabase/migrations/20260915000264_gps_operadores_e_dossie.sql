-- Fatia 5 (ÚLTIMA) da esteira: PAPEL DE OPERADOR + DOSSIÊ.
--
-- Decisão do Marcio (15/09), travada: UM PAPEL SÓ — "equipe da esteira". Quem
-- está nele vê a fila de ligações (`gps.fila_de_ligacoes`) E o dossiê do
-- cliente. O advogado que conduz a reunião preliminar e o operador que faz
-- as ligações são o mesmo papel — decisão dele, para simplificar.
--
-- ═══════════════════════════════════════════════════════════════════════
-- 🔴 POR QUE `gps.operadores` E NÃO REAPROVEITAR NADA QUE JÁ EXISTE
-- ═══════════════════════════════════════════════════════════════════════
--
-- NÃO `public.perfis` / `gp_is_admin()`: `auth.users` é compartilhado pelos
-- 7 sistemas do grupo, e `public.perfis` dá acesso a TODOS eles — promover
-- alguém a admin para fazer ligação do GPS o tornaria admin do Workbook, da
-- Rede, da Central. Além disso `gp_is_admin()` é lida em policies de
-- 50 TABELAS em 3 schemas (gps 36, public 13, storage 1, medido 15/09) —
-- mexer nela para acrescentar um papel novo arrisca as 50. NÃO TOCADA aqui.
--
-- NÃO `gps.membros.papel`: o CHECK daquela coluna é ('titular','socio') e o
-- significado é "papel DENTRO de um ambiente" (quem é dono/sócio de um
-- aluno). Operador é TRANSVERSAL — não pertence a nenhum ambiente, atende
-- todos. Acrescentar um 3º valor ao CHECK misturaria dois conceitos
-- diferentes na mesma coluna.
--
-- `gps.operadores` é tabela PRÓPRIA, papel transversal, sem tocar em nenhuma
-- das duas.
--
-- ═══════════════════════════════════════════════════════════════════════
-- DUAS GUARDAS NOVAS — `gp_is_admin()` continua intocada
-- ═══════════════════════════════════════════════════════════════════════
--
-- `gps.eh_operador()`: `exists(... where user_id=auth.uid() and ativo)`,
-- com `coalesce(..., false)` — sem sessão (auth.uid() null) devolve false,
-- nunca NULL (NULL num `if not` do plpgsql não dispara o `raise`, e uma
-- guarda que "falha aberta" é exatamente o defeito que a `…175` já corrigiu
-- uma vez neste projeto, para o segredo do Plantão).
--
-- `gps.eh_equipe()`: `gp_is_admin() or eh_operador()`, ambos com coalesce.
-- É a guarda que `gps.fila_de_ligacoes`, `gps.entrevista_gravar` e
-- `gps.reuniao_propor_data` passam a usar — e SÓ ELAS. `admin_definir_senha`,
-- `admin_excluir_acesso`, o Diário (`aluno_notas`) e os `admin_painel_*`
-- continuam `gp_is_admin()`: é isso que mantém o operador fora do resto.
--
-- ═══════════════════════════════════════════════════════════════════════
-- 🔴 CORPOS VIGENTES — LIDOS DAS MIGRATIONS, NÃO DO BANCO AO VIVO
-- ═══════════════════════════════════════════════════════════════════════
--
-- Mesma limitação já registrada por escrito nas migrations `…261`, `…262` e
-- `…263`: nem MCP do Supabase nem CLI (`supabase`/`psql`) estavam
-- disponíveis neste ambiente de execução para ler `pg_get_functiondef` ao
-- vivo nem para rodar `explain (analyze, buffers)` de verdade. Os 3 corpos
-- recriados abaixo (`fila_de_ligacoes`, `entrevista_gravar`,
-- `reuniao_propor_data`) são copiados INTEGRALMENTE da `…262`/`…263` — só a
-- linha da guarda de permissão muda (`gp_is_admin()` → `eh_equipe()`), tudo
-- o mais (parâmetros, corpo, comentário, grants) permanece idêntico. Isto é
-- o "extrato com pg_get_functiondef" possível sem acesso ao banco: cópia
-- literal do texto já aplicado, e não reescrita de memória.
--
-- ⚠️ Confirme contra o banco antes de aplicar
-- (`select pg_get_functiondef(oid) from pg_proc where proname in
-- ('fila_de_ligacoes','entrevista_gravar','reuniao_propor_data') and
-- pronamespace = 'gps'::regnamespace`) — se alguma dessas 3 RPCs foi
-- alterada no banco por fora deste diretório desde a `…263`, este
-- `create or replace` vai reverter essa mudança em silêncio.
--
-- ═══════════════════════════════════════════════════════════════════════
-- O DOSSIÊ — `gps.dossie_do_cliente(p_cliente_id)`
-- ═══════════════════════════════════════════════════════════════════════
--
-- Entra: nome/telefone/grau/fase (etapa1_clientes), DISC (perfil_disc),
-- decisores (gps.cliente_decisores), resultado+observações+quem+quando da
-- entrevista (colunas …262), data aceita da reunião + estado da proposta
-- viva (data_reuniao_preliminar + reuniao_preliminar_propostas), nome do
-- parceiro (LEFT JOIN thb_alunos — nunca INNER, mesma lição da `…255`: se o
-- cadastro do parceiro sumir de thb_alunos, o dossiê aparece com dono vazio
-- em vez de a RPC falhar).
--
-- 🔴 NÃO entra (mesmas exclusões de LGPD já decididas nas migrations `…255`,
-- `…262` e `…259`, aplicadas aqui por herança, não por decisão nova):
--   - `registro_contato` (anotação do PARCEIRO sobre o cliente — `…255`)
--   - CPF/documento (do parceiro e do cliente)
--   - `valor_honorarios`, `contrato_*`, qualquer coisa financeira
--   - Diário do parceiro (`gps.aluno_notas` — só-admin, RLS não tocada; o
--     operador NÃO tem policy nova ali, e não ganha por esta função porque
--     ela é SECURITY DEFINER mas nunca faz select em aluno_notas)
--   - dado de QUALQUER outro cliente — a RPC lê UM `p_cliente_id` só
--
-- 🔴 TRILHA OBRIGATÓRIA: cada abertura do dossiê grava 1 linha em
-- `gps.acessos_log` (ação nova `dossie_acessado`) — é dado de terceiro
-- (LGPD), e a `…255` já estabeleceu que aqui a trilha é a guarda (mesmo
-- raciocínio de `clientes_exportados`). A trilha é escrita PELA PRÓPRIA RPC,
-- sempre, mesmo em leitura — não é opt-in da tela.
--
-- Guarda: `gps.eh_equipe()` (admin OU operador ativo) — é a porta de entrada
-- da fatia 5. `security definer`, `search_path=''`.
--
-- ═══════════════════════════════════════════════════════════════════════
-- ÍNDICE: NENHUM NOVO
-- ═══════════════════════════════════════════════════════════════════════
--
-- O dossiê lê por `id` (etapa1_clientes, PK), `cliente_id = $1`
-- (cliente_decisores — já tem `cliente_decisores_cliente_idx`, da `…262`) e
-- `cliente_id = $1` (reuniao_preliminar_propostas — já tem o índice único
-- parcial `reuniao_preliminar_propostas_cliente_viva_uk` para a proposta
-- viva; para o HISTÓRICO usa Seq Scan sobre o subconjunto daquele cliente,
-- que por natureza é pequeno — poucas propostas por cliente). Nenhum WHERE
-- novo sobre coluna sem índice. Ver `explain (analyze, buffers)` no fim do
-- arquivo — 🔴 NÃO MEDIDO NESTA SESSÃO, mesma limitação de ambiente.
--
-- ═══════════════════════════════════════════════════════════════════════
-- `aluno_eventos.tipo` — SEM VALOR NOVO NESTA MIGRAÇÃO
-- ═══════════════════════════════════════════════════════════════════════
--
-- O dossiê é LEITURA; não grava evento de diário nenhum. Só
-- `acessos_log.acao` ganha 1 valor (`dossie_acessado`).
--
-- 🔴 LEITURA DO CHECK VIGENTE feita a partir das migrations (mesma
-- limitação registrada acima): `grep -rl acessos_log_acao_check
-- supabase/migrations/` mostra que a última a tocar o CHECK é a `…263`
-- (25 valores: os 24 da `…260` + `reuniao_preliminar_cancelada`). Nenhuma
-- migration entre a `…263` e esta toca o CHECK. A lista abaixo é a `…263`
-- completa + 1 valor novo no fim. O bloco `do $$` confere o NOME da
-- constraint pelo CONTEÚDO antes de reescrever — aborta se o banco divergir.
-- ⚠️ Confirme contra o banco antes de aplicar
-- (`select pg_get_constraintdef(oid) from pg_constraint where
-- conrelid='gps.acessos_log'::regclass and contype='c'`).
--
-- ═══════════════════════════════════════════════════════════════════════
-- GESTÃO DO PAPEL — `gps.operador_definir`
-- ═══════════════════════════════════════════════════════════════════════
--
-- Guarda `gp_is_admin()`, NÃO `eh_equipe()`: operador não promove operador
-- (só quem já é admin do sistema decide quem entra na equipe da esteira).
-- Trilha em `acessos_log` (`operador_definido`).
--
-- ═══════════════════════════════════════════════════════════════════════
-- RLS de `gps.operadores`
-- ═══════════════════════════════════════════════════════════════════════
--
-- Operador lê a PRÓPRIA linha (para a tela saber "eu sou operador, mostra a
-- fila"); admin lê todas (para a tela de gestão do papel). Nenhuma policy de
-- escrita: só a RPC `gps.operador_definir` grava (security definer).
--
-- 🔴 NÃO removido nem congelado nenhum campo/função/tabela existente.
--
-- REVERSÃO (nesta ordem):
--   drop function if exists gps.dossie_do_cliente(uuid);
--   drop function if exists gps.operador_definir(uuid, boolean);
--   -- devolver as 3 RPCs para a guarda gp_is_admin() (corpo da …262/…263):
--   --   create or replace function gps.fila_de_ligacoes(...) ... (ver …262)
--   --   create or replace function gps.entrevista_gravar(...) ... (ver …262)
--   --   create or replace function gps.reuniao_propor_data(...) ... (ver …263)
--   drop function if exists gps.eh_equipe();
--   drop function if exists gps.eh_operador();
--   alter table gps.acessos_log drop constraint acessos_log_acao_check;
--   alter table gps.acessos_log add constraint acessos_log_acao_check
--     check (acao = any(array[<lista da …263, sem 'dossie_acessado' e sem 'operador_definido'>]));
--   drop table if exists gps.operadores;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) TABELA gps.operadores
-- ═══════════════════════════════════════════════════════════════════════════
create table gps.operadores (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  nome        text not null,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now(),
  criado_por  uuid references auth.users(id) on delete set null
);

comment on table gps.operadores is
  'Papel transversal "equipe da esteira" (decisao Marcio 15/09/2026, fatia 5): quem esta aqui ve a fila de ligacoes E o dossie do cliente. NAO e public.perfis (aquele da acesso nos 7 sistemas do grupo) nem gps.membros.papel (aquele e "papel DENTRO de um ambiente", CHECK titular/socio). Escrita so por gps.operador_definir (guarda gp_is_admin -- operador nao promove operador).';

comment on column gps.operadores.ativo is
  'false = operador desativado (remedio rapido sem apagar a linha/historico). gps.eh_operador() confere esta coluna -- inativo e barrado nas 3 RPCs da esteira e no dossie, mesmo com a linha existindo.';

-- RLS: operador le a PROPRIA linha; admin le todas. Nenhuma policy de
-- escrita para ninguem -- so a RPC gps.operador_definir grava (security
-- definer, revoga o resto).
alter table gps.operadores enable row level security;

create policy gps_operadores_select on gps.operadores
  for select
  using (
    public.gp_is_admin()
    or user_id = auth.uid()
  );

-- 🔴 GRANT explícito: `service_role` não dispensa RLS nem GRANT neste
-- projeto (schema `gps` exposto no PostgREST). `revoke` primeiro, sempre —
-- nenhuma escrita direta pela REST: só SELECT, toda escrita é pela RPC
-- `gps.operador_definir` (security definer, revoga o resto).
revoke all on gps.operadores from public, anon;
grant select on gps.operadores to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) DUAS GUARDAS — gp_is_admin() NÃO É TOCADA
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function gps.eh_operador()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    exists (
      select 1 from gps.operadores o
       where o.user_id = auth.uid()
         and o.ativo
    ),
    false
  );
$function$;

comment on function gps.eh_operador() is
  'true se o usuario logado e operador ATIVO da esteira (gps.operadores). coalesce(..., false): sem sessao (auth.uid() null) devolve false, nunca NULL -- guarda que falha aberta em NULL ja foi o defeito corrigido uma vez neste projeto (segredo do Plantao, migracao …175). Usada por gps.eh_equipe() -- nao chamar isolada nas RPCs da esteira, usar sempre eh_equipe().';

revoke all on function gps.eh_operador() from public, anon;
grant execute on function gps.eh_operador() to authenticated;

create or replace function gps.eh_equipe()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(public.gp_is_admin(), false) or gps.eh_operador();
$function$;

comment on function gps.eh_equipe() is
  '"Equipe da esteira" (decisao Marcio 15/09/2026): admin OU operador ativo. E a guarda que gps.fila_de_ligacoes, gps.entrevista_gravar e gps.reuniao_propor_data passam a usar -- e SO ELAS. admin_definir_senha, admin_excluir_acesso, o Diario (aluno_notas) e os admin_painel_* continuam gp_is_admin() de proposito: e isso que mantem o operador fora do resto do sistema.';

revoke all on function gps.eh_equipe() from public, anon;
grant execute on function gps.eh_equipe() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) gps.operador_definir — gestão do papel. Guarda gp_is_admin(), NÃO
--    eh_equipe(): operador não promove operador.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function gps.operador_definir(
  p_user_id uuid,
  p_ativo   boolean,
  p_nome    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_nome  text;
  v_email text;
begin
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'usuario nao informado' using errcode = '22023';
  end if;

  if p_ativo is null then
    raise exception 'ativo nao informado' using errcode = '22023';
  end if;

  -- p_user_id precisa ser um login existente em auth.users -- nunca aceito
  -- cego do cliente (mesmo padrao de gps.admin_user_do_aluno).
  select u.email into v_email from auth.users u where u.id = p_user_id;
  if v_email is null then
    raise exception 'Login não encontrado.' using errcode = 'P0002';
  end if;

  v_nome := nullif(btrim(coalesce(p_nome, '')), '');
  if v_nome is not null and char_length(v_nome) > 200 then
    raise exception 'O nome passa de 200 caracteres.' using errcode = '22023';
  end if;

  insert into gps.operadores (user_id, nome, ativo, criado_por)
  values (p_user_id, coalesce(v_nome, v_email), p_ativo, auth.uid())
  on conflict (user_id) do update
     set ativo = excluded.ativo,
         nome  = coalesce(v_nome, gps.operadores.nome);

  insert into gps.acessos_log (acao, aluno_id, feito_por, detalhe)
  values (
    'operador_definido',
    null,
    auth.uid(),
    'user_id=' || p_user_id::text || ' ativo=' || p_ativo::text
  );

  return jsonb_build_object('user_id', p_user_id, 'ativo', p_ativo);
end;
$function$;

comment on function gps.operador_definir(uuid, boolean, text) is
  'Ativa/desativa o papel "equipe da esteira" para um login existente em auth.users. Guarda gp_is_admin() (NAO eh_equipe()) -- operador nao promove operador. Upsert por user_id (1 linha por pessoa). Trilha em gps.acessos_log (operador_definido, aluno_id=null -- nao e acao sobre um aluno especifico).';

revoke all on function gps.operador_definir(uuid, boolean, text) from public, anon;
grant execute on function gps.operador_definir(uuid, boolean, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) `acessos_log.acao` ganha 2 valores — `dossie_acessado` e
--    `operador_definido`. Corpo VIGENTE da …263 (25 valores) + 2 novos.
--    Confere o NOME da constraint pelo CONTEÚDO antes de reescrever — aborta
--    se o banco tiver mudado por fora deste diretório.
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare v_nome text;
begin
  select con.conname
    into v_nome
    from pg_constraint con
    join pg_class     c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'gps'
     and c.relname = 'acessos_log'
     and con.contype = 'c'
     and pg_get_constraintdef(con.oid) like '%reuniao_preliminar_cancelada%';

  if v_nome is null then
    raise exception
      'CHECK de gps.acessos_log.acao nao encontrado (procurado pelo CONTEUDO reuniao_preliminar_cancelada, da migracao …263) -- migracao abortada. Leia o CHECK vigente no banco antes de reescrever esta lista.';
  end if;

  execute format('alter table gps.acessos_log drop constraint %I', v_nome);
end;
$$;

alter table gps.acessos_log
  add constraint acessos_log_acao_check check (acao = any (array[
    'senha_definida',
    'acesso_excluido',
    'socio_adicionado',
    'membro_excluido',
    'ambiente_ambiguo',
    'etapa_liberacao_alterada',
    'progresso_reaberto',
    'membro_pessoa_vinculada',
    'titular_trocado',
    'membro_movido',
    'financeiro_vinculado',
    'financeiro_desvinculado',
    'favorito_confirmado',
    'favorito_liberado',
    'acessos_criados_em_lote',
    'socio_convidado',
    'socio_convite_aceito',
    'socio_convite_revogado',
    'chamado_solicitacao_aprovada',
    'chamado_solicitacao_declinada',
    'email_login_alterado',
    'clientes_exportados',
    'socio_cadastro_preenchido',
    'interruptor_alterado',
    'reuniao_preliminar_cancelada',
    -- ── Fatia 5: papel de operador + dossiê (15/09/2026, migração …264) ──
    'dossie_acessado',
    'operador_definido'
  ]));

comment on constraint acessos_log_acao_check on gps.acessos_log is
  'Catalogo fechado das acoes administrativas auditadas. Espelha ROTULO_ACAO_ADMIN em src/components/admin/diario-labels.ts. 25 valores vigentes na …263 + 2 desta migracao: dossie_acessado (cada abertura do dossie do cliente, LGPD -- a trilha E a guarda) e operador_definido (gestao do papel de operador).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) RPCs da esteira migram gp_is_admin() → eh_equipe(). SÓ ESTAS 3.
--    Corpo INTEGRAL copiado da …262/…263 -- só a linha da guarda muda.
-- ═══════════════════════════════════════════════════════════════════════════

-- 5.a) gps.fila_de_ligacoes — corpo idêntico à …262, guarda trocada.
create or replace function gps.fila_de_ligacoes(
  p_limite integer default 100,
  p_offset integer default 0
)
returns table (
  cliente_id     uuid,
  cliente_nome   text,
  telefone       text,
  parceiro_nome  text,
  grau_relacao   text,
  favorito       boolean,
  perfil_disc    text,
  total_linhas   bigint
)
language plpgsql stable security definer set search_path to ''
as $function$
declare
  v_limite integer;
  v_offset integer;
begin
  if not gps.eh_equipe() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  -- Mesmo teto de `admin_clientes_lista` (…255): serve a fila inteira do
  -- universo do filtro numa única chamada, sem paginar em N idas ao banco.
  v_limite := least(greatest(coalesce(p_limite, 100), 1), 5000);
  v_offset := greatest(coalesce(p_offset, 0), 0);

  return query
  with base as (
    select
      c.id,
      c.nome,
      c.telefone,
      t.nome as parceiro_nome,
      c.grau_relacao,
      c.acompanhado_equipe,
      c.perfil_disc,
      c.criado_em
    from gps.etapa1_clientes c
    -- LEFT, não INNER (mesma lição paga da …255): se o cadastro do parceiro
    -- sumir de thb_alunos, o cliente aparece com dono vazio em vez de
    -- desaparecer da fila e da contagem.
    left join public.thb_alunos t on t.id = c.aluno_id
    where c.selecionado_entrevista
      and c.entrevista_resultado is null
  )
  select
    b.id, b.nome, b.telefone, b.parceiro_nome, b.grau_relacao,
    b.acompanhado_equipe, b.perfil_disc,
    (count(*) over ())::bigint as total_linhas
  from base b
  order by b.criado_em, b.id
  limit v_limite offset v_offset;
end;
$function$;

comment on function gps.fila_de_ligacoes(integer, integer) is
  'Fila de ligacoes da entrevista previa: clientes selecionado_entrevista=true com entrevista_resultado ainda null. Guarda gps.eh_equipe() (admin OU operador ativo -- migracao …264, decisao Marcio 15/09) ou 42501. Devolve cliente, telefone, nome do parceiro (LEFT join thb_alunos, mesma licao da …255), grau de relacao, se e favorito e o DISC ja registrado. total_linhas e count(*) over() DENTRO do filtro (universo do filtro, nao da pagina). 🔴 NAO devolve registro_contato, entrevista_observacoes nem decisores -- LGPD, ver cabecalho da migracao …262. Ordenado por criado_em (fila FIFO): quem foi selecionado ha mais tempo aparece primeiro.';

revoke all on function gps.fila_de_ligacoes(integer, integer) from public, anon;
grant execute on function gps.fila_de_ligacoes(integer, integer) to authenticated;

-- 5.b) gps.entrevista_gravar — corpo idêntico à …262, guarda trocada.
create or replace function gps.entrevista_gravar(
  p_cliente_id   uuid,
  p_resultado    text,
  p_disc         text default null,
  p_observacoes  text default null,
  p_decisores    jsonb default null   -- array de {nome, papel_no_negocio?, principal?}; null = não mexe no conjunto
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_cliente      record;
  v_observacoes  text;
  v_decisor      jsonb;
  v_nome         text;
  v_papel        text;
  v_principal    boolean;
  v_qtd_gravados integer := 0;
  v_equipe       boolean;
begin
  v_equipe := gps.eh_equipe();
  if not v_equipe then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if p_cliente_id is null then
    raise exception 'cliente nao informado' using errcode = '22023';
  end if;

  if p_resultado is null or p_resultado not in ('interessado', 'sem_interesse', 'nao_atendeu', 'remarcar') then
    raise exception 'Escolha um resultado válido para a ligação.' using errcode = '22023';
  end if;

  if p_disc is not null and p_disc not in ('D', 'I', 'S', 'C') then
    raise exception 'Perfil DISC inválido.' using errcode = '22023';
  end if;

  v_observacoes := nullif(btrim(coalesce(p_observacoes, '')), '');
  if v_observacoes is not null and char_length(v_observacoes) > 2000 then
    raise exception 'As observações passam de 2000 caracteres.' using errcode = '22023';
  end if;

  select c.id, c.aluno_id, c.nome, c.selecionado_entrevista
    into v_cliente
    from gps.etapa1_clientes c
   where c.id = p_cliente_id;

  if v_cliente.id is null then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;

  -- DECISÃO (E): só grava entrevista de quem está na fila (selecionado pelo
  -- parceiro). Ver o cabeçalho da migração …262 — evita registrar entrevista
  -- em quem nunca passou pelo funil dos 5.
  if not v_cliente.selecionado_entrevista then
    raise exception 'Este cliente não está entre os selecionados para a entrevista prévia.' using errcode = '22023';
  end if;

  -- UPDATE único: resultado, DISC (só se veio), observações, autoria e
  -- `ligacao_realizada`. A trigger de captura já existente
  -- (aluno_eventos_capturar_etapa1_clientes) grava sozinha o evento
  -- `cliente_ligacao` ao ver `ligacao_realizada` virar `true` -- não repetimos
  -- aqui.
  update gps.etapa1_clientes
     set entrevista_resultado    = p_resultado,
         entrevista_observacoes  = v_observacoes,
         entrevista_em           = now(),
         entrevista_por          = auth.uid(),
         perfil_disc             = coalesce(p_disc, perfil_disc),
         ligacao_realizada       = true
   where id = p_cliente_id;

  -- Evento próprio com o RESULTADO (a trigger de captura já grava
  -- `cliente_ligacao` sozinha ao ver `ligacao_realizada` virar `true` — isto
  -- aqui é o "o que ela disse", não "que ela ligou"). `rotulo` truncado em
  -- 300 pelo mesmo motivo da trigger (CHECK 1..300, `nome` é `text` sem
  -- limite). `entrevista_observacoes` NUNCA entra no `detalhe` — é o mesmo
  -- dado sensível que fica fora da lista consolidada (ver cabeçalho).
  -- `ator`: 'equipe' cobre tanto admin quanto operador (é a equipe da
  -- esteira ligando, do ponto de vista do parceiro que lê o Diário).
  insert into gps.aluno_eventos
    (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
  values
    (v_cliente.aluno_id, now(), 'cliente_entrevista_registrada', 'cliente', p_cliente_id,
     left(coalesce(nullif(btrim(v_cliente.nome), ''), 'Cliente sem nome'), 300),
     jsonb_build_object('resultado', p_resultado), 'equipe', auth.uid(), 'app');

  -- Decisores: `null` = não mexe no conjunto (permite gravar só o resultado
  -- numa ligação e voltar depois para os decisores). Array (mesmo vazio)
  -- SUBSTITUI o conjunto inteiro — mesmo padrão de
  -- `gps.selecao_entrevista_definir`: o operador reenvia a lista completa a
  -- cada salvamento, nunca um diff.
  if p_decisores is not null then
    if jsonb_typeof(p_decisores) <> 'array' then
      raise exception 'Lista de decisores inválida.' using errcode = '22023';
    end if;

    delete from gps.cliente_decisores where cliente_id = p_cliente_id;

    for v_decisor in select * from jsonb_array_elements(p_decisores)
    loop
      v_nome := nullif(btrim(coalesce(v_decisor->>'nome', '')), '');
      if v_nome is null then
        raise exception 'Todo decisor precisa de nome.' using errcode = '22023';
      end if;
      if char_length(v_nome) > 200 then
        raise exception 'O nome do decisor passa de 200 caracteres.' using errcode = '22023';
      end if;

      v_papel := nullif(btrim(coalesce(v_decisor->>'papel_no_negocio', '')), '');
      if v_papel is not null and char_length(v_papel) > 200 then
        raise exception 'O papel do decisor no negócio passa de 200 caracteres.' using errcode = '22023';
      end if;

      v_principal := coalesce((v_decisor->>'principal')::boolean, false);

      insert into gps.cliente_decisores
        (cliente_id, nome, papel_no_negocio, principal, criado_por)
      values
        (p_cliente_id, v_nome, v_papel, v_principal, auth.uid());

      v_qtd_gravados := v_qtd_gravados + 1;
    end loop;
  end if;

  return jsonb_build_object(
    'cliente_id', p_cliente_id,
    'resultado', p_resultado,
    'decisores_gravados', v_qtd_gravados
  );
end;
$function$;

comment on function gps.entrevista_gravar(uuid, text, text, text, jsonb) is
  'Grava o resultado da ligacao da entrevista previa (resultado + DISC + observacoes + decisores) numa transacao so. Guarda gps.eh_equipe() (admin OU operador ativo -- migracao …264, decisao Marcio 15/09) ou 42501. So aceita cliente com selecionado_entrevista=true (fila) -- ver decisao (E) no cabecalho da migracao …262. Marca ligacao_realizada=true (a trigger existente aluno_eventos_capturar_etapa1_clientes grava cliente_ligacao sozinha). p_decisores null = nao mexe no conjunto; array (mesmo vazio) SUBSTITUI o conjunto inteiro, mesmo padrao de gps.selecao_entrevista_definir. entrevista_observacoes herda a LGPD de registro_contato: nunca sai desta RPC/da ficha para lista agregada.';

revoke all on function gps.entrevista_gravar(uuid, text, text, text, jsonb) from public, anon;
grant execute on function gps.entrevista_gravar(uuid, text, text, text, jsonb) to authenticated;

-- 5.c) gps.reuniao_propor_data — corpo idêntico à …263, guarda trocada.
create or replace function gps.reuniao_propor_data(
  p_cliente_id uuid,
  p_data       timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_cliente record;
begin
  if not gps.eh_equipe() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if p_cliente_id is null then
    raise exception 'cliente nao informado' using errcode = '22023';
  end if;

  if p_data is null then
    raise exception 'Informe a data proposta.' using errcode = '22023';
  end if;

  select c.id, c.aluno_id, c.nome, c.acompanhado_equipe
    into v_cliente
    from gps.etapa1_clientes c
   where c.id = p_cliente_id;

  if v_cliente.id is null then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;

  -- Só para o cliente FAVORITO do parceiro (o que a equipe acompanha).
  if not v_cliente.acompanhado_equipe then
    raise exception 'A reunião preliminar só pode ser proposta para o cliente que a equipe acompanha.' using errcode = '22023';
  end if;

  -- Recusa se já houver proposta viva (o índice único garante no banco; esta
  -- checagem é para devolver frase própria em vez de 23505 genérico).
  if exists (
    select 1 from gps.reuniao_preliminar_propostas
     where cliente_id = p_cliente_id and estado = 'proposta'
  ) then
    raise exception 'Já existe uma proposta de data aguardando resposta para este cliente.' using errcode = '22023';
  end if;

  insert into gps.reuniao_preliminar_propostas
    (cliente_id, aluno_id, data_proposta, proposta_por)
  values
    (p_cliente_id, v_cliente.aluno_id, p_data, auth.uid());

  insert into gps.aluno_eventos
    (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
  values
    (v_cliente.aluno_id, now(), 'reuniao_preliminar_proposta', 'cliente', p_cliente_id,
     left(coalesce(nullif(btrim(v_cliente.nome), ''), 'Cliente sem nome'), 300),
     jsonb_build_object('data_proposta', p_data), 'equipe', auth.uid(), 'app');

  return jsonb_build_object('cliente_id', p_cliente_id, 'data_proposta', p_data);
end;
$function$;

comment on function gps.reuniao_propor_data(uuid, timestamptz) is
  'Equipe propoe uma data de reuniao preliminar para o cliente FAVORITO do parceiro (acompanhado_equipe=true). Guarda gps.eh_equipe() (admin OU operador ativo -- migracao …264, decisao Marcio 15/09) ou 42501. Recusa se o cliente nao for o favorito, ou se ja houver proposta viva (estado=proposta) -- o indice unico parcial garante isso no banco. Grava reuniao_preliminar_proposta no Diario.';

revoke all on function gps.reuniao_propor_data(uuid, timestamptz) from public, anon;
grant execute on function gps.reuniao_propor_data(uuid, timestamptz) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6) gps.dossie_do_cliente — o dossiê. Guarda eh_equipe(). Trilha obrigatória.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function gps.dossie_do_cliente(p_cliente_id uuid)
returns jsonb
language plpgsql
-- 🔴 VOLATILE (o padrão), NÃO `stable`: esta função ESCREVE — a trilha
-- obrigatória em gps.acessos_log a cada abertura. `stable` promete ao
-- planner que a função não altera o banco, e o Postgres recusa o INSERT em
-- tempo de execução ("INSERT is not allowed in a non-volatile function").
-- Pego antes de aplicar, 15/09/2026.
security definer
set search_path = ''
as $function$
declare
  v_cliente        record;
  v_parceiro_nome  text;
  v_decisores      jsonb;
  v_proposta_viva  record;
  v_propostas      jsonb;
begin
  if not gps.eh_equipe() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if p_cliente_id is null then
    raise exception 'cliente nao informado' using errcode = '22023';
  end if;

  select
    c.id, c.aluno_id, c.nome, c.telefone, c.grau_relacao, c.fase,
    c.perfil_disc, c.acompanhado_equipe, c.selecionado_entrevista,
    c.entrevista_resultado, c.entrevista_observacoes, c.entrevista_em,
    c.entrevista_por, c.data_reuniao_preliminar, c.aderiu_reuniao
    into v_cliente
    from gps.etapa1_clientes c
   where c.id = p_cliente_id;

  if v_cliente.id is null then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;

  -- LEFT via subselect (não INNER) — mesma lição da …255: se o cadastro do
  -- parceiro sumir de thb_alunos, o dossiê mostra dono vazio, não erro.
  select t.nome into v_parceiro_nome
    from public.thb_alunos t
   where t.id = v_cliente.aluno_id;

  -- Decisores deste cliente — nunca entram em lista agregada (LGPD, …262).
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', d.id,
             'nome', d.nome,
             'papel_no_negocio', d.papel_no_negocio,
             'principal', d.principal
           )
           order by d.principal desc, d.criado_em
         ), '[]'::jsonb)
    into v_decisores
    from gps.cliente_decisores d
   where d.cliente_id = p_cliente_id;

  -- Proposta VIVA (estado='proposta'), se houver.
  select pp.id, pp.data_proposta, pp.proposta_em, pp.estado
    into v_proposta_viva
    from gps.reuniao_preliminar_propostas pp
   where pp.cliente_id = p_cliente_id
     and pp.estado = 'proposta';

  -- Histórico completo de propostas (propôs → contestou → propôs de novo) —
  -- é o processo; `data_reuniao_preliminar` acima é o resultado.
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', pp.id,
             'data_proposta', pp.data_proposta,
             'proposta_em', pp.proposta_em,
             'estado', pp.estado,
             'resposta_em', pp.resposta_em,
             'contestacao_motivo', pp.contestacao_motivo
           )
           order by pp.proposta_em desc
         ), '[]'::jsonb)
    into v_propostas
    from gps.reuniao_preliminar_propostas pp
   where pp.cliente_id = p_cliente_id;

  -- 🔴 TRILHA OBRIGATÓRIA: cada abertura grava, sempre — LGPD, a trilha É a
  -- guarda (mesma decisão de `clientes_exportados`, …255). `aluno_id` do
  -- ambiente dono do cliente, não do operador que abriu.
  insert into gps.acessos_log (acao, aluno_id, feito_por, detalhe)
  values ('dossie_acessado', v_cliente.aluno_id, auth.uid(), 'cliente_id=' || p_cliente_id::text);

  return jsonb_build_object(
    'cliente_id', v_cliente.id,
    'aluno_id', v_cliente.aluno_id,
    'parceiro_nome', v_parceiro_nome,
    'cliente_nome', v_cliente.nome,
    'telefone', v_cliente.telefone,
    'grau_relacao', v_cliente.grau_relacao,
    'fase', v_cliente.fase,
    'perfil_disc', v_cliente.perfil_disc,
    'acompanhado_equipe', v_cliente.acompanhado_equipe,
    'selecionado_entrevista', v_cliente.selecionado_entrevista,
    'entrevista', jsonb_build_object(
      'resultado', v_cliente.entrevista_resultado,
      'observacoes', v_cliente.entrevista_observacoes,
      'em', v_cliente.entrevista_em,
      'por', v_cliente.entrevista_por
    ),
    'decisores', v_decisores,
    'reuniao', jsonb_build_object(
      'data_aceita', v_cliente.data_reuniao_preliminar,
      'aderiu', v_cliente.aderiu_reuniao,
      'proposta_viva_id', v_proposta_viva.id,
      'proposta_viva_data', v_proposta_viva.data_proposta,
      'propostas', v_propostas
    )
  );
end;
$function$;

comment on function gps.dossie_do_cliente(uuid) is
  'Dossie de UM cliente para o advogado da reuniao preliminar / operador da esteira (fatia 5, decisao Marcio 15/09/2026). Guarda gps.eh_equipe() (admin OU operador ativo) ou 42501. Entra: nome/telefone/grau/fase, DISC, decisores, resultado+observacoes+quem+quando da entrevista, data aceita da reuniao + historico de propostas, nome do parceiro (LEFT thb_alunos). 🔴 NAO entra: registro_contato, CPF/documento, valor_honorarios/contrato_*, Diario do parceiro (aluno_notas), dado de outro cliente. 🔴 Cada chamada grava 1 linha em gps.acessos_log (dossie_acessado) -- LGPD, a trilha E a guarda, sempre, mesmo em leitura.';

revoke all on function gps.dossie_do_cliente(uuid) from public, anon;
grant execute on function gps.dossie_do_cliente(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- PROVA PENDENTE — 🔴 NÃO MEDIDA NESTA SESSÃO. Nem MCP do Supabase nem CLI
-- (`supabase`/`psql`) estavam disponíveis neste ambiente de execução para
-- rodar `explain (analyze, buffers)` de verdade nem para ler
-- `pg_get_functiondef`/`pg_get_constraintdef` ao vivo antes de escrever esta
-- migração. Mesma limitação já registrada por escrito nas migrations `…261`,
-- `…262` e `…263`. O que precisa rodar contra o banco real ANTES de aplicar:
--
--   -- 1) confirmar os 3 corpos vigentes ANTES desta migração (para provar
--   --    que a cópia acima é fiel ao que está no banco hoje):
--   select pg_get_functiondef(oid) from pg_proc
--    where pronamespace = 'gps'::regnamespace
--      and proname in ('fila_de_ligacoes','entrevista_gravar','reuniao_propor_data');
--
--   -- 2) confirmar o CHECK vigente de acessos_log.acao (25 valores esperados):
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = ''gps.acessos_log''::regclass and contype = ''c'';
--
--   -- 3) a query do dossiê (predicado por PK/id, sem WHERE novo):
--   explain (analyze, buffers)
--   select gps.dossie_do_cliente(''<um cliente_id real com decisores e proposta>'');
--
--   -- 4) a leitura isolada de cada parte (para separar o custo de cada join):
--   explain (analyze, buffers)
--   select c.id, c.nome, c.telefone, c.grau_relacao, c.fase, c.perfil_disc
--     from gps.etapa1_clientes c where c.id = ''<cliente_id>'';
--   explain (analyze, buffers)
--   select * from gps.cliente_decisores where cliente_id = ''<cliente_id>'';
--   explain (analyze, buffers)
--   select * from gps.reuniao_preliminar_propostas where cliente_id = ''<cliente_id>'';
--
-- Hipótese escrita (não medição): todos os predicados são igualdade sobre PK
-- ou coluna já indexada (`cliente_decisores_cliente_idx`,
-- `reuniao_preliminar_propostas_cliente_viva_uk` para a proposta viva; o
-- histórico completo por cliente é Seq Scan sobre um subconjunto pequeno por
-- natureza — poucas propostas por cliente). Nenhum índice novo se justifica
-- sem essa medição real.
-- ═══════════════════════════════════════════════════════════════════════════
