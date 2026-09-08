-- Filtra `bloqueado_por_programa` nas DUAS leituras que ainda contavam
-- fantasma (achado do arquiteto, 08/09/2026).
--
-- 🔴 A migração ...034 travou LOGIN (`plantao_login`) e SESSÃO
-- (`plantao_sessao`), mas duas leituras continuavam somando quem já não
-- pode mais entrar:
--
--   1. `plantao_aviso_mentora_pendente` monta a lista de participantes do
--      e-mail da mentora a partir de `plantao_inscricoes` sem checar se o
--      inscrito está bloqueado. A mentora esperaria alguém que o sistema
--      já impede de entrar na sala.
--
--   2. `plantao_calendario` conta `inscritos_qtd` por slot (subselect
--      lateral `cnt`) sem o mesmo filtro. O aluno vendo o calendário veria
--      um número que inclui gente bloqueada.
--
-- Hoje são 0 inscrições de aluno bloqueado (o produto nunca foi usado) —
-- corrigir agora custa zero e evita que o primeiro caso real seja
-- descoberto em produção. Ambas passam a exigir
-- `not a.bloqueado_por_programa` no JOIN com `plantao_alunos`.
--
-- Reversão: reaplicar os corpos das migrações 20260909000030 (aviso) e
-- 20260901000002 (calendário), sem a condição de bloqueio.

-- ── 1. Aviso à mentora — participantes só de quem pode participar ──────────

create or replace function gps.plantao_aviso_mentora_pendente(p_segredo text)
returns table (
  slot_id uuid,
  mentora_nome text,
  mentora_email text,
  data date,
  hora_inicio time without time zone,
  participantes jsonb
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_esperado text;
begin
  v_esperado := current_setting('app.plantao_manutencao_segredo', true);
  if v_esperado is null or btrim(v_esperado) = ''
     or p_segredo is null or p_segredo <> v_esperado then
    raise exception 'Manutencao nao autorizada.' using errcode = '42501';
  end if;

  return query
  select sl.id, m.nome, m.email, sl.data, sl.hora_inicio,
         coalesce(
           jsonb_agg(
             jsonb_build_object('nome', a.nome, 'email', a.email)
             order by a.nome
           ) filter (where a.id is not null),
           '[]'::jsonb
         )
  from gps.plantao_slots sl
  join gps.plantao_mentoras m on m.id = sl.mentora_id
  left join gps.plantao_inscricoes i
         on i.slot_id = sl.id and i.cancelado_em is null
  -- 🔑 só entra na lista quem AINDA pode participar. Sem isto, o aluno
  -- bloqueado depois de já inscrito continuaria aparecendo para a mentora.
  left join gps.plantao_alunos a
         on a.id = i.aluno_plantao_id and not a.bloqueado_por_programa
  where sl.publicado
    and sl.aviso_mentora_em is null
    and m.email is not null and btrim(m.email) <> ''
    and (sl.inicio_em at time zone 'America/Sao_Paulo')::date
        = ((now() at time zone 'America/Sao_Paulo')::date + 1)
  group by sl.id, m.nome, m.email, sl.data, sl.hora_inicio
  having count(i.id) filter (where a.id is not null) > 0;
end;
$function$;

comment on function gps.plantao_aviso_mentora_pendente(text) is
  'Plantoes de AMANHA (fuso America/Sao_Paulo) publicados, ainda nao avisados e com pelo menos 1 inscrito ELEGIVEL, com a lista de participantes para o e-mail da mentora. Exclui inscrito bloqueado_por_programa (migracao ...037) — a mentora nunca ve quem o sistema ja impede de entrar. Exige app.plantao_manutencao_segredo — falha fechado.';

-- ── 2. Calendário — contagem de inscritos só de quem pode participar ───────

create or replace function gps.plantao_calendario(p_token text, p_ano int, p_mes int)
returns table (
  slot_id uuid,
  data date,
  hora_inicio time,
  duracao_min int,
  mentora_nome text,
  inscritos_qtd int,
  minha_inscricao boolean,
  encerrado boolean
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public, gps
as $$
declare
  v_aluno_id uuid;
  v_inicio timestamptz;
  v_fim timestamptz;
begin
  select s.aluno_plantao_id into v_aluno_id from gps.plantao_sessao(p_token) s;
  if v_aluno_id is null then
    return;
  end if;

  v_inicio := make_date(p_ano, p_mes, 1) at time zone 'America/Sao_Paulo';
  v_fim := (make_date(p_ano, p_mes, 1) + interval '1 month') at time zone 'America/Sao_Paulo';

  return query
  select
    sl.id,
    sl.data,
    sl.hora_inicio,
    sl.duracao_min,
    m.nome,
    coalesce(cnt.qtd, 0)::int,
    (insc.id is not null),
    (sl.inicio_em <= now())
  from gps.plantao_slots sl
  join gps.plantao_mentoras m on m.id = sl.mentora_id
  left join lateral (
    select count(*) as qtd
    from gps.plantao_inscricoes i
    -- 🔑 só conta inscrito que ainda pode participar (não bloqueado).
    join gps.plantao_alunos a
      on a.id = i.aluno_plantao_id and not a.bloqueado_por_programa
    where i.slot_id = sl.id and i.cancelado_em is null
  ) cnt on true
  left join gps.plantao_inscricoes insc
    on insc.slot_id = sl.id
    and insc.aluno_plantao_id = v_aluno_id
    and insc.cancelado_em is null
  where sl.publicado
    and sl.inicio_em >= v_inicio
    and sl.inicio_em < v_fim
  order by sl.inicio_em;
end;
$$;

comment on function gps.plantao_calendario(text, int, int) is
  'Calendario mensal do aluno logado (token resolvido por plantao_sessao). inscritos_qtd exclui inscrito bloqueado_por_programa (migracao ...037) — o aluno nunca ve uma contagem que inclui gente que o sistema ja impede de entrar.';
