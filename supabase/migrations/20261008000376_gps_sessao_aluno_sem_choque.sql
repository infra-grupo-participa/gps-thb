-- 20261008000376 — o mesmo aluno não pode ter duas reuniões marcadas no mesmo horário
--
-- Caso real (07/10/2026): um aluno marcou a Entrevista Prévia e a Reunião
-- Preliminar para 09/10 às 14h, com 4 minutos de diferença, cada uma com uma
-- profissional. As travas existentes não pegam isso:
--   · sessao_slot_unico / sessao_sem_sobreposicao → por PROFISSIONAL;
--   · sessao_aluno_tipo_viva                    → por ALUNO + MESMO TIPO.
-- E `sessao_horarios_livres` filtra só a agenda da profissional.
--
-- Duas peças:
--   1. Trava na TABELA (vale para sessao_agendar, sessao_remarcar e qualquer
--      escrita futura): gatilho AFTER, porque inicio_em/fim_em são colunas
--      GERADAS e chegam nulas num BEFORE.
--      ⚠️ Não é EXCLUDE: a tabela já tem 1 par sobreposto (o caso acima), e
--      EXCLUDE não aceita NOT VALID. O par existente fica para a equipe
--      remarcar; o gatilho só olha escrita nova.
--   2. A grade do ALUNO deixa de oferecer horário que bate com reunião dele.
--      A grade da equipe não sabe de qual aluno se trata — ali vale o gatilho.
--
-- errcode P0001 (e não 23P01) de propósito: sessao_agendar captura
-- exclusion_violation e reescreve como "mesma profissional", o que seria falso.
--
-- Reversão: drop trigger trg_sessao_aluno_sem_choque on gps.sessao_agendamentos;
--           e recriar sessao_horarios_livres sem o bloco `ch`.

create or replace function gps.sessao_aluno_sem_choque()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.estado <> 'agendado' then
    return null;
  end if;

  -- Serializa escritas do mesmo aluno (duas abas, equipe + aluno ao mesmo tempo).
  perform pg_advisory_xact_lock(hashtextextended('gps.sessao_aluno:' || new.aluno_id::text, 0));

  if exists (
    select 1
      from gps.sessao_agendamentos a
     where a.aluno_id = new.aluno_id
       and a.id <> new.id
       and a.estado = 'agendado'
       and tstzrange(a.inicio_em, a.fim_em, '[)') && tstzrange(new.inicio_em, new.fim_em, '[)')
  ) then
    if new.aluno_id = gps.aluno_atual() then
      raise exception 'Você já tem outra reunião marcada nesse horário. Escolha outro na lista.'
        using errcode = 'P0001';
    else
      raise exception 'Este aluno já tem outra reunião marcada nesse horário. Escolha outro.'
        using errcode = 'P0001';
    end if;
  end if;

  return null;
end;
$function$;

revoke all on function gps.sessao_aluno_sem_choque() from public, anon, authenticated;

drop trigger if exists trg_sessao_aluno_sem_choque on gps.sessao_agendamentos;
create trigger trg_sessao_aluno_sem_choque
  after insert or update of data, hora_inicio, duracao_min, estado, aluno_id
  on gps.sessao_agendamentos
  for each row execute function gps.sessao_aluno_sem_choque();

create or replace function gps.sessao_horarios_livres(p_tipo_id smallint, p_responsavel_id uuid DEFAULT NULL::uuid, p_de date DEFAULT NULL::date, p_ate date DEFAULT NULL::date)
 RETURNS TABLE(responsavel_id uuid, responsavel_nome text, data date, hora_inicio time without time zone, inicio_em timestamp with time zone, fim_em timestamp with time zone, duracao_min smallint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ambiente   uuid := gps.aluno_atual();
  v_equipe     boolean := coalesce(gps.eh_equipe(), false);
  v_duracao    smallint;
  v_intervalo  smallint;
  v_de         date;
  v_ate        date;
  v_cliente_id uuid;
begin
  if p_tipo_id is null then
    raise exception 'tipo de sessao nao informado' using errcode = '22023';
  end if;

  select t.duracao_min, t.intervalo_min
    into v_duracao, v_intervalo
    from gps.sessao_tipos t
   where t.id = p_tipo_id and t.ativo;

  if not found then
    raise exception 'Tipo de sessão não encontrado.' using errcode = 'P0002';
  end if;

  if not v_equipe then
    if v_ambiente is null then
      raise exception 'Sem permissão.' using errcode = '42501';
    end if;
    v_cliente_id := gps.sessao_pode_agendar(v_ambiente, p_tipo_id);
    if v_cliente_id is null then
      return;
    end if;
  end if;

  v_de  := greatest(coalesce(p_de, (now() at time zone 'America/Sao_Paulo')::date),
                    (now() at time zone 'America/Sao_Paulo')::date);
  v_ate := coalesce(p_ate, v_de + 56);
  if v_ate > v_de + 120 then
    v_ate := v_de + 120;
  end if;
  if v_ate < v_de then
    return;
  end if;

  return query
  with dias as (
    select g::date as dia
      from generate_series(v_de, v_ate, interval '1 day') g
  ),
  faixas as (
    select d.dia, f.responsavel_id, f.hora_inicio, f.hora_fim
      from dias d
      join gps.sessao_disponibilidade f
        on f.ativo
       and f.dia_semana = extract(dow from d.dia)::smallint
       and f.vigencia_inicio <= d.dia
       and (f.vigencia_fim is null or f.vigencia_fim >= d.dia)
       and (f.tipo_id is null or f.tipo_id = p_tipo_id)
       and (p_responsavel_id is null or f.responsavel_id = p_responsavel_id)
  ),
  blocos as (
    select f.dia, f.responsavel_id,
           (f.hora_inicio + make_interval(mins => (v_duracao + v_intervalo) * s.i))::time as h_ini,
           f.hora_fim
      from faixas f
      cross join lateral (
        select generate_series(
                 0,
                 greatest(
                   (extract(epoch from (f.hora_fim - f.hora_inicio))::int
                     / nullif((v_duracao + v_intervalo) * 60, 0)),
                   0)
               ) as i
      ) s
  ),
  candidatos as materialized (
    select b.responsavel_id, b.dia as data, b.h_ini as hora_inicio,
           ((b.dia + b.h_ini) at time zone 'America/Sao_Paulo') as inicio_em,
           (((b.dia + b.h_ini) + make_interval(mins => v_duracao))
              at time zone 'America/Sao_Paulo') as fim_em
      from blocos b
     where (b.h_ini + make_interval(mins => v_duracao)) <= b.hora_fim
  )
  select c.responsavel_id, nm.nome, c.data, c.hora_inicio,
         c.inicio_em, c.fim_em, v_duracao
    from candidatos c
    left join lateral (
      select p.nome from public.perfis p
       where p.id = c.responsavel_id limit 1
    ) nm on true
    left join lateral (
      select 1 as ocupado
        from gps.sessao_agendamentos a
       where a.responsavel_id = c.responsavel_id
         and a.estado in ('agendado', 'realizado')
         and tstzrange(a.inicio_em, a.fim_em, '[)')
             && tstzrange(c.inicio_em, c.fim_em, '[)')
       limit 1
    ) oc on true
    left join lateral (
      select 1 as bloqueado
        from gps.sessao_bloqueios bl
       where bl.responsavel_id = c.responsavel_id
         and tstzrange(bl.inicio, bl.fim, '[)')
             && tstzrange(c.inicio_em, c.fim_em, '[)')
       limit 1
    ) bq on true
    -- 376: o aluno não vê horário que bate com outra reunião DELE.
    left join lateral (
      select 1 as choque
        from gps.sessao_agendamentos a2
       where not v_equipe
         and a2.aluno_id = v_ambiente
         and a2.estado = 'agendado'
         and tstzrange(a2.inicio_em, a2.fim_em, '[)')
             && tstzrange(c.inicio_em, c.fim_em, '[)')
       limit 1
    ) ch on true
   where c.inicio_em > now()
     and oc.ocupado   is null
     and bq.bloqueado is null
     and ch.choque    is null
   order by c.inicio_em, c.responsavel_id;
end;
$function$;
