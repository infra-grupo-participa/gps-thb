-- O diário passa a auditar o HONORÁRIO do cliente (novo tipo de evento
-- `cliente_honorarios_definidos`, com detalhe {de, para}).
--
-- MOTIVAÇÃO: `valor_honorarios` (migração ...090) é a comprovação de
-- faturamento do ambiente e a base da meta de R$ 150.000. Número que sustenta
-- meta e que o próprio aluno digita precisa de trilha: sem ela, "quem mudou de
-- 80.000 para 8.000 e quando" não tem resposta -- e a única prova possível
-- seria a memória de alguém.
--
-- `contrato_url` NÃO É AUDITADO, de propósito: link de Drive muda por
-- manutenção de pasta (mover arquivo, recriar link, trocar de conta) e cada
-- troca viraria um evento sem informação. A disputa é sempre sobre o VALOR.
--
-- CORPO DE PARTIDA da função: o `create or replace function
-- gps.aluno_eventos_capturar_etapa1_clientes()` de
-- supabase/migrations/20260909000060_gps_etapa1_clientes_fase.sql -- que o
-- orquestrador conferiu ser o vigente no banco. NÃO é o da ...008 (aquele
-- ainda audita `status`, congelado desde a ...060): partir dele reverteria o
-- `cliente_fase_mudou` sem ninguém notar, porque a ausência de evento não
-- gera erro. A única diferença deste arquivo para a ...060 é o bloco novo de
-- `valor_honorarios`; todo o resto -- inclusive a rede de segurança
-- `begin / exception when others` da ...008 -- é idêntico, letra por letra.
--
-- 🔴 A ORDEM DOS DOIS PASSOS É OBRIGATÓRIA: primeiro o CHECK aceita o tipo
-- novo, depois a trigger passa a gravá-lo. Invertido, todo INSERT do tipo
-- novo falharia com 23514 DENTRO da trigger -- que engole exceção por design
-- (migração ...008) -- e o evento sumiria sem barulho nenhum.
--
-- 🔴 O NOME DO CHECK É DESCOBERTO, NÃO ADIVINHADO. A ...060 recriou a
-- constraint já com o nome `aluno_eventos_tipo_check`, mas escrever
-- `drop constraint if exists aluno_eventos_tipo_check` seria apostar nisso: se
-- o nome real for outro (a constraint nasceu inline e sem nome na ...001, e o
-- Postgres batiza sozinho), o `if exists` vira NO-OP SILENCIOSO, o CHECK
-- antigo continua valendo e caímos exatamente no cenário do parágrafo acima.
-- Por isso: acha pelo conteúdo (`pg_get_constraintdef ... like
-- '%cliente_fase_mudou%'`), ou aborta a migração inteira.
--
-- BACKFILL: NENHUM. Nenhuma linha de gps.aluno_eventos é criada, alterada ou
-- apagada por esta migração -- `gps.aluno_eventos` tem de terminar com
-- EXATAMENTE o mesmo total com que começou. O tipo novo só passa a existir
-- quando alguém digitar um honorário na tela. Corolário: logo após aplicar,
-- `count(*) where tipo = 'cliente_honorarios_definidos'` é 0, e isso é o
-- resultado correto, não uma falha.
--
-- ESPELHO OBRIGATÓRIO NO TS: `TIPOS_EVENTO` em src/lib/types.ts,
-- `ROTULO_TIPO_EVENTO` em src/components/admin/diario-labels.ts (Record
-- exaustivo -- o TypeScript quebra o build se faltar) e
-- `ROTULO_MACRO_POR_TIPO` em src/lib/log-agregacao.ts (Partial -- NÃO quebra
-- o build; esquecer ali deixa a macro com rótulo cru
-- "cliente_honorarios_definidos (3)" na tela do admin).
--
-- O QUE ESTA MIGRAÇÃO NÃO FAZ:
--   * não remove nenhum tipo do catálogo -- `cliente_status_mudou` continua
--     permitido para as linhas HISTÓRICAS, como na ...060;
--   * não muda o comportamento da trigger para nenhum outro campo;
--   * não audita `contrato_url`;
--   * não cria índice: gps.aluno_eventos já tem idx_aluno_eventos_timeline,
--     e a leitura da trilha é por (aluno_id, ocorrido_em), nunca por `tipo`.
--
-- REVERSÃO (nesta ordem):
--   1) reaplicar o `create or replace function
--      gps.aluno_eventos_capturar_etapa1_clientes()` INTEGRAL de
--      supabase/migrations/20260909000060_gps_etapa1_clientes_fase.sql
--      (a trigger volta a ignorar valor_honorarios);
--   2) opcional -- recriar o CHECK sem 'cliente_honorarios_definidos'. Só é
--      possível se NENHUMA linha desse tipo tiver sido gravada; do contrário
--      o `add constraint` falha na validação. Manter o tipo permitido é
--      inofensivo e é o caminho RECOMENDADO: apagar as linhas para caber na
--      constraint seria destruir trilha para satisfazer uma reversão.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) O catálogo de tipos aceita o evento novo (ANTES da trigger gravá-lo)
-- ─────────────────────────────────────────────────────────────────────────
do $$
declare
  v_nome text;
begin
  select con.conname
    into v_nome
    from pg_constraint con
    join pg_class     c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'gps'
     and c.relname = 'aluno_eventos'
     and con.contype = 'c'
     and pg_get_constraintdef(con.oid) like '%cliente_fase_mudou%';

  if v_nome is null then
    raise exception
      'CHECK de gps.aluno_eventos.tipo nao encontrado (procurado pelo conteudo, nao pelo nome) -- migracao abortada para nao deixar a trigger gravando um tipo que a constraint rejeita em silencio';
  end if;

  execute format('alter table gps.aluno_eventos drop constraint %I', v_nome);
end;
$$;

-- Lista COMPLETA: os 17 tipos da ...060, na mesma ordem, + o novo no fim.
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
    'entrou_no_programa'
  ));

comment on constraint aluno_eventos_tipo_check on gps.aluno_eventos is
  'Catalogo fechado de tipos de evento do diario. Espelha TIPOS_EVENTO em src/lib/types.ts -- acrescentar tipo aqui SEM acrescentar la deixa o rotulo da trilha sem traducao (e ROTULO_MACRO_POR_TIPO em src/lib/log-agregacao.ts e Partial: esquecer la nao quebra o build, so mostra o codigo cru na tela). cliente_status_mudou fica permitido para as linhas HISTORICAS: a captura ao vivo passou a gravar cliente_fase_mudou na migracao ...060. cliente_honorarios_definidos entrou na ...092 e audita SO `valor_honorarios` -- `contrato_url` nao e auditado de proposito.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2) A trigger passa a gravar o evento
--
-- Corpo VIGENTE (20260909000060), com UM acréscimo: o bloco de
-- `valor_honorarios`, logo depois do bloco de `fase`. Dentro do
-- `begin ... exception when others` que já existe -- o log nunca pode
-- abortar a escrita do aluno.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function gps.aluno_eventos_capturar_etapa1_clientes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator text;
  v_aluno_id uuid;
  v_rotulo text;
begin
  begin
    -- public.gp_is_admin() é SECURITY DEFINER e barata (lê public.perfis pelo
    -- auth.uid() da sessão) — é o mesmo teste usado em toda policy do projeto.
    -- Sem sessão (ex.: função interna chamando sem contexto de auth), auth.uid()
    -- é null e gp_is_admin() devolve false, então cai em 'aluno'; nenhum dos
    -- caminhos de escrita hoje passa por aqui sem sessão de aluno/admin.
    v_ator := case when public.gp_is_admin() then 'equipe' else 'aluno' end;

    if tg_op = 'DELETE' then
      -- Cliente excluído: registra o EVENTO mas ANONIMIZA o rótulo — decisão
      -- do Marcio. Não reter nome de um terceiro (o cliente do aluno) que foi
      -- deliberadamente apagado.
      insert into gps.aluno_eventos
        (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, ator, ator_user_id, origem)
      values
        (old.aluno_id, now(), 'cliente_excluido', 'cliente', old.id, 'Cliente removido', v_ator, auth.uid(), 'app');
      return old;
    end if;

    v_aluno_id := new.aluno_id;
    -- left(...,300): o CHECK de `rotulo` é 1..300 e `etapa1_clientes.nome` é
    -- `text` SEM limite no banco. Sem truncar, um cliente com nome longo faz o
    -- CHECK estourar DENTRO da trigger e o ALUNO não consegue salvar a própria
    -- ficha (testado: 23514 no INSERT). Truncar é obrigatório justamente porque
    -- esta trigger roda no caminho de escrita do aluno.
    v_rotulo := left(coalesce(nullif(btrim(new.nome), ''), 'Cliente sem nome'), 300);

    if tg_op = 'INSERT' then
      insert into gps.aluno_eventos
        (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, ator, ator_user_id, origem)
      values
        (v_aluno_id, now(), 'cliente_cadastrado', 'cliente', new.id, v_rotulo, v_ator, auth.uid(), 'app');
      return new;
    end if;

    -- UPDATE: só grava quando um campo da LISTA FECHADA de interesse mudou.
    -- Campo livre (registro_contato, telefone, nome, perda_inercia, problemas,
    -- perfil_disc, ordem, contrato_url) NÃO audita — decisão do Marcio. `nome`
    -- muda o RÓTULO dos eventos futuros mas não é ele próprio um evento.

    if new.acompanhado_equipe is distinct from old.acompanhado_equipe then
      insert into gps.aluno_eventos
        (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, ator, ator_user_id, origem)
      values
        (v_aluno_id, now(),
         case when new.acompanhado_equipe then 'cliente_favoritado' else 'cliente_desfavoritado' end,
         'cliente', new.id, v_rotulo, v_ator, auth.uid(), 'app');
    end if;

    -- FASE, no lugar de `status` (migração 20260909000060). `status` está
    -- congelado: auditá-lo agora seria vigiar uma coluna que ninguém escreve.
    if new.fase is distinct from old.fase then
      insert into gps.aluno_eventos
        (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
      values
        (v_aluno_id, now(), 'cliente_fase_mudou', 'cliente', new.id, v_rotulo,
         jsonb_build_object('de', old.fase, 'para', new.fase), v_ator, auth.uid(), 'app');
    end if;

    -- HONORÁRIOS (migração 20260909000092). É o número que sustenta a meta de
    -- R$ 150.000 do ambiente e quem o digita é o próprio aluno: precisa de
    -- trilha com o valor ANTERIOR, senão uma correção de 80.000 para 8.000 é
    -- indistinguível de um registro novo. `is distinct from` cobre os dois
    -- sentidos de NULL (registrar pela primeira vez e apagar o valor).
    -- `contrato_url` não entra aqui de propósito -- ver cabeçalho.
    if new.valor_honorarios is distinct from old.valor_honorarios then
      insert into gps.aluno_eventos
        (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
      values
        (v_aluno_id, now(), 'cliente_honorarios_definidos', 'cliente', new.id, v_rotulo,
         jsonb_build_object('de', old.valor_honorarios, 'para', new.valor_honorarios),
         v_ator, auth.uid(), 'app');
    end if;

    if new.mensagem_padrao_enviada is distinct from old.mensagem_padrao_enviada
       and new.mensagem_padrao_enviada then
      insert into gps.aluno_eventos
        (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, ator, ator_user_id, origem)
      values
        (v_aluno_id, now(), 'cliente_mensagem_padrao', 'cliente', new.id, v_rotulo, v_ator, auth.uid(), 'app');
    end if;

    if new.estudo_caso_enviado is distinct from old.estudo_caso_enviado
       and new.estudo_caso_enviado then
      insert into gps.aluno_eventos
        (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, ator, ator_user_id, origem)
      values
        (v_aluno_id, now(), 'cliente_estudo_caso', 'cliente', new.id, v_rotulo, v_ator, auth.uid(), 'app');
    end if;

    if new.ligacao_realizada is distinct from old.ligacao_realizada
       and new.ligacao_realizada then
      insert into gps.aluno_eventos
        (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, ator, ator_user_id, origem)
      values
        (v_aluno_id, now(), 'cliente_ligacao', 'cliente', new.id, v_rotulo, v_ator, auth.uid(), 'app');
    end if;

    if new.aderiu_reuniao is distinct from old.aderiu_reuniao
       and new.aderiu_reuniao then
      insert into gps.aluno_eventos
        (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, ator, ator_user_id, origem)
      values
        (v_aluno_id, now(), 'cliente_aderiu_reuniao', 'cliente', new.id, v_rotulo, v_ator, auth.uid(), 'app');
    end if;

    if new.data_reuniao_preliminar is distinct from old.data_reuniao_preliminar
       and new.data_reuniao_preliminar is not null then
      insert into gps.aluno_eventos
        (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
      values
        (v_aluno_id, now(), 'cliente_reuniao_agendada', 'cliente', new.id, v_rotulo,
         jsonb_build_object('data_reuniao_preliminar', new.data_reuniao_preliminar), v_ator, auth.uid(), 'app');
    end if;

    return new;
  exception when others then
    -- Rede de segurança: qualquer falha IMPREVISTA dentro do log nunca pode
    -- abortar a escrita do aluno na tabela de origem. Engole o erro e
    -- devolve a linha (new/old) que o TG_OP já determinou acima — se a
    -- exceção interrompeu antes de `return`, ainda temos NEW/OLD disponíveis
    -- (parâmetros implícitos da trigger, não variáveis locais que o erro
    -- possa ter deixado indefinidas).
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end;
end;
$$;

comment on function gps.aluno_eventos_capturar_etapa1_clientes() is
  'Trigger de captura do diario (Fase 2) em gps.etapa1_clientes. SECURITY DEFINER OBRIGATORIO: o aluno dispara esta trigger ao salvar a propria ficha (atualizarCliente/criarCliente/removerCliente) e nao tem grant em gps.aluno_eventos. Blindada com begin/exception when others: qualquer falha imprevista no log e engolida, a escrita do aluno na tabela de origem NUNCA e abortada por causa do log (migracao ...008) -- por isso o tipo novo TEM de entrar no CHECK antes de a trigger grava-lo, senao o 23514 morre aqui dentro em silencio. Desde a migracao ...060 audita `fase` (cliente_fase_mudou, detalhe {de,para}) e NAO mais `status`, que esta congelado. Desde a migracao ...092 audita `valor_honorarios` (cliente_honorarios_definidos, detalhe {de,para}) -- o numero que sustenta a meta de R$ 150.000 e que o proprio aluno digita. `contrato_url` NAO e auditado: link muda por manutencao de pasta. DELETE grava rotulo anonimizado (''Cliente removido''), decisao do Marcio. Campo livre (registro_contato, telefone, nome, perda_inercia, problemas, perfil_disc, ordem, contrato_url) nao audita.';
