-- ════════════════════════════════════════════════════════════════════════
-- O onboarding NÃO favorita mais o cliente 1 sozinho (14/09/2026)
-- ════════════════════════════════════════════════════════════════════════
--
-- Decisão do Marcio: *"pode ser então, ele nao favorita de cara"*.
--
-- O QUE ACONTECIA: `onboarding_concluir` cadastrava o cliente 1 e, se o
-- ambiente ainda não tivesse favorito, marcava a estrela nele
-- automaticamente. Como a estrela TRAVA depois de escolhida (migração ...215:
-- só a equipe destrava, via chamado), a pessoa ficava presa numa escolha que
-- não sabia ter feito.
--
-- MEDIDO em 14/09, antes de mexer:
--   · 4 chamados abertos em UMA noite (10/09), todos "trocar cliente
--     acompanhado", todos logo após o onboarding
--   · 13 dos 18 eventos `cliente_favoritado` do sistema aconteceram no mesmo
--     minuto do `onboarding_concluido` — 72% não foram escolha deliberada
--   · 34 ambientes com estrela, ZERO com `acompanhamento_confirmado_em`
--
-- A Vânia Claudie descreveu com precisão: *"ao salvar ele já apareceu como
-- favorito"*. O log confirma: `onboarding_concluido`, `cliente_cadastrado` e
-- `cliente_favoritado` no MESMO MINUTO (10/09 21:49). Ela não clicou.
--
-- 🔑 O cliente 1 CONTINUA sendo cadastrado (nome, telefone, grau de relação,
-- fase, honorários). O que sai é só a estrela.
--
-- ⚠️ NADA RETROAGE: os 34 que já têm estrela continuam com ela.
--
-- O retorno mantém a chave `favoritado` (agora sempre `false`) — o front lê,
-- e mudar o contrato seria custo sem ganho. A mensagem final do onboarding
-- foi ajustada no mesmo commit: dizia "A equipe já acompanha outro cliente
-- neste ambiente", o que virou mentira para todo mundo.
--
-- Provado em rollback: cliente cadastrado com nome/telefone/grau/fase e
-- `acompanhado_equipe = false`.
-- Corpo conferido contra pg_get_functiondef APÓS aplicar (fonte: o banco).

create or replace function gps.onboarding_concluir()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_pessoa uuid; v_ambiente uuid; v_r gps.onboarding_respostas%rowtype; v_fase_cli text; v_ordem integer; v_cliente uuid; v_favoritado boolean := false;
begin
  v_pessoa := gps.pessoa_atual();
  if v_pessoa is null then raise exception 'Seu cadastro ainda não está vinculado ao programa. Fale com a equipe.' using errcode = '42501'; end if;
  v_ambiente := gps.aluno_atual();
  if v_ambiente is null then raise exception 'Este cadastro não tem ambiente no programa.' using errcode = '42501'; end if;
  select * into v_r from gps.onboarding_respostas r where r.pessoa_aluno_id = v_pessoa for update;
  if not found then raise exception 'Responda o questionário antes de concluir.' using errcode = '22023'; end if;
  if v_r.concluido_em is not null then raise exception 'Você já concluiu o questionário inicial.' using errcode = '22023'; end if;
  if v_r.origem_cliente1 is null then raise exception 'Escolha de onde virá o seu cliente 1.' using errcode = '22023'; end if;

  if v_r.origem_cliente1 = 'ja_tenho' then
    if v_r.fase_cliente1 is null then raise exception 'Informe em que fase você está com este cliente.' using errcode = '22023'; end if;
    if coalesce(btrim(v_r.cliente_nome), '') = '' then raise exception 'Informe o nome do seu cliente 1.' using errcode = '22023'; end if;
    -- Nome E WhatsApp obrigatórios (decisão do Marcio, 10/09/2026): sem o
    -- contato a equipe não consegue trabalhar o lead.
    if coalesce(btrim(v_r.cliente_telefone), '') = '' then raise exception 'Informe o número de WhatsApp do seu cliente 1.' using errcode = '22023'; end if;
    if coalesce(btrim(v_r.cliente_grau_relacao), '') = '' then raise exception 'Escolha o grau de relação com este cliente.' using errcode = '22023'; end if;
    if v_r.honorarios_pactuados is true and v_r.valor_honorarios is null then
      raise exception 'Informe o valor dos honorários pactuados.' using errcode = '22023';
    end if;
    v_fase_cli := case v_r.fase_cliente1
                    when 'agendado' then 'prospeccao'
                    when 'viabilidade_feita' then 'fechamento'
                    when 'croqui_apresentado' then 'fechamento'
                    when 'execucao_andamento' then 'contratado' end;
    select coalesce(max(c.ordem), 0) + 1 into v_ordem from gps.etapa1_clientes c where c.aluno_id = v_ambiente;
    insert into gps.etapa1_clientes (aluno_id, nome, telefone, grau_relacao, fase, valor_honorarios, ordem)
    values (v_ambiente, btrim(v_r.cliente_nome), v_r.cliente_telefone, v_r.cliente_grau_relacao, v_fase_cli, v_r.valor_honorarios, v_ordem)
    returning id into v_cliente;

    -- 🔴 AQUI FICAVA O `update ... set acompanhado_equipe = true` (removido em
    -- 14/09/2026). A estrela TRAVA (migração ...215), e marcá-la por conta do
    -- aluno prendia gente numa escolha que ela não fez. `v_favoritado` fica
    -- `false` e o aluno escolhe depois, na aba Clientes, com o aviso da tela.
    -- NÃO REINTRODUZIR sem decisão explícita do Marcio.
  end if;

  update gps.onboarding_respostas set concluido_em = now(), cliente_id = v_cliente, passo_atual = 6 where pessoa_aluno_id = v_pessoa;
  insert into gps.aluno_eventos (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
  values (v_ambiente, now(), 'onboarding_concluido', 'onboarding', null, 'Concluiu o questionário inicial',
          jsonb_build_object('pessoa_aluno_id', v_pessoa, 'origem_cliente1', v_r.origem_cliente1, 'fase_cliente1', v_r.fase_cliente1, 'cliente_id', v_cliente, 'favoritado', v_favoritado, 'pais', v_r.cliente_pais),
          'aluno', auth.uid(), 'app');
  return jsonb_build_object('cliente_id', v_cliente, 'favoritado', v_favoritado);
end $function$;

