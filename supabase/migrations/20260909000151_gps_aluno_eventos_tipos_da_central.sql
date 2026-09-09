-- Central de resolução — dois tipos novos e a entidade `etapa` no Diário.
--
-- POR QUE EXISTE
--   Liberar ou travar uma etapa PARA UM ALUNO muda o que aquela pessoa vê no
--   produto. Isso é trilha, não só auditoria: em 3 meses alguém vai abrir o
--   Diário e perguntar "por que o fulano viu a Etapa 04 antes de todo mundo?".
--   `gps.admin_definir_liberacao_etapa` (migração ...152) grava o evento — e
--   `gps.aluno_eventos` tem CHECK fechado em `tipo` (18 valores desde a ...092)
--   e em `entidade` (3 valores desde a ...001). As duas precisam crescer ANTES
--   de a função existir, senão o insert do evento morre com 23514 no último
--   passo e a liberação inteira volta.
--
-- DOIS TIPOS, NÃO UM COM {de,para}
--   `cliente_fase_mudou` usa um tipo só porque a UI mostra "de → para" de um
--   VALOR. Aqui o que importa na leitura é a DIREÇÃO (a equipe abriu x a equipe
--   fechou), que é o que muda o produto para o aluno — e é como o rótulo
--   aparece na trilha sem obrigar quem lê a decodificar o jsonb. O `detalhe`
--   leva {etapa, de, para, global, motivo} de qualquer forma.
--   Remover o override (voltar à regra geral) grava o tipo correspondente ao
--   estado EFETIVO resultante, com `detalhe->>'removido' = true`: o que a
--   pessoa vê passou a ser o global, e é isso que a trilha precisa contar.
--
-- ENTIDADE `etapa`
--   `entidade_id` fica NULL: `gps.etapas.id` é smallint e a coluna é uuid. O
--   número da etapa vai no `detalhe` e no `rotulo`. Mesma situação dos marcos
--   de conta (conta_criada, primeiro_acesso), que já gravam entidade_id nulo.
--
-- POR CONTEÚDO, NÃO PELO NOME (mesma técnica da ...092): as duas constraints
--   nasceram inline no `create table` da ...001 e foram batizadas pelo Postgres.
--   `drop constraint if exists <nome>` com o nome errado vira NO-OP silencioso.
--   Acha pelo conteúdo ou ABORTA.
--
-- BACKFILL: NENHUM. Nenhuma linha de gps.aluno_eventos é criada, alterada ou
--   apagada aqui. Logo após aplicar, `count(*) where tipo like 'etapa_%'` é 0 —
--   e isso é o resultado correto, não uma falha.
--
-- ESPELHO OBRIGATÓRIO NO TS (feito nesta mesma rodada):
--   `TIPOS_EVENTO` em src/lib/types.ts (e `EntidadeEvento`),
--   `ROTULO_TIPO_EVENTO` em src/components/admin/diario-labels.ts (Record
--   exaustivo — o TypeScript quebra o build se faltar) e
--   `ROTULO_MACRO_POR_TIPO` em src/lib/log-agregacao.ts (Partial — NÃO quebra
--   o build; esquecer ali deixa a macro com rótulo cru na tela do admin).
--
-- O QUE NÃO FAZ
--   * não remove nenhum tipo nem nenhuma entidade (linha histórica continua válida);
--   * não muda RLS (a tabela segue append-only: nenhuma policy de insert/update/
--     delete; a única escrita é por função SECURITY DEFINER);
--   * não cria índice (a trilha lê por (aluno_id, ocorrido_em), nunca por tipo);
--   * não muda nenhuma trigger de captura.
--
-- REVERSÃO (só depois de apagar as linhas dos tipos novos — senão o `add`
-- falha na validação; e apagar trilha para satisfazer reversão é destruir
-- histórico, então o caminho RECOMENDADO é deixar os valores permitidos):
--   repor os dois CHECK com as listas de ...092 (18 tipos) e ...001 (3 entidades).

-- ─────────────────────────────────────────────────────────────────────────
-- 1) tipo
-- ─────────────────────────────────────────────────────────────────────────
do $$
declare v_nome text;
begin
  select con.conname into v_nome
    from pg_constraint con
    join pg_class     c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'gps' and c.relname = 'aluno_eventos' and con.contype = 'c'
     and pg_get_constraintdef(con.oid) like '%cliente_honorarios_definidos%';

  if v_nome is null then
    raise exception
      'CHECK de gps.aluno_eventos.tipo nao encontrado (procurado pelo conteudo cliente_honorarios_definidos) -- a ...092 foi aplicada? migracao abortada';
  end if;

  execute format('alter table gps.aluno_eventos drop constraint %I', v_nome);
end;
$$;

-- Lista COMPLETA: os 18 tipos da ...092, na mesma ordem, + os 2 novos no fim.
alter table gps.aluno_eventos
  add constraint aluno_eventos_tipo_check check (tipo in (
    'cliente_cadastrado',
    'cliente_favoritado',
    'cliente_desfavoritado',
    'cliente_status_mudou',
    'cliente_fase_mudou',
    'cliente_mensagem_padrao',
    'cliente_estudo_caso',
    'cliente_ligacao',
    'cliente_aderiu_reuniao',
    'cliente_reuniao_agendada',
    'cliente_excluido',
    'cliente_honorarios_definidos',
    'tarefa_concluida',
    'tarefa_reaberta',
    'conta_criada',
    'email_confirmado',
    'primeiro_acesso',
    'entrou_no_programa',
    'etapa_liberada_pela_equipe',
    'etapa_travada_pela_equipe'
  ));

comment on constraint aluno_eventos_tipo_check on gps.aluno_eventos is
  'Catalogo fechado de tipos de evento do diario. Espelha TIPOS_EVENTO em src/lib/types.ts -- acrescentar tipo aqui SEM acrescentar la deixa o rotulo da trilha sem traducao (e ROTULO_MACRO_POR_TIPO em src/lib/log-agregacao.ts e Partial: esquecer la nao quebra o build, so mostra o codigo cru). cliente_status_mudou fica permitido para as linhas HISTORICAS (a captura viva grava cliente_fase_mudou desde a ...060). cliente_honorarios_definidos entrou na ...092. etapa_liberada_pela_equipe / etapa_travada_pela_equipe entraram na ...151 (Central de resolucao) e sao gravados SO por gps.admin_definir_liberacao_etapa.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2) entidade
-- ─────────────────────────────────────────────────────────────────────────
do $$
declare v_nome text;
begin
  select con.conname into v_nome
    from pg_constraint con
    join pg_class     c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'gps' and c.relname = 'aluno_eventos' and con.contype = 'c'
     and pg_get_constraintdef(con.oid) like '%entidade%';

  if v_nome is null then
    raise exception
      'CHECK de gps.aluno_eventos.entidade nao encontrado (procurado pelo conteudo) -- migracao abortada';
  end if;

  execute format('alter table gps.aluno_eventos drop constraint %I', v_nome);
end;
$$;

alter table gps.aluno_eventos
  add constraint aluno_eventos_entidade_check
  check (entidade in ('cliente', 'tarefa', 'conta', 'etapa'));

comment on constraint aluno_eventos_entidade_check on gps.aluno_eventos is
  'Dominio de `entidade`. `etapa` entrou na ...151 (Central de resolucao) e vem SEMPRE com entidade_id NULL -- gps.etapas.id e smallint e entidade_id e uuid; o numero da etapa vai no detalhe e no rotulo, como nos marcos de conta.';
