-- ═══════════════════════════════════════════════════════════════════════════
-- 385 — Cristiane: blocos de 2h passam a ser 10:00–12:00 · 13:30–15:30 ·
--       16:00–18:00, seg–sex (João, 14/10/2026). Antes (…384): 09:30, 11:30,
--       16:00. Vale para os 4 tipos dela (2 Preliminar, 3 Viabilidade,
--       4 Croqui, 6 Minuta). O bloco das 16:00 não muda.
-- ═══════════════════════════════════════════════════════════════════════════
-- Faixas 09:30 e 11:30 viram ativo=false (nunca apagar). Sessões já marcadas
-- nesses horários NÃO são canceladas (medido 14/10: 1 Croqui em 15/10 09:30);
-- seguem valendo e ocupam o bloco das 10:00 daquele dia pela constraint de
-- sobreposição.
--
-- REVERSÃO (à mão):
--   update gps.sessao_disponibilidade set ativo = false
--    where responsavel_id = '1b153c6d-6287-43ae-9e02-6caf6e6f9c33'
--      and hora_inicio in ('10:00','13:30') and vigencia_inicio = date '2026-10-15';
--   update gps.sessao_disponibilidade set ativo = true
--    where responsavel_id = '1b153c6d-6287-43ae-9e02-6caf6e6f9c33'
--      and hora_inicio in ('09:30','11:30') and vigencia_inicio = date '2026-10-15';
-- ═══════════════════════════════════════════════════════════════════════════
begin;

set local lock_timeout = '2s';
set local statement_timeout = '20s';

do $mig$
declare
  c_cris constant uuid := '1b153c6d-6287-43ae-9e02-6caf6e6f9c33';
  c_vig  constant date := date '2026-10-15';
  v_email text;
  v_horas text;
begin
  select lower(btrim(email)) into v_email from auth.users where id = c_cris;
  if v_email is distinct from 'cristiane@advmais.com' then
    raise exception 'uuid da Cristiane nao confere -- ABORTADA';
  end if;

  update gps.sessao_disponibilidade
     set ativo = false
   where ativo
     and responsavel_id = c_cris
     and hora_inicio in (time '09:30', time '11:30');

  insert into gps.sessao_disponibilidade
    (responsavel_id, dia_semana, hora_inicio, hora_fim, tipo_id, vigencia_inicio, ativo)
  select c_cris, d.dia::smallint, h.ini, h.ini + interval '120 minutes', t.tipo::smallint, c_vig, true
    from generate_series(1,5) d(dia)
   cross join (values (time '10:00'), (time '13:30')) h(ini)
   cross join (values (2),(3),(4),(6)) t(tipo)
   where not exists (
     select 1 from gps.sessao_disponibilidade s
      where s.responsavel_id = c_cris and s.dia_semana = d.dia
        and s.hora_inicio = h.ini and s.tipo_id = t.tipo and s.vigencia_inicio = c_vig);

  select string_agg(distinct to_char(hora_inicio, 'HH24:MI'), ',' order by to_char(hora_inicio, 'HH24:MI'))
    into v_horas
    from gps.sessao_disponibilidade where ativo and responsavel_id = c_cris;
  if (select count(*) from gps.sessao_disponibilidade where ativo and responsavel_id = c_cris) <> 60
     or v_horas <> '10:00,13:30,16:00' then
    raise exception 'grade da Cristiane ficou diferente do esperado (% ) -- ABORTADA', v_horas;
  end if;
end
$mig$;

commit;
