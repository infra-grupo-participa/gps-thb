-- ═══════════════════════════════════════════════════════════════════════════
-- 384 — Grade da agenda de sessões redesenhada (pedido do João, 14/10/2026)
-- ═══════════════════════════════════════════════════════════════════════════
-- CRISTIANE (cristiane@advmais.com) — UM calendário para 4 tipos:
--   Reunião Preliminar (2), Sessão de Viabilidade (3), Croqui Estrutural (4)
--   e Apresentação da Minuta (6, NOVO). Seg–sex, blocos de 2h:
--   09:30–11:30 · 11:30–13:30 · 16:00–18:00 (15 blocos/semana).
--   O bloqueio entre tipos JÁ existe: `sessao_sem_sobreposicao` (…291) é por
--   responsável, não por tipo, e `sessao_grade_candidatos` (…377) marca como
--   `ocupado` qualquer sessão agendada/realizada dela. Marcar um tipo às 9:30
--   tira as 9:30 dos outros três. Nada a construir; só publicar as faixas.
--   Reunião Preliminar: 150 → 120 min (30 min de briefing falado deixam de
--   ser parte do bloco, por pedido do João; a decisão D1 de 22/09 do Marcio
--   previa 150). Faixa tem a largura exata da duração → 1 bloco por faixa.
--   Blocos colados (11:30 fim = 11:30 início) são aceitos: range '[)'.
--
-- MARCO (marco@advmais.com) — Entrevista Prévia (tipo etapa_id = 1), 1h:
--   09:00, 10:00 (para às 11h), 13:00, 14:00, 15:00, 16:00; seg–sex.
--   Independente da Cristiane (grades e responsáveis distintos).
--   duracao_min 40 → 60. Antes: 25 faixas (9, 11, 14, 15, 16h × 40 min).
--
-- Faixas antigas NÃO são apagadas: viram ativo=false (histórico).
-- Sessões já marcadas guardam cópia da duração (…291); não mudam.
-- Futuras agendadas medidas em 14/10: 0.
--
-- REVERSÃO (à mão, nunca delete):
--   update gps.sessao_disponibilidade set ativo=false
--    where vigencia_inicio = date '2026-10-15' ;                -- faixas novas
--   update gps.sessao_disponibilidade set ativo=true
--    where vigencia_fim = date '2026-10-14' ;                   -- faixas antigas
--   update gps.sessao_tipos set duracao_min=150 where id=2;
--   update gps.sessao_tipos set duracao_min=40  where etapa_id=1;
--   update gps.sessao_tipos set ativo=false where id=6;
-- ═══════════════════════════════════════════════════════════════════════════
begin;

set local lock_timeout = '2s';
set local statement_timeout = '20s';

do $mig$
declare
  c_cris  constant uuid := '1b153c6d-6287-43ae-9e02-6caf6e6f9c33';
  c_marco constant uuid := '85016fb8-5f7b-4474-a418-bc1ab87f870b';
  c_vig   constant date := date '2026-10-15';
  v_email text;
  v_fut   int;
  v_n6    text;
  v_ep    smallint;
begin
  -- G1 pessoas conferidas por e-mail exato
  select lower(btrim(email)) into v_email from auth.users where id = c_cris;
  if v_email is distinct from 'cristiane@advmais.com' then
    raise exception 'uuid da Cristiane nao confere (%) -- ABORTADA', coalesce(v_email,'<inexistente>');
  end if;
  select lower(btrim(email)) into v_email from auth.users where id = c_marco;
  if v_email is distinct from 'marco@advmais.com' then
    raise exception 'uuid do Marco nao confere (%) -- ABORTADA', coalesce(v_email,'<inexistente>');
  end if;

  -- G2 sem sessão futura agendada (a duração nova não pode surpreender ninguém)
  select count(*) into v_fut from gps.sessao_agendamentos
   where estado = 'agendado' and inicio_em > now();
  if v_fut > 0 then
    raise exception '% sessao(oes) futura(s) agendada(s) -- ABORTADA; trate antes', v_fut;
  end if;

  -- G3 id 6 livre ou já é a Minuta
  select nome into v_n6 from gps.sessao_tipos where id = 6;
  if v_n6 is not null and v_n6 <> 'Apresentação da Minuta' then
    raise exception 'id 6 ja ocupado por "%" -- ABORTADA', v_n6;
  end if;

  select id into strict v_ep from gps.sessao_tipos where etapa_id = 1;

  -- §1 catálogo
  insert into gps.sessao_tipos (id, nome, duracao_min, intervalo_min, exige_briefing, etapa_id, ativo)
  select 6, 'Apresentação da Minuta', 120, 10, t.exige_briefing, null, true
    from gps.sessao_tipos t where t.id = 2
  on conflict (id) do nothing;

  update gps.sessao_tipos set duracao_min = 120 where id = 2 and duracao_min <> 120;
  update gps.sessao_tipos set duracao_min = 60  where id = v_ep and duracao_min <> 60;

  -- §2 aposenta as faixas antigas das duas pessoas (idempotente: só as ativas
  -- anteriores à nova vigência)
  update gps.sessao_disponibilidade
     set ativo = false, vigencia_fim = date '2026-10-14'
   where ativo
     and responsavel_id in (c_cris, c_marco)
     and vigencia_inicio < c_vig;

  -- §3 Cristiane: 4 tipos × seg–sex × 3 blocos de 2h
  insert into gps.sessao_disponibilidade
    (responsavel_id, dia_semana, hora_inicio, hora_fim, tipo_id, vigencia_inicio, ativo)
  select c_cris, d.dia::smallint, h.ini, h.ini + interval '120 minutes', t.tipo::smallint, c_vig, true
    from generate_series(1,5) d(dia)
   cross join (values (time '09:30'), (time '11:30'), (time '16:00')) h(ini)
   cross join (values (2),(3),(4),(6)) t(tipo)
   where not exists (
     select 1 from gps.sessao_disponibilidade s
      where s.responsavel_id = c_cris and s.dia_semana = d.dia
        and s.hora_inicio = h.ini and s.tipo_id = t.tipo and s.vigencia_inicio = c_vig);

  -- §4 Marco: Entrevista Prévia, 6 horários × seg–sex, faixa de 60 min
  insert into gps.sessao_disponibilidade
    (responsavel_id, dia_semana, hora_inicio, hora_fim, tipo_id, vigencia_inicio, ativo)
  select c_marco, d.dia::smallint, h.ini, h.ini + interval '60 minutes', v_ep, c_vig, true
    from generate_series(1,5) d(dia)
   cross join (values (time '09:00'), (time '10:00'), (time '13:00'),
                      (time '14:00'), (time '15:00'), (time '16:00')) h(ini)
   where not exists (
     select 1 from gps.sessao_disponibilidade s
      where s.responsavel_id = c_marco and s.dia_semana = d.dia
        and s.hora_inicio = h.ini and s.tipo_id = v_ep and s.vigencia_inicio = c_vig);

  -- G4 contagem final
  if (select count(*) from gps.sessao_disponibilidade
       where ativo and responsavel_id = c_cris and vigencia_inicio = c_vig) <> 60
  or (select count(*) from gps.sessao_disponibilidade
       where ativo and responsavel_id = c_marco and vigencia_inicio = c_vig) <> 30 then
    raise exception 'contagem de faixas novas diferente de 60 (Cristiane) / 30 (Marco) -- ABORTADA';
  end if;
end
$mig$;

commit;
