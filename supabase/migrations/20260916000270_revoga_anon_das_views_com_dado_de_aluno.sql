-- 🔴 VAZAMENTO ATIVO — 1.873 alunos com CPF legíveis SEM LOGIN. 16/09/2026.
--
-- ⚠️ ESTA MIGRAÇÃO MEXE EM `public`, NÃO EM `gps` (mesma ressalva da …269).
--    As views são do ecossistema THB/disparos; o achado saiu da varredura de
--    segurança feita a partir deste repo, e é daqui que foi aplicada.
--
-- Três views `SECURITY DEFINER` davam acesso ao papel `anon` — a chave
-- pública que vai no JavaScript de qualquer página. Medido com curl, sem
-- autenticação nenhuma:
--
--   vw_aluno_360             → 1.873 linhas (Content-Range 0-1872/1873)
--       nome, documento (CPF), email, telefone, profissao
--   vw_gp_depoimentos_alunos →   112 linhas (0-111/112)
--       aluno_nome, aluno_email, aluno_telefone
--   vw_alunos_cancelados     →     8 linhas (0-7/8)
--       nome, email, telefone, turma
--
-- 🔴 Pior: em `vw_aluno_360` e `vw_alunos_cancelados` o grant a `anon` era
--    `arwdDxtm` — leitura E ESCRITA, não só select.
--
-- CONFERIDO ANTES (para não derrubar sistema do grupo):
--   - `edge_logs` das últimas 24h: ZERO chamadas a estas views além dos
--     testes desta própria auditoria;
--   - os 5 consumidores (public.fn_aluno_360, fn_aluno_360_safe,
--     cs.fn_hm_programa, cs.fn_tag_hm_origem, rede.sync_alunos_thb) e a view
--     cs.vw_central_alunos rodam como definer/owner — NÃO dependem do grant
--     de `anon`;
--   - 🔑 os papéis `disparos_ui_ro` e `disparos_app` EXISTEM e têm grant
--     PRÓPRIO nestas views. Um `revoke all from public` genérico teria
--     derrubado o sistema de disparos junto. Por isso revoga-se SÓ `anon`.
--
-- CONFERIDO DEPOIS: as três devolvem `permission denied` (42501) para a chave
-- anon; fn_aluno_360, fn_aluno_360_safe e cs.vw_central_alunos (1.857 linhas)
-- seguem funcionando; nenhum 401/403 novo nos logs.
--
-- REVERSÃO (uma linha, se algum sistema quebrar):
--   grant select on public.vw_aluno_360 to anon;
--   grant select on public.vw_alunos_cancelados to anon;
--   grant select on public.vw_gp_depoimentos_alunos to anon;

revoke all on public.vw_aluno_360             from anon;
revoke all on public.vw_alunos_cancelados     from anon;
revoke all on public.vw_gp_depoimentos_alunos from anon;

comment on view public.vw_aluno_360 is
  'Visao 360 do aluno. 🔴 anon REVOGADO em 16/09/2026: expunha 1.873 linhas com CPF/email/telefone sem login, e com permissao de ESCRITA (arwdDxtm). Consumidores legitimos (fn_aluno_360, fn_aluno_360_safe, cs.vw_central_alunos, rede.sync_alunos_thb) rodam como definer/owner e nao dependem do grant de anon. disparos_ui_ro preservado.';

comment on view public.vw_alunos_cancelados is
  'Alunos cancelados. 🔴 anon REVOGADO em 16/09/2026 (expunha nome/email/telefone sem login, com permissao de escrita). disparos_app e disparos_ui_ro preservados.';

comment on view public.vw_gp_depoimentos_alunos is
  'Depoimentos com dado do aluno. 🔴 anon REVOGADO em 16/09/2026 (expunha nome/email/telefone de 112 alunos sem login). disparos_ui_ro preservado.';
