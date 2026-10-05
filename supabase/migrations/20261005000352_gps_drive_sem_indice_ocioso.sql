-- …352 — remove gps.drive_arquivos_modificado_idx (criado na …349).
-- Nenhuma leitura o usa: a view vw_cliente_drive_atividade e
-- getUltimaModificacaoPasta filtram por cliente_id (drive_arquivos_cliente_idx).
-- Era só custo de escrita em cada página do feed. (veredito do orquestrador, 05/10)
-- Reverter: create index drive_arquivos_modificado_idx on gps.drive_arquivos (modificado_em desc);
set local lock_timeout = '3s';
drop index if exists gps.drive_arquivos_modificado_idx;
