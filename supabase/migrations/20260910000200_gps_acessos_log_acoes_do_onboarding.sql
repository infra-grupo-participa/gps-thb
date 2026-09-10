-- Mega feature (10/09/2026) — amplia gps.acessos_log.acao com as ações novas.
--
-- POR QUE EXISTE, E POR QUE VEM PRIMEIRO DE TODA A RODADA
--   `acessos_log_acao_check` aceita hoje 12 valores (5 do baseline + 7 da
--   Central, migração ...150). Três funções desta rodada gravam ação NOVA no
--   MESMO log, e em todas elas o `insert` do log é o ÚLTIMO passo:
--     · gps.admin_confirmar_acompanhamento  → 'favorito_confirmado'   (...203)
--     · gps.admin_liberar_acompanhamento    → 'favorito_liberado'     (...203)
--     · criarAcessosEmLote (src/app/admin/actions.ts), pela RPC
--       gps.admin_registrar_lote_de_acessos criada no fim deste arquivo
--                                           → 'acessos_criados_em_lote'
--   Sem esta migração, cada uma morreria com 23514 DEPOIS de já ter feito o
--   trabalho, a transação inteira voltaria e, de fora, o botão "não faz nada".
--   É o modo de falha que deixou gps.admin_adotar_login_existente quebrada por
--   15 dias (migração ...020) e que a ...150 documentou. Por isso vem primeiro.
--
-- POR CONTEÚDO, NÃO PELO NOME
--   A constraint foi recriada pela ...150 com nome explícito, mas procurar
--   pelo nome seria apostar que ninguém a recriou depois: `drop constraint if
--   exists <nome>` com o nome errado vira NO-OP SILENCIOSO, o CHECK antigo
--   continua valendo e caímos no cenário do parágrafo acima. Acha pelo
--   CONTEÚDO ('financeiro_desvinculado', o último valor que a ...150
--   acrescentou) ou ABORTA. Mesma técnica das ...092/...150/...151.
--
-- ⚠️ `drop`+`add` revalida a tabela inteira. `gps.acessos_log` é log de ação
--    ADMINISTRATIVA (não de acesso do aluno): tamanho de centenas de linhas,
--    revalidação instantânea. Conferir com o B0 do bloco de conferência.
--
-- O QUE NÃO FAZ
--   * não muda RLS, policy, grant, coluna nem UMA linha existente;
--   * não remove nenhum valor antigo (linha histórica continua válida);
--   * não acrescenta valor sem escritor: cada um dos 3 tem exatamente uma
--     função/ação escritora nesta mesma rodada.
--
-- REVERSÃO (nesta ordem, e só depois de apagar as linhas com as ações novas —
-- senão o `add constraint` falha na validação):
--   delete from gps.acessos_log where acao in ('favorito_confirmado',
--     'favorito_liberado','acessos_criados_em_lote');
--   alter table gps.acessos_log drop constraint acessos_log_acao_check;
--   -- e reaplicar o `add constraint` da migração ...150 (12 valores).

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
     and pg_get_constraintdef(con.oid) like '%financeiro_desvinculado%';

  if v_nome is null then
    raise exception
      'CHECK de gps.acessos_log.acao nao encontrado (procurado pelo CONTEUDO financeiro_desvinculado, da migracao ...150) -- migracao abortada para nao deixar as RPCs novas gravando uma acao que a constraint rejeita';
  end if;

  execute format('alter table gps.acessos_log drop constraint %I', v_nome);
end;
$$;

-- Lista COMPLETA: os 12 valores vigentes, na mesma ordem, + os 3 novos.
alter table gps.acessos_log
  add constraint acessos_log_acao_check check (acao = any (array[
    'senha_definida',
    'acesso_excluido',
    'socio_adicionado',
    'membro_excluido',
    'ambiente_ambiguo',
    -- ── Central de resolução (09/09/2026, migrações ...152 a ...157) ──
    'etapa_liberacao_alterada',
    'progresso_reaberto',
    'membro_pessoa_vinculada',
    'titular_trocado',
    'membro_movido',
    'financeiro_vinculado',
    'financeiro_desvinculado',
    -- ── Mega feature: onboarding e trava do favorito (10/09/2026) ──
    'favorito_confirmado',       -- ...203 gps.admin_confirmar_acompanhamento
    'favorito_liberado',         -- ...203 gps.admin_liberar_acompanhamento
    'acessos_criados_em_lote'    -- criarAcessosEmLote (src/app/admin/actions.ts)
  ]));

comment on constraint acessos_log_acao_check on gps.acessos_log is
  'Catalogo fechado das acoes administrativas auditadas. Espelha ROTULO_ACAO_ADMIN em src/components/admin/diario-labels.ts -- acrescentar acao aqui SEM acrescentar la deixa a trilha do admin mostrando o codigo cru (rotuloAcaoAdmin tem fallback, nao quebra o build). Os 5 primeiros sao do baseline; 7 entraram com a Central (...150) e 3 com a mega feature de 10/09/2026 (...200): favorito_confirmado e favorito_liberado sao gravados so por gps.admin_confirmar_acompanhamento/gps.admin_liberar_acompanhamento (...203); acessos_criados_em_lote e gravado UMA vez por clique de "Criar acesso para os selecionados", com o resumo do lote no detalhe (nunca uma linha por pessoa -- as linhas por pessoa continuam sendo os senha_definida que cada criacao ja grava).';

-- ─────────────────────────────────────────────────────────────────────────
-- gps.admin_registrar_lote_de_acessos — a ÚNICA escritora de
-- 'acessos_criados_em_lote'
--
-- POR QUE UMA RPC E NÃO UM INSERT DA ACTION
--   `gps.acessos_log` tem RLS com UMA policy, de SELECT (baseline). Os grants
--   de insert/update/delete existem mas NÃO têm policy correspondente: na
--   prática o RLS nega. Um `.from("acessos_log").insert(...)` da action
--   voltaria SEM ERRO e sem linha — o pior resultado possível para uma
--   auditoria (é a lição de `salvarPerfilAluno`: update que não casa nada
--   volta "com sucesso"). SECURITY DEFINER é o único caminho de escrita neste
--   log, e é o mesmo de todas as outras 12 ações.
--
--   ⚠️ UMA linha por CLIQUE, com o resumo — não uma por pessoa. A linha por
--   pessoa continua sendo a que cada criação de acesso já gera; duplicar isso
--   inflaria o log de auditoria em 20× por lote sem informação nova.
--
-- O QUE NÃO FAZ: não cria acesso, não manda e-mail, não toca auth.users.
-- REVERSÃO: drop function gps.admin_registrar_lote_de_acessos(integer, integer, integer, integer);

create or replace function gps.admin_registrar_lote_de_acessos(
  p_total          integer,
  p_criados        integer,
  p_falhas         integer,
  p_precisa_decisao integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  insert into gps.acessos_log (acao, aluno_id, detalhe, feito_por)
  values ('acessos_criados_em_lote', null,
          format('lote de %s: %s criado(s), %s falha(s), %s aguardando decisao',
                 greatest(coalesce(p_total, 0), 0),
                 greatest(coalesce(p_criados, 0), 0),
                 greatest(coalesce(p_falhas, 0), 0),
                 greatest(coalesce(p_precisa_decisao, 0), 0)),
          auth.uid());
end $function$;

comment on function gps.admin_registrar_lote_de_acessos(integer, integer, integer, integer) is
  'Grava UMA linha de auditoria por clique em "Criar acesso para os selecionados" (acao=acessos_criados_em_lote), com o resumo do lote. aluno_id fica NULL de proposito: o lote nao e de um ambiente. Nenhum dado pessoal no detalhe -- so contagens. SECURITY DEFINER porque gps.acessos_log nao tem policy de insert (o RLS nega o insert direto, em silencio).';

revoke execute on function gps.admin_registrar_lote_de_acessos(integer, integer, integer, integer) from public, anon;
grant  execute on function gps.admin_registrar_lote_de_acessos(integer, integer, integer, integer) to authenticated;
