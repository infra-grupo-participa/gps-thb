-- ═══════════════════════════════════════════════════════════════════════════
-- 391 — TODO agendamento precisa de 48 HORAS de antecedência
--       (João, 16/10/2026: "na agenda qualquer agendamento, de todo tipo, seja
--       reunião preliminar ou qualquer outro, tem que ter 48 horas de
--       antecedência. A gente tem que deixar isso explícito." Motivo: clientes
--       marcando no mesmo dia, em cima da hora, atrapalhando a operação.)
-- ═══════════════════════════════════════════════════════════════════════════
-- Vale para os 5 tipos (EP do Marco, Preliminar, Viabilidade, Croqui, Minuta)
-- e para quem marca (aluno) e quem remarca (equipe).
--
-- Fonte ÚNICA do prazo: `gps.sessao_antecedencia_minima()` (R11). Três usos:
--   1. `sessao_grade_candidatos` — a grade deixa de oferecer horário que começa
--      antes de now() + 48h. É a função de onde `sessao_horarios_livres`
--      (tela + validação de agendar/remarcar) e `sessao_horarios_reservados`
--      leem; trocando aqui, tela e gravação mudam juntas.
--   2. `sessao_agendar` — recusa explícita, com a frase da regra, antes da
--      checagem de grade (senão o aluno leria só "não está mais disponível").
--   3. `sessao_remarcar` — idem, para a equipe.
--
-- Medido 16/10 (R02): nos últimos 30 dias, 10 de 19 sessões foram marcadas
-- com menos de 48h (EP 4/7, Preliminar 4/10, Croqui 2/2). Sessões JÁ marcadas
-- não são tocadas: a regra vale para marcar/remarcar daqui em diante.
--
-- REVERSÃO: reaplicar os corpos da …390 (sessao_agendar), …386
-- (sessao_grade_candidatos) e o corpo vivo anterior de sessao_remarcar sem o
-- bloco "…391"; `drop function gps.sessao_antecedencia_minima()`.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function gps.sessao_antecedencia_minima()
returns interval
language sql
immutable
set search_path to ''
as $$ select interval '48 hours' $$;

comment on function gps.sessao_antecedencia_minima() is
  'Antecedência mínima para marcar/remarcar qualquer sessão (…391, João 16/10/2026). Fonte única.';

-- Só leitura de constante, mas a regra da casa é nascer fechada (R05).
revoke all on function gps.sessao_antecedencia_minima() from public, anon;
grant execute on function gps.sessao_antecedencia_minima() to authenticated, service_role;

-- ── 1. A grade ──────────────────────────────────────────────────────────────
create or replace function gps.sessao_grade_candidatos(p_tipo_id smallint, p_responsavel_id uuid, p_de date, p_ate date, p_duracao smallint, p_intervalo smallint)
 returns table(responsavel_id uuid, data date, hora_inicio time without time zone, inicio_em timestamp with time zone, fim_em timestamp with time zone, ocupado boolean, bloqueado boolean)
 language sql
 stable security definer
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
   -- …391: só horário a 48h ou mais de agora (era `> now()`).
   where c.inicio_em >= now() + gps.sessao_antecedencia_minima();
$function$;

-- ── 2. Agendar (aluno) ──────────────────────────────────────────────────────
create or replace function gps.sessao_agendar(p_tipo_id smallint, p_responsavel_id uuid, p_data date, p_hora_inicio time without time zone)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_ambiente   uuid := gps.aluno_atual();
  v_cliente_id uuid;
  v_tipo       record;
  v_inicio     timestamptz;
  v_fim        timestamptz;
  v_snapshot   jsonb;
  v_id         uuid;
  v_ok         boolean;
  v_constraint text;
  v_ordem      text;
begin
  if p_tipo_id is null or p_responsavel_id is null
     or p_data is null or p_hora_inicio is null then
    raise exception 'Escolha um horário para continuar.' using errcode = '22023';
  end if;

  if v_ambiente is null then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  v_cliente_id := gps.sessao_pode_agendar(v_ambiente, p_tipo_id);
  if v_cliente_id is null then
    raise exception 'Você ainda não pode agendar esta sessão. É preciso ter um cliente marcado como o que a equipe acompanha, e a etapa correspondente liberada.'
      using errcode = '42501';
  end if;

  select t.id, t.duracao_min, t.intervalo_min, t.etapa_id, t.nome
    into v_tipo from gps.sessao_tipos t where t.id = p_tipo_id and t.ativo;

  if not found then
    raise exception 'Tipo de sessão não encontrado.' using errcode = 'P0002';
  end if;

  perform 1 from gps.etapa1_clientes where id = v_cliente_id for update;

  v_inicio := ((p_data + p_hora_inicio) at time zone 'America/Sao_Paulo');
  v_fim    := (((p_data + p_hora_inicio) + make_interval(mins => v_tipo.duracao_min))
                 at time zone 'America/Sao_Paulo');

  if v_inicio <= now() then
    raise exception 'Esse horário já passou. Escolha outro.' using errcode = '22023';
  end if;

  -- …391: 48h de antecedência, com a frase da regra (antes da grade, que já
  -- esconde esses horários e diria só "não está mais disponível").
  if v_inicio < now() + gps.sessao_antecedencia_minima() then
    raise exception 'Os agendamentos precisam de 48 horas de antecedência. Escolha um horário a partir de depois de amanhã.'
      using errcode = '22023';
  end if;

  -- …390: ordem Preliminar → Viabilidade → Croqui → Minuta (sob o lock do cliente).
  v_ordem := gps.sessao_ordem_pendente(v_cliente_id, p_tipo_id, v_inicio);
  if v_ordem is not null then
    raise exception '%', v_ordem using errcode = '22023';
  end if;

  select exists (
    select 1 from gps.sessao_horarios_livres(p_tipo_id, p_responsavel_id, p_data, p_data) h
     where h.inicio_em = v_inicio and h.responsavel_id = p_responsavel_id
  ) into v_ok;

  if not v_ok then
    raise exception 'Esse horário não está mais disponível. Escolha outro na lista.'
      using errcode = '22023';
  end if;

  v_snapshot := gps.sessao_briefing_montar(v_cliente_id);

  begin
    insert into gps.sessao_agendamentos
      (tipo_id, responsavel_id, aluno_id, cliente_id, data, hora_inicio,
       duracao_min, estado, briefing_snapshot, criado_por)
    values
      (p_tipo_id, p_responsavel_id, v_ambiente, v_cliente_id, p_data, p_hora_inicio,
       v_tipo.duracao_min, 'agendado', v_snapshot, auth.uid())
    returning id into v_id;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'sessao_aluno_tipo_viva' then
        raise exception 'Você já tem uma % marcada. Cancele a atual antes de marcar outra.', v_tipo.nome
          using errcode = '23505';
      else
        raise exception 'Alguém acabou de pegar esse horário. Escolha outro na lista.'
          using errcode = '23505';
      end if;
    when exclusion_violation then
      raise exception 'Esse horário conflita com outra sessão da mesma profissional. Escolha outro na lista.'
        using errcode = '23P01';
  end;

  if v_tipo.etapa_id = 2 then
    update gps.etapa1_clientes
       set data_reuniao_preliminar = p_data
     where id = v_cliente_id;
  end if;

  insert into gps.sessao_eventos (agendamento_id, acao, ator_id, detalhe)
  values (v_id, 'sessao_agendada', auth.uid(),
          jsonb_build_object(
            'tipo_id', p_tipo_id, 'responsavel_id', p_responsavel_id,
            'cliente_id', v_cliente_id, 'inicio_em', v_inicio,
            'duracao_min', v_tipo.duracao_min,
            'escreveu_data_reuniao_preliminar', (v_tipo.etapa_id = 2)));

  return jsonb_build_object(
    'agendamento_id', v_id, 'estado', 'agendado',
    'inicio_em', v_inicio, 'fim_em', v_fim,
    'duracao_min', v_tipo.duracao_min, 'tipo_nome', v_tipo.nome);
end;
$function$;

-- ── 3. Remarcar (equipe) ────────────────────────────────────────────────────
create or replace function gps.sessao_remarcar(p_sessao_id uuid, p_data date, p_hora time without time zone, p_motivo text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_a          record;
  v_motivo     text;
  v_inicio     timestamptz;
  v_fim        timestamptz;
  v_ok         boolean;
  v_constraint text;
  v_etapa_id   smallint;
  v_escreveu   boolean := false;
begin
  -- 🔴 Guarda PRÓPRIA, na entrada, coalesce = falha FECHADA (achado ALTO de
  -- 22/09: `if null then raise` não dispara).
  if auth.uid() is null then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if p_sessao_id is null or p_data is null or p_hora is null then
    raise exception 'Escolha o novo horário para continuar.' using errcode = '22023';
  end if;

  v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');
  if v_motivo is null or char_length(v_motivo) < 3 then
    raise exception 'Escreva o motivo da remarcação (ao menos 3 caracteres).'
      using errcode = '22023';
  end if;
  if char_length(v_motivo) > 300 then
    raise exception 'O motivo passa de 300 caracteres.' using errcode = '22023';
  end if;

  -- Quem remarca: admin ou a DONA da sessão — o mesmo recorte do cancelar
  -- (nunca gps.eh_equipe(): operador da esteira não mexe na agenda da dra).
  -- 🔴 Autoriza ANTES do lock e com o MESMO erro para "não existe" e "não é
  -- sua" (kirad 01/10): senão o P0002 × 42501 revela ids de sessões alheias e
  -- o `for update` trava a linha de outra pessoa antes da recusa.
  if not (coalesce(gps.eh_admin(), false)
          or exists (select 1 from gps.sessao_agendamentos a
                      where a.id = p_sessao_id
                        and a.responsavel_id = auth.uid())) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  -- 🔴 `for update`: duas remarcações (ou remarcação × cancelamento)
  -- simultâneas não podem as duas passar pela checagem de estado.
  select a.id, a.tipo_id, a.responsavel_id, a.cliente_id, a.estado,
         a.data, a.hora_inicio, a.inicio_em, a.duracao_min
    into v_a
    from gps.sessao_agendamentos a
   where a.id = p_sessao_id
   for update;

  if v_a.id is null then
    -- só admin chega aqui com id inexistente
    raise exception 'Sessão não encontrada.' using errcode = 'P0002';
  end if;
  -- 🔴 Teto contra rajada de e-mail (kirad 01/10): cada remarcação zera os
  -- carimbos e o cron avisa o aluno de novo. 3 por sessão em 24 h.
  if (select count(*) from gps.sessao_eventos e
       where e.agendamento_id = p_sessao_id
         and e.acao = 'sessao_remarcada'
         and e.criado_em >= now() - interval '24 hours') >= 3 then
    raise exception 'Esta sessão já foi remarcada 3 vezes nas últimas 24 horas. Fale com o aluno antes de mudar de novo.'
      using errcode = 'P0001';
  end if;
  if v_a.estado <> 'agendado' then
    raise exception 'Esta sessão não está marcada — não há o que remarcar.'
      using errcode = '22023';
  end if;
  -- 🔴 Contra inicio_em, nunca contra `data` (servidor em UTC).
  if v_a.inicio_em <= now() then
    raise exception 'Esta sessão já começou. Só uma sessão futura pode ser remarcada.'
      using errcode = '22023';
  end if;

  v_inicio := ((p_data + p_hora) at time zone 'America/Sao_Paulo');
  v_fim    := (((p_data + p_hora) + make_interval(mins => v_a.duracao_min))
                 at time zone 'America/Sao_Paulo');

  if v_inicio <= now() then
    raise exception 'Esse horário já passou. Escolha outro.' using errcode = '22023';
  end if;
  if v_inicio = v_a.inicio_em then
    raise exception 'A sessão já está marcada nesse horário.' using errcode = '22023';
  end if;
  -- …391: o NOVO horário também precisa de 48h de antecedência.
  if v_inicio < now() + gps.sessao_antecedencia_minima() then
    raise exception 'Os agendamentos precisam de 48 horas de antecedência. Escolha um horário a partir de depois de amanhã.'
      using errcode = '22023';
  end if;

  select exists (
    select 1
      from gps.sessao_horarios_livres(v_a.tipo_id, v_a.responsavel_id, p_data, p_data) h
     where h.inicio_em = v_inicio
       and h.responsavel_id = v_a.responsavel_id
  ) into v_ok;

  if not v_ok then
    raise exception 'Esse horário não está na agenda livre desta profissional. Escolha outro na lista.'
      using errcode = '22023';
  end if;

  begin
    update gps.sessao_agendamentos
       set data                     = p_data,
           hora_inicio              = p_hora,
           remarcado_de             = v_a.inicio_em,
           remarcado_motivo         = v_motivo,
           remarcado_em             = now(),
           email_24h_dra_em         = null, email_24h_dra_req        = null,
           email_24h_aluno_em       = null, email_24h_aluno_req      = null,
           email_1h_dra_em          = null, email_1h_dra_req         = null,
           email_1h_aluno_em        = null, email_1h_aluno_req       = null,
           email_remarcou_aluno_em  = null, email_remarcou_aluno_req = null
     where id = p_sessao_id;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'sessao_slot_unico' then
        raise exception 'Alguém acabou de pegar esse horário. Escolha outro na lista.'
          using errcode = '23505';
      else
        raise exception 'Este aluno já tem outra sessão deste tipo marcada.'
          using errcode = '23505';
      end if;
    when exclusion_violation then
      raise exception 'Esse horário conflita com outra sessão da mesma profissional. Escolha outro na lista.'
        using errcode = '23P01';
  end;

  select t.etapa_id into v_etapa_id from gps.sessao_tipos t where t.id = v_a.tipo_id;
  if v_etapa_id = 2 and p_data <> v_a.data then
    update gps.etapa1_clientes
       set data_reuniao_preliminar = p_data
     where id = v_a.cliente_id
       and data_reuniao_preliminar = v_a.data;
    v_escreveu := found;
  end if;

  insert into gps.sessao_eventos (agendamento_id, acao, ator_id, detalhe)
  values (p_sessao_id, 'sessao_remarcada', auth.uid(),
          jsonb_build_object(
            'por', 'equipe',
            'de_inicio_em', v_a.inicio_em,
            'para_inicio_em', v_inicio,
            'motivo', v_motivo,
            'horas_de_antecedencia', round(extract(epoch from (v_a.inicio_em - now())) / 3600.0, 2),
            'escreveu_data_reuniao_preliminar', v_escreveu));

  return jsonb_build_object(
    'agendamento_id', p_sessao_id,
    'estado', 'agendado',
    'inicio_em', v_inicio,
    'fim_em', v_fim,
    'remarcado_de', v_a.inicio_em);
end;
$function$;
