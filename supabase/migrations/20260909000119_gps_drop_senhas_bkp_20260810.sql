-- Apaga gps.senhas_bkp_20260810.
--
-- O que era: cópia de 83 hashes bcrypt de auth.users (id, email, encrypted_password,
-- last_sign_in_at, copiado_em) feita em 10/08/2026 15:05 UTC — backup do experimento
-- "login em duas etapas", revertido no mesmo dia (commit 4c9890b). RLS DESLIGADA, mas
-- sem grant para anon/authenticated: nunca esteve exposta pela API.
--
-- Por que sai: medido em 09/09/2026 — 83 linhas, todos os 83 usuários ainda existem,
-- 71 hashes ainda IDÊNTICOS aos atuais. Era um espelho de senhas vivas, parado há 30
-- dias, sem finalidade e fora de qualquer rotina de retenção. Segredo em repouso sem
-- dono é passivo, não backup. Pendência registrada no CLAUDE.md e no plano de
-- polimento; o João autorizou ("prossegue com o que ficou pendente").
--
-- O QUE NÃO FAZ: não toca auth.users, não toca gps.bak_socios_migracao_20260908
-- (backup de dados de vínculo, sem segredo — fica).
--
-- Reversão: NENHUMA (irreversível por desenho — é exatamente o ponto).

drop table if exists gps.senhas_bkp_20260810;
