-- ─────────────────────────────────────────────────────────────────────────
-- `gps.config_definir`: a allowlist ganha as 3 chaves da Agenda de Sessões
-- e a `minuta_contexto_obrigatorio`, que FALTAVA desde 17/09.
--
-- APLICADA EM PRODUÇÃO em 22/09/2026 (migration `gps_config_definir_sessoes_e_minuta`).
--
-- 🔴 DEFEITO PRÉ-EXISTENTE MEDIDO, com JWT de admin real:
--   minuta_contexto_obrigatorio -> RECUSADO [22023] "Este interruptor não existe."
--   tutoriais_ativo             -> ACEITO   (prova de que o teste era válido)
--
-- `minuta_contexto_obrigatorio` está em `INTERRUPTORES_CONFIG`
-- (src/lib/config-tipos.ts) desde 17/09: a equipe VÊ o botão na tela e ele
-- falha ao clicar. Interruptor que a tela oferece e o banco recusa é PIOR que
-- interruptor ausente — a pessoa acredita que desligou.
--
-- Como passou despercebido: a allowlist vive no CORPO da função, e a fatia que
-- acrescentou o interruptor mexeu só no TypeScript. `tsc`, `eslint` e `build`
-- ficam verdes; só clicar na tela (ou ler `pg_get_functiondef`) revela.
-- 🔑 Regra: interruptor novo toca DOIS lugares — `INTERRUPTORES_CONFIG` e esta
-- allowlist. Conferir sempre uma contra a outra, lendo a função VIVA.
--
-- As 3 de sessão (`sessoes_email_ativo`, `sessoes_exige_disc`,
-- `sessoes_exige_confirmacao`) existem em `gps.config` desde a …293 e só se
-- mexiam por SQL — os "botões de pânico inacessíveis no pânico" que este
-- projeto já registrou em 4 outros interruptores.
--
-- 🔑 Corpo reescrito por INTEIRO (não `replace` textual): a função é curta e
-- foi conferida contra `pg_get_functiondef` do banco antes de reescrever.
-- Tudo que não é a lista permanece literalmente igual — guarda
-- `coalesce(gp_is_admin(), false)`, CHECK de 'true'/'false', upsert e trilha.
--
-- ── MEDIDO DEPOIS DE APLICAR (JWT de admin real, em transação com rollback) ──
--   15 de 15 chaves da allowlist  -> ACEITO
--   'chave_inventada'             -> RECUSADO [22023]
--   'resend_api_key' (o SEGREDO)  -> RECUSADO [22023]
--   '' (string vazia)             -> RECUSADO [22023]
--   valor 'talvez'                -> RECUSADO [22023]
--   sem JWT                       -> RECUSADO [42501]
--   ACL: anon NÃO executa · authenticated executa (guarda gp_is_admin dentro)
--
-- Sem `explain analyze`: não há query nova. A função faz um upsert por chave
-- primária e um insert de trilha, ambos O(1), disparados por clique de admin
-- (unidades por mês). Nenhum índice novo se justifica.
--
-- REVERSÃO: reaplicar esta função com a lista de 11 chaves de antes de 22/09.
-- Nada de dado muda; `gps.config` não é tocada por esta migration.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function gps.config_definir(p_chave text, p_valor text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode='42501'; end if;
  if p_chave is null or p_chave not in (
    'chamados_aberto','chamados_categorias_ativo','convite_socio_ativo','entrada_codigo_ativa',
    'minuta_contexto_obrigatorio',
    'plantao_inscricao_aberta','resgate_ativo','slack_mencoes_ativo','socio_cadastro_obrigatorio',
    'troca_email_login_ativa','tutoriais_ativo','videos_ativo',
    -- Agenda de Sessões (…293 e …294). Desligar `sessoes_email_ativo` é o
    -- freio de mão do disparo por cron; as outras duas relaxam exigências
    -- de fluxo sem deploy.
    'sessoes_email_ativo','sessoes_exige_disc','sessoes_exige_confirmacao'
  ) then raise exception 'Este interruptor não existe.' using errcode='22023'; end if;
  if p_valor not in ('true','false') then
    raise exception 'Este interruptor só aceita ligado ou desligado.' using errcode='22023'; end if;
  insert into gps.config (chave, valor, atualizado_por)
  values (p_chave, p_valor, auth.uid())
  on conflict (chave) do update set valor=excluded.valor, atualizado_por=excluded.atualizado_por;
  insert into gps.acessos_log (acao, aluno_id, detalhe, feito_por)
  values ('interruptor_alterado', null,
    format('interruptor "%s" definido para %s', p_chave, p_valor), auth.uid());
end; $function$;
