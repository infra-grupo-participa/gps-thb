-- Funcoes de trigger nascem executaveis por PUBLIC. Sao SECURITY DEFINER e
-- escrevem; so o gatilho deve chama-las. Revogar nao afeta a trigger --
-- o Postgres nao checa EXECUTE ao disparar gatilho.
revoke all on function gps.plantao_inscricoes_semana_sync() from public, anon, authenticated;
revoke all on function gps.plantao_slots_semana_sync() from public, anon, authenticated;
