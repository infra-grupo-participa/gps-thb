-- ═══════════════════════════════════════════════════════════════════════════
-- 387 — Croqui Estrutural (tipo 4) só às QUARTAS e SEXTAS
--       (João, 15/10/2026: "pro croqui, mantemos o que ela falou no slack")
-- ═══════════════════════════════════════════════════════════════════════════
-- Origem: a Aldri viu um Croqui numa quinta (15/10 09:30), marcado em 14/10
-- 11:33 dentro da grade da …384 (seg–sex). Não foi furo: a grade permitia.
-- Regra nova SÓ para o Croqui. Preliminar (2), Viabilidade (3) e Minuta (6)
-- seguem seg–sex em 10:00 · 13:30 · 16:00 (…385).
--
-- Desativa (nunca apaga) as faixas do tipo 4 da Cristiane em seg/ter/qui
-- (dia_semana 1, 2, 4). Medido 15/10: 0 Croquis futuros nesses dias.
-- Esperado depois: 6 faixas ativas de Croqui (qua e sex × 10:00/13:30/16:00).
--
-- REVERSÃO:
--   update gps.sessao_disponibilidade set ativo = true
--    where responsavel_id = '1b153c6d-6287-43ae-9e02-6caf6e6f9c33' and tipo_id = 4
--      and dia_semana in (1,2,4) and vigencia_inicio = date '2026-10-15'
--      and hora_inicio in ('10:00','13:30','16:00');
-- ═══════════════════════════════════════════════════════════════════════════
begin;

set local lock_timeout = '2s';
set local statement_timeout = '20s';

do $mig$
declare
  c_cris constant uuid := '1b153c6d-6287-43ae-9e02-6caf6e6f9c33';
  v_n int;
begin
  update gps.sessao_disponibilidade
     set ativo = false
   where ativo and responsavel_id = c_cris and tipo_id = 4
     and dia_semana in (1, 2, 4);

  select count(*) into v_n from gps.sessao_disponibilidade
   where ativo and responsavel_id = c_cris and tipo_id = 4;
  if v_n <> 6 or exists (select 1 from gps.sessao_disponibilidade
                          where ativo and responsavel_id = c_cris and tipo_id = 4
                            and dia_semana not in (3, 5)) then
    raise exception 'Croqui ficou com % faixas ativas (esperado 6, so qua/sex) -- ABORTADA', v_n;
  end if;
end
$mig$;

commit;
