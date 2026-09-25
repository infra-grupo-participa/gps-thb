-- O rate limit de `gps.plantao_inscrever` (10 por IP a cada 15 min) contava só
-- `plantao_inscricao` e `plantao_inscricao_tentativa`. Desde a …315 as recusas
-- de quem tem e-mail válido também gravam log (`plantao_recusa_*`) — sem entrar
-- na conta, um e-mail válido podia martelar a RPC e encher o log sem teto.
-- Achado do Fable (trava final de 25/09/2026).
--
-- Troca cirúrgica sobre o corpo VIGENTE (pg_get_functiondef), não reescrita:
-- o corpo inteiro acabou de ser provado em rollback na …315.
do $mig$
declare
  v_def text := pg_get_functiondef('gps.plantao_inscrever(text,text,uuid,text)'::regprocedure);
  v_de  text := $x$and e.acao in ('plantao_inscricao', 'plantao_inscricao_tentativa')$x$;
  v_para text := $x$and (e.acao in ('plantao_inscricao', 'plantao_inscricao_tentativa')
         or e.acao like 'plantao\_recusa\_%')$x$;
begin
  if position(v_de in v_def) = 0 then
    raise exception 'corpo vigente de plantao_inscrever não tem o trecho esperado';
  end if;
  execute replace(v_def, v_de, v_para);
end
$mig$;
