-- ═══════════════════════════════════════════════════════════════════════════
-- 388 — TODAS as reuniões da Cristiane só às QUARTAS e SEXTAS
--       (Aldri, áudio no Slack em 15/10/2026: "De segunda a sexta é o Marco,
--       que é a entrevista. As outras reuniões, da Cristiane, somente quarta
--       e sexta"; João, 16/10: "vamos resolver o que ficou pendente")
-- ═══════════════════════════════════════════════════════════════════════════
-- A …387 tirou só o Croqui (tipo 4) de seg/ter/qui. Esta faz o mesmo com
-- Preliminar (2), Viabilidade (3) e Minuta (6). Horários não mudam (…385):
-- 10:00 · 13:30 · 16:00. O Marco (Entrevista Prévia, tipo 1) segue seg–sex.
--
-- Desativa (nunca apaga) as faixas em dia_semana 1, 2, 4.
-- Medido 16/10: 1 sessão futura já marcada fora da regra (Preliminar
-- 20/10 10:00, 3fc34c54). NÃO é cancelada aqui: segue valendo; decidir à mão.
-- Esperado depois: 24 faixas ativas (4 tipos × qua/sex × 3 horários).
--
-- REVERSÃO:
--   update gps.sessao_disponibilidade set ativo = true
--    where responsavel_id = '1b153c6d-6287-43ae-9e02-6caf6e6f9c33'
--      and tipo_id in (2,3,6) and dia_semana in (1,2,4)
--      and vigencia_inicio = date '2026-10-15'
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
   where ativo and responsavel_id = c_cris and tipo_id in (2, 3, 6)
     and dia_semana in (1, 2, 4);

  select count(*) into v_n from gps.sessao_disponibilidade
   where ativo and responsavel_id = c_cris;
  if v_n <> 24 or exists (select 1 from gps.sessao_disponibilidade
                           where ativo and responsavel_id = c_cris
                             and dia_semana not in (3, 5)) then
    raise exception 'Cristiane ficou com % faixas ativas (esperado 24, so qua/sex) -- ABORTADA', v_n;
  end if;
end
$mig$;

commit;
