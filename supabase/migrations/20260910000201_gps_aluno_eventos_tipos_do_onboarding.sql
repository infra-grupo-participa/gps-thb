-- Mega feature — 4 tipos novos e a entidade `onboarding` no Diário.
--
-- POR QUE EXISTE
--   O questionário inicial e a confirmação do favorito pela equipe mudam o que
--   a pessoa vê no produto — isso é TRILHA, não só auditoria. Em 3 meses
--   alguém vai abrir o Diário e perguntar "por que o fulano já entrou com um
--   cliente contratado?" ou "quem travou a estrela dele?". As funções que
--   gravam esses eventos (`gps.onboarding_salvar_passo`,
--   `gps.onboarding_concluir`, `gps.admin_confirmar_acompanhamento`,
--   `gps.admin_liberar_acompanhamento`) só existem nas migrações ...203/...206,
--   e `gps.aluno_eventos` tem CHECK fechado em `tipo` (20 valores desde a
--   ...151) e em `entidade` (4 desde a ...151). As duas precisam crescer ANTES
--   de as funções existirem, senão o insert do evento morre com 23514 no
--   último passo e a operação inteira volta.
--
-- OS QUATRO TIPOS
--   `onboarding_iniciado`  — a pessoa salvou o primeiro passo. Marca o começo
--     da conversa; sem ele, "158 não iniciados" e "158 iniciados e abandonados
--     no passo 2" seriam indistinguíveis na trilha.
--   `onboarding_concluido` — o questionário fechou. É o único que o
--     `gps.onboarding_concluir` grava por conta própria: o `cliente_cadastrado`
--     e o `cliente_favoritado` da mesma transação são gravados pela trigger de
--     captura que JÁ existe (`gps.aluno_eventos_capturar_etapa1_clientes`,
--     migração ...008) — duplicá-los aqui contaria a mesma coisa duas vezes na
--     mesma linha do tempo.
--   `favorito_confirmado_pela_equipe` / `favorito_liberado_pela_equipe` — dois
--     tipos, não um com {de,para}: o que a trilha precisa contar é a DIREÇÃO
--     (a equipe travou x a equipe soltou), que é o que muda o produto para o
--     aluno. Mesmo raciocínio de `etapa_liberada/travada_pela_equipe` (...151).
--     ⚠️ NÃO confundir com `cliente_favoritado`/`cliente_desfavoritado`, que a
--     trigger grava quando a ESTRELA muda. Aqui é a equipe ACEITANDO acompanhar
--     — o segundo conceito que o boolean misturava (§B.5 da concepção).
--
-- ENTIDADE `onboarding`
--   `entidade_id` fica NULL: a PK de `gps.onboarding_respostas` é
--   `pessoa_aluno_id` (a PESSOA), e `aluno_eventos.aluno_id` é o AMBIENTE.
--   Guardar a pessoa em `entidade_id` faria a coluna significar duas coisas
--   diferentes conforme a entidade. A pessoa vai no `detalhe`. Mesma situação
--   dos marcos de conta (conta_criada, primeiro_acesso), que já gravam
--   entidade_id nulo.
--
-- POR CONTEÚDO, NÃO PELO NOME (mesma técnica das ...092/...151): as duas
--   constraints nasceram inline no `create table` da ...001 e foram recriadas
--   pela ...151. `drop constraint if exists <nome>` com o nome errado vira
--   NO-OP silencioso e o insert do evento morre depois. Acha pelo conteúdo ou
--   ABORTA.
--
-- BACKFILL: NENHUM. Nenhuma linha de gps.aluno_eventos é criada, alterada ou
--   apagada aqui. Logo após aplicar, `count(*) where tipo like 'onboarding%'`
--   é 0 — e isso é o resultado correto, não uma falha.
--
-- ESPELHO OBRIGATÓRIO NO TS (feito nesta mesma rodada):
--   `TIPOS_EVENTO` e `EntidadeEvento` em src/lib/types.ts,
--   `ROTULO_TIPO_EVENTO` em src/components/admin/diario-labels.ts (Record
--   exaustivo — o TypeScript QUEBRA O BUILD se faltar) e
--   `ROTULO_MACRO_POR_TIPO` em src/lib/log-agregacao.ts (Partial — NÃO quebra
--   o build; esquecer ali deixa a macro com rótulo cru na tela do admin).
--
-- O QUE NÃO FAZ
--   * não remove nenhum tipo nem nenhuma entidade (linha histórica continua válida);
--   * não muda RLS (a tabela segue append-only: nenhuma policy de insert/update/
--     delete; a única escrita é por função SECURITY DEFINER);
--   * não cria índice (o índice do dashboard entra na ...209, com o `explain`
--     medido ao lado);
--   * não muda nenhuma trigger de captura.
--
-- REVERSÃO (só depois de apagar as linhas dos tipos novos — e apagar trilha
-- para satisfazer reversão é destruir histórico, então o caminho RECOMENDADO
-- é deixar os valores permitidos): repor os dois CHECK com as listas da ...151
-- (20 tipos, 4 entidades).

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
     and pg_get_constraintdef(con.oid) like '%etapa_travada_pela_equipe%';

  if v_nome is null then
    raise exception
      'CHECK de gps.aluno_eventos.tipo nao encontrado (procurado pelo conteudo etapa_travada_pela_equipe) -- a ...151 foi aplicada? migracao abortada';
  end if;

  execute format('alter table gps.aluno_eventos drop constraint %I', v_nome);
end;
$$;

-- Lista COMPLETA: os 20 tipos da ...151, na mesma ordem, + os 4 novos no fim.
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
    'etapa_travada_pela_equipe',
    -- ── Mega feature (10/09/2026, migrações ...203 e ...206) ──
    'onboarding_iniciado',
    'onboarding_concluido',
    'favorito_confirmado_pela_equipe',
    'favorito_liberado_pela_equipe'
  ));

comment on constraint aluno_eventos_tipo_check on gps.aluno_eventos is
  'Catalogo fechado de tipos de evento do diario. Espelha TIPOS_EVENTO em src/lib/types.ts -- acrescentar tipo aqui SEM acrescentar la deixa o rotulo da trilha sem traducao (e ROTULO_MACRO_POR_TIPO em src/lib/log-agregacao.ts e Partial: esquecer la nao quebra o build, so mostra o codigo cru). cliente_status_mudou fica permitido para as linhas HISTORICAS (a captura viva grava cliente_fase_mudou desde a ...060). Os 4 ultimos entraram na ...201: onboarding_iniciado/onboarding_concluido sao gravados so por gps.onboarding_salvar_passo/gps.onboarding_concluir (...206) e favorito_confirmado/liberado_pela_equipe so por gps.admin_confirmar_acompanhamento/gps.admin_liberar_acompanhamento (...203). NAO confundir favorito_confirmado_pela_equipe (a equipe aceitou acompanhar) com cliente_favoritado (o aluno mexeu na estrela).';

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
  check (entidade in ('cliente', 'tarefa', 'conta', 'etapa', 'onboarding'));

comment on constraint aluno_eventos_entidade_check on gps.aluno_eventos is
  'Dominio de `entidade`. `etapa` entrou na ...151 e `onboarding` na ...201; as duas vem SEMPRE com entidade_id NULL. No caso do onboarding e de proposito: a PK de gps.onboarding_respostas e a PESSOA (pessoa_aluno_id) e aluno_eventos.aluno_id e o AMBIENTE -- guardar a pessoa em entidade_id faria a coluna significar coisas diferentes conforme a entidade. A pessoa vai no detalhe.';
