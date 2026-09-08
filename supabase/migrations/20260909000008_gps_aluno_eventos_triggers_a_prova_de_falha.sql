-- Diário do aluno — Fase 2: torna as triggers de captura REALMENTE à prova
-- de falha, como o comentário da migração ...02 já afirmava.
--
-- Achado do `fable-orchestrator`: a migração ...02 documenta "NUNCA lançam
-- exceção" (linha ~17), mas o corpo das duas funções não tem bloco
-- `EXCEPTION` nenhum — é uma intenção de design, não uma garantia
-- estrutural. Estas triggers rodam `after insert or update or delete` em
-- `gps.etapa1_clientes`/`gps.progresso`, no caminho de escrita que o ALUNO
-- percorre toda vez que salva a ficha de um cliente ou marca uma tarefa
-- (`atualizarCliente`, `criarCliente`, `removerCliente`, `marcarTarefa`).
-- Qualquer falha IMPREVISTA dentro do INSERT em `gps.aluno_eventos` (uma
-- constraint futura, um índice corrompido, um deadlock pontual — não
-- precisa ser um bug conhecido) propagaria e abortaria a TRANSAÇÃO INTEIRA:
-- o aluno tomaria erro ao salvar a própria ficha por causa de uma falha no
-- LOG, que é subproduto, não a operação principal.
--
-- Correção: envolve o CORPO INTEIRO das duas funções em
-- `begin ... exception when others then null; end;` — qualquer exceção
-- dentro do bloco (em qualquer um dos vários `insert into
-- gps.aluno_eventos` espalhados pela função, não só o primeiro) é engolida
-- e a função retorna normalmente (`new`/`old`, conforme `tg_op`), deixando
-- a operação na tabela de origem seguir intacta. O log perde aquele evento
-- silenciosamente — pior caso é uma lacuna na trilha do diário, nunca um
-- aluno impedido de usar o produto. `create or replace function`: mesma
-- assinatura, mesmo comportamento observável em caminho de sucesso, só
-- ganha a rede de segurança.
--
-- Por que não fazer isso ANTES (migração ...02) já com o EXCEPTION: fora do
-- escopo desta correção original, e adicionar tratamento de erro "porque
-- sim" sem o comentário estar provado errado seria código defensivo sem
-- necessidade demonstrada. Agora está demonstrado: o comentário da própria
-- migração promete algo que o código não garante.
--
-- Reversão: reaplicar o `create or replace function` de cada uma com o
-- corpo original da migração ...02 (sem o `begin/exception` externo) — o
-- texto integral está lá, versionado.

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

    if new.status is distinct from old.status then
      insert into gps.aluno_eventos
        (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
      values
        (v_aluno_id, now(), 'cliente_status_mudou', 'cliente', new.id, v_rotulo,
         jsonb_build_object('de', old.status, 'para', new.status), v_ator, auth.uid(), 'app');
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
  'Trigger de captura do diário (Fase 2) em gps.etapa1_clientes. SECURITY DEFINER OBRIGATÓRIO: o aluno dispara esta trigger ao salvar a própria ficha (atualizarCliente/criarCliente/removerCliente) e não tem grant em gps.aluno_eventos. Blindada com begin/exception when others: qualquer falha imprevista no log é engolida, a escrita do aluno na tabela de origem NUNCA é abortada por causa do log (migração ...008 — corrige o comentário desatualizado da ...002, que prometia isso sem o bloco EXCEPTION). DELETE grava rótulo anonimizado (''Cliente removido''), decisão do Marcio. Campo livre (registro_contato, telefone, nome, perda_inercia, problemas, perfil_disc, ordem) não audita.';

create or replace function gps.aluno_eventos_capturar_progresso()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator text;
begin
  begin
    v_ator := case when public.gp_is_admin() then 'equipe' else 'aluno' end;

    if tg_op = 'DELETE' then
      return old;
    end if;

    if tg_op = 'UPDATE' and new.concluida is distinct from old.concluida then
      insert into gps.aluno_eventos
        (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
      values
        (new.aluno_id, now(),
         case when new.concluida then 'tarefa_concluida' else 'tarefa_reaberta' end,
         'tarefa', new.id,
         format('Etapa %s, tarefa %s', new.etapa, new.tarefa),
         jsonb_build_object('etapa', new.etapa, 'tarefa', new.tarefa),
         v_ator, auth.uid(), 'app');
    elsif tg_op = 'INSERT' and new.concluida then
      -- marcarTarefa faz upsert: a primeira marcação de uma tarefa já concluída
      -- não passa pelo ramo UPDATE (não existia linha antes) — trata aqui.
      insert into gps.aluno_eventos
        (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
      values
        (new.aluno_id, now(), 'tarefa_concluida', 'tarefa', new.id,
         format('Etapa %s, tarefa %s', new.etapa, new.tarefa),
         jsonb_build_object('etapa', new.etapa, 'tarefa', new.tarefa),
         v_ator, auth.uid(), 'app');
    end if;

    return new;
  exception when others then
    -- Mesma rede de segurança da trigger de etapa1_clientes acima.
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end;
end;
$$;

comment on function gps.aluno_eventos_capturar_progresso() is
  'Trigger de captura do diário (Fase 2) em gps.progresso. SECURITY DEFINER OBRIGATÓRIO (mesmo motivo de aluno_eventos_capturar_etapa1_clientes). Blindada com begin/exception when others (migração ...008): falha imprevista no log nunca aborta marcarTarefa. Cobre INSERT com concluida=true (upsert direto para concluído, sem UPDATE prévio) e UPDATE de concluida via IS DISTINCT FROM.';
