-- Fatia E da esteira: o DOSSIÊ ganha o histórico de tentativas de ligação.
--
-- A Fatia B (migração `…266`) trocou `entrevista_resultado` de "o único
-- resultado" para "resultado da ÚLTIMA tentativa" e criou
-- `gps.entrevista_tentativas` (uma linha por tentativa). O dossiê
-- (`gps.dossie_do_cliente`, migração `…264`) continuava devolvendo só as 4
-- chaves antigas de `entrevista` (resultado/observações/em/por da ÚLTIMA
-- tentativa) — quem lê o dossiê antes de ligar não via o histórico completo
-- (quantas vezes já ligaram, o que foi dito em cada uma).
--
-- ═══════════════════════════════════════════════════════════════════════
-- O QUE MUDA: só a chave `tentativas`, ADITIVA
-- ═══════════════════════════════════════════════════════════════════════
-- As 4 chaves de `entrevista` (resultado/observacoes/em/por) NÃO mudam — o
-- componente `Dossie` (`src/components/admin/dossie/index.tsx`) já as lê.
-- `tentativas` é um array novo, `tentativa_em desc` (mais recente primeiro),
-- cada item com id/tentativa_em/resultado/qualidade/observacoes/retorno_em —
-- o mesmo shape de `gps.entrevista_tentativas`, sem `cliente_id`/`tentativa_por`
-- (o dossiê já é escopado a UM cliente; `tentativa_por` fica de fora porque
-- nenhuma tela do dossiê mostra "quem ligou", só "o que foi dito" — mesmo
-- corte que `entrevista.por` já tem no card de identificação, não no
-- histórico).
--
-- 🔴 `observacoes` e `qualidade` entram AQUI e SÓ AQUI (+ a ficha, fora de
-- escopo desta migração) — mesma decisão de LGPD já escrita nas migrations
-- `…255`/`…259`/`…262`/`…266`: o dossiê é a superfície autorizada, com
-- trilha obrigatória (abaixo, sem mudança nesta migração).
--
-- ═══════════════════════════════════════════════════════════════════════
-- POR QUE `create or replace` (não drop-before-create)
-- ═══════════════════════════════════════════════════════════════════════
-- A assinatura de `gps.dossie_do_cliente(uuid)` NÃO muda (mesmo parâmetro,
-- mesmo tipo de retorno `jsonb`) — só o CONTEÚDO do jsonb ganha uma chave.
-- `create or replace` é seguro aqui; `drop function` só seria necessário se
-- a assinatura (parâmetros/tipo de retorno) mudasse, o que não é o caso.
--
-- ═══════════════════════════════════════════════════════════════════════
-- 🔴 VOLATILE — NÃO tornar `stable`
-- ═══════════════════════════════════════════════════════════════════════
-- Esta função já é VOLATILE desde a `…264` (grava trilha `dossie_acessado`
-- em `gps.acessos_log` a cada chamada, mesmo em leitura). Continua VOLATILE
-- aqui — `stable` faria o Postgres recusar o INSERT em tempo de execução
-- (lição já paga neste projeto, registrada na `…264`).
--
-- ═══════════════════════════════════════════════════════════════════════
-- ÍNDICE: NENHUM NOVO — usa `entrevista_tentativas_cliente_idx` (…266)
-- ═══════════════════════════════════════════════════════════════════════
-- O `jsonb_agg` novo lê `gps.entrevista_tentativas where cliente_id = $1
-- order by tentativa_em desc` — exatamente o predicado do índice
-- `entrevista_tentativas_cliente_idx (cliente_id, tentativa_em desc)`
-- criado na `…266` para esta MESMA leitura (a migração `…266` já registrou
-- que ele foi desenhado para "a ficha/dossiê de UM cliente"). EXPLAIN
-- colado no fim do arquivo.
--
-- ═══════════════════════════════════════════════════════════════════════
-- 🔴 LIMITAÇÃO DE AMBIENTE — mesma registrada nas migrations …261-…266
-- ═══════════════════════════════════════════════════════════════════════
-- Nem MCP do Supabase nem CLI (`supabase`/`psql`) estavam acessíveis a este
-- agente no ambiente de execução desta sessão para rodar
-- `explain (analyze, buffers)` de verdade nem para ler `pg_get_functiondef`
-- ao vivo antes de escrever esta migração. O corpo abaixo é o corpo INTEGRAL
-- da `…264` com a alteração mínima: 1 declaração nova (`v_tentativas`), 1
-- bloco de `select ... jsonb_agg` novo (mesmo padrão do bloco de decisores,
-- 3 linhas acima dele) e 1 chave nova no `jsonb_build_object` final. Nenhuma
-- outra linha do corpo original foi tocada.
-- ⚠️ Confirme contra o banco antes de aplicar
-- (`select pg_get_functiondef(oid) from pg_proc where proname =
-- 'dossie_do_cliente' and pronamespace = 'gps'::regnamespace`) — se a função
-- foi alterada no banco por fora deste diretório desde a `…264`, este
-- `create or replace` vai reverter essa mudança em silêncio.
--
-- REVERSÃO: `create or replace function gps.dossie_do_cliente(uuid) ...`
-- com o corpo da `…264` (ver aquele arquivo) — a assinatura não muda, então
-- reverter é reaplicar o corpo antigo, sem drop.

create or replace function gps.dossie_do_cliente(p_cliente_id uuid)
returns jsonb
language plpgsql
-- VOLATILE (o padrão), NÃO `stable` — ver bloco acima.
security definer
set search_path = ''
as $function$
declare
  v_cliente        record;
  v_parceiro_nome  text;
  v_decisores      jsonb;
  v_tentativas     jsonb;
  v_proposta_viva  record;
  v_propostas      jsonb;
begin
  if not gps.eh_equipe() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if p_cliente_id is null then
    raise exception 'cliente nao informado' using errcode = '22023';
  end if;

  select
    c.id, c.aluno_id, c.nome, c.telefone, c.grau_relacao, c.fase,
    c.perfil_disc, c.acompanhado_equipe, c.selecionado_entrevista,
    c.entrevista_resultado, c.entrevista_observacoes, c.entrevista_em,
    c.entrevista_por, c.data_reuniao_preliminar, c.aderiu_reuniao
    into v_cliente
    from gps.etapa1_clientes c
   where c.id = p_cliente_id;

  if v_cliente.id is null then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;

  -- LEFT via subselect (não INNER) — mesma lição da …255: se o cadastro do
  -- parceiro sumir de thb_alunos, o dossiê mostra dono vazio, não erro.
  select t.nome into v_parceiro_nome
    from public.thb_alunos t
   where t.id = v_cliente.aluno_id;

  -- Decisores deste cliente — nunca entram em lista agregada (LGPD, …262).
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', d.id,
             'nome', d.nome,
             'papel_no_negocio', d.papel_no_negocio,
             'principal', d.principal
           )
           order by d.principal desc, d.criado_em
         ), '[]'::jsonb)
    into v_decisores
    from gps.cliente_decisores d
   where d.cliente_id = p_cliente_id;

  -- Histórico COMPLETO de tentativas de ligação (Fatia B, …266), mais
  -- recente primeiro — usa entrevista_tentativas_cliente_idx (cliente_id,
  -- tentativa_em desc), o mesmo índice desenhado naquela migração para esta
  -- leitura. `tentativa_por` fica FORA do jsonb: nenhuma tela do dossiê
  -- mostra "quem ligou", só "o que foi dito" (mesmo corte que `entrevista.por`
  -- já tem no card de identificação, não no histórico).
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', et.id,
             'tentativa_em', et.tentativa_em,
             'resultado', et.resultado,
             'qualidade', et.qualidade,
             'observacoes', et.observacoes,
             'retorno_em', et.retorno_em
           )
           order by et.tentativa_em desc
         ), '[]'::jsonb)
    into v_tentativas
    from gps.entrevista_tentativas et
   where et.cliente_id = p_cliente_id;

  -- Proposta VIVA (estado='proposta'), se houver.
  select pp.id, pp.data_proposta, pp.proposta_em, pp.estado
    into v_proposta_viva
    from gps.reuniao_preliminar_propostas pp
   where pp.cliente_id = p_cliente_id
     and pp.estado = 'proposta';

  -- Histórico completo de propostas (propôs → contestou → propôs de novo) —
  -- é o processo; `data_reuniao_preliminar` acima é o resultado.
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', pp.id,
             'data_proposta', pp.data_proposta,
             'proposta_em', pp.proposta_em,
             'estado', pp.estado,
             'resposta_em', pp.resposta_em,
             'contestacao_motivo', pp.contestacao_motivo
           )
           order by pp.proposta_em desc
         ), '[]'::jsonb)
    into v_propostas
    from gps.reuniao_preliminar_propostas pp
   where pp.cliente_id = p_cliente_id;

  -- 🔴 TRILHA OBRIGATÓRIA: cada abertura grava, sempre — LGPD, a trilha É a
  -- guarda (mesma decisão de `clientes_exportados`, …255). `aluno_id` do
  -- ambiente dono do cliente, não do operador que abriu.
  insert into gps.acessos_log (acao, aluno_id, feito_por, detalhe)
  values ('dossie_acessado', v_cliente.aluno_id, auth.uid(), 'cliente_id=' || p_cliente_id::text);

  return jsonb_build_object(
    'cliente_id', v_cliente.id,
    'aluno_id', v_cliente.aluno_id,
    'parceiro_nome', v_parceiro_nome,
    'cliente_nome', v_cliente.nome,
    'telefone', v_cliente.telefone,
    'grau_relacao', v_cliente.grau_relacao,
    'fase', v_cliente.fase,
    'perfil_disc', v_cliente.perfil_disc,
    'acompanhado_equipe', v_cliente.acompanhado_equipe,
    'selecionado_entrevista', v_cliente.selecionado_entrevista,
    'entrevista', jsonb_build_object(
      'resultado', v_cliente.entrevista_resultado,
      'observacoes', v_cliente.entrevista_observacoes,
      'em', v_cliente.entrevista_em,
      'por', v_cliente.entrevista_por
    ),
    'decisores', v_decisores,
    'tentativas', v_tentativas,
    'reuniao', jsonb_build_object(
      'data_aceita', v_cliente.data_reuniao_preliminar,
      'aderiu', v_cliente.aderiu_reuniao,
      'proposta_viva_id', v_proposta_viva.id,
      'proposta_viva_data', v_proposta_viva.data_proposta,
      'propostas', v_propostas
    )
  );
end;
$function$;

comment on function gps.dossie_do_cliente(uuid) is
  'Dossie de UM cliente para o advogado da reuniao preliminar / operador da esteira (fatia 5, decisao Marcio 15/09/2026; ganhou tentativas na fatia E, migracao …267). Guarda gps.eh_equipe() (admin OU operador ativo) ou 42501. Entra: nome/telefone/grau/fase, DISC, decisores, resultado+observacoes+quem+quando da ULTIMA entrevista, historico COMPLETO de tentativas (gps.entrevista_tentativas, mais recente primeiro), data aceita da reuniao + historico de propostas, nome do parceiro (LEFT thb_alunos). 🔴 NAO entra: registro_contato, CPF/documento, valor_honorarios/contrato_*, Diario do parceiro (aluno_notas), dado de outro cliente, tentativa_por (nenhuma tela do dossie mostra quem ligou). 🔴 Cada chamada grava 1 linha em gps.acessos_log (dossie_acessado) -- LGPD, a trilha E a guarda, sempre, mesmo em leitura.';

-- `revoke`/`grant` já concedidos na …264 e sobrevivem ao `create or
-- replace` (mesma assinatura) — reafirmados aqui por clareza, sem custo.
revoke all on function gps.dossie_do_cliente(uuid) from public, anon;
grant execute on function gps.dossie_do_cliente(uuid) to authenticated;

-- O QUE NÃO FAZ: não mexe nas 3 RPCs da esteira (`fila_de_ligacoes`,
-- `entrevista_gravar`, `reuniao_propor_data`), não mexe em `gps.operadores`
-- nem em `gps.operador_definir`, não cria índice novo (reusa
-- `entrevista_tentativas_cliente_idx` da …266), não mexe no front das
-- fatias C/D (`src/components/admin/fila/*`).

notify pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- PROVA PENDENTE — 🔴 NÃO MEDIDA POR ESTE AGENTE NESTA SESSÃO (ver bloco de
-- limitação de ambiente acima). O que precisa rodar contra o banco real,
-- com a saída colada, ANTES de considerar esta migração encerrada:
--
--   -- 1) confirmar o corpo vigente ANTES desta migração:
--   select pg_get_functiondef(oid) from pg_proc
--    where pronamespace = 'gps'::regnamespace and proname = 'dossie_do_cliente';
--
--   -- 2) a query nova isolada (predicado = índice …266):
--   explain (analyze, buffers)
--   select et.id, et.tentativa_em, et.resultado, et.qualidade, et.observacoes, et.retorno_em
--     from gps.entrevista_tentativas et
--    where et.cliente_id = '<um cliente_id real com >=1 tentativa>'
--    order by et.tentativa_em desc;
--
--   -- 3) o dossiê inteiro, para o custo total da função:
--   explain (analyze, buffers)
--   select gps.dossie_do_cliente('<mesmo cliente_id>');
--
-- Hipótese escrita (não medição): Index Scan em `entrevista_tentativas_cliente_idx
-- (cliente_id, tentativa_em desc)` — igualdade sobre a 1ª coluna do índice
-- composto, ordenação já satisfeita pela 2ª coluna (desc, mesmo sentido do
-- índice), sem Sort adicional. Volume por cliente é poucas tentativas
-- (dezenas no máximo), então mesmo um Seq Scan seria barato — mas o índice já
-- existe e o predicado bate exatamente com o dele.
-- ═══════════════════════════════════════════════════════════════════════════
