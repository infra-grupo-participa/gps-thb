-- 20261008000377 — a grade mostra também os horários JÁ RESERVADOS
--
-- Pedido do João (08/10/2026): "tem que exibir para os demais alunos as que
-- estão marcadas já, para eles saberem". Hoje o horário reservado some da
-- lista e o aluno não entende por que a agenda tem buracos.
--
-- Desenho:
--   · gps.sessao_grade_candidatos(...) — INTERNA (sem grant a ninguém): os
--     blocos da agenda das profissionais na janela, com os sinais `ocupado`
--     (sessão agendada/realizada de QUALQUER aluno) e `bloqueado`
--     (sessao_bloqueios). É o miolo que antes vivia só dentro de
--     sessao_horarios_livres — agora as duas funções públicas leem dele, então
--     "livre" e "reservado" não podem divergir.
--   · gps.sessao_horarios_livres — mesmo contrato (assinatura, colunas, guarda,
--     filtro de choque do próprio aluno da …376). Só passa a ler do miolo.
--   · gps.sessao_horarios_reservados — NOVA, mesma guarda e mesmas colunas de
--     HorarioLivre. Devolve os blocos `ocupado and not bloqueado` FUTUROS.
--
-- 🔒 Privacidade: a reservada devolve só profissional + horário. Nada de
-- aluno, cliente, estado ou id da sessão — o aluno sabe que está tomado, não
-- por quem. Bloqueio da profissional (férias, compromisso) NÃO aparece como
-- reservado: some, como antes.
--
-- Reversão: drop function gps.sessao_horarios_reservados(smallint, uuid, date, date);
--           recriar sessao_horarios_livres pela …376 e drop function
--           gps.sessao_grade_candidatos(smallint, uuid, date, date, smallint, smallint).

create or replace function gps.sessao_grade_candidatos(
  p_tipo_id        smallint,
  p_responsavel_id uuid,
  p_de             date,
  p_ate            date,
  p_duracao        smallint,
  p_intervalo      smallint
)
returns table(responsavel_id uuid, data date, hora_inicio time without time zone,
              inicio_em timestamp with time zone, fim_em timestamp with time zone,
              ocupado boolean, bloqueado boolean)
language sql
stable
security definer
set search_path to ''
as $function$
  with dias as (
    select g::date as dia
      from generate_series(p_de, p_ate, interval '1 day') g
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
           (f.hora_inicio + make_interval(mins => (p_duracao + p_intervalo) * s.i))::time as h_ini,
           f.hora_fim
      from faixas f
      cross join lateral (
        select generate_series(
                 0,
                 greatest(
                   (extract(epoch from (f.hora_fim - f.hora_inicio))::int
                     / nullif((p_duracao + p_intervalo) * 60, 0)),
                   0)
               ) as i
      ) s
  ),
  candidatos as materialized (
    select b.responsavel_id, b.dia as data, b.h_ini as hora_inicio,
           ((b.dia + b.h_ini) at time zone 'America/Sao_Paulo') as inicio_em,
           (((b.dia + b.h_ini) + make_interval(mins => p_duracao))
              at time zone 'America/Sao_Paulo') as fim_em
      from blocos b
     where (b.h_ini + make_interval(mins => p_duracao)) <= b.hora_fim
  )
  select c.responsavel_id, c.data, c.hora_inicio, c.inicio_em, c.fim_em,
         (oc.ocupado is not null)   as ocupado,
         (bq.bloqueado is not null) as bloqueado
    from candidatos c
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
   where c.inicio_em > now();
$function$;

revoke all on function gps.sessao_grade_candidatos(smallint, uuid, date, date, smallint, smallint)
  from public, anon, authenticated;

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
  select c.responsavel_id, nm.nome, c.data, c.hora_inicio,
         c.inicio_em, c.fim_em, v_duracao
    from gps.sessao_grade_candidatos(p_tipo_id, p_responsavel_id, v_de, v_ate,
                                     v_duracao, v_intervalo) c
    left join lateral (
      select p.nome from public.perfis p
       where p.id = c.responsavel_id limit 1
    ) nm on true
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
   where not c.ocupado
     and not c.bloqueado
     and ch.choque is null
   order by c.inicio_em, c.responsavel_id;
end;
$function$;

create or replace function gps.sessao_horarios_reservados(p_tipo_id smallint, p_responsavel_id uuid DEFAULT NULL::uuid, p_de date DEFAULT NULL::date, p_ate date DEFAULT NULL::date)
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

  -- Mesma porta da livre: quem não pode ver a grade também não vê o que
  -- está reservado nela.
  if not v_equipe then
    if v_ambiente is null then
      raise exception 'Sem permissão.' using errcode = '42501';
    end if;
    if gps.sessao_pode_agendar(v_ambiente, p_tipo_id) is null then
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
  select c.responsavel_id, nm.nome, c.data, c.hora_inicio,
         c.inicio_em, c.fim_em, v_duracao
    from gps.sessao_grade_candidatos(p_tipo_id, p_responsavel_id, v_de, v_ate,
                                     v_duracao, v_intervalo) c
    left join lateral (
      select p.nome from public.perfis p
       where p.id = c.responsavel_id limit 1
    ) nm on true
   where c.ocupado
     and not c.bloqueado
   order by c.inicio_em, c.responsavel_id;
end;
$function$;

revoke all on function gps.sessao_horarios_reservados(smallint, uuid, date, date) from public, anon;
grant execute on function gps.sessao_horarios_reservados(smallint, uuid, date, date) to authenticated;

-- ═══ Provas (aplicada em 08/10/2026, medido em produção) ═══════════════════
-- Equivalência: sessao_horarios_livres antes × depois, visão equipe, md5 da
--   saída ordenada: tipo 1 = 199 linhas 840db30a…, tipo 2 = 30 linhas
--   523d67de… — IGUAIS. Visão do aluno do caso (…376): tipo 1 = 197 linhas.
-- Reservados (visão equipe): 4 horários, todos de 09/10 — batem com as 4
--   sessões 'agendado' futuras da tabela.
-- Permissões (proacl): sessao_grade_candidatos e sessao_aluno_sem_choque só
--   postgres/service_role; livres e reservados com authenticated.
-- explain (analyze, buffers), como aluno, janela de 120 dias (o teto):
--   sessao_horarios_reservados → Execution Time 17,192 ms, shared hit=2775, 2 linhas
--   sessao_horarios_livres     → Execution Time 21,412 ms, shared hit=4417, 407 linhas
--   (o lateral de ocupação usa o mesmo predicado do GiST sessao_sem_sobreposicao;
--    a janela padrão da tela é 56 dias, ~metade disso.)
