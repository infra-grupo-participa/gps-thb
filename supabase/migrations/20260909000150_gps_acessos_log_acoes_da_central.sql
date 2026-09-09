-- Central de resolução (09/09/2026) — amplia gps.acessos_log.acao.
--
-- POR QUE EXISTE (medido)
--   `acessos_log_acao_check` aceita hoje 5 valores
--   ('senha_definida','acesso_excluido','socio_adicionado','membro_excluido',
--   'ambiente_ambiguo' — retrato em docs/audits/2026-09-09-polimento/
--   schema-gps-dump.md). TODAS as RPCs da Central gravam no MESMO log — auditoria
--   de acesso e de vínculo mora num lugar só — e o insert do log é sempre o
--   ÚLTIMO passo de cada função. Sem esta migração, cada uma delas morreria com
--   23514 depois de já ter feito o trabalho, e a transação inteira voltaria: de
--   fora, o botão "não faz nada". É exatamente o modo de falha que deixou
--   gps.admin_adotar_login_existente quebrada por 15 dias (migração ...020).
--   Por isso esta migração vem PRIMEIRO de toda a rodada.
--
-- POR CONTEÚDO, NÃO PELO NOME
--   A constraint nasceu inline no `create table` e foi batizada pelo Postgres.
--   `drop constraint if exists <nome>` seria uma aposta: se o nome real for
--   outro, o `if exists` vira NO-OP SILENCIOSO, o CHECK antigo continua valendo
--   e caímos no cenário do parágrafo acima. Mesma técnica da migração ...092:
--   acha pelo conteúdo ('ambiente_ambiguo') ou ABORTA a migração.
--
-- ⚠️ `drop`+`add` revalida a tabela inteira. Conferir o tamanho antes (bloco M6
--    do plano): com menos de ~10 mil linhas é instantâneo. `gps.acessos_log` é
--    log de ação ADMINISTRATIVA (não de acesso do aluno), então é pequena.
--
-- O QUE NÃO FAZ
--   * não muda RLS, policy, grant, coluna nem UMA linha existente;
--   * não remove nenhum valor antigo (linha histórica continua válida);
--   * não acrescenta valor sem escritor: cada um dos 7 abaixo é gravado por uma
--     função desta mesma rodada (...152 a ...157).
--
-- REVERSÃO (nesta ordem, e só depois de apagar as linhas com as ações novas —
-- senão o `add constraint` falha na validação):
--   delete from gps.acessos_log where acao in ('etapa_liberacao_alterada',
--     'progresso_reaberto','membro_pessoa_vinculada','titular_trocado',
--     'membro_movido','financeiro_vinculado','financeiro_desvinculado');
--   alter table gps.acessos_log drop constraint acessos_log_acao_check;
--   alter table gps.acessos_log add constraint acessos_log_acao_check
--     check (acao = any (array['senha_definida','acesso_excluido',
--       'socio_adicionado','membro_excluido','ambiente_ambiguo']));

do $$
declare v_nome text;
begin
  select con.conname
    into v_nome
    from pg_constraint con
    join pg_class     c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'gps'
     and c.relname = 'acessos_log'
     and con.contype = 'c'
     and pg_get_constraintdef(con.oid) like '%ambiente_ambiguo%';

  if v_nome is null then
    raise exception
      'CHECK de gps.acessos_log.acao nao encontrado (procurado pelo CONTEUDO, nao pelo nome) -- migracao abortada para nao deixar as RPCs da Central gravando uma acao que a constraint rejeita';
  end if;

  execute format('alter table gps.acessos_log drop constraint %I', v_nome);
end;
$$;

-- Lista COMPLETA: os 5 valores vigentes, na mesma ordem, + os 7 da Central.
alter table gps.acessos_log
  add constraint acessos_log_acao_check check (acao = any (array[
    'senha_definida',
    'acesso_excluido',
    'socio_adicionado',
    'membro_excluido',
    'ambiente_ambiguo',
    -- ── Central de resolução (09/09/2026) ──
    'etapa_liberacao_alterada',   -- ...152 gps.admin_definir_liberacao_etapa
    'progresso_reaberto',         -- ...153 gps.admin_reabrir_etapa
    'membro_pessoa_vinculada',    -- ...154 gps.admin_vincular_pessoa_membro
    'titular_trocado',            -- ...155 gps.admin_trocar_titular
    'membro_movido',              -- ...156 gps.admin_mover_membro
    'financeiro_vinculado',       -- ...157 gps.admin_financeiro_vincular
    'financeiro_desvinculado'     -- ...157 gps.admin_financeiro_desvincular
  ]));

comment on constraint acessos_log_acao_check on gps.acessos_log is
  'Catalogo fechado das acoes administrativas auditadas. Espelha ROTULO_ACAO_ADMIN em src/components/admin/diario-labels.ts -- acrescentar acao aqui SEM acrescentar la deixa a trilha do admin mostrando o codigo cru (rotuloAcaoAdmin tem fallback, nao quebra o build). Os 5 primeiros sao do baseline; os 7 seguintes entraram com a Central de resolucao em 09/09/2026 e cada um tem exatamente uma funcao escritora (migracoes ...152 a ...157).';
