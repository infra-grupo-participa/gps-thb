-- 🔴 Duas funções auxiliares `gps.admin_*` SEM GUARDA eram executáveis por
-- QUALQUER usuário logado. Achado em 08/09/2026, corrigido em 16/09.
--
-- PROVADO antes de corrigir, com JWT de um aluno comum (gp_is_admin = false):
--   select gps.admin_user_do_aluno('<aluno_id>')
--     → devolveu o user_id de OUTRA pessoa.
--
--   gps.admin_user_do_aluno(uuid)  → uuid    · sem guarda
--   gps.admin_alvo_e_equipe(uuid)  → boolean · sem guarda
--   (gps.admin_direito_ao_acesso JÁ tinha guarda — não é tocada aqui)
--
-- POR QUE REVOGAR NÃO QUEBRA NADA:
-- as duas são AUXILIARES INTERNAS, chamadas por 14 funções do próprio schema
-- (admin_definir_senha, admin_excluir_acesso, admin_status_acesso,
--  admin_adicionar_socio, admin_adotar_login_existente, admin_excluir_membro,
--  admin_programas_do_email, admin_trocar_email_login, admin_trocar_titular,
--  admin_definir_senha_membro, entrada_pelo_codigo, resgate_concluir,
--  resgate_iniciar, socio_convite_aceitar, socio_convite_criar).
-- TODAS são `security definer` com dono `postgres` — rodam como o dono e NÃO
-- dependem do grant de quem chamou (conferido em pg_proc.prosecdef).
--
-- 🔑 A mitigação que existia era OBSCURIDADE: precisar descobrir o UUID de um
--    terceiro. Obscuridade não é controle de acesso.
--
-- CONFERIDO DEPOIS, em transação com rollback:
--   aluno chamando admin_user_do_aluno   → 42501 ✓
--   aluno chamando admin_alvo_e_equipe   → 42501 ✓
--   admin usando admin_status_acesso (que consome as duas) → funciona ✓
--
-- REVERSÃO:
--   grant execute on function gps.admin_user_do_aluno(uuid) to authenticated;
--   grant execute on function gps.admin_alvo_e_equipe(uuid) to authenticated;

revoke execute on function gps.admin_user_do_aluno(uuid) from public, anon, authenticated;
revoke execute on function gps.admin_alvo_e_equipe(uuid) from public, anon, authenticated;

comment on function gps.admin_user_do_aluno(uuid) is
  'AUXILIAR INTERNA: devolve o user_id do titular de um ambiente. 🔴 NAO tem guarda propria -- por isso NAO e executavel por authenticated/anon (revogado em 16/09/2026, apos prova de que um aluno comum a chamava e recebia o user_id de terceiro). So as funcoes security definer do schema a chamam, e elas rodam como o dono. Se algum dia precisar ser chamada direto, acrescente gp_is_admin() ANTES de conceder grant.';

comment on function gps.admin_alvo_e_equipe(uuid) is
  'AUXILIAR INTERNA: diz se um user_id pertence a equipe interna (protege as acoes de senha/acesso de mirarem em admin). 🔴 NAO tem guarda propria -- revogada de authenticated/anon em 16/09/2026 pelo mesmo motivo de admin_user_do_aluno. Chamada por 14 funcoes security definer do schema, que rodam como dono e nao dependem deste grant.';
