-- ═══════════════════════════════════════════════════════════════════════════
-- 348 — Google Drive: ajustes da 347 (reprovação do orquestrador)
-- ═══════════════════════════════════════════════════════════════════════════
-- Corpos recriados a partir da 347 do repo (= vivo, aplicada em 05/10/2026).
--
-- 1. Revogação presa: tarefa 'revogar' que vira 'erro' (4ª transitória ou
--    credencial morta) deixava gps.drive_permissoes marcadas sem retomada.
--    gps.drive_varrer passa a reenfileirar 'revogar' quando há permissão
--    marcada, viva e com tentativas < 4, e NÃO há 'revogar' pendente/rodando.
--    Teto: 1 por hora, comparando com o criado_em da última 'revogar' (com
--    credencial morta, no máximo 24 linhas/dia — nunca 1/min).
--    Índice parcial novo drive_tarefas_revogar_criado_idx serve essa leitura
--    (aluno_id IS NULL não deixa o planner usar a ordem de drive_tarefas_aluno_idx).
-- 2. gps.drive_estado desligado devolve {ativo:false} na 1ª linha, antes de
--    auth.uid()/gp_is_admin() e das demais consultas.
-- 3. gps.drive_estado ganha, no lado do parceiro:
--      organizada          boolean  — raiz_parceiro E clientes em drive_pastas
--      revogacao_pendente  boolean  — SÓ para admin (chave ausente p/ parceiro):
--                                     permissão marcada e não revogada do aluno
--                                     (pendente ou desistida com tentativas = 4).
--
-- DOWN (comentado — rodar à mão): recriar gps.drive_varrer e gps.drive_estado
--   com os corpos da 20261005000347 (seções 6 e 7.3) e
--   drop index if exists gps.drive_tarefas_revogar_criado_idx;
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '2s';
set local statement_timeout = '20s';

-- Última 'revogar' (teto 1/h do reenfileiramento). Só linhas de revogar.
create index if not exists drive_tarefas_revogar_criado_idx
  on gps.drive_tarefas (criado_em desc)
  where tipo = 'revogar';

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Varredura: + retomada da revogação presa
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function gps.drive_varrer()
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_n      int;
  v_ultimo timestamptz;
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

  -- Revogação presa (…348): há permissão marcada viva (a tarefa 'revogar'
  -- anterior virou erro, ou o enfileirar do gatilho falhou) e nenhuma
  -- 'revogar' ativa. Teto 1/h pelo criado_em da última 'revogar': com
  -- credencial morta a fila cresce no máximo 24/dia, nunca 1/min.
  -- Ordem do mais barato/raro primeiro: sem item marcado, 1 index scan vazio.
  if exists (select 1 from gps.drive_permissoes p
              where p.revogar_desde is not null and p.revogado_em is null
                and p.tentativas < 4)
     and not exists (select 1 from gps.drive_tarefas t
                      where t.tipo = 'revogar' and t.estado in ('pendente', 'rodando')) then
    select t.criado_em into v_ultimo
      from gps.drive_tarefas t
     where t.tipo = 'revogar'
     order by t.criado_em desc
     limit 1;
    if v_ultimo is null or v_ultimo < now() - interval '1 hour' then
      insert into gps.drive_tarefas (tipo, aluno_id)
      values ('revogar', null)
      on conflict (tipo) where tipo = 'revogar' and estado in ('pendente', 'rodando') do nothing;
    end if;
  end if;

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
-- 2) Estado para a tela: desligado na 1ª linha; organizada; revogacao_pendente
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function gps.drive_estado(p_aluno_id uuid, p_cliente_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid   uuid;
  v_admin boolean;
  v_par   jsonb;
  v_cli   jsonb   := null;
  v_url   text;
  v_org   boolean;
begin
  -- Desligado: nada mais é lido (nem sessão, nem guarda). Só revela o
  -- interruptor, que a tela já trata como "esconder"; anon não executa.
  if not gps.drive_ativo() then
    return jsonb_build_object('ativo', false);
  end if;

  v_uid   := auth.uid();
  v_admin := coalesce(public.gp_is_admin(), false);

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

  -- Organizada = raiz E 5) CLIENTES registradas (mesma regra de
  -- drive_criar_pasta_cliente). drive_pastas_parceiro_papel_uq: 1 por papel.
  select count(*) = 2 into v_org
    from gps.drive_pastas p
   where p.aluno_id = p_aluno_id
     and p.papel in ('raiz_parceiro', 'clientes');

  v_par := coalesce(v_par, '{}'::jsonb)
           || jsonb_build_object('url', v_url, 'organizada', coalesce(v_org, false));

  -- Só a equipe vê: permissão marcada e ainda viva (pendente ou desistida).
  if v_admin then
    v_par := v_par || jsonb_build_object('revogacao_pendente', exists (
      select 1 from gps.drive_permissoes p
       where p.aluno_id = p_aluno_id
         and p.revogado_em is null
         and p.revogar_desde is not null));
  end if;

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

  return jsonb_build_object('ativo', true, 'parceiro', v_par, 'cliente', v_cli);
end;
$function$;

comment on function gps.drive_estado(uuid, uuid) is
  'Desligado (drive_provisionar_ativo) -> {ativo:false} sem nenhuma outra leitura (348). Ligado: estado da ultima tarefa do Drive do parceiro (provisionar/compartilhar) + url + organizada (raiz_parceiro e clientes em drive_pastas) + revogacao_pendente (SO admin) e, com p_cliente_id, do cliente (criar_pasta_cliente) + url. Guarda: admin OU gps.aluno_atual() = p_aluno_id (coalesce). Cliente de outro ambiente -> P0002. erro_detalhe so para admin.';

revoke all     on function gps.drive_estado(uuid, uuid) from public, anon;
grant  execute on function gps.drive_estado(uuid, uuid) to authenticated;

commit;
