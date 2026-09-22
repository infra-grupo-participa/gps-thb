-- ═══════════════════════════════════════════════════════════════════════════
-- Evolução da Agenda de Sessões — FATIA C: concluir a sessão e o resumo.
--
-- PRD: docs/specs/2026-09-23-sessoes-disc-link-resumo-PRD.md
--      (§3 fatia C · §4 P4 · §6.5 · §7 o que não se toca)
--
-- Entrega DUAS funções, e só elas:
--   gps.sessao_concluir(uuid, text)        → agendado  → realizado (+ resumo)
--   gps.sessao_resumo_editar(uuid, text)   → corrige resumo de sessão realizada
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 ESTA MIGRAÇÃO ENTRA POR CIMA DE ESTRUTURA VIVA
-- ═══════════════════════════════════════════════════════════════════════════
-- Em produção neste momento (23/09/2026): as 5 tabelas e as 14 funções das
-- …291/…292/…293, o cron `sessao-emails` (*/5) e a fatia A (…294), que já
-- criou `resumo`, `resumo_em`, `resumo_por`, `link_definido_por`, `link_em`
-- em `gps.sessao_agendamentos` e os 5 campos do DISC rico em
-- `gps.etapa1_clientes`. Consequências que governam TODO este arquivo:
--
--   · NENHUM `alter table`. Esta fatia não cria, não altera e não dropa
--     coluna, CHECK, índice, trigger, policy ou grant de tabela. Só duas
--     funções novas. Se este arquivo contiver um `alter table`, algo saiu do
--     escopo e deve ser recusado na revisão.
--   · Os dois CHECKs do resumo (`chk_sessao_agend_resumo_tamanho` e
--     `chk_sessao_agend_resumo_so_realizado`) JÁ EXISTEM e NÃO são tocados.
--     A prova P0 os lê com `pg_get_constraintdef` para confirmar que
--     continuam byte a byte como a …294 os deixou — CHECK reescrito de
--     memória apaga valor em silêncio, e a falha só aparece meses depois.
--   · `acessos_log_acao_check` NÃO é tocado. As duas funções gravam em
--     `gps.sessao_eventos`, cuja coluna `acao` é TEXTO LIVRE 3..60 por
--     decisão explícita da …291 ("acrescentar uma ação nova viraria
--     migration"). Nenhum valor novo de catálogo é necessário aqui, e
--     reescrever aquele CHECK para nada é justamente o risco que a …292
--     documenta.
--   · Havia **0 sessões** na tabela em 23/09. Nenhum backfill, nenhum
--     UPDATE de dado existente.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 REVERSÃO — o caminho de volta, NESTA ORDEM
-- ═══════════════════════════════════════════════════════════════════════════
-- As duas funções são NOVAS (não há versão anterior a restaurar), nada
-- depende delas no banco, e a tela que as chama é de outra fatia. Dropá-las
-- devolve o sistema ao estado da …294 exatamente.
--
--   -- 1) Tirar o acesso antes de dropar (se a tela ainda estiver no ar, o
--   --    revoke sozinho já desarma a feature sem derrubar transação nenhuma):
--   revoke execute on function gps.sessao_concluir(uuid, text)       from authenticated;
--   revoke execute on function gps.sessao_resumo_editar(uuid, text)  from authenticated;
--
--   -- 2) Dropar:
--   drop function if exists gps.sessao_concluir(uuid, text);
--   drop function if exists gps.sessao_resumo_editar(uuid, text);
--
-- ⚠️ O QUE A REVERSÃO **NÃO** DESFAZ, e é por isso que ela é segura:
--   · sessões já concluídas continuam `realizado`, com `resumo`/`resumo_em`/
--     `resumo_por` gravados. Isso é dado, não feature: apagá-lo seria perda
--     silenciosa. Sem as funções, ninguém conclui mais — nada quebra.
--   · 🔴 Reverter NÃO devolve a sessão a `agendado`. Uma sessão concluída
--     saiu do índice `sessao_aluno_tipo_viva` e o ambiente pode ter marcado
--     outra do mesmo tipo nesse meio-tempo; voltar o estado à força
--     levantaria 23505 ou criaria duas sessões vivas. Desfazer uma conclusão
--     é operação de dado, caso a caso, nunca varredura.
--   · Não existe "desconcluir" nesta fatia de propósito: `realizado` é um
--     fato sobre o mundo (a reunião aconteceu), não um estado de fluxo. Se
--     o Marcio quiser o desfazer, é feature nova, com guarda própria e
--     trilha própria.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 O ALUNO NÃO CONCLUI — dois motivos independentes, os dois bastam
-- ═══════════════════════════════════════════════════════════════════════════
-- (1) PRODUTO: quem diz que a reunião aconteceu é quem a conduziu. O resumo
--     é da EQUIPE (§4 P4 do PRD).
--
-- (2) 🔴 TÉCNICO, e é o que fecha a porta: `sessao_aluno_tipo_viva` (…291) é
--     índice único PARCIAL em `estado = 'agendado'`. Sair de `agendado`
--     LIBERA o ambiente para marcar outra sessão do mesmo tipo. Se o aluno
--     pudesse concluir, ele contornaria sozinho a trava de "uma sessão viva
--     por tipo" — bastaria concluir a própria sessão para marcar a seguinte,
--     sem a equipe saber. Com a conclusão na mão de quem conduz, quem libera
--     o slot é a própria equipe, que é o desenho de §6.5.
--
-- ⚠️ §6.5 do PRD registra que a liberação em si é INTENCIONAL (é assim que se
-- remarca) e que NÃO se trava nesta v2. Fica registrado para o dia em que a
-- fila apertar. Travar hoje seria resolver problema que a medição não mostrou.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 GUARDA: `coalesce(..., false)` em TODO ramo, na ENTRADA do corpo
-- ═══════════════════════════════════════════════════════════════════════════
-- Nulo em guarda LIBERA: `if null then raise` não dispara. O pentester
-- EXPLOROU e CONFIRMOU esse vazamento em 22/09 em `gps.sessao_pode_agendar`
-- (devolvia o uuid do cliente favoritado de QUALQUER ambiente) e o mesmo
-- defeito estava em `sessao_briefing_ler`. Estas funções são SECURITY DEFINER
-- com grant para `authenticated` e recebem o id do chamador — a RLS de
-- `gps.sessao_agendamentos` NÃO se aplica dentro delas. A guarda própria é a
-- única defesa.
--
-- ⚠️ A guarda aqui é cadeia `if/elsif/else` com `else raise` — a mesma forma
-- de `sessao_cancelar` e `sessao_marcar_falta`. O `else` final já captura o
-- NULL (um `elsif NULL` não entra). O `coalesce` continua em cada ramo porque
-- a regra desta feature é "toda comparação de guarda é coalesced": sem ele,
-- reordenar os ramos ou virar a cadeia num `if not (...)` reintroduz o
-- falha-aberta em silêncio, que é exatamente o achado ALTO de 22/09.
--
-- 🔴 Quem conclui: admin OU `responsavel_id = auth.uid()` (a doutora DONA da
-- sessão). NÃO `gps.eh_equipe()` — operador da esteira não conclui sessão de
-- doutora nenhuma, pelo mesmo recorte que `sessao_marcar_falta` usa.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 LGPD — o `detalhe` do evento NÃO leva o resumo
-- ═══════════════════════════════════════════════════════════════════════════
-- A trilha grava o TAMANHO em caracteres, nunca o texto. Mesma regra que
-- mantém `descricao_caso` e o `briefing_snapshot` fora da trilha, do CSV, do
-- Slack e do e-mail, e que o comentário da coluna `gps.sessao_eventos.detalhe`
-- (…291) escreve: "NUNCA gravar aqui o briefing nem trecho de
-- descricao_caso/observacoes. So identificadores e o delta".
--
-- `gps.sessao_eventos` é lida por 16 admins e pela doutora dona da sessão.
-- Copiar o resumo para lá criaria uma SEGUNDA cópia do texto, fora do grant
-- de coluna que a …294 desenhou justamente para mantê-lo restrito — e
-- `sessao_eventos` tem `grant select` de TABELA para `authenticated`
-- (…291 seção 6), com a policy filtrando LINHA, não coluna. Um resumo no
-- `detalhe` escaparia por ali.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 SEM ÍNDICE NOVO — e a razão, não a promessa
-- ═══════════════════════════════════════════════════════════════════════════
-- As duas funções buscam por `id` (chave primária) e nada mais. Não há
-- predicado novo, não há ordenação nova, não há varredura nova. O único
-- caminho de acesso é `Index Scan using sessao_agendamentos_pkey`, que já
-- existe desde a …291. Criar índice aqui seria escrita em todo agendamento
-- sem plano medido que a justifique (~/.claude/PROTOCOLO-SUSTENTABILIDADE.md).
-- A prova M1 mede o plano em vez de afirmá-lo.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ E-MAIL — conferido: concluir NÃO deixa gatilho órfão
-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência estática de `gps.sessao_disparar_emails` (…293, os 8 ramos do
-- `union all`), feita porque concluir muda o estado e a fila é montada por
-- estado + carimbo:
--
--   6 ramos exigem `estado = 'agendado'`  (agendou dra/aluno, 24h dra/aluno,
--                                          1h dra/aluno)
--   2 ramos exigem `estado = 'cancelado'` (cancel dra/aluno)
--   NENHUM ramo casa com `realizado`.
--
-- Logo, concluir uma sessão a RETIRA da fila — e não há gatilho órfão, por
-- DUAS razões que se somam:
--
--   · as janelas dos lembretes já fecham por TEMPO antes de a conclusão ser
--     possível: 24h exige `inicio_em > now() + 23h`, 1h exige
--     `inicio_em > now()`, e esta função SÓ conclui quando
--     `inicio_em <= now()`. Nenhuma sessão concluível ainda está em janela.
--   · e o filtro de estado fecha de novo, em redundância.
--
-- ⚠️ O único efeito real é BENIGNO e vale registrar: se a confirmação de
-- agendamento (janela de 24h desde `criado_em`) ainda não tiver saído quando
-- a sessão for concluída, ela deixa de sair. É o certo — "sua sessão foi
-- marcada" depois de a sessão ter acontecido seria mentira —, e só acontece
-- se o cron estiver parado ou a sessão tiver sido marcada para daqui a menos
-- de 5 minutos.
--
-- 🔴 NÃO existe e-mail de "sessão realizada" nem de "resumo registrado".
-- Avisar o aluno que houve resumo é da fatia H (tela), não de e-mail, e
-- `gps.sessao_disparar_emails` é de OUTRA FATIA — esta migração não a toca.
-- Se o Marcio quiser o aviso por e-mail, é carimbo novo + ramo novo naquela
-- função, com o mesmo par (carimbo, request_id) dos outros 8.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 O QUE ESTA MIGRAÇÃO NÃO TOCA (§7 do PRD, lista fechada)
-- ═══════════════════════════════════════════════════════════════════════════
-- `gps.reuniao_*`, `gps.agenda`, `gps.plantao_*`, `public.gp_is_admin()`,
-- `gps.sessao_disparar_emails`, `gps.sessao_pode_agendar`,
-- `gps.sessao_briefing_ler`, `gps.config_definir`, `gps.acessos_log` e
-- qualquer estrutura de tabela. Nenhum `create or replace` de função
-- existente: as duas funções abaixo NÃO existem hoje.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- 1) gps.sessao_concluir — agendado → realizado, com resumo opcional
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 O RESUMO É OPCIONAL NA CONCLUSÃO, de propósito e por três razões:
--
--   (a) O CHECK `chk_sessao_agend_resumo_so_realizado` diz "tem resumo =>
--       estado realizado", em UMA direção. O inverso NÃO é exigido: sessão
--       realizada sem resumo é estado legítimo, e a …294 documenta que exigir
--       os dois lados "travaria a conclusão, que é da fatia C" — é esta.
--   (b) A doutora sai de uma reunião de 2h30 e pode precisar marcar
--       "aconteceu" agora e escrever depois. Exigir 10 caracteres no mesmo
--       clique produz resumo-lixo ("reunião ok") para vencer o formulário,
--       que é pior que resumo nenhum: afirma que a equipe registrou o
--       desfecho.
--   (c) `gps.sessao_resumo_editar` existe exatamente para o "depois", e
--       aceita a PRIMEIRA escrita também (ver a seção 2).
--
-- 🔴 "Ainda não começou" compara contra `inicio_em`, NUNCA contra `data`
-- isolada: o servidor roda em UTC e `data` mentiria o prazo das 21h à
-- meia-noite. `inicio_em` é coluna GERADA exatamente para isto (…291).
--
-- ⚠️ Compara contra `inicio_em`, não contra `fim_em`: quem conduziu sabe se a
-- reunião aconteceu, e travar até o FIM do bloco impediria a doutora de
-- concluir uma sessão que terminou antes do previsto — recusa sem ganho.
-- O que a trava impede é o caso real: concluir uma sessão que ainda vai
-- acontecer, que é declarar fato futuro.
--
-- 🔴 VOLATILE (o padrão), NUNCA `stable`: esta função ESCREVE. `stable`
-- promete ao planner que a função não altera o banco, e o Postgres recusa o
-- INSERT em execução ("INSERT is not allowed in a non-volatile function") —
-- pego assim em `dossie_do_cliente` antes de aplicar, em 15/09.
create or replace function gps.sessao_concluir(
  p_agendamento_id uuid,
  p_resumo         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin  boolean := coalesce(public.gp_is_admin(), false);
  v_a      record;
  v_resumo text;
  v_quem   text;
begin
  if p_agendamento_id is null then
    raise exception 'sessao nao informada' using errcode = '22023';
  end if;

  -- 🔴 `for update`: sem o lock, dois cliques simultâneos (a doutora e o
  -- admin, ou dois toques no mesmo botão) passariam os dois pela checagem de
  -- estado e gravariam DOIS eventos `sessao_realizada` para uma conclusão só
  -- — e o segundo sobrescreveria o resumo do primeiro sem deixar rastro de
  -- que houve sobrescrita. Mesma técnica de `sessao_cancelar` e
  -- `sessao_marcar_falta`.
  select a.id, a.aluno_id, a.responsavel_id, a.cliente_id, a.tipo_id,
         a.estado, a.inicio_em, a.fim_em, a.resumo
    into v_a
    from gps.sessao_agendamentos a
   where a.id = p_agendamento_id
   for update;

  if v_a.id is null then
    raise exception 'Sessão não encontrada.' using errcode = 'P0002';
  end if;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 🔴 GUARDA — admin OU a doutora DONA. O ALUNO NUNCA.
  -- ═══════════════════════════════════════════════════════════════════════
  -- Ver o cabeçalho: sem `coalesce`, `auth.uid()` NULL (chamada sem JWT) faz
  -- `v_a.responsavel_id = auth.uid()` virar NULL e a cadeia falhar ABERTA.
  -- Não há ramo `aluno` aqui de propósito — é o que impede o contorno de
  -- `sessao_aluno_tipo_viva` descrito no cabeçalho.
  if coalesce(v_admin, false) then
    v_quem := 'admin';
  elsif coalesce(v_a.responsavel_id = auth.uid(), false) then
    v_quem := 'responsavel';
  else
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if v_a.estado <> 'agendado' then
    raise exception 'Esta sessão não está marcada — não há o que concluir.'
      using errcode = '22023';
  end if;

  -- 🔴 Só DEPOIS do horário de início, contra `inicio_em`. Ver o cabeçalho.
  if v_a.inicio_em > now() then
    raise exception 'Esta sessão ainda não começou. A conclusão só pode ser registrada depois do horário.'
      using errcode = '22023';
  end if;

  -- O resumo: nulo e vazio são a MESMA coisa aqui (não informado). O CHECK
  -- `chk_sessao_agend_resumo_tamanho` mede `btrim` — 10 espaços não são um
  -- resumo —, então normalizamos ANTES de gravar, para a mensagem de erro ser
  -- a nossa (em português) e não um 23514 cru vindo da constraint.
  v_resumo := nullif(btrim(coalesce(p_resumo, '')), '');

  if v_resumo is not null then
    if char_length(v_resumo) < 10 then
      raise exception 'O resumo precisa de ao menos 10 caracteres. Se preferir escrever depois, conclua sem resumo e registre em seguida.'
        using errcode = '22023';
    end if;
    if char_length(v_resumo) > 4000 then
      raise exception 'O resumo passa de 4000 caracteres.' using errcode = '22023';
    end if;
  end if;

  -- ⚠️ NÃO grava `cancelado_em`/`cancelado_motivo`: o CHECK
  -- `chk_sessao_agend_so_cancelado_tem_carimbo` (…291) exige que só o estado
  -- `cancelado` tenha carimbo — gravá-los aqui levantaria 23514.
  --
  -- ⚠️ `resumo_em`/`resumo_por` andam com o texto ou ficam os TRÊS nulos:
  -- `chk_sessao_agend_resumo_so_realizado` é tudo-ou-nada. Por isso o
  -- `case when v_resumo is null then null else now() end`, e não `now()`
  -- direto: carimbo sem texto seria afirmação de que alguém resumiu sem ter
  -- resumido, e a constraint recusa (23514) com uma mensagem que ninguém
  -- entende na tela.
  update gps.sessao_agendamentos
     set estado     = 'realizado',
         resumo     = v_resumo,
         resumo_em  = case when v_resumo is null then null else now() end,
         resumo_por = case when v_resumo is null then null else auth.uid() end
   where id = p_agendamento_id;

  -- 🔴 TRILHA SEM O TEXTO. `resumo_caracteres` é METADADO: diz que houve
  -- resumo e o tamanho, sem transportar dado pessoal de cliente de terceiro
  -- para uma tabela que 16 admins leem. Ver o cabeçalho (LGPD).
  insert into gps.sessao_eventos (agendamento_id, acao, ator_id, detalhe)
  values (p_agendamento_id, 'sessao_realizada', auth.uid(),
          jsonb_build_object(
            'por', v_quem,
            'de', 'agendado',
            'para', 'realizado',
            'com_resumo', (v_resumo is not null),
            'resumo_caracteres', coalesce(char_length(v_resumo), 0),
            'inicio_em', v_a.inicio_em));

  return jsonb_build_object(
    'agendamento_id', p_agendamento_id,
    'estado', 'realizado',
    'por', v_quem,
    'com_resumo', (v_resumo is not null),
    'resumo_caracteres', coalesce(char_length(v_resumo), 0));
end;
$function$;

comment on function gps.sessao_concluir(uuid, text) is
  'Conclui uma sessao (agendado -> realizado), com resumo OPCIONAL (PRD 23/09/2026, fatia C, pedido 8 do Marcio). Guarda: admin ou a doutora DONA (responsavel_id = auth.uid(), o mesmo recorte de sessao_marcar_falta) -- NUNCA o aluno, e nao eh_equipe(). 🔴 O aluno nao conclui por DOIS motivos independentes: quem diz que a reuniao aconteceu e quem conduziu; e sair de `agendado` libera o indice parcial sessao_aluno_tipo_viva (…291), entao o aluno que concluisse contornaria sozinho a trava de uma sessao viva por tipo. 🔴 So depois do horario, comparado contra inicio_em e NUNCA contra `data` isolada (servidor em UTC, o prazo mentiria das 21h a meia-noite). Resumo opcional de proposito: chk_sessao_agend_resumo_so_realizado exige "tem resumo => realizado" em UMA direcao, e realizado sem resumo e legitimo -- exigir texto no mesmo clique produziria resumo-lixo para vencer o formulario. 10..4000 caracteres quando informado, validado aqui em portugues antes de o CHECK levantar 23514. Os carimbos resumo_em/resumo_por andam com o texto ou ficam os tres nulos (tudo-ou-nada da constraint). 🔴 LGPD: o detalhe do evento leva o TAMANHO do resumo, nunca o texto -- gps.sessao_eventos tem grant de tabela para authenticated e a policy filtra LINHA, nao coluna. `for update`: dois cliques simultaneos gravariam dois eventos e um resumo sobrescreveria o outro sem rastro. VOLATILE de proposito -- `stable` faria o Postgres recusar o INSERT da trilha.';

-- 🔴 `revoke all` de `public` E `anon` ANTES do grant. Duas lições deste
-- projeto, as duas aplicadas:
--   (a) neste banco TODA função nova nasce executável por PUBLIC/anon;
--   (b) `revoke from anon` NÃO pega quando a permissão vem de `PUBLIC` —
--       por isso `public` é nomeado explicitamente, e primeiro.
-- A ordem importa: revogar DEPOIS do grant tiraria o acesso de quem deve tê-lo
-- se `authenticated` herdar de PUBLIC.
revoke all on function gps.sessao_concluir(uuid, text) from public, anon;
grant execute on function gps.sessao_concluir(uuid, text) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2) gps.sessao_resumo_editar — corrigir (ou escrever depois) o resumo
-- ═══════════════════════════════════════════════════════════════════════════
-- Mesma entidade, mesma guarda, evento próprio: `sessao_resumo_editado`.
--
-- 🔴 Aceita a PRIMEIRA escrita, não só a correção. É o par de
-- `sessao_concluir(id, null)`: a doutora conclui na saída da reunião e
-- escreve o resumo à noite. Exigir que só edite quem já escreveu deixaria a
-- sessão concluída sem resumo para sempre — feature com porta de entrada que
-- some, o padrão que este projeto já pagou 3 vezes.
--
-- 🔴 Só em sessão `realizado`, porque `chk_sessao_agend_resumo_so_realizado`
-- recusa resumo em qualquer outro estado (23514). Conferimos ANTES para a
-- mensagem ser em português — a constraint é a rede, não a porta.
--
-- ⚠️ NÃO permite APAGAR o resumo (texto vazio é recusado, não vira null). Um
-- resumo já gravado é registro do que a equipe apurou sobre uma reunião; o
-- caminho para "estava errado" é REESCREVER, que deixa evento na trilha, não
-- sumir, que não deixa nada. Se o Marcio quiser o apagar, é decisão dele e
-- vira ramo próprio, com evento próprio.
create or replace function gps.sessao_resumo_editar(
  p_agendamento_id uuid,
  p_resumo         text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin   boolean := coalesce(public.gp_is_admin(), false);
  v_a       record;
  v_resumo  text;
  v_quem    text;
  v_antes   int;
begin
  if p_agendamento_id is null then
    raise exception 'sessao nao informada' using errcode = '22023';
  end if;

  select a.id, a.aluno_id, a.responsavel_id, a.cliente_id,
         a.estado, a.inicio_em, a.resumo, a.resumo_em
    into v_a
    from gps.sessao_agendamentos a
   where a.id = p_agendamento_id
   for update;

  if v_a.id is null then
    raise exception 'Sessão não encontrada.' using errcode = 'P0002';
  end if;

  -- 🔴 MESMA guarda de `sessao_concluir`, pela mesma razão, com o mesmo
  -- `coalesce` em cada ramo. O aluno não entra: se ele não vê o texto
  -- (§4 P4, `resumo` está FORA do grant de coluna), não faz sentido que o
  -- escreva.
  if coalesce(v_admin, false) then
    v_quem := 'admin';
  elsif coalesce(v_a.responsavel_id = auth.uid(), false) then
    v_quem := 'responsavel';
  else
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if v_a.estado <> 'realizado' then
    raise exception 'O resumo só existe em sessão concluída. Conclua a sessão primeiro.'
      using errcode = '22023';
  end if;

  v_resumo := nullif(btrim(coalesce(p_resumo, '')), '');

  -- ⚠️ Vazio NÃO apaga. Ver o cabeçalho desta seção.
  if v_resumo is null then
    raise exception 'Escreva o resumo (ao menos 10 caracteres). Para corrigir, reescreva o texto — o resumo não pode ser apagado.'
      using errcode = '22023';
  end if;
  if char_length(v_resumo) < 10 then
    raise exception 'O resumo precisa de ao menos 10 caracteres.' using errcode = '22023';
  end if;
  if char_length(v_resumo) > 4000 then
    raise exception 'O resumo passa de 4000 caracteres.' using errcode = '22023';
  end if;

  -- Tamanho anterior, para o delta da trilha. 0 quando não havia resumo —
  -- é como a trilha distingue "escreveu depois" de "corrigiu".
  v_antes := coalesce(char_length(btrim(coalesce(v_a.resumo, ''))), 0);

  update gps.sessao_agendamentos
     set resumo     = v_resumo,
         resumo_em  = now(),
         resumo_por = auth.uid()
   where id = p_agendamento_id;

  -- 🔴 TRILHA SEM O TEXTO — nem o novo, nem o antigo. Só os tamanhos.
  -- Guardar o texto anterior "para poder comparar" seria criar a segunda
  -- cópia que o grant de coluna da …294 existe para impedir.
  insert into gps.sessao_eventos (agendamento_id, acao, ator_id, detalhe)
  values (p_agendamento_id, 'sessao_resumo_editado', auth.uid(),
          jsonb_build_object(
            'por', v_quem,
            'primeira_escrita', (v_antes = 0),
            'resumo_caracteres_antes', v_antes,
            'resumo_caracteres_depois', char_length(v_resumo),
            'inicio_em', v_a.inicio_em));

  return jsonb_build_object(
    'agendamento_id', p_agendamento_id,
    'estado', 'realizado',
    'por', v_quem,
    'primeira_escrita', (v_antes = 0),
    'resumo_caracteres', char_length(v_resumo));
end;
$function$;

comment on function gps.sessao_resumo_editar(uuid, text) is
  'Grava ou corrige o resumo de uma sessao JA CONCLUIDA (PRD 23/09/2026, fatia C). Mesma guarda de gps.sessao_concluir: admin ou a doutora DONA (responsavel_id = auth.uid()), nunca o aluno -- ele nao ve o texto (resumo esta FORA do grant de coluna, §4 P4), entao nao o escreve. 🔴 Aceita a PRIMEIRA escrita, nao so a correcao: e o par de sessao_concluir(id, null), para a doutora concluir na saida da reuniao e escrever a noite -- exigir escrita previa deixaria a sessao sem resumo para sempre. So em estado `realizado`, porque chk_sessao_agend_resumo_so_realizado recusa resumo em qualquer outro estado; conferido aqui antes para a mensagem sair em portugues. ⚠️ NAO apaga: texto vazio e RECUSADO, nao vira null -- o caminho para "estava errado" e reescrever (deixa evento na trilha), nao sumir (nao deixa nada). 🔴 LGPD: a trilha leva os tamanhos antes/depois, NUNCA o texto novo nem o antigo -- guardar o anterior criaria a segunda copia que o grant de coluna da …294 existe para impedir. `for update` contra escrita concorrente. VOLATILE de proposito.';

revoke all on function gps.sessao_resumo_editar(uuid, text) from public, anon;
grant execute on function gps.sessao_resumo_editar(uuid, text) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 🧪 ROTEIRO DE PROVA — para o Marcio rodar pelo MCP DEPOIS do apply
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ EU NÃO RODEI NADA DISTO. Não há `psql` nem Docker nesta máquina e eu não
-- busco credencial de produção. Tudo abaixo é conferência estática virada em
-- roteiro para quem TEM o acesso.
--
-- 🔴 NENHUM NÚMERO DE PLANO ESTÁ PRÉ-PREENCHIDO. Plano de `explain` previsto
-- de cabeça erra o TIPO de scan (18/09: previ `Index Scan`, era `Seq Scan`
-- numa tabela de 4 linhas), e colar plano fabricado como "expectativa"
-- contamina a leitura seguinte.
--
-- 🔴 `explain (analyze)` em UPDATE/DELETE **EXECUTA o comando**, e TODA
-- chamada das duas funções abaixo escreve (UPDATE + INSERT na trilha).
-- RODAR TUDO DENTRO DE `begin … rollback`. Nunca cru em produção.
--
-- ⚠️ Havia **0 sessões** em 23/09 — as provas P2..P7 precisam de UMA sessão
-- de teste, criada e revertida no mesmo bloco (P1 monta).
--
-- ── P0 — O QUE ESTA MIGRAÇÃO NÃO DEVIA TOCAR ─────────────────────────────
-- Leitura pura, pode rodar fora de transação.
--
--   -- (a) Os CHECKs de sessao_agendamentos: 7, e os 7 IDÊNTICOS aos de antes
--   --     do apply. Esta migração não tem um único `alter table`.
--   --     🔴 FILTRAR POR conname — esta tabela tem vários.
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'gps.sessao_agendamentos'::regclass and contype = 'c'
--    order by conname;
--   -- ESPERADO 7: chk_sessao_agend_cancelado_tem_motivo, _estado, _link,
--   --   _link_dono, _resumo_so_realizado, _resumo_tamanho,
--   --   _so_cancelado_tem_carimbo.
--   -- 🔴 Conferir em especial que chk_sessao_agend_resumo_tamanho continua
--   --   `btrim` com 10..4000 e que _resumo_so_realizado continua o
--   --   tudo-ou-nada com estado = 'realizado'. Se QUALQUER definição mudou,
--   --   reverter — esta fatia não altera constraint nenhuma.
--
--   -- (b) O catálogo da trilha administrativa NÃO foi tocado (as duas
--   --     funções gravam em sessao_eventos, não em acessos_log):
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'gps.acessos_log'::regclass
--      and conname  = 'acessos_log_acao_check';
--   -- 🔴 ESPERADO: os mesmos 32 valores de antes. NENHUM a menos.
--
--   -- (c) As funções da …292/…293 continuam existindo e em número:
--   select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'gps' and p.proname like 'sessao%';
--   -- ESPERADO: o número de antes + 2 (as duas desta fatia).
--
-- ── P1 — AS DUAS FUNÇÕES NASCERAM FECHADAS ───────────────────────────────
-- 🔴 A prova de segurança mais importante do arquivo. Neste projeto TODA
-- função nova nasce executável por PUBLIC/anon (ALTER DEFAULT PRIVILEGES do
-- schema gps), e `revoke from anon` não pega quando a permissão vem de
-- PUBLIC.
--
--   select p.proname, p.proacl
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'gps'
--      and p.proname in ('sessao_concluir','sessao_resumo_editar');
--   -- 🔴 ESPERADO: `authenticated=X/...` e `service_role=X/...` presentes;
--   --   NENHUMA entrada `=X/` sem role (essa é a de PUBLIC) e NENHUMA
--   --   `anon=X/`. Se aparecer `=X/postgres`, PUBLIC ainda executa → o
--   --   revoke não pegou e a feature está aberta.
--
--   -- Contraprova por papel, que é o que prova de fato (o proacl é o mapa;
--   -- isto é o território):
--   begin;
--     set local role anon;
--     select gps.sessao_concluir('00000000-0000-0000-0000-000000000000'::uuid, null);
--     -- 🔴 ESPERADO: ERROR 42501 permission denied for function sessao_concluir
--     --   (permissão de EXECUTE, antes de qualquer guarda do corpo)
--   rollback;
--
--   begin;
--     set local role anon;
--     select gps.sessao_resumo_editar('00000000-0000-0000-0000-000000000000'::uuid, 'texto qualquer aqui');
--     -- 🔴 ESPERADO: ERROR 42501 permission denied for function sessao_resumo_editar
--   rollback;
--
-- ── P2 — MONTAGEM da sessão de teste (base das provas seguintes) ─────────
-- 🔴 TUDO num único `begin … rollback`. Grava de verdade e desfaz.
--
--   begin;
--     -- Sessão JÁ COMEÇADA (ontem), para poder ser concluída. `inicio_em` e
--     -- `fim_em` são colunas GERADAS — não aceitam valor no insert.
--     insert into gps.sessao_agendamentos
--       (tipo_id, responsavel_id, aluno_id, cliente_id, data, hora_inicio, duracao_min)
--     select 1, d.responsavel_id, c.aluno_id, c.id, current_date - 1, time '09:30',
--            t.duracao_min
--       from gps.sessao_disponibilidade d
--       cross join lateral (select * from gps.etapa1_clientes limit 1) c
--       cross join (select duracao_min from gps.sessao_tipos where id = 1) t
--      limit 1
--     returning id, aluno_id, responsavel_id, inicio_em;
--     -- 🔴 ANOTAR o id devolvido: é o <SESSAO> das provas abaixo.
--     -- (seguir no MESMO bloco, sem rollback ainda)
--
-- ── P3 — 🔴 O ALUNO NÃO CONCLUI (tem de dar 42501) ───────────────────────
-- A prova que o PRD exige por escrito. `set local role authenticated` +
-- `request.jwt.claims` com o sub do MEMBRO do ambiente dono da sessão.
--
--     -- Descobrir o login de um membro do ambiente dono da sessão:
--     select m.user_id, u.email
--       from gps.membros m
--       join auth.users u on u.id = m.user_id
--      where m.aluno_id = (select aluno_id from gps.sessao_agendamentos
--                           where id = '<SESSAO>')
--      limit 1;
--
--     set local role authenticated;
--     set local request.jwt.claims = '{"sub":"<USER_ID_DO_ALUNO>","role":"authenticated"}';
--     select gps.sessao_concluir('<SESSAO>', 'A reuniao aconteceu e correu bem.');
--     -- 🔴 ESPERADO: ERROR 42501 "Sem permissão."
--     -- 🔴 SE DEVOLVER JSON, A FEATURE ESTÁ QUEBRADA: o aluno concluindo
--     --   contorna sozinho sessao_aluno_tipo_viva e marca outra sessão do
--     --   mesmo tipo. Reverter imediatamente.
--
--     -- E o resumo também não é dele:
--     select gps.sessao_resumo_editar('<SESSAO>', 'texto do aluno aqui');
--     -- 🔴 ESPERADO: ERROR 42501 "Sem permissão."
--     reset role;
--
-- ── P4 — 🔴 GUARDA SEM JWT (o vazamento de 22/09, contraprovado) ─────────
-- `authenticated` sem `sub`: `auth.uid()` é NULL. Sem o `coalesce`, a
-- comparação viraria NULL e a cadeia falharia ABERTA.
--
--     set local role authenticated;
--     set local request.jwt.claims = '{"role":"authenticated"}';
--     select gps.sessao_concluir('<SESSAO>', null);
--     -- 🔴 ESPERADO: ERROR 42501 "Sem permissão."
--     select gps.sessao_resumo_editar('<SESSAO>', 'texto qualquer com dez');
--     -- 🔴 ESPERADO: ERROR 42501 "Sem permissão."
--     reset role;
--
--     -- E uma doutora que NÃO é a responsável também não conclui
--     -- (só funciona se houver um login de equipe NÃO-admin; hoje as duas
--     -- doutoras são admin/dev em public.perfis, então este caso é teórico —
--     -- registrar o resultado como está, sem forçar):
--     -- set local request.jwt.claims = '{"sub":"<OUTRA_RESPONSAVEL>","role":"authenticated"}';
--     -- select gps.sessao_concluir('<SESSAO>', null);  -- ESPERADO 42501
--
-- ── P5 — 🔴 CONCLUIR ANTES DO HORÁRIO (tem de dar 22023) ─────────────────
-- Sessão no FUTURO. Como admin, para provar que a recusa é de TEMPO e não de
-- permissão.
--
--     insert into gps.sessao_agendamentos
--       (tipo_id, responsavel_id, aluno_id, cliente_id, data, hora_inicio, duracao_min)
--     select a.tipo_id, a.responsavel_id, a.aluno_id, a.cliente_id,
--            current_date + 30, time '14:00', a.duracao_min
--       from gps.sessao_agendamentos a where a.id = '<SESSAO>'
--     returning id;  -- <SESSAO_FUTURA>
--
--     select gps.sessao_concluir('<SESSAO_FUTURA>', null);
--     -- 🔴 ESPERADO: ERROR 22023 "Esta sessão ainda não começou. A conclusão
--     --   só pode ser registrada depois do horário."
--
--     -- 🔴 A PROVA DO UTC (a que `data` isolada reprovaria). Uma sessão de
--     --   HOJE às 23:00 ainda não começou, mesmo quando o servidor em UTC já
--     --   está no dia seguinte:
--     insert into gps.sessao_agendamentos
--       (tipo_id, responsavel_id, aluno_id, cliente_id, data, hora_inicio, duracao_min)
--     select a.tipo_id, a.responsavel_id, a.aluno_id, a.cliente_id,
--            current_date, time '23:00', a.duracao_min
--       from gps.sessao_agendamentos a where a.id = '<SESSAO>'
--     returning id, inicio_em;  -- <SESSAO_23H>
--     select gps.sessao_concluir('<SESSAO_23H>', null);
--     -- ESPERADO 22023 se `now()` ainda for anterior a 23:00 em
--     -- America/Sao_Paulo. Anotar `now()` e o `inicio_em` junto do resultado.
--
-- ── P6 — O CAMINHO FELIZ, e o que ele grava ──────────────────────────────
--     -- (como admin/postgres, no mesmo bloco)
--     select gps.sessao_concluir('<SESSAO>', 'Cliente compareceu; discutimos a estrutura e ficou de enviar as certidoes.');
--     -- ESPERADO: json com estado=realizado, com_resumo=true,
--     --   resumo_caracteres ≈ 76, por='admin'.
--
--     select estado, resumo_em is not null as tem_carimbo,
--            resumo_por is not null        as tem_autor,
--            char_length(resumo)           as tamanho
--       from gps.sessao_agendamentos where id = '<SESSAO>';
--     -- ESPERADO: realizado · true · true · o mesmo número.
--
--     -- 🔴 LGPD — A TRILHA NÃO PODE CONTER O TEXTO:
--     select acao, detalhe from gps.sessao_eventos
--      where agendamento_id = '<SESSAO>' order by id;
--     -- 🔴 ESPERADO em `sessao_realizada`: as chaves por, de, para,
--     --   com_resumo, resumo_caracteres, inicio_em — e NENHUM pedaço do
--     --   texto. Conferir literalmente:
--     select count(*) from gps.sessao_eventos
--      where agendamento_id = '<SESSAO>'
--        and detalhe::text ilike '%certidoes%';
--     -- 🔴 ESPERADO: 0. Qualquer número > 0 reprova a fatia.
--
--     -- Concluir de novo é recusado (idempotência por estado):
--     select gps.sessao_concluir('<SESSAO>', 'outro resumo qualquer aqui');
--     -- ESPERADO: ERROR 22023 "Esta sessão não está marcada — não há o que
--     --   concluir."
--
-- ── P7 — O RESUMO: limites, edição e o que NÃO se pode ───────────────────
--     -- (a) 9 caracteres recusados, 10 aceitos (o piso é NOSSO, em
--     --     português, antes de o CHECK levantar 23514):
--     select gps.sessao_resumo_editar('<SESSAO>', '123456789');
--     -- ESPERADO 22023 "O resumo precisa de ao menos 10 caracteres."
--     select gps.sessao_resumo_editar('<SESSAO>', '1234567890');
--     -- ESPERADO: json, primeira_escrita=false, resumo_caracteres=10.
--
--     -- (b) espaços não são resumo (o CHECK mede btrim):
--     select gps.sessao_resumo_editar('<SESSAO>', '              ');
--     -- ESPERADO 22023 "Escreva o resumo (ao menos 10 caracteres)…"
--
--     -- (c) 4001 caracteres recusados; 4000 aceitos:
--     select gps.sessao_resumo_editar('<SESSAO>', repeat('a', 4001));
--     -- ESPERADO 22023 "O resumo passa de 4000 caracteres."
--     select gps.sessao_resumo_editar('<SESSAO>', repeat('a', 4000));
--     -- ESPERADO: json com resumo_caracteres = 4000.
--
--     -- (d) 🔴 CONCLUIR SEM RESUMO e escrever DEPOIS (o par que a fatia C
--     --     existe para entregar). Usar <SESSAO_23H> já não serve (é futura);
--     --     criar outra sessão passada:
--     insert into gps.sessao_agendamentos
--       (tipo_id, responsavel_id, aluno_id, cliente_id, data, hora_inicio, duracao_min)
--     select a.tipo_id, a.responsavel_id, a.aluno_id, a.cliente_id,
--            current_date - 2, time '14:00', a.duracao_min
--       from gps.sessao_agendamentos a where a.id = '<SESSAO>'
--     returning id;  -- <SESSAO_2>
--     select gps.sessao_concluir('<SESSAO_2>', null);
--     -- ESPERADO: json com com_resumo=false, resumo_caracteres=0.
--     select estado, resumo, resumo_em, resumo_por
--       from gps.sessao_agendamentos where id = '<SESSAO_2>';
--     -- 🔴 ESPERADO: realizado, e os TRÊS campos NULL (tudo-ou-nada da
--     --   constraint). Se `resumo_em` vier preenchido com `resumo` nulo, o
--     --   CHECK deveria ter recusado — investigar antes de seguir.
--     select gps.sessao_resumo_editar('<SESSAO_2>', 'Escrito no dia seguinte, depois da reuniao.');
--     -- ESPERADO: json com primeira_escrita=true.
--
--     -- (e) resumo em sessão NÃO concluída é recusado com frase própria:
--     select gps.sessao_resumo_editar('<SESSAO_FUTURA>', 'texto valido com mais de dez');
--     -- ESPERADO 22023 "O resumo só existe em sessão concluída…"
--
--     -- (f) a trilha da edição também não leva texto:
--     select detalhe from gps.sessao_eventos
--      where agendamento_id = '<SESSAO_2>' and acao = 'sessao_resumo_editado';
--     -- ESPERADO: primeira_escrita, resumo_caracteres_antes/_depois, por,
--     --   inicio_em. Nenhum trecho do texto.
--
-- ── P8 — 🔴 §6.5: concluir LIBERA o tipo para o ambiente ─────────────────
-- Não é defeito, é o desenho — mas tem de ser MEDIDO, não assumido.
--
--     -- No mesmo bloco, com <SESSAO> (tipo 1) já concluída:
--     insert into gps.sessao_agendamentos
--       (tipo_id, responsavel_id, aluno_id, cliente_id, data, hora_inicio, duracao_min)
--     select a.tipo_id, a.responsavel_id, a.aluno_id, a.cliente_id,
--            current_date + 60, time '09:30', a.duracao_min
--       from gps.sessao_agendamentos a where a.id = '<SESSAO>';
--     -- ESPERADO: INSERT 1 (passa — o índice parcial só conta 'agendado').
--     -- 🔴 Se der 23505 sessao_aluno_tipo_viva, o índice não é o que a …291
--     --   documenta e §6.5 do PRD precisa ser relido.
--
--   rollback;   -- 🔴 FECHA TUDO. Nada de P2..P8 fica no banco.
--
-- ── M1 — O PLANO (o `explain analyze` que o protocolo exige) ─────────────
-- 🔴 As duas funções acessam a tabela SÓ por `id` (PK). Não há predicado
-- novo, não há índice novo nesta fatia. O que se mede é que o caminho é o
-- Index Scan da PK e nada mais:
--
--   begin;
--     explain (analyze, buffers)
--     select a.id, a.aluno_id, a.responsavel_id, a.estado, a.inicio_em, a.resumo
--       from gps.sessao_agendamentos a
--      where a.id = '<SESSAO>'
--      for update;
--   rollback;
--   -- ⚠️ NÃO prevejo o tipo de scan aqui. Com 0..poucas linhas o planner pode
--   --   escolher Seq Scan e ESTAR CERTO — foi o que aconteceu em 18/09 numa
--   --   tabela de 4 linhas, quando previ Index Scan de cabeça e errei.
--   --   🔴 O que reprova é OUTRA coisa: `Rows Removed by Filter` alto, ou
--   --   qualquer plano que não seja acesso direto por id. Colar o resultado
--   --   literal no relatório.
--
--   -- E o UPDATE, que é o que de fato escreve (🔴 EXECUTA — dentro de
--   -- transação revertida, sempre):
--   begin;
--     explain (analyze, buffers)
--     update gps.sessao_agendamentos
--        set estado = 'realizado'
--      where id = '<SESSAO>';
--   rollback;
--
-- ── M2 — A conta da frequência (§5.3) ────────────────────────────────────
-- 4 sessões/semana com a Cristiane, 8 se a Dra. Elaine entrar. Cada sessão
-- gera NO MÁXIMO: 1 conclusão + N edições de resumo, todas por `id`, todas
-- disparadas por clique humano. Não há laço, não há cron, não há N+1 — as
-- duas funções não existem em nenhuma lista.
--   select count(*) from gps.sessao_agendamentos where estado = 'realizado';
--   -- Acompanhar ao longo das semanas. Se este número crescer muito além de
--   -- 8/semana, alguém está concluindo por fora da tela.
-- ═══════════════════════════════════════════════════════════════════════════
