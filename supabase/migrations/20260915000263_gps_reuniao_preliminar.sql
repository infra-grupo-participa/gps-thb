-- Fatia 4 da esteira: REUNIÃO PRELIMINAR — proposta de data, aceite e
-- contestação (decisões do Marcio, 15/09/2026).
--
-- A equipe propõe uma data para a reunião preliminar com o cliente FAVORITO
-- do parceiro (`acompanhado_equipe`). O parceiro aceita ou contesta (com
-- motivo). Contestação vira aviso no `/admin`.
--
-- ═══════════════════════════════════════════════════════════════════════
-- 🔴 AS TABELAS `gps.reuniao_*` ANTIGAS CONTINUAM PROIBIDAS
-- ═══════════════════════════════════════════════════════════════════════
--
-- `gps.reuniao_agendamentos`, `reuniao_horarios`, `reuniao_bloqueios`,
-- `reuniao_eventos` e `gps.agenda` seguem ÓRFÃS no banco desde a remoção do
-- agendamento com a equipe em 08/2026 (decisão operacional do Marcio: "a
-- equipe não estava comparecendo"). Elas JÁ FORAM RECONSTRUÍDAS POR ENGANO
-- UMA VEZ, em 05/08/2026 — o modelo tinha `aluno_id UNIQUE` (só 1 reunião por
-- ambiente, para sempre) e `check (dow = 3)` (só quarta-feira), e a escrita
-- foi revogada de novo (migração `…117`) com triggers que nunca chegaram a
-- ser versionadas. Este texto é o aviso escrito, para quem ler esta migração
-- amanhã não repetir o erro: NÃO REABRIR aquelas tabelas, mesmo que pareçam
-- "quase servir".
--
-- Esta feature usa uma tabela NOVA, `gps.reuniao_preliminar_propostas`, nome
-- deliberadamente distinto, e um modelo diferente: append-only, único
-- parcial por CLIENTE (não por aluno — um ambiente pode ter vários clientes
-- em processo), sem restrição de dia da semana.
--
-- ═══════════════════════════════════════════════════════════════════════
-- POR QUE APPEND-ONLY (a tabela é o PROCESSO, a coluna é o RESULTADO)
-- ═══════════════════════════════════════════════════════════════════════
--
-- "Propôs → contestou → propôs de novo" é o histórico que a equipe precisa
-- enxergar (é o que decide se um cliente está indo para o chamado da 2ª
-- contestação). Uma linha MUTÁVEL apagaria esse rastro a cada resposta. Por
-- isso `reuniao_responder` nunca faz `update estado='aceita' where ...` como
-- reescrita destrutiva de significado — grava a transição na MESMA linha da
-- proposta respondida (ela deixa de estar "viva", mas o que ela foi continua
-- legível), e uma proposta nova (depois de contestação) é uma LINHA NOVA.
--
-- 🔑 O ACEITE ESCREVE EM `gps.etapa1_clientes.data_reuniao_preliminar` NA
--    MESMA TRANSAÇÃO. Aquela coluna (40 preenchidos hoje) alimenta
--    `agendados` no painel, a meta de 15 reuniões da Etapa 01 e
--    `admin_clientes_lista` — a tabela nova é o PROCESSO, a coluna é o
--    RESULTADO. Sem escrever as duas juntas haveria duas verdades sobre
--    "quando é a reunião".
--
-- ═══════════════════════════════════════════════════════════════════════
-- POR QUE O ÚNICO PARCIAL É ESSENCIAL
-- ═══════════════════════════════════════════════════════════════════════
--
-- Sem `UNIQUE (cliente_id) WHERE estado='proposta'`, duas pessoas da equipe
-- poderiam propor datas diferentes para o mesmo cliente (nada no app impede
-- dois cliques quase simultâneos de duas abas), e o parceiro poderia aceitar
-- as duas — duas reuniões "vivas" para o mesmo cliente, sem meio de saber
-- qual vale. O índice garante isso no banco, não só na RPC (que já confere
-- antes de inserir, mas a checagem em aplicação sozinha tem janela de corrida
-- que o índice único fecha de vez).
--
-- ═══════════════════════════════════════════════════════════════════════
-- CONTESTAÇÃO: 1 VEZ SÓ (decisão do Marcio, 15/09)
-- ═══════════════════════════════════════════════════════════════════════
--
-- Contestou uma vez com motivo; se a segunda data também não servir, vira
-- CHAMADO e uma pessoa resolve — sem teto isso vira loop de reagendamento, e
-- foi justamente "reunião que não acontece" que matou o agendamento antigo
-- em 08/2026. `reuniao_responder` CONTA quantas propostas deste CLIENTE já
-- foram contestadas (`estado = 'contestada'`) e recusa a 2ª contestação —
-- não impede a equipe de propor uma 3ª data (ela decide se abre o chamado ou
-- tenta de novo), só impede o parceiro de contestar pela segunda vez sem
-- passar pelo chamado.
--
-- ═══════════════════════════════════════════════════════════════════════
-- PRAZO DE 3 DIAS ÚTEIS: `caduca` É DERIVADO NA LEITURA, SEM CRON
-- ═══════════════════════════════════════════════════════════════════════
--
-- O projeto já tem 19 crons — o plano desta fatia diz explicitamente que
-- NADA aqui roda em cron. `estado` no banco NUNCA vira `'caduca'` sozinho: a
-- LEITURA (`propostaCaducou`/`estadoEfetivo`, `src/lib/reuniao-preliminar-tipos.ts`)
-- compara `proposta_em` com `now()` e mostra "caduca" quando passou o prazo,
-- sem escrever nada. "Ninguém aceita no lugar dele" — caducar não é aceitar:
-- é só a fila da equipe (`reunioes_contestadas`, na verdade "pendências de
-- resposta") enxergar que aquele cliente está parado.
--
-- ═══════════════════════════════════════════════════════════════════════
-- O AVISO NO `/admin` — SEM CONSULTA NOVA
-- ═══════════════════════════════════════════════════════════════════════
--
-- `gps.admin_painel_atendimento()` já devolve `pendencias_abertas`,
-- `chamados_abertos` etc. por aluno, e já é chamada UMA VEZ em toda abertura
-- do `/admin` (ver `getAtendimentoPorAluno`, `src/lib/data/diario.ts`). A
-- contestação entra como coluna NOVA `reunioes_contestadas integer` NA MESMA
-- RPC — nunca uma segunda consulta. `explain (analyze, buffers)` ANTES e
-- DEPOIS no fim deste arquivo.
--
-- ═══════════════════════════════════════════════════════════════════════
-- ÍNDICES
-- ═══════════════════════════════════════════════════════════════════════
--
-- `(aluno_id, proposta_em desc)` — é o predicado da leitura "propostas deste
-- ambiente, mais recente primeiro" (`getPropostasDoAluno`), tanto para o
-- parceiro (a própria ficha) quanto para o admin (histórico do cliente).
--
-- `UNIQUE (cliente_id) WHERE estado='proposta'` — além da invariante (acima),
-- é o índice que `reuniao_propor_data` usa para checar "já há proposta viva"
-- antes de inserir (`select 1 from ... where cliente_id=$1 and
-- estado='proposta'`) — sem ele essa checagem faria Seq Scan crescente com o
-- histórico da tabela inteira; com ele é Index Scan sobre um subconjunto que
-- só contém propostas EM ABERTO (pequeno por natureza: uma proposta sai do
-- estado 'proposta' assim que respondida ou cancelada).
--
-- Nenhum índice em `gps.aluno_eventos`/`acessos_log` — só reaproveita o
-- catálogo (`tipo`/`acao`) e o resto do desenho já existente.
--
-- ═══════════════════════════════════════════════════════════════════════
-- CHECKS VIGENTES NO BANCO — LIDOS DAS MIGRATIONS (sem MCP/CLI disponível
-- nesta sessão de execução; mesma limitação já registrada nas migrations
-- `…261` e `…262`). `aluno_eventos_tipo_check`: a última migração a tocar o
-- CHECK é a `…262` (32 valores: os 31 da `…261` + `cliente_entrevista_registrada`).
-- `acessos_log_acao_check`: a última é a `…260` (24 valores). A lista abaixo
-- é reconstruída dessas duas + os valores novos desta migração, e o bloco
-- `do $$` confere o NOME da constraint pelo CONTEÚDO antes de reescrever —
-- aborta se o banco divergir do que foi lido aqui.
-- ⚠️ Confirme contra o banco antes de aplicar
-- (`select pg_get_constraintdef(oid) from pg_constraint where
-- conrelid='gps.aluno_eventos'::regclass and contype='c'` — e o mesmo para
-- `gps.acessos_log`).
--
-- REVERSÃO (nesta ordem):
--   drop function if exists gps.reuniao_cancelar_proposta(uuid);
--   drop function if exists gps.reuniao_responder(uuid, text, text);
--   drop function if exists gps.reuniao_propor_data(uuid, timestamptz);
--   alter table gps.aluno_eventos drop constraint aluno_eventos_tipo_check;
--   alter table gps.aluno_eventos add constraint aluno_eventos_tipo_check
--     check (tipo in (<lista da …262, sem os 3 valores novos>));
--   alter table gps.acessos_log drop constraint acessos_log_acao_check;
--   alter table gps.acessos_log add constraint acessos_log_acao_check
--     check (acao = any(array[<lista da …260, sem 'reuniao_preliminar_cancelada'>]));
--   drop table if exists gps.reuniao_preliminar_propostas;
--   -- gps.admin_painel_atendimento: reverter para a definição da …235 (sem
--   -- reunioes_contestadas) — ver o corpo ANTERIOR comentado antes da nova
--   -- definição, mais abaixo.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) TABELA gps.reuniao_preliminar_propostas
-- ═══════════════════════════════════════════════════════════════════════════
create table gps.reuniao_preliminar_propostas (
  id                  uuid primary key default gen_random_uuid(),
  cliente_id          uuid not null references gps.etapa1_clientes(id) on delete cascade,
  -- Desnormalizado DE PROPÓSITO: é o predicado da fila do /admin ("propostas
  -- deste ambiente") sem precisar de join com etapa1_clientes só para achar o
  -- dono. Mantido coerente com cliente_id.aluno_id pela própria RPC (nunca
  -- escrito pelo cliente).
  aluno_id            uuid not null,
  data_proposta       timestamptz not null,
  proposta_em         timestamptz not null default now(),
  proposta_por        uuid not null references auth.users(id) on delete set null,
  estado              text not null default 'proposta'
    check (estado in ('proposta', 'aceita', 'contestada', 'cancelada')),
  resposta_em         timestamptz,
  resposta_por        uuid references auth.users(id) on delete set null,
  -- Obrigatório (3..300) quando estado='contestada'; null nos demais estados.
  contestacao_motivo  text,
  constraint chk_reuniao_preliminar_motivo_quando_contestada
    check (
      (estado = 'contestada' and contestacao_motivo is not null
        and char_length(btrim(contestacao_motivo)) between 3 and 300)
      or (estado <> 'contestada' and contestacao_motivo is null)
    )
);

comment on table gps.reuniao_preliminar_propostas is
  'Proposta de data da reuniao preliminar (Fatia 4 da esteira, migracao …263, 15/09/2026). APPEND-ONLY: contestar ou aceitar muda o ESTADO desta linha (nao apaga, nao reescreve o sentido), e uma proposta nova depois de contestacao e uma LINHA NOVA -- e o historico que a equipe precisa. NAO e gps.reuniao_agendamentos nem parente dela: aquelas tabelas seguem ORFAS e PROIBIDAS (removidas em 08/2026, ja reconstruidas por engano uma vez em 05/08). O aceite tambem escreve gps.etapa1_clientes.data_reuniao_preliminar na MESMA transacao -- esta tabela e o PROCESSO, aquela coluna e o RESULTADO.';

comment on column gps.reuniao_preliminar_propostas.aluno_id is
  'Desnormalizado de cliente_id.aluno_id -- e o predicado da fila do /admin (pendencias por ambiente), evitando join. Mantido coerente pela RPC gps.reuniao_propor_data; nunca escrito pelo cliente.';

comment on column gps.reuniao_preliminar_propostas.estado is
  'proposta | aceita | contestada | cancelada. NUNCA "caduca" -- esse estado e DERIVADO NA LEITURA (src/lib/reuniao-preliminar-tipos.ts:estadoEfetivo), comparando proposta_em com now() (3 dias uteis). Sem cron: o projeto ja tem 19 e o plano desta fatia exige zero novos.';

comment on column gps.reuniao_preliminar_propostas.contestacao_motivo is
  'Obrigatorio (3..300 chars) quando estado=contestada; null nos demais. CHECK chk_reuniao_preliminar_motivo_quando_contestada garante a coerencia no banco, nao so na RPC.';

-- Índice do predicado da leitura "propostas deste ambiente, recente primeiro"
-- (ficha do parceiro e histórico do admin).
create index reuniao_preliminar_propostas_aluno_idx
  on gps.reuniao_preliminar_propostas (aluno_id, proposta_em desc);

-- 🔴 O único parcial: garante 1 proposta VIVA por cliente (a invariante) e é
-- o índice que `reuniao_propor_data` usa para checar "já há proposta viva"
-- antes de inserir.
create unique index reuniao_preliminar_propostas_cliente_viva_uk
  on gps.reuniao_preliminar_propostas (cliente_id) where estado = 'proposta';

-- RLS: mesma regra de leitura de `gps.etapa1_clientes` (a proposta É de um
-- cliente dela) — admin vê tudo, aluno/sócio só o próprio ambiente. Nenhuma
-- policy de escrita para aluno nem para admin: as 3 RPCs (security definer)
-- são a única porta de escrita, no mesmo padrão de `cliente_decisores` e
-- `chamados`.
alter table gps.reuniao_preliminar_propostas enable row level security;

create policy gps_reuniao_preliminar_propostas_select
  on gps.reuniao_preliminar_propostas
  for select
  using (
    public.gp_is_admin()
    or aluno_id = gps.aluno_atual()
  );

-- 🔴 GRANT explícito: `service_role` não dispensa RLS nem GRANT neste
-- projeto (schema `gps` exposto no PostgREST). `revoke` primeiro, sempre —
-- nenhuma escrita direta pela REST: só SELECT (ficha e painel leem), toda
-- escrita é pelas 3 RPCs abaixo (security definer, revogam o resto).
revoke all on gps.reuniao_preliminar_propostas from public, anon;
grant select on gps.reuniao_preliminar_propostas to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) DIÁRIO — 4 tipos novos. Corpo VIGENTE da …262 (32 valores) + 4 novos.
--    Confere o NOME da constraint pelo CONTEÚDO (não pelo número da
--    migração que a criou por último) antes de reescrever — aborta se o
--    banco tiver mudado por fora deste diretório.
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
     and c.relname = 'aluno_eventos'
     and con.contype = 'c'
     and pg_get_constraintdef(con.oid) like '%cliente_entrevista_registrada%';

  if v_nome is null then
    raise exception
      'CHECK de gps.aluno_eventos.tipo nao encontrado (procurado pelo CONTEUDO cliente_entrevista_registrada, da migracao …262) -- migracao abortada. Leia o CHECK vigente no banco antes de reescrever esta lista.';
  end if;

  execute format('alter table gps.aluno_eventos drop constraint %I', v_nome);
end;
$$;

alter table gps.aluno_eventos
  add constraint aluno_eventos_tipo_check check (tipo in (
    'cliente_cadastrado',
    'cliente_favoritado',
    'cliente_desfavoritado',
    'cliente_status_mudou',
    'cliente_fase_mudou',
    'cliente_mensagem_padrao',
    'cliente_estudo_caso',
    'cliente_ligacao',
    'cliente_aderiu_reuniao',
    'cliente_reuniao_agendada',
    'cliente_excluido',
    'cliente_honorarios_definidos',
    'tarefa_concluida',
    'tarefa_reaberta',
    'conta_criada',
    'email_confirmado',
    'primeiro_acesso',
    'entrou_no_programa',
    'etapa_liberada_pela_equipe',
    'etapa_travada_pela_equipe',
    'onboarding_iniciado',
    'onboarding_concluido',
    'favorito_confirmado_pela_equipe',
    'favorito_liberado_pela_equipe',
    'cliente_contrato_anexado',
    'cliente_contrato_removido',
    'nota_apagada',
    'cliente_minuta_anexada',
    'cliente_minuta_removida',
    'cliente_selecionado_entrevista',
    'cliente_removido_entrevista',
    'cliente_entrevista_registrada',
    -- ── Reunião preliminar (15/09/2026, migração …263) ──
    -- 🔑 'reuniao_preliminar_cancelada' NÃO entra aqui: cancelamento é a
    -- EQUIPE desfazendo a própria proposta (ação administrativa), gravado só
    -- em gps.acessos_log — ver acessos_log_acao_check logo abaixo.
    'reuniao_preliminar_proposta',
    'reuniao_preliminar_aceita',
    'reuniao_preliminar_contestada'
  ));

comment on constraint aluno_eventos_tipo_check on gps.aluno_eventos is
  'Catalogo fechado de tipos de evento do diario. Espelha TIPOS_EVENTO em src/lib/types.ts. 32 valores vigentes na …262 + 3 desta migracao: reuniao_preliminar_proposta/_aceita/_contestada, gravados pelas RPCs gps.reuniao_propor_data/gps.reuniao_responder. O cancelamento (reuniao_preliminar_cancelada) e ACAO ADMINISTRATIVA, gravado so em gps.acessos_log -- nao entra aqui. Ao acrescentar valor, LEIA O CHECK VIGENTE NO BANCO antes -- reescrever a lista de memoria apaga valores em silencio.';

-- `acessos_log.acao` ganha 1 valor: a EQUIPE cancelando uma proposta é ação
-- administrativa (auditada em acessos_log, no padrão de
-- etapa_liberacao_alterada) -- propor e responder já são cobertos pelo
-- Diário (aluno_eventos), que é a trilha do AMBIENTE; cancelar é a equipe
-- desfazendo o próprio trabalho e por isso também entra na trilha
-- administrativa.
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
     and pg_get_constraintdef(con.oid) like '%interruptor_alterado%';

  if v_nome is null then
    raise exception
      'CHECK de gps.acessos_log.acao nao encontrado (procurado pelo CONTEUDO interruptor_alterado, da migracao …260) -- migracao abortada. Leia o CHECK vigente no banco antes de reescrever esta lista.';
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
    -- ── Reunião preliminar (15/09/2026, migração …263) ──
    'reuniao_preliminar_cancelada'
  ]));

comment on constraint acessos_log_acao_check on gps.acessos_log is
  'Catalogo fechado das acoes administrativas auditadas. Espelha ROTULO_ACAO_ADMIN em src/components/admin/diario-labels.ts. 24 valores vigentes na …260 + 1 desta migracao: reuniao_preliminar_cancelada (a equipe desfazendo a propria proposta). Propor e responder ficam so no Diario (aluno_eventos) -- sao a trilha do AMBIENTE, nao acao administrativa sobre login/acesso.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) gps.reuniao_propor_data — a EQUIPE propõe uma data
-- ═══════════════════════════════════════════════════════════════════════════
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
  if not coalesce(public.gp_is_admin(), false) then
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
  'Equipe propoe uma data de reuniao preliminar para o cliente FAVORITO do parceiro (acompanhado_equipe=true). gp_is_admin() ou 42501. Recusa se o cliente nao for o favorito, ou se ja houver proposta viva (estado=proposta) -- o indice unico parcial garante isso no banco. Grava reuniao_preliminar_proposta no Diario.';

revoke all on function gps.reuniao_propor_data(uuid, timestamptz) from public, anon;
grant execute on function gps.reuniao_propor_data(uuid, timestamptz) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) gps.reuniao_responder — o PARCEIRO aceita ou contesta
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function gps.reuniao_responder(
  p_proposta_id uuid,
  p_resposta    text,
  p_motivo      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ambiente        uuid := gps.aluno_atual();
  v_proposta        record;
  v_motivo          text;
  v_qtd_contestadas integer;
begin
  if p_proposta_id is null then
    raise exception 'proposta nao informada' using errcode = '22023';
  end if;

  if p_resposta is null or p_resposta not in ('aceita', 'contestada') then
    raise exception 'Escolha uma resposta válida.' using errcode = '22023';
  end if;

  select pp.id, pp.cliente_id, pp.aluno_id, pp.estado, pp.data_proposta
    into v_proposta
    from gps.reuniao_preliminar_propostas pp
   where pp.id = p_proposta_id;

  if v_proposta.id is null then
    raise exception 'Proposta não encontrada.' using errcode = 'P0002';
  end if;

  -- AUTORIZAÇÃO: só o dono do ambiente (titular OU sócio, via
  -- gps.aluno_atual() -- mesma função que a RLS de etapa1_clientes usa).
  -- Admin NÃO responde no lugar do parceiro: é o parceiro quem aceita ou
  -- contesta.
  if v_ambiente is null or v_ambiente <> v_proposta.aluno_id then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if v_proposta.estado <> 'proposta' then
    raise exception 'Esta proposta já foi respondida ou cancelada.' using errcode = '22023';
  end if;

  if p_resposta = 'contestada' then
    v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');
    if v_motivo is null or char_length(v_motivo) < 3 then
      raise exception 'Escreva o motivo da contestação (ao menos 3 caracteres).' using errcode = '22023';
    end if;
    if char_length(v_motivo) > 300 then
      raise exception 'O motivo passa de 300 caracteres.' using errcode = '22023';
    end if;

    -- 🔴 Contestação: 1 vez só. Conta quantas propostas deste CLIENTE já
    -- foram contestadas -- se a segunda data também não servir, vira chamado
    -- e uma pessoa resolve (decisão do Marcio: sem teto vira loop de
    -- reagendamento).
    select count(*) into v_qtd_contestadas
      from gps.reuniao_preliminar_propostas
     where cliente_id = v_proposta.cliente_id and estado = 'contestada';

    if v_qtd_contestadas >= 1 then
      raise exception 'Você já contestou uma proposta para este cliente. Para reagendar de novo, abra um chamado no Suporte.' using errcode = '22023';
    end if;

    update gps.reuniao_preliminar_propostas
       set estado = 'contestada',
           resposta_em = now(),
           resposta_por = auth.uid(),
           contestacao_motivo = v_motivo
     where id = p_proposta_id;

    insert into gps.aluno_eventos
      (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
    values
      (v_proposta.aluno_id, now(), 'reuniao_preliminar_contestada', 'cliente', v_proposta.cliente_id,
       'Contestou a data da reunião preliminar', jsonb_build_object('motivo', v_motivo), 'aluno', auth.uid(), 'app');

    return jsonb_build_object('proposta_id', p_proposta_id, 'estado', 'contestada');
  end if;

  -- ACEITE: grava a proposta E a coluna-resultado, na MESMA transação.
  update gps.reuniao_preliminar_propostas
     set estado = 'aceita',
         resposta_em = now(),
         resposta_por = auth.uid()
   where id = p_proposta_id;

  update gps.etapa1_clientes
     set data_reuniao_preliminar = v_proposta.data_proposta
   where id = v_proposta.cliente_id;

  insert into gps.aluno_eventos
    (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
  values
    (v_proposta.aluno_id, now(), 'reuniao_preliminar_aceita', 'cliente', v_proposta.cliente_id,
     'Aceitou a data da reunião preliminar', jsonb_build_object('data_proposta', v_proposta.data_proposta), 'aluno', auth.uid(), 'app');

  return jsonb_build_object('proposta_id', p_proposta_id, 'estado', 'aceita', 'data_proposta', v_proposta.data_proposta);
end;
$function$;

comment on function gps.reuniao_responder(uuid, text, text) is
  'Parceiro (titular ou socio, via gps.aluno_atual()) aceita ou contesta uma proposta de reuniao preliminar. Aceite grava etapa1_clientes.data_reuniao_preliminar na MESMA transacao. Contestacao exige motivo (3..300) e e recusada se este CLIENTE ja tiver 1 contestacao anterior (decisao Marcio: sem teto vira loop -- a 2a virada de chamado). Grava reuniao_preliminar_aceita/_contestada no Diario.';

revoke all on function gps.reuniao_responder(uuid, text, text) from public, anon;
grant execute on function gps.reuniao_responder(uuid, text, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) gps.reuniao_cancelar_proposta — a EQUIPE cancela
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function gps.reuniao_cancelar_proposta(
  p_proposta_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_proposta record;
begin
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if p_proposta_id is null then
    raise exception 'proposta nao informada' using errcode = '22023';
  end if;

  select pp.id, pp.cliente_id, pp.aluno_id, pp.estado
    into v_proposta
    from gps.reuniao_preliminar_propostas pp
   where pp.id = p_proposta_id;

  if v_proposta.id is null then
    raise exception 'Proposta não encontrada.' using errcode = 'P0002';
  end if;

  if v_proposta.estado <> 'proposta' then
    raise exception 'Só é possível cancelar uma proposta ainda aguardando resposta.' using errcode = '22023';
  end if;

  update gps.reuniao_preliminar_propostas
     set estado = 'cancelada',
         resposta_em = now(),
         resposta_por = auth.uid()
   where id = p_proposta_id;

  insert into gps.acessos_log (acao, aluno_id, feito_por, detalhe)
  values ('reuniao_preliminar_cancelada', v_proposta.aluno_id, auth.uid(), 'proposta_id=' || v_proposta.cliente_id::text);

  return jsonb_build_object('proposta_id', p_proposta_id, 'estado', 'cancelada');
end;
$function$;

comment on function gps.reuniao_cancelar_proposta(uuid) is
  'Equipe cancela uma proposta ainda aguardando resposta (estado=proposta). gp_is_admin() ou 42501. Auditado em gps.acessos_log (reuniao_preliminar_cancelada) -- e a equipe desfazendo o proprio trabalho, nao um fato do ambiente.';

revoke all on function gps.reuniao_cancelar_proposta(uuid) from public, anon;
grant execute on function gps.reuniao_cancelar_proposta(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6) gps.admin_painel_atendimento — +1 coluna, ZERO consulta nova
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Definição ANTERIOR (…235, para reversão):
--
-- create or replace function gps.admin_painel_atendimento()
--  returns table(aluno_id uuid, pendencias_abertas integer, ultima_nota_em timestamp with time zone, ultima_nota_tipo text, ultima_nota_resumo text, chamados_abertos integer)
--  language plpgsql stable set search_path to ''
-- as $function$
-- begin
--   if not public.gp_is_admin() then
--     raise exception 'apenas administradores' using errcode = '42501';
--   end if;
--   return query
--   with ult as (...), pend as (...), cham as (...), base as (...)
--   select b.aluno_id, coalesce(p.abertas,0), u.criado_em, u.tipo, u.resumo, coalesce(ch.abertos,0)
--     from base b left join ult u ... left join pend p ... left join cham ch ...;
-- end;
-- $function$;
--
-- A função é DROPADA e recriada (não apenas `create or replace`) porque a
-- assinatura de retorno muda (coluna nova no `returns table`) — Postgres
-- recusa `create or replace` que altera o shape de saída.
drop function if exists gps.admin_painel_atendimento();

create or replace function gps.admin_painel_atendimento()
 returns table(
   aluno_id uuid,
   pendencias_abertas integer,
   ultima_nota_em timestamp with time zone,
   ultima_nota_tipo text,
   ultima_nota_resumo text,
   chamados_abertos integer,
   reunioes_contestadas integer
 )
 language plpgsql
 stable
 set search_path to ''
as $function$
begin
  if not public.gp_is_admin() then
    raise exception 'apenas administradores' using errcode = '42501';
  end if;
  return query
  with ult as (
    select distinct on (n.aluno_id)
           n.aluno_id       as aluno_id,
           n.criado_em      as criado_em,
           n.tipo           as tipo,
           left(n.texto, 140) as resumo
      from gps.aluno_notas n
     order by n.aluno_id, n.criado_em desc
  ),
  pend as (
    select n.aluno_id as aluno_id, count(*)::integer as abertas
      from gps.aluno_notas n
     where n.tipo = 'pendencia' and n.resolvido_em is null
     group by n.aluno_id
  ),
  cham as (
    select c.aluno_id as aluno_id, count(*)::integer as abertos
      from gps.chamados c
     where c.status <> 'fechado'
     group by c.aluno_id
  ),
  -- Reunião preliminar contestada: a coluna nova. Mesma granularidade das
  -- demais (contagem por aluno_id), reaproveitando a coluna desnormalizada
  -- reuniao_preliminar_propostas.aluno_id -- sem join com etapa1_clientes.
  reun as (
    select pp.aluno_id as aluno_id, count(*)::integer as contestadas
      from gps.reuniao_preliminar_propostas pp
     where pp.estado = 'contestada'
     group by pp.aluno_id
  ),
  base as (
    select b.aluno_id
      from (
        select u.aluno_id from ult u
        union
        select ch.aluno_id from cham ch
        union
        select r.aluno_id from reun r
      ) b
     -- 🔑 a trava: só continua na fila quem AINDA tem ambiente (…235).
     where exists (
       select 1 from gps.membros m where m.aluno_id = b.aluno_id
     )
  )
  select b.aluno_id,
         coalesce(p.abertas, 0),
         u.criado_em,
         u.tipo,
         u.resumo,
         coalesce(ch.abertos, 0),
         coalesce(r.contestadas, 0)
    from base b
    left join ult  u  on u.aluno_id  = b.aluno_id
    left join pend p  on p.aluno_id  = b.aluno_id
    left join cham ch on ch.aluno_id = b.aluno_id
    left join reun r  on r.aluno_id  = b.aluno_id;
end;
$function$;

comment on function gps.admin_painel_atendimento() is
  'Resumo de atendimento por ambiente para os cards de /admin: pendencias abertas, ultima nota (140 chars), chamados abertos e (…263) reunioes contestadas aguardando a equipe. UMA RPC so, chamada uma vez por abertura do painel -- reunioes_contestadas reaproveita a MESMA CTE base (uniao com reuniao_preliminar_propostas.aluno_id, ja desnormalizado, sem join), nao e consulta nova. gp_is_admin() ou 42501.';

revoke all on function gps.admin_painel_atendimento() from public, anon;
grant execute on function gps.admin_painel_atendimento() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- PROVA PENDENTE — 🔴 NÃO MEDIDA NESTA SESSÃO. Nem MCP do Supabase nem CLI
-- (`supabase`/`psql`) estavam disponíveis neste ambiente de execução. Mesma
-- limitação já registrada nas migrations `…261` e `…262`.
--
-- O que precisa rodar contra o banco real ANTES de aplicar (EXIGÊNCIA
-- explícita do plano: `explain (analyze, buffers)` ANTES e DEPOIS da mudança
-- em admin_painel_atendimento; ela custa ~0,730 ms hoje, medido na …235):
--
--   -- 1) confirmar os dois CHECKs pelo conteúdo (os blocos `do $$` acima já
--   --    abortam se divergirem, mas é prudente conferir à mão também):
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'gps.aluno_eventos'::regclass and contype = 'c';
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'gps.acessos_log'::regclass and contype = 'c';
--
--   -- 2) ANTES (rodar contra a definição …235, sem reunioes_contestadas):
--   explain (analyze, buffers) select * from gps.admin_painel_atendimento();
--
--   -- 3) DEPOIS de aplicar esta migração:
--   explain (analyze, buffers) select * from gps.admin_painel_atendimento();
--
--   -- 4) a query nova que a fila do admin faz para propostas pendentes de
--   --    resposta de UM ambiente (usa o índice aluno_idx criado acima):
--   explain (analyze, buffers)
--   select * from gps.reuniao_preliminar_propostas
--    where aluno_id = '<um aluno_id real com cliente favorito>'
--    order by proposta_em desc;
--
-- Hipótese escrita (não medição): a CTE `reun` agrega
-- `reuniao_preliminar_propostas` filtrando `estado='contestada'` — tabela
-- nova, hoje vazia (0 linhas), então o custo adicional é próximo de zero
-- até haver volume real. Quando crescer, o predicado é `estado='contestada'`
-- sobre uma tabela cujo tamanho tende a ser pequeno por natureza (só
-- contestações, que já têm teto de 1 por cliente) — um índice parcial
-- `where estado='contestada'` só se justifica se o EXPLAIN real mostrar
-- Seq Scan custoso, não por suposição (mesma lição de etapa1_clientes(fase):
-- Seq Scan 0,686 ms venceu Index Scan 0,809 ms em 1.222 linhas).
-- ═══════════════════════════════════════════════════════════════════════════
