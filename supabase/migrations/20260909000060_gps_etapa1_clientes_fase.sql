-- Cliente passa a ter FASE (prospeccao | fechamento | contratado), no lugar
-- dos 5 status. `status` NÃO SAI nesta migração -- é o que torna tudo
-- reversível sem restore de backup.
--
-- POR QUE NÃO É DE-PARA POR STATUS (levantamento de 08/09, 879 clientes,
-- medido pelo orquestrador no banco real):
--   pendente 833 (22 com evidência) | contatado 35 (5) | agendado 5 (4)
--   | realizada 5 (5) | recusou 1 (0)
-- VINTE E DUAS linhas em 'pendente' já têm data_reuniao_preliminar e/ou
-- aderiu_reuniao. O status atual já não descreve a realidade; um de-para por
-- status carimbaria essas 22 como prospecção. O backfill olha a EVIDÊNCIA.
--
-- DECISÕES (B4, sem resposta do Marcio -- caminho conservador e reversível):
--   'recusou'   -> prospeccao  (as 3 fases não têm lugar para recusa; mandar
--                  para fechamento seria PROMOVER quem disse não. A recusa
--                  continua legível em `status` durante a janela.)
--   'recusou' é avaliado ANTES da evidência: recusa explícita vale mais do
--                  que reunião marcada no passado. Hoje a única linha
--                  'recusou' não tem reunião -- a ordem não muda número
--                  nenhum, está definida para o futuro não ficar ambíguo.
--   evidência (aderiu_reuniao OU data_reuniao_preliminar is not null)
--               -> fechamento  (é o que pega as 22 'pendente' incoerentes)
--   status in ('agendado','realizada') -> fechamento
--                  AJUSTE do orquestrador sobre o plano original: 1 linha
--                  'agendado' NÃO tem data nem adesão registrada e, só pela
--                  evidência, cairia em 'prospeccao' -- rebaixando quem o
--                  próprio aluno marcou como agendado. Reunião realizada,
--                  pelo mesmo motivo, não é prospecção; e chamar de
--                  'contratado' afirmaria um contrato que nenhum dado prova.
--   resto       -> prospeccao (o default da coluna)
-- Cliente PODE voltar de fase: nenhuma catraca, nenhuma constraint de sentido
-- único. Pôr catraca depois é um `create trigger`; tirar catraca aplicada
-- errado exige adivinhar, sem histórico, para onde cada linha deveria voltar.
--
-- PROJEÇÃO MEDIDA ANTES DE ESCREVER (orquestrador, 08/09, banco real):
--   prospeccao 842 | fechamento 37 | contratado 0   (879 no total)
--   O UPDATE abaixo toca 37 linhas -- as únicas que saem do default.
--   NINGUÉM é promovido a 'contratado' por backfill: contrato é fato que só
--   a equipe pode afirmar, e nenhuma coluna de hoje o registra.
--
-- O QUE ESTA MIGRAÇÃO NÃO FAZ:
--   * não remove `status` nem o de-para -- a coluna fica CONGELADA (a
--     aplicação para de escrever nela na mesma entrega). Remoção em commit
--     separado, depois da janela de reversão;
--   * não cria índice em `fase` -- toda leitura é `where aluno_id = $1` e
--     devolve <= 30 linhas (já servida por etapa1_clientes_aluno_idx), e a
--     agregação do painel varre a tabela inteira de propósito. Índice em
--     `fase` seria peso morto de escrita;
--   * não põe catraca de sentido único entre as fases;
--   * não muda `agendados` do painel do admin -- isso é a migração ...061;
--   * NÃO gera evento no diário pelo backfill. O UPDATE não toca nenhum campo
--     da lista fechada da trigger de captura, e a trigger só passa a olhar
--     `fase` DEPOIS do UPDATE (ordem deliberada, ver bloco 3). `atualizado_em`
--     é bumpado pelo trg_etapa1_clientes_touch nas 37 linhas: conferido em
--     08/09 que nenhum código lê `atualizado_em` de cliente (`rg atualizado_em
--     src` -> só types.ts e data.ts:70, que é a tabela `membros`).
--
-- REVERSÃO (literal, nesta ordem):
--   1) alter table gps.etapa1_clientes drop column fase;
--      -- `status` fica intacto: nenhuma linha perde informação.
--   2) reaplicar o corpo INTEGRAL de
--      supabase/migrations/20260909000008_gps_aluno_eventos_triggers_a_prova_de_falha.sql
--      (o `create or replace function gps.aluno_eventos_capturar_etapa1_clientes()`
--      de lá volta o bloco de `status` no lugar do de `fase`);
--   3) opcional -- `alter table gps.aluno_eventos drop constraint
--      aluno_eventos_tipo_check;` e recriar sem 'cliente_fase_mudou'. Só é
--      possível se nenhuma linha desse tipo tiver sido gravada; manter o tipo
--      permitido é inofensivo e é o caminho recomendado.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) A coluna
-- ─────────────────────────────────────────────────────────────────────────
alter table gps.etapa1_clientes
  add column fase text not null default 'prospeccao'
  constraint chk_etapa1_clientes_fase
    check (fase in ('prospeccao', 'fechamento', 'contratado'));

comment on column gps.etapa1_clientes.fase is
  'Fase de negocio do cliente: prospeccao | fechamento (a reuniao preliminar e o croqui entram aqui) | contratado. Substitui `status` na UI a partir de 09/2026. Backfill por EVIDENCIA (aderiu_reuniao/data_reuniao_preliminar) e nao de-para por status -- 22 linhas em "pendente" ja tinham reuniao em 08/09. Cliente pode voltar de fase: nao ha catraca. Mudanca de fase e auditada no diario como cliente_fase_mudou (gps.aluno_eventos_capturar_etapa1_clientes).';

comment on column gps.etapa1_clientes.status is
  'DEPRECADO desde 09/2026, substituido por `fase`. Mantido CONGELADO -- nenhum caminho de escrita da aplicacao toca nesta coluna (PatchCliente perdeu o campo em src/app/etapa-1/actions.ts) -- durante a janela de reversao: e o que permite `drop column fase` restaurar o estado anterior sem restore de backup. Unico consumidor restante e o marcador "Recusou" na UI. Remover em commit separado.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2) O backfill -- ANTES de a trigger passar a olhar `fase`
--
-- `status is distinct from 'recusou'` (e nao `<>`) para que uma eventual
-- linha com status nulo no futuro nao seja silenciosamente excluida do
-- backfill: com `<>`, NULL <> 'recusou' e NULL e a linha nao entraria mesmo
-- tendo evidencia. Hoje nao ha status nulo (833+35+5+5+1 = 879 = total).
--
-- Toca so as linhas que saem do default: 37 de 879. A trigger de captura roda
-- por linha, entao UPDATE estreito tambem e UPDATE barato.
-- ─────────────────────────────────────────────────────────────────────────
update gps.etapa1_clientes
   set fase = case
                when status = 'recusou' then 'prospeccao'
                when aderiu_reuniao
                  or data_reuniao_preliminar is not null then 'fechamento'
                when status in ('agendado', 'realizada') then 'fechamento'
                else 'prospeccao'
              end
 where status is distinct from 'recusou'
   and (aderiu_reuniao
        or data_reuniao_preliminar is not null
        or status in ('agendado', 'realizada'));

-- ─────────────────────────────────────────────────────────────────────────
-- 3) O diário volta a enxergar a progressão do cliente
--
-- A trigger de captura gravava `cliente_status_mudou` quando `status` mudava.
-- Com `status` congelado, o Diário do aluno ficaria CEGO para a progressão de
-- cliente -- o evento mais informativo da Etapa 01 -- e ninguém notaria,
-- porque a ausência de evento não gera erro.
--
-- Este bloco vem DEPOIS do UPDATE de propósito: se a trigger já estivesse
-- olhando `fase`, o backfill teria gravado 37 eventos falsos de "mudou a
-- fase" datados de hoje, poluindo a trilha de 15 ambientes com uma ação que
-- aluno nenhum praticou. `gps.aluno_eventos` tem 1.443 linhas antes desta
-- migração e tem de continuar com 1.443 depois.
--
-- `cliente_status_mudou` PERMANECE na lista de tipos permitidos: as linhas
-- históricas já gravadas continuam válidas e legíveis.
-- ─────────────────────────────────────────────────────────────────────────

-- O CHECK de `tipo` nasceu inline e sem nome em 20260909000001 (o Postgres o
-- batizou automaticamente). Descobrir o nome real em vez de adivinhar
-- `aluno_eventos_tipo_check`: se o palpite estivesse errado, um `drop ... if
-- exists` seria um no-op silencioso, o CHECK antigo continuaria valendo e o
-- INSERT de 'cliente_fase_mudou' passaria a falhar DENTRO da trigger -- que
-- engole exceção por design (migração ...008). O evento sumiria sem barulho.
-- Por isso: acha, ou aborta a migração inteira.
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
     and pg_get_constraintdef(con.oid) like '%cliente_status_mudou%';

  if v_nome is null then
    raise exception
      'CHECK de gps.aluno_eventos.tipo nao encontrado -- migracao abortada para nao deixar a trigger gravando um tipo que a constraint rejeita em silencio';
  end if;

  execute format('alter table gps.aluno_eventos drop constraint %I', v_nome);
end;
$$;

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
    'tarefa_concluida',
    'tarefa_reaberta',
    'conta_criada',
    'email_confirmado',
    'primeiro_acesso',
    'entrou_no_programa'
  ));

comment on constraint aluno_eventos_tipo_check on gps.aluno_eventos is
  'Catalogo fechado de tipos de evento do diario. Espelha TIPOS_EVENTO em src/lib/types.ts -- acrescentar tipo aqui SEM acrescentar la deixa o rotulo da trilha sem traducao. cliente_status_mudou fica permitido para as linhas HISTORICAS: a captura ao vivo passou a gravar cliente_fase_mudou na migracao 20260909000060.';

-- Corpo VIGENTE (20260909000008), com UMA troca: o bloco de `status` vira o
-- bloco de `fase`, emitindo 'cliente_fase_mudou'. Todo o resto -- inclusive a
-- rede de segurança `begin/exception when others`, que é a razão de existir
-- da ...008 -- é idêntico.
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
    -- perfil_disc, ordem) NÃO audita — decisão do Marcio. `nome` muda o
    -- RÓTULO dos eventos futuros mas não é ele próprio um evento.

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
  'Trigger de captura do diario (Fase 2) em gps.etapa1_clientes. SECURITY DEFINER OBRIGATORIO: o aluno dispara esta trigger ao salvar a propria ficha (atualizarCliente/criarCliente/removerCliente) e nao tem grant em gps.aluno_eventos. Blindada com begin/exception when others: qualquer falha imprevista no log e engolida, a escrita do aluno na tabela de origem NUNCA e abortada por causa do log (migracao ...008). Desde a migracao ...060 audita `fase` (cliente_fase_mudou, detalhe {de,para}) e NAO mais `status`, que esta congelado -- auditar coluna que ninguem escreve seria evento morto. DELETE grava rotulo anonimizado (''Cliente removido''), decisao do Marcio. Campo livre (registro_contato, telefone, nome, perda_inercia, problemas, perfil_disc, ordem) nao audita.';
