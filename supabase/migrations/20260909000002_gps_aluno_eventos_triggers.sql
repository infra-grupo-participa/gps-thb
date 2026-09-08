-- Diário do aluno — Fase 2: triggers de captura em gps.etapa1_clientes e
-- gps.progresso. NÃO em gps.tarefa_enfase (ajuste de EXIBIÇÃO do admin, não
-- ação do aluno) nem em gps.reuniao_* (órfãs, proibidas).
--
-- ⚠️ SECURITY DEFINER É OBRIGATÓRIO NAS DUAS. Quem dispara a trigger na
-- imensa maioria das vezes é o próprio ALUNO salvando a ficha do cliente
-- (`atualizarCliente`, `criarCliente`, `removerCliente`, `marcarTarefa`) e o
-- aluno NÃO tem grant nenhum em gps.aluno_eventos (só `authenticated` tem
-- SELECT — ver migração ...01, e nem isso ajudaria: precisa de INSERT). Se a
-- trigger fosse invoker-rights, o aluno tomaria "permission denied" ao
-- salvar a PRÓPRIA ficha — derrubaria a funcionalidade que a Etapa 01 inteira
-- depende. `security definer` roda a trigger como o DONO da função (owner do
-- schema), contornando a ausência de grant do aluno sem abrir grant nenhum.
--
-- ⚠️ Estas duas triggers entram no caminho de escrita que o ALUNO percorre
-- toda vez que mexe na ficha de um cliente ou marca uma tarefa. Por isso:
--   - NUNCA lançam exceção (erro aqui = o aluno não consegue salvar a ficha);
--   - só tocam a tabela de log (não consultam outra tabela desnecessária —
--     cada consulta extra é mais latência no caminho de escrita do aluno);
--   - só gravam quando algo da LISTA FECHADA de colunas relevantes mudou —
--     comparado com IS DISTINCT FROM, nunca `<>` (NULL <> false é NULL, e um
--     `if` que dependesse disso perderia o evento em silêncio quando um dos
--     dois lados for NULL, caso comum em `perda_inercia`/`aderiu_reuniao`
--     no primeiro preenchimento).
--
-- Reversão: `drop trigger trg_aluno_eventos_etapa1_clientes on gps.etapa1_clientes;`
-- `drop trigger trg_aluno_eventos_progresso on gps.progresso;`
-- `drop function gps.aluno_eventos_capturar_etapa1_clientes();`
-- `drop function gps.aluno_eventos_capturar_progresso();`

-- ─────────────────────────────────────────────────────────────────────────
-- gps.etapa1_clientes
-- ─────────────────────────────────────────────────────────────────────────
create function gps.aluno_eventos_capturar_etapa1_clientes()
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
end;
$$;

comment on function gps.aluno_eventos_capturar_etapa1_clientes() is
  'Trigger de captura do diário (Fase 2) em gps.etapa1_clientes. SECURITY DEFINER OBRIGATÓRIO: o aluno dispara esta trigger ao salvar a própria ficha (atualizarCliente/criarCliente/removerCliente) e não tem grant em gps.aluno_eventos. Nunca lança exceção — erro aqui derrubaria o salvamento do aluno. DELETE grava rótulo anonimizado (''Cliente removido''), decisão do Marcio. Campo livre (registro_contato, telefone, nome, perda_inercia, problemas, perfil_disc, ordem) não audita.';

create trigger trg_aluno_eventos_etapa1_clientes
  after insert or update or delete on gps.etapa1_clientes
  for each row execute function gps.aluno_eventos_capturar_etapa1_clientes();

-- ─────────────────────────────────────────────────────────────────────────
-- gps.progresso — tarefa concluída/reaberta.
-- ─────────────────────────────────────────────────────────────────────────
create function gps.aluno_eventos_capturar_progresso()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator text;
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
end;
$$;

comment on function gps.aluno_eventos_capturar_progresso() is
  'Trigger de captura do diário (Fase 2) em gps.progresso. SECURITY DEFINER OBRIGATÓRIO (mesmo motivo de aluno_eventos_capturar_etapa1_clientes): marcarTarefa é chamada pelo aluno. Cobre INSERT com concluida=true (upsert direto para concluído, sem UPDATE prévio) e UPDATE de concluida via IS DISTINCT FROM.';

create trigger trg_aluno_eventos_progresso
  after insert or update or delete on gps.progresso
  for each row execute function gps.aluno_eventos_capturar_progresso();
