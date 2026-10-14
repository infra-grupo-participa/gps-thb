-- ═══════════════════════════════════════════════════════════════════════════
-- 386 — Plantão da mentora BLOQUEIA a agenda de sessões da mesma pessoa
--       (João, 14/10/2026: "se ela tiver plantão na hora, temos que bloquear")
-- ═══════════════════════════════════════════════════════════════════════════
-- O furo: a Cristiane é mentora do Plantão (gps.plantao_slots) e responsável
-- da agenda (gps.sessao_*). As duas não se viam. Medido em 14/10: plantões
-- publicados em 20/10 16:00–18:00 e 26/10 14:00–16:00 batiam com blocos da
-- grade dela e os blocos apareciam LIVRES para o aluno.
--
-- A correção mora num lugar só: gps.sessao_grade_candidatos. Medido no
-- pg_proc em 14/10: é a ÚNICA função que lê sessao_bloqueios, e
-- sessao_agendar e sessao_remarcar validam pela sessao_horarios_livres, que
-- lê dela. Logo tela, agendar e remarcar passam a respeitar o plantão juntos.
--
-- Regra: um bloco fica `bloqueado` se houver plantão PUBLICADO e NÃO
-- CANCELADO da mesma pessoa sobrepondo o intervalo. O vínculo
-- mentora → responsável é pelo E-MAIL (plantao_mentoras.email = auth.users),
-- nunca pelo nome: há alunas chamadas Cristiane/Elaine. Plantão cancelado ou
-- despublicado devolve o horário sozinho (cálculo ao vivo, sem cópia).
--
-- Bloqueado não aparece como "reservado" para o aluno: some da grade (…377).
--
-- Sentido contrário (plantão publicado por cima de sessão já marcada) NÃO é
-- impedido aqui: o plantão é o calendário oficial do Acelera. Conferir com
-- a consulta "CHOQUES" no fim deste arquivo.
--
-- REVERSÃO: reaplicar o corpo da …377 (sem o bloco `pl`).
-- ═══════════════════════════════════════════════════════════════════════════
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
         (oc.ocupado is not null)                          as ocupado,
         (bq.bloqueado is not null or pl.plantao is not null) as bloqueado
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
    -- 386: plantão publicado e não cancelado da MESMA pessoa (por e-mail).
    left join lateral (
      select 1 as plantao
        from gps.plantao_slots ps
        join gps.plantao_mentoras m on m.id = ps.mentora_id
        join auth.users u on lower(btrim(u.email)) = lower(btrim(m.email))
       where u.id = c.responsavel_id
         and ps.publicado
         and ps.cancelado_em is null
         and tstzrange(ps.inicio_em, ps.inicio_em + make_interval(mins => ps.duracao_min), '[)')
             && tstzrange(c.inicio_em, c.fim_em, '[)')
       limit 1
    ) pl on true
   where c.inicio_em > now();
$function$;

revoke all on function gps.sessao_grade_candidatos(smallint, uuid, date, date, smallint, smallint)
  from public, anon, authenticated;

-- ── CHOQUES (rodar à mão): sessão marcada que bate com plantão da mesma pessoa
--   select a.id, a.tipo_id, a.inicio_em, ps.inicio_em as plantao
--     from gps.sessao_agendamentos a
--     join auth.users u on u.id = a.responsavel_id
--     join gps.plantao_mentoras m on lower(btrim(m.email)) = lower(btrim(u.email))
--     join gps.plantao_slots ps on ps.mentora_id = m.id and ps.publicado and ps.cancelado_em is null
--    where a.estado = 'agendado' and a.inicio_em > now()
--      and tstzrange(a.inicio_em, a.fim_em, '[)')
--          && tstzrange(ps.inicio_em, ps.inicio_em + make_interval(mins => ps.duracao_min), '[)');
