-- Plantão — origem da presença: portal (aluno) × equipe (admin), 09/09/2026.
--
-- POR QUE EXISTE
--   O painel do admin (`/admin/plantao`) vai ganhar "Marcar presença" na
--   lista de inscritos (Fase 1 desta rodada). Sem uma coluna própria, uma
--   presença marcada pela equipe ficaria indistinguível de uma presença que
--   o próprio aluno registrou ao revelar o link do Zoom
--   (`gps.plantao_revelar_link`) — e o Marcio decidiu que as duas VALEM
--   IGUAL (contam para NPS, para o histórico do aluno), mas a ORIGEM
--   precisa ficar visível na tela, para a equipe saber que aquela marcação
--   foi manual.
--
-- O QUE FAZ
--   1. `presenca_origem text check (in ('portal','equipe'))`, NULÁVEL, ZERO
--      BACKFILL: todo registro de presença anterior a esta migration fica
--      com origem `null` — que é o estado HONESTO ("não sabemos", não
--      "veio do portal"). A UI mostra "origem desconhecida" para esses,
--      nunca assume `portal` por omissão.
--   2. `create or replace` em `gps.plantao_revelar_link`, preservando TUDO
--      que a função já faz (rate limit de 10/15min por `ip_hash`, recusa
--      genérica de identidade, janela `[início-1h, início+duracao_min)`,
--      idempotência de `presenca_em`) e acrescentando
--      `presenca_origem = 'portal'` no MESMO update que já grava
--      `presenca_em`. `gps.admin_plantao_marcar_presenca` (migration
--      seguinte, `…180`) é quem grava `'equipe'`.
--
-- O QUE NÃO FAZ
--   * NÃO cria índice: a coluna não entra em nenhum WHERE/JOIN, só é
--     exibida. Índice sem predicado provado é o antipadrão do protocolo de
--     sustentabilidade.
--   * NÃO faz backfill. Não há como saber, para as inscrições já marcadas,
--     se a presença veio do portal ou de um ajuste manual da equipe.
--
-- REVERSÃO
--   1) create or replace de gps.plantao_revelar_link com o corpo VIGENTE da
--      migration `…172` (colado textual, sem a linha `presenca_origem`);
--   2) alter table gps.plantao_inscricoes drop column presenca_origem;
--   ⚠️ Fazer os dois passos juntos: reverter só a coluna com a função ainda
--      gravando nela quebra a escrita; reverter só a função e manter a
--      coluna é inofensivo, mas deixa lixo de schema.

begin;

alter table gps.plantao_inscricoes
  add column if not exists presenca_origem text
  check (presenca_origem in ('portal', 'equipe'));

comment on column gps.plantao_inscricoes.presenca_origem is
  'Quem marcou a presenca: portal (o proprio aluno, via plantao_revelar_link) ou equipe (admin, via admin_plantao_marcar_presenca). NULL = presenca de ANTES desta coluna (09/09/2026) ou nunca marcada -- estado honesto, sem backfill. As duas origens valem igual para NPS e historico; a UI so exibe a origem, nao pondera por ela.';

-- Corpo IDÊNTICO ao vigente na migration `…172`, só acrescentando
-- `presenca_origem = 'portal'` no update que já grava `presenca_em`.
create or replace function gps.plantao_revelar_link(
  p_email text, p_inscricao_id uuid, p_ip_hash text default null)
returns table(ok boolean, motivo text, zoom_url text)
language plpgsql
security definer
set search_path to 'pg_catalog', 'extensions', 'public', 'gps'
as $function$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_ip    text := coalesce(nullif(btrim(coalesce(p_ip_hash, '')), ''), 'sem-ip');
  v_aluno_id uuid;
  v_dono uuid;
  v_slot gps.plantao_slots%rowtype;
  v_fim  timestamptz;
  v_tentativas int;
  v_generico text := 'Não foi possível abrir a sala agora. Se o plantão está no horário, fale com a monitoria.';
begin
  if not gps.plantao_escrita_liberada() then
    return query select false, 'Operação temporariamente indisponível.'::text, null::text;
    return;
  end if;

  select count(*) into v_tentativas
  from gps.plantao_eventos e
  where e.ip_hash = v_ip
    and e.acao in ('plantao_presenca', 'plantao_presenca_tentativa')
    and e.criado_em > now() - interval '15 minutes';

  if v_tentativas >= 10 then
    return query select false, 'Muitas tentativas. Aguarde alguns minutos.'::text, null::text;
    return;
  end if;

  select id into v_aluno_id from gps.plantao_alunos
   where email = v_email and ativo and not bloqueado_por_programa;
  if v_aluno_id is null then
    insert into gps.plantao_eventos (acao, ip_hash)
      values ('plantao_presenca_tentativa', v_ip);
    return query select false, v_generico, null::text;
    return;
  end if;

  select i.aluno_plantao_id into v_dono
  from gps.plantao_inscricoes i
  where i.id = p_inscricao_id and i.cancelado_em is null;

  select sl.* into v_slot
  from gps.plantao_inscricoes i
  join gps.plantao_slots sl on sl.id = i.slot_id
  where i.id = p_inscricao_id and i.cancelado_em is null;

  if v_dono is null or v_dono <> v_aluno_id then
    insert into gps.plantao_eventos (aluno_plantao_id, acao, ip_hash)
      values (v_aluno_id, 'plantao_presenca_tentativa', v_ip);
    return query select false, v_generico, null::text;
    return;
  end if;

  v_fim := v_slot.inicio_em + make_interval(mins => coalesce(v_slot.duracao_min, 120));

  if now() < v_slot.inicio_em - interval '60 minutes' then
    return query select false, 'A sala abre 1 hora antes do início.'::text, null::text;
    return;
  end if;

  if now() >= v_fim then
    return query select false, 'Este plantão já foi encerrado.'::text, null::text;
    return;
  end if;

  if v_slot.zoom_url is null or btrim(v_slot.zoom_url) = '' then
    return query select false, 'O link deste plantão ainda não foi cadastrado.'::text, null::text;
    return;
  end if;

  -- Idempotente: so grava presenca_em (e a origem) se ainda nao tiver.
  update gps.plantao_inscricoes
  set presenca_em = now(),
      presenca_origem = 'portal'
  where id = p_inscricao_id and presenca_em is null;

  insert into gps.plantao_eventos (aluno_plantao_id, acao, ip_hash, slot_id)
    values (v_aluno_id, 'plantao_presenca', v_ip, v_slot.id);

  return query select true, null::text, v_slot.zoom_url;
end;
$function$;

comment on function gps.plantao_revelar_link(text, uuid, text) is
  'Revela o link do Zoom e grava presenca (presenca_origem=portal). Janela: [inicio-1h, inicio+duracao_min). Rate limit 10/15min por ip_hash.';

commit;
