-- `gps.admin_excluir_acesso` volta a apagar TUDO — e `acessos_log.acao`
-- ganha o valor da conversão de titular em sócio.
--
-- ═══════════════════════════════════════════════════════════════════════
-- POR QUE ESTA MIGRAÇÃO EXISTE
-- ═══════════════════════════════════════════════════════════════════════
-- O comentário da própria função diz, desde a ...217:
--
--   "REGRA DE MANUTENCAO: toda tabela nova em gps.* que guarde dado do aluno
--    entra na lista de deletes AQUI, no mesmo commit em que nasce -- ja foram
--    tres correcoes retroativas."
--
-- A regra foi escrita e não foi seguida. A lista de deletes está congelada em
-- 10/09/2026 e o schema andou: nasceram tabelas de chamado-solicitação,
-- liberação de etapa, reunião preliminar, resgate, onboarding, tutorial e
-- convite de sócio. Excluir um acesso hoje deixa linha de aluno para trás.
--
-- 🔑 Esta é a QUARTA correção retroativa da mesma lista. O padrão é claro:
--    lista de deletes escrita à mão envelhece em silêncio. Registro a
--    observação aqui, mas NÃO troco o mecanismo nesta migração — trocar
--    exclusão por FK `on delete cascade` em 24 tabelas é mudança estrutural
--    que merece plano próprio, não carona numa correção de chamado.
--
-- ⚠️ ATENÇÃO AO APLICAR — divergência repositório × produção
--    A versão desta função NO REPOSITÓRIO (...217) está DESATUALIZADA: ela
--    não grava retrato na lixeira. A versão EM PRODUÇÃO grava (`insert into
--    gps.lixeira_ambientes ... `) e exige confirmação nomeada (P0004); foi
--    aplicada fora do versionamento por volta de 11/09. Esta migração é
--    escrita sobre a versão DE PRODUÇÃO, preservando retrato e P0004.
--    🔴 Antes de aplicar, conferir `pg_get_functiondef` e garantir que o
--    corpo abaixo não perdeu nada do que está no ar.
--
-- 🔴 ASSINATURA CONFERIDA EM PRODUÇÃO (21/09): `(uuid, boolean default false)`.
--    Uma versão anterior deste arquivo declarava `text` — teria criado
--    SOBRECARGA em vez de substituir, deixando a tela na função velha, sem as
--    7 tabelas novas e sem erro nenhum. Não mexer no tipo.
--
-- ═══════════════════════════════════════════════════════════════════════
-- AS 5 PERGUNTAS
-- ═══════════════════════════════════════════════════════════════════════
-- ESCALA ....... Deletes por `aluno_id`/`ambiente_aluno_id`/`pessoa_aluno_id`,
--                todos com índice. O custo é por ambiente, não por base.
-- ÍNDICE ....... Cada delete filtra pela coluna de chave do ambiente. Em
--                tabela pequena (`etapa_liberacao_aluno`, `tutorial_reacoes`)
--                o Seq Scan é a escolha CERTA do planner — não é defeito.
-- FREQUÊNCIA ... Sob demanda do admin, raríssima.
-- REPETIÇÃO .... Uma chamada por ambiente.
-- REVERSÃO ..... O retrato na lixeira continua sendo a via de volta (e
--                `lixeira_ambientes` é justamente a tabela que NÃO se apaga).
--                Para reverter o CHECK: refazer com o array de 29 valores.

-- ═══════════════════════════════════════════════════════════════════════
-- 1) `acessos_log.acao` — acrescentar o valor novo
-- ═══════════════════════════════════════════════════════════════════════
-- 🔴 CHECK reescrito de memória APAGA VALOR EM SILÊNCIO. O array abaixo foi
-- copiado de `pg_get_constraintdef('acessos_log_acao_check')` medido em
-- 21/09/2026 — são 29 valores existentes + 2 novos = 31. Não redigitar de
-- cabeça: um valor perdido aqui derruba a gravação de trilha de outra feature
-- meses depois, e o erro aparece longe da causa.
--
-- 🔑 `titular_convertido_em_socio` é usado por
--    `gps.admin_converter_titular_em_socio` (...287). Sem este valor no CHECK,
--    aquela RPC falha no insert de trilha — e a migração ...287 precisa desta
--    aqui aplicada ANTES dela, ou junto.
--
-- 🔑 `onboarding_concluido_pela_equipe` é usado no Passo E (caso Jonas), para
--    registrar que a equipe encerrou um onboarding abandonado. Nasce aqui, e
--    não improvisado na hora, justamente para não reaproveitar um valor de
--    significado diferente (`socio_cadastro_preenchido`) só porque já existia.

alter table gps.acessos_log drop constraint if exists acessos_log_acao_check;

alter table gps.acessos_log add constraint acessos_log_acao_check
  check (acao = any (array[
    'senha_definida','acesso_excluido','socio_adicionado','membro_excluido',
    'ambiente_ambiguo','etapa_liberacao_alterada','progresso_reaberto',
    'membro_pessoa_vinculada','titular_trocado','membro_movido',
    'financeiro_vinculado','financeiro_desvinculado','favorito_confirmado',
    'favorito_liberado','acessos_criados_em_lote','socio_convidado',
    'socio_convite_aceito','socio_convite_revogado',
    'chamado_solicitacao_aprovada','chamado_solicitacao_declinada',
    'email_login_alterado','clientes_exportados','socio_cadastro_preenchido',
    'interruptor_alterado','reuniao_preliminar_cancelada','dossie_acessado',
    'operador_definido','clientes_restaurados','lixeira_expurgada',
    -- ── novos em 21/09/2026 ──
    'titular_convertido_em_socio',      -- usado por ...287
    'onboarding_concluido_pela_equipe'  -- usado no Passo E (caso Jonas)
  ]));

-- ═══════════════════════════════════════════════════════════════════════
-- 2) A lista de deletes que faltava
-- ═══════════════════════════════════════════════════════════════════════
-- DECISÃO TABELA A TABELA — o que entra, o que não entra, e por quê.
-- Critério: a linha é dado DO AMBIENTE que está sendo apagado? Entra.
-- É dado DA PESSOA, que sobrevive ao ambiente? Fica.
--
-- ENTRAM (dado do ambiente, ficariam órfãs):
--
--   chamado_solicitacoes (ambiente_aluno_id)
--     🔴 `ambiente_aluno_id` é DENORMALIZADA e NÃO é FK (ver DDL). Não há
--     cascade nenhum para socorrer: sem delete explícito a linha fica órfã
--     para sempre, e o índice único parcial `(ambiente_aluno_id, tipo) where
--     estado='pendente'` passa a bloquear uma solicitação futura de um
--     ambiente que nem existe mais.
--
--   etapa_liberacao_aluno (aluno_id)
--     Liberação/trava de etapa concedida PELA EQUIPE àquele ambiente. PK é
--     (aluno_id, etapa). Tem cascade de thb_alunos, mas `thb_alunos` NÃO é
--     apagada aqui (o cadastro do aluno sobrevive) — logo o cascade nunca
--     dispara e a linha fica.
--
--   reuniao_eventos (aluno_id)
--     Histórico de remarcação/cancelamento de reunião do ambiente. Mesmo
--     raciocínio: cascade é de thb_alunos, que não se apaga aqui.
--
--   reuniao_preliminar_propostas (aluno_id, cliente_id)
--     🔑 Tem `on delete cascade` de `gps.etapa1_clientes(id)`, e os clientes
--     SÃO apagados aqui — então na prática o cascade já limpa. O delete
--     explícito por `aluno_id` entra mesmo assim, e vai ANTES do delete de
--     clientes: `aluno_id` é coluna solta (`uuid not null`, sem FK), então
--     uma proposta cujo cliente já tenha sumido por outro caminho ficaria
--     órfã. Custa um delete em tabela pequena e fecha o buraco.
--
--   resgate_tentativas (aluno_id, user_id)
--     Tentativas de resgate de acesso daquele ambiente. `aluno_id` e
--     `user_id` são colunas soltas, sem FK e sem cascade.
--
--   socio_convites (ambiente_aluno_id)
--     Convites de sócio pendentes do ambiente. Índice único parcial por
--     `ambiente_aluno_id where status='pendente'` — mesmo problema do
--     chamado_solicitacoes.
--
--   onboarding_respostas (ambiente_aluno_id)  ⚠️ decisão explicada abaixo
--
-- NÃO ENTRAM:
--
--   🔴 lixeira_ambientes — É O RETRATO. Apagá-la aqui destruiria justamente
--      o backup que a exclusão acabou de gravar. Nunca entra nesta lista.
--
--   onboarding_anexos (pessoa_aluno_id)
--     NÃO precisa de delete próprio: tem `references
--     gps.onboarding_respostas(pessoa_aluno_id) on delete cascade`. Apagar a
--     resposta já leva os anexos. Um delete explícito seria redundante e, pior,
--     mascararia a dependência para quem ler a lista depois.
--     ⚠️ Os arquivos no bucket de Storage NÃO saem por aqui — banco não fala
--     com a Storage API. Viram órfãos, igual aos anexos de chamado (já
--     registrado no comentário da função desde a ...217).
--
--   tutorial_reacoes (pessoa_aluno_id)
--     🔑 FICA. É "achei este tutorial útil" — opinião DA PESSOA sobre um
--     vídeo do programa, não dado do ambiente. A pessoa continua existindo
--     (o cadastro em thb_alunos não é apagado) e pode voltar em outro
--     ambiente; apagar a reação dela seria destruir dado de produto sem
--     ninguém ter pedido. Não é órfã: aponta para `thb_alunos`, que fica.
--
-- ⚠️ DECISÃO DIFÍCIL — `onboarding_respostas`
--   A PK é `pessoa_aluno_id` (a PESSOA), e há também `ambiente_aluno_id` (o
--   ambiente onde ela respondeu, denormalizado de propósito). Pelo critério
--   "dado da pessoa fica", ela ficaria.
--   Entra assim mesmo, filtrando por `ambiente_aluno_id`, por três razões:
--     1. O retrato JÁ a fotografa — `admin_excluir_acesso` grava
--        `conteudo->'onboarding'` antes dos deletes. Não se perde nada.
--     2. A resposta contém dado de cliente/patrimônio declarado no ambiente
--        que está sendo apagado; mantê-la depois de "excluir o acesso" viola
--        a expectativa de quem clicou em excluir.
--     3. Filtrar por `ambiente_aluno_id` (e não por pessoa) é o que preserva
--        a resposta de quem respondeu em OUTRO ambiente — exatamente o caso
--        do Carlos, que responde no ambiente novo depois de convertido.
--   🔴 Efeito colateral aceito: o pop-up de onboarding volta a aparecer para
--      essa pessoa se ela entrar em ambiente novo. É o comportamento certo —
--      ela vai responder sobre o ambiente novo.

-- ═══════════════════════════════════════════════════════════════════════
-- 🔴 A ASSINATURA É `boolean`, IDÊNTICA À DE PRODUÇÃO — não mexer
-- ═══════════════════════════════════════════════════════════════════════
-- `create or replace` só SUBSTITUI quando a assinatura bate. Com um tipo
-- diferente ele CRIA SOBRECARGA: duas funções vivas, e o chamador antigo
-- (a tela, que passa boolean) continua na versão velha — sem as 7 tabelas
-- novas e SEM ERRO NENHUM. O sintoma apareceria semanas depois, como órfã
-- inexplicável, longe desta migração.
--
-- 📌 PROPOSTA REGISTRADA, FORA DESTA RODADA: trocar `p_confirmar_perda
--    boolean` por confirmação NOMEADA (`text`, o admin digita o nome do
--    ambiente), como já fazem `admin_converter_titular_em_socio` (...287) e a
--    lixeira. Um booleano é um clique; o nome digitado é um ato de conferir
--    QUAL ambiente está sendo apagado — e esta função apaga o ambiente
--    inteiro. Mas isso é MUDANÇA DE CONTRATO com o frontend e não pega
--    carona numa correção de chamado.

create or replace function gps.admin_excluir_acesso(
  p_aluno_id uuid,
  p_confirmar_perda boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid; v_email text; v_login_apagado boolean := false; v_outros uuid[];
  v_motivo text := null; v_nome text;
  v_conteudo jsonb; v_resumo jsonb; v_lixeira_id uuid;
  v_clientes int; v_progresso int; v_notas int; v_chamados int; v_eventos int;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  v_user := gps.admin_user_do_aluno(p_aluno_id);
  if v_user is not null then
    if gps.admin_alvo_e_equipe(v_user) then
      raise exception 'Esta conta é da equipe — não pode ser excluída por aqui.' using errcode = '42501';
    end if;
    if v_user = auth.uid() then
      raise exception 'Você não pode excluir o próprio acesso.' using errcode = '42501';
    end if;
    select email into v_email from auth.users where id = v_user;
  end if;

  select t.nome into v_nome from public.thb_alunos t where t.id = p_aluno_id;

  -- ── Contagens (nomes e ordem idênticos aos de produção) ────────────────
  select count(*) into v_clientes  from gps.etapa1_clientes c where c.aluno_id = p_aluno_id;
  select count(*) into v_progresso from gps.progresso p       where p.aluno_id = p_aluno_id;
  select count(*) into v_notas     from gps.aluno_notas n     where n.aluno_id = p_aluno_id;
  select count(*) into v_chamados  from gps.chamados ch       where ch.aluno_id = p_aluno_id;
  select count(*) into v_eventos   from gps.aluno_eventos e   where e.aluno_id = p_aluno_id;

  -- 🔴 FRASE PRESERVADA LITERALMENTE da versão em produção. `traduzirErroBanco`
  -- casa por igualdade EXATA (acento, pontuação, travessão): mudar uma vírgula
  -- aqui derruba a mensagem da tela para o texto genérico.
  if not p_confirmar_perda
     and (v_clientes > 0 or v_progresso > 0 or v_notas > 0 or v_chamados > 0) then
    raise exception 'Este ambiente tem conteúdo: % cliente(s), % tarefa(s), % nota(s), % chamado(s). Confirme a exclusão para prosseguir — o conteúdo vai para a lixeira, mas some do portal.',
      v_clientes, v_progresso, v_notas, v_chamados
      using errcode = 'P0004';
  end if;

  -- ── Retrato ANTES de qualquer delete ───────────────────────────────────
  v_conteudo := jsonb_build_object(
    'clientes',  coalesce((select jsonb_agg(to_jsonb(c)) from gps.etapa1_clientes c
                            where c.aluno_id = p_aluno_id), '[]'::jsonb),
    'progresso', coalesce((select jsonb_agg(to_jsonb(p)) from gps.progresso p
                            where p.aluno_id = p_aluno_id), '[]'::jsonb),
    'notas',     coalesce((select jsonb_agg(to_jsonb(n)) from gps.aluno_notas n
                            where n.aluno_id = p_aluno_id), '[]'::jsonb),
    'chamados',  coalesce((select jsonb_agg(to_jsonb(ch)) from gps.chamados ch
                            where ch.aluno_id = p_aluno_id), '[]'::jsonb),
    'membros',   coalesce((select jsonb_agg(to_jsonb(mm)) from gps.membros mm
                            where mm.aluno_id = p_aluno_id), '[]'::jsonb),
    'onboarding',coalesce((select jsonb_agg(to_jsonb(r)) from gps.onboarding_respostas r
                            join gps.membros m2 on m2.pessoa_aluno_id = r.pessoa_aluno_id
                           where m2.aluno_id = p_aluno_id), '[]'::jsonb));

  v_resumo := jsonb_build_object(
    'clientes', v_clientes, 'progresso', v_progresso, 'notas', v_notas,
    'chamados', v_chamados, 'eventos', v_eventos);

  insert into gps.lixeira_ambientes
    (aluno_id, email_alvo, nome_alvo, conteudo, resumo, excluido_por)
  values (p_aluno_id, v_email, v_nome, v_conteudo, v_resumo, auth.uid())
  returning id into v_lixeira_id;

  select array_agg(m.user_id) into v_outros
    from gps.membros m
   where m.aluno_id = p_aluno_id and m.user_id is not null
     and m.user_id <> coalesce(v_user, '00000000-0000-0000-0000-000000000000'::uuid)
     and not gps.admin_alvo_e_equipe(m.user_id) and m.user_id <> auth.uid();

  -- ── Os 13 deletes que já existiam ──────────────────────────────────────
  delete from gps.progresso              where aluno_id = p_aluno_id;
  delete from gps.tarefa_enfase          where aluno_id = p_aluno_id;
  delete from gps.reuniao_agendamentos   where aluno_id = p_aluno_id;
  delete from gps.etapa3_agendamentos    where aluno_id = p_aluno_id;
  delete from gps.etapa3_revisao         where aluno_id = p_aluno_id;

  -- ── Os que faltavam (ver justificativa tabela a tabela no cabeçalho) ───
  -- 🔑 ORDEM IMPORTA: `reuniao_preliminar_propostas` tem FK para
  -- `etapa1_clientes(id)`. Vai ANTES do delete de clientes — assim o delete é
  -- explícito e não depende do cascade disparar na ordem certa.
  delete from gps.reuniao_preliminar_propostas where aluno_id = p_aluno_id;
  delete from gps.reuniao_eventos              where aluno_id = p_aluno_id;
  delete from gps.etapa_liberacao_aluno        where aluno_id = p_aluno_id;
  delete from gps.chamado_solicitacoes         where ambiente_aluno_id = p_aluno_id;
  delete from gps.socio_convites               where ambiente_aluno_id = p_aluno_id;
  delete from gps.resgate_tentativas           where aluno_id = p_aluno_id;
  -- `onboarding_anexos` sai por cascade desta linha (FK on delete cascade):
  delete from gps.onboarding_respostas         where ambiente_aluno_id = p_aluno_id;

  delete from gps.etapa1_clientes        where aluno_id = p_aluno_id;
  delete from gps.agenda                 where aluno_id = p_aluno_id;
  delete from gps.aluno_notas            where aluno_id = p_aluno_id;
  delete from gps.aluno_eventos          where aluno_id = p_aluno_id;
  delete from gps.chamados               where aluno_id = p_aluno_id;
  delete from gps.membros                where aluno_id = p_aluno_id;
  delete from gps.ambientes              where aluno_id = p_aluno_id;
  delete from gps.solicitacoes_acesso    where aluno_id = p_aluno_id;

  -- 🔴 gps.lixeira_ambientes NÃO entra — é o retrato gravado acima.
  -- 🔑 gps.tutorial_reacoes NÃO entra — opinião da pessoa, não do ambiente.

  if v_outros is not null then
    delete from gps.solicitacoes_acesso where user_id = any(v_outros);
    begin
      delete from auth.users where id = any(v_outros);
    exception when foreign_key_violation then null;
    end;
  end if;

  if v_user is not null then
    delete from gps.solicitacoes_acesso where user_id = v_user;
    begin
      delete from auth.users where id = v_user;
      v_login_apagado := true;
    exception when foreign_key_violation then
      -- ...217: NÃO levantar. O login tem registros em outro portal do grupo e
      -- fica; o ambiente do GPS foi limpo de verdade (acima). A tela diz isso.
      v_login_apagado := false;
      v_motivo := 'A conta tem registros em outros sistemas do grupo; o login foi preservado e só os dados do programa foram apagados.';
    end;
  end if;

  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, detalhe, feito_por)
  values ('acesso_excluido', p_aluno_id, v_user, v_email,
          case when v_login_apagado then 'login e dados do GPS (inclui diário, log de ações e chamados)'
               else 'apenas dados do GPS (inclui diário, log de ações e chamados)'
                    || coalesce(' — ' || v_motivo, '') end,
          auth.uid());

  -- Chaves do retorno preservadas da versão em produção, inclusive
  -- `na_lixeira` — a tela a usa para dizer que dá para restaurar.
  return jsonb_build_object('login_apagado', v_login_apagado, 'email', v_email,
                            'login_preservado_motivo', v_motivo,
                            'na_lixeira', v_lixeira_id);
end $function$;

comment on function gps.admin_excluir_acesso(uuid, boolean) is
  'Exclui o ambiente do GPS e (quando possivel) o login do aluno. Grava RETRATO INTEGRAL em gps.lixeira_ambientes antes de qualquer delete e exige confirmacao nomeada (P0004) quando o ambiente tem conteudo. Desde a ...217, login com FK em outro sistema do grupo NAO aborta: fica preservado e o retorno traz login_preservado_motivo. ...288 (21/09/2026): a lista de deletes estava congelada em 10/09 e deixava orfas em 7 tabelas nascidas depois -- entraram reuniao_preliminar_propostas, reuniao_eventos, etapa_liberacao_aluno, chamado_solicitacoes(ambiente_aluno_id), socio_convites(ambiente_aluno_id), resgate_tentativas e onboarding_respostas(ambiente_aluno_id, que leva onboarding_anexos por cascade). 🔴 gps.lixeira_ambientes NUNCA entra (e o retrato). 🔑 gps.tutorial_reacoes NAO entra: e opiniao DA PESSOA sobre um video, nao dado do ambiente, e a pessoa sobrevive a exclusao. REGRA DE MANUTENCAO: toda tabela nova em gps.* que guarde dado do aluno entra na lista AQUI, no mesmo commit em que nasce -- esta ja e a QUARTA correcao retroativa (diario ...0002, eventos ...0005, chamados ...114, lista completa ...288); lista escrita a mao envelhece em silencio. Anexos nos buckets de Storage NAO sao apagados aqui (banco nao fala com a Storage API): viram orfaos e saem pelo expurgo.';

revoke execute on function gps.admin_excluir_acesso(uuid, boolean) from public, anon;
grant  execute on function gps.admin_excluir_acesso(uuid, boolean) to authenticated;
