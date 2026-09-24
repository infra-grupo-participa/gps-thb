-- ═══════════════════════════════════════════════════════════════════════════
-- Trilha LGPD da pré-visualização INLINE: quem da EQUIPE abriu documento de
-- cliente, quando, e de que tipo — sem o nome do arquivo
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Decisão do arquiteto (24/09/2026), fatia 6 da reforma da ficha do cliente.
--
-- A rota `src/app/clientes/[clienteId]/documento/[tipo]/[id]/route.ts` serve
-- contrato, minuta e croqui INLINE (o único caminho do repo que não força
-- `download=`). O byte passa pelo NOSSO servidor com a sessão de quem pede.
-- Quando quem pede é o ADMIN, isso é acesso administrativo a documento de
-- terceiro e precisa de rastro; quando é o dono do ambiente, é uso do
-- produto e NÃO gera evento (ver "SÓ ADMIN", abaixo).
--
-- ── POR QUE UMA RPC, E NÃO UM `.insert()` DA ROTA ─────────────────────────
-- `gps.aluno_eventos` tem RLS com UMA policy de SELECT (só `gp_is_admin()`) e
-- NENHUMA de INSERT — é append-only de verdade desde a migração
-- `20260909000001`. Um `.insert()` do PostgREST não levanta erro: devolve
-- ZERO LINHAS. A trilha passaria a mentir em silêncio (tela dizendo que
-- registra, tabela vazia), que é pior que trilha ausente. Toda escrita nessa
-- tabela entra por trigger ou por função SECURITY DEFINER — esta é a função.
--
-- ── 🔴 SÓ ADMIN GRAVA (e o não-admin sai em SILÊNCIO, sem erro) ───────────
-- `coalesce(public.gp_is_admin(), false)` na primeira linha. Duas decisões
-- dentro de uma:
--
--   1. O `coalesce` é OBRIGATÓRIO. `gp_is_admin()` devolve NULL sem JWT, e
--      `if not null then` NÃO dispara — guarda sem `coalesce` falha ABERTA.
--      Esta classe de defeito apareceu DUAS VEZES no mesmo dia em 22/09
--      (`sessao_pode_agendar` vazou o cliente favoritado de qualquer
--      ambiente; `sessao_briefing_ler` repetiu). Aqui o efeito seria o
--      inverso (gravar demais em vez de vazar), mas a forma é a mesma e a
--      regra da casa é escrever sempre com `coalesce`.
--
--   2. Não-admin faz `return`, NÃO `raise`. O parceiro lendo o PRÓPRIO
--      documento é uso legítimo — recusar com 42501 obrigaria a rota a
--      tratar um erro que não é erro, e o pior: um `raise` aqui derrubaria
--      a transação do lado do chamador se algum dia isso virar parte de um
--      fluxo maior. "Não gerou evento" é o resultado CORRETO, não uma falha.
--
-- POR QUE o dono não gera evento (a pergunta que volta):
--   · abrir documento é clique REPETIDO (N×/min ao folhear minutas), não ato
--     raro — o Diário do ambiente viraria ruído e esconderia exatamente a
--     linha que importa, a da equipe;
--   · `gps.aluno_eventos` é a trilha que o ADMIN lê SOBRE o ambiente, não um
--     log de navegação do dono;
--   · a trilha de ação administrativa neste sistema é `gps.acessos_log` /
--     `gps.aluno_eventos` com ator `'equipe'` — é essa a natureza do fato.
--   Reverter esta decisão é trocar o `return` por seguir adiante com
--   `ator = case when v_admin then 'equipe' else 'aluno' end` (o molde da
--   `…309`). Uma linha. Mas leia o parágrafo do ruído antes.
--
-- ── VOLATILE, NUNCA `stable` ──────────────────────────────────────────────
-- 🔴 Função que GRAVA não pode ser `stable`: o Postgres RECUSA o INSERT em
-- tempo de execução. `volatile` é o default e está escrito EXPLICITAMENTE
-- abaixo, para ninguém "otimizar" isso depois lendo o corpo de relance.
--
-- ── `p_documento_id` ACEITA NULO, de propósito ────────────────────────────
-- O CONTRATO da ficha é UM anexo por cliente (colunas `contrato_*` de
-- `gps.etapa1_clientes`, migração `…214`) e NÃO tem id próprio — o `[id]` da
-- URL é a string literal `'contrato'`. Mandar isso num parâmetro `uuid` daria
-- `22P02` (invalid_text_representation) e a trilha falharia em TODA leitura
-- de contrato pela equipe. A rota manda `null` nesse caso, e o `p_tipo` já
-- identifica qual documento é; `entidade_id` é o CLIENTE, que é o que a
-- trilha do Diário indexa.
--
-- ── DETALHE SEM NOME DE ARQUIVO (LGPD) ────────────────────────────────────
-- `detalhe = {tipo, documento_id}` e nada mais. Nome de arquivo é escrito
-- por quem subiu e frequentemente carrega nome do cliente final, número de
-- processo ou situação familiar ("minuta-holding-familia-silva-divorcio.pdf").
-- Mesma regra já aplicada em `gps.cliente_croqui_anexar`/`_remover` (…309) e
-- em `gps.cliente_minuta_anexar` (…259), que gravam `{croqui_id, tamanho}` e
-- NUNCA `nome` nem `observacoes`. O `rotulo` é o nome do CLIENTE — padrão da
-- trigger de captura desde a `…092` — cortado em 300 pelo
-- `aluno_eventos_rotulo_check`.
--
-- ── SUSTENTABILIDADE (as 5 perguntas) ─────────────────────────────────────
-- escala      — 1 `select` por PK em `gps.etapa1_clientes` (1.710 linhas) +
--               1 INSERT de UMA linha. Não varre nada e não cresce com o
--               número de clientes, de documentos nem de eventos. O que
--               cresce é `gps.aluno_eventos`, e cresce por ABERTURA DE
--               DOCUMENTO PELA EQUIPE — dezenas por dia, não por render.
--               ⚠️ Se um dia o volume incomodar, o corte é o `p_tipo`, não o
--               índice: a leitura da trilha já usa
--               `idx_aluno_eventos_timeline (aluno_id, ocorrido_em desc)`.
-- índice      — nenhum índice novo. O `select` é por chave primária
--               (`etapa1_clientes.id`) e o INSERT não tem predicado. A
--               armadilha `lower(btrim())` × `btrim(lower())` não se aplica:
--               não há expressão funcional em lugar nenhum desta função.
--               Índice novo em `aluno_eventos` seria custo de escrita na
--               trilha mais quente do sistema sem query que o use.
-- frequência  — 1 chamada por ABERTURA de documento PELA EQUIPE (a rota nem
--               chama para o parceiro: `if (ctx.papel === "admin")`). Não é
--               por render de lista nem por troca de aba.
-- repetição   — chamador único (a rota). Não há N telas pedindo o mesmo.
--               E a rota NÃO memoiza esta chamada de propósito: memoizar
--               esconderia leituras repetidas sem esconder a gravação —
--               mesmo raciocínio escrito em `getBriefingDaSessao`.
-- reversão    — `drop function gps.cliente_documento_registrar_leitura(uuid,
--               text, uuid);` + tirar o bloco 4-bis da rota. O CHECK volta
--               aos 38 valores (corpo anterior colado abaixo). Nenhum dado
--               de cliente é tocado; só para de nascer evento novo.
--               ⚠️ Reverter o CHECK com linhas `cliente_documento_lido` já
--               gravadas FALHA na validação do `add constraint` — apagar
--               essas linhas antes, ou deixar o CHECK largo.
--
-- REVERSÃO COMPLETA:
--   drop function gps.cliente_documento_registrar_leitura(uuid, text, uuid);
--   delete from gps.aluno_eventos where tipo = 'cliente_documento_lido';
--   -- + reaplicar o CHECK de 38 valores (corpo colado na seção 2)
--   -- + tirar o bloco 4-bis de
--   --   src/app/clientes/[clienteId]/documento/[tipo]/[id]/route.ts
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- 1. CHECK `aluno_eventos_tipo_check`: 38 → 39 valores
--
-- 🔴 A LISTA ABAIXO É A VIVA DO BANCO em 24/09/2026: os 36 do retrato
--    (`C:/tmp/ficha-abas/banco-vivo-minutas.sql`) + os 2 que a migração
--    `…309` acrescentou e que JÁ ESTÃO APLICADOS (`cliente_croqui_anexado`,
--    `cliente_croqui_removido`). Copiada da `…309`, que é a versão viva —
--    NÃO da `…259`, que tinha 27 e apagaria 9 em silêncio.
--
-- 🔴 A ÂNCORA É 'cliente_croqui_removido' (o valor mais recente da lista
--    viva). Achar o CHECK pelo CONTEÚDO e nunca pelo nome: `gps.aluno_eventos`
--    tem 5 CHECKs e os outros 4 NÃO são tocados — `aluno_eventos_ator_check`
--    (aluno|equipe|sistema), `aluno_eventos_entidade_check` (cliente|tarefa|
--    conta|etapa|onboarding|nota), `aluno_eventos_origem_check` (app|backfill),
--    `aluno_eventos_rotulo_check` (1..300). Se a âncora não existir, a lista
--    mudou desde a extração e a migração ABORTA em vez de reescrever de
--    memória: apagar valor em silêncio já aconteceu DUAS VEZES neste projeto.
-- ---------------------------------------------------------------------------
do $$
declare v_nome text;
begin
  select con.conname into v_nome
    from pg_constraint con
    join pg_class     c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'gps' and c.relname = 'aluno_eventos' and con.contype = 'c'
     and pg_get_constraintdef(con.oid) like '%cliente_croqui_removido%';

  if v_nome is null then
    raise exception
      'CHECK de gps.aluno_eventos.tipo nao encontrado (procurado pelo conteudo cliente_croqui_removido, aplicado pela migracao ...309 em 24/09/2026) -- migracao abortada. Ou a ...309 nao foi aplicada neste ambiente, ou a lista mudou depois: leia o CHECK vigente (select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid=''gps.aluno_eventos''::regclass and contype=''c'') e reescreva o bloco abaixo A PARTIR DELE, nunca de memoria.';
  end if;

  execute format('alter table gps.aluno_eventos drop constraint %I', v_nome);
end;
$$;

-- CORPO ANTERIOR, PARA REVERSÃO (os 38 valores vivos em 24/09/2026, SEM o
-- desta migração):
--   alter table gps.aluno_eventos
--     add constraint aluno_eventos_tipo_check check (tipo = any (array[
--       'cliente_cadastrado', 'cliente_favoritado', 'cliente_desfavoritado',
--       'cliente_status_mudou', 'cliente_fase_mudou', 'cliente_mensagem_padrao',
--       'cliente_estudo_caso', 'cliente_ligacao', 'cliente_aderiu_reuniao',
--       'cliente_reuniao_agendada', 'cliente_excluido',
--       'cliente_honorarios_definidos', 'tarefa_concluida', 'tarefa_reaberta',
--       'conta_criada', 'email_confirmado', 'primeiro_acesso',
--       'entrou_no_programa', 'etapa_liberada_pela_equipe',
--       'etapa_travada_pela_equipe', 'onboarding_iniciado',
--       'onboarding_concluido', 'favorito_confirmado_pela_equipe',
--       'favorito_liberado_pela_equipe', 'cliente_contrato_anexado',
--       'cliente_contrato_removido', 'nota_apagada', 'cliente_minuta_anexada',
--       'cliente_minuta_removida', 'cliente_selecionado_entrevista',
--       'cliente_removido_entrevista', 'cliente_entrevista_registrada',
--       'reuniao_preliminar_proposta', 'reuniao_preliminar_aceita',
--       'reuniao_preliminar_contestada', 'cliente_entrevista_sem_contato',
--       'cliente_croqui_anexado', 'cliente_croqui_removido'
--     ]::text[]));

alter table gps.aluno_eventos
  add constraint aluno_eventos_tipo_check check (tipo = any (array[
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
    'onboarding_iniciado',
    'onboarding_concluido',
    'favorito_confirmado_pela_equipe',
    'favorito_liberado_pela_equipe',
    'cliente_contrato_anexado',
    'cliente_contrato_removido',
    'nota_apagada',
    'cliente_minuta_anexada',
    'cliente_minuta_removida',
    'cliente_selecionado_entrevista',
    'cliente_removido_entrevista',
    'cliente_entrevista_registrada',
    'reuniao_preliminar_proposta',
    'reuniao_preliminar_aceita',
    'reuniao_preliminar_contestada',
    'cliente_entrevista_sem_contato',
    -- ── Croquis da ficha do cliente (24/09/2026, migração ...309) ──
    'cliente_croqui_anexado',
    'cliente_croqui_removido',
    -- ── Trilha LGPD da pré-visualização inline (24/09/2026, ...311) ──
    -- Gravado SÓ por gps.cliente_documento_registrar_leitura, SÓ para admin.
    'cliente_documento_lido'
  ]::text[]));

comment on constraint aluno_eventos_tipo_check on gps.aluno_eventos is
  'Catalogo fechado de tipos de evento do diario. 39 valores em 24/09/2026: os 36 vivos antes da ...309 + cliente_croqui_anexado/cliente_croqui_removido (...309) + cliente_documento_lido (...311, gravado so por gps.cliente_documento_registrar_leitura). Espelha TIPOS_EVENTO em src/lib/types.ts (39 desde 24/09 -- os 3 que faltavam la, cliente_entrevista_sem_contato e os 2 de croqui, entraram junto com este, com rotulo em diario-labels.ts). Ao acrescentar valor, LEIA O CHECK VIGENTE NO BANCO antes (pg_get_constraintdef, filtrando por conname -- a tabela tem 5 CHECKs).';

-- ---------------------------------------------------------------------------
-- 2. `gps.cliente_documento_registrar_leitura` — a trilha
--
-- Molde: `gps.cliente_croqui_anexar` (…309), do qual herda o `rotulo` (nome do
-- cliente, cortado em 300), a forma do `detalhe` sem PII de arquivo, e a
-- ordem "guarda → validação → existência → INSERT".
--
-- ⚠️ `create or replace` com assinatura NOVA criaria SOBRECARGA, não
-- substituiria. Esta função nasce aqui; se a assinatura mudar um dia,
-- `drop` a antiga ANTES do `create` — senão duas funções ficam vivas e a
-- rota antiga continua chamando a velha (o modo de falha da `…273`).
-- ---------------------------------------------------------------------------
create or replace function gps.cliente_documento_registrar_leitura(
  p_cliente_id   uuid,
  p_tipo         text,
  p_documento_id uuid default null
)
returns void
language plpgsql
volatile              -- 🔴 NÃO `stable`: função que grava, o Postgres recusaria o INSERT.
security definer
set search_path to ''
as $function$
declare
  v_c record;
begin
  -- 1. Guarda. `coalesce(..., false)`: sem JWT, `gp_is_admin()` devolve NULL e
  --    `if not null` NÃO dispararia — guarda sem coalesce falha ABERTA.
  --    Não-admin NÃO é erro: é o dono lendo o próprio documento. Sai calado.
  if not coalesce(public.gp_is_admin(), false) then
    return;
  end if;

  -- 2. Catálogo fechado do tipo. Espelha TIPOS_DOCUMENTO em
  --    src/lib/documento-inline.ts — os 3 tipos que a rota serve inline.
  --    22023 e não 22P02: é valor fora do domínio, não erro de conversão.
  if p_tipo is null or p_tipo not in ('contrato', 'minuta', 'croqui') then
    raise exception 'Tipo de documento desconhecido.' using errcode = '22023';
  end if;

  -- 3. O cliente precisa existir. Sem `for update`: esta função só LÊ a ficha
  --    (para o rótulo e o `aluno_id`) e grava em OUTRA tabela — não há corrida
  --    a serializar, ao contrário de `cliente_croqui_anexar`, que decide "é a
  --    primeira?" e precisa da trava. `select into` + `if not found`:
  --    `perform` não levanta erro em zero linhas.
  --
  --    🔑 Sem `and aluno_id = ...`: a autorização de LEITURA já aconteceu na
  --    rota, pela RLS de `etapa1_clientes`/`cliente_minutas`/`cliente_croquis`
  --    com a sessão do usuário. Esta função é SECURITY DEFINER e vê tudo — se
  --    replicasse a regra de acesso aqui, seriam duas verdades que podem
  --    divergir. Ela grava o que aconteceu; ela não decide o que pode.
  select c.aluno_id, c.nome
    into v_c
    from gps.etapa1_clientes c
   where c.id = p_cliente_id;

  if not found then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;

  -- 4. O evento. `ator = 'equipe'` fixo: só admin chega aqui (passo 1).
  --    `detalhe` NUNCA leva nome de arquivo nem caminho — o caminho carrega o
  --    id do ambiente e o nome é escrito por quem subiu (pode conter nome do
  --    cliente final, número de processo, situação familiar).
  insert into gps.aluno_eventos
    (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe,
     ator, ator_user_id, origem)
  values
    (v_c.aluno_id, now(), 'cliente_documento_lido', 'cliente', p_cliente_id,
     left(coalesce(nullif(btrim(v_c.nome), ''), 'Cliente sem nome'), 300),
     jsonb_build_object('tipo', p_tipo, 'documento_id', p_documento_id),
     'equipe', auth.uid(), 'app');
end $function$;

comment on function gps.cliente_documento_registrar_leitura(uuid, text, uuid) is
  'Trilha LGPD da pre-visualizacao INLINE de documento da ficha do cliente (src/app/clientes/[clienteId]/documento/[tipo]/[id]/route.ts). Grava o evento cliente_documento_lido em gps.aluno_eventos com detalhe {tipo, documento_id} -- NUNCA o nome do arquivo nem o caminho (o nome e escrito por quem subiu e costuma carregar nome do cliente final ou numero de processo). Rotulo = nome do CLIENTE, ator = equipe, entidade = cliente, entidade_id = p_cliente_id. 🔴 SO GRAVA PARA ADMIN: coalesce(gp_is_admin(), false); o parceiro lendo o PROPRIO documento sai em silencio (return, nao raise) -- nao e acesso administrativo, e uso do produto, e leitura N vezes por minuto viraria ruido no Diario escondendo a linha da equipe. SECURITY DEFINER porque gps.aluno_eventos tem RLS SEM policy de INSERT (append-only desde a ...20260909000001): .insert() pelo PostgREST devolveria ZERO LINHAS sem erro e a trilha mentiria. VOLATILE obrigatorio -- stable faz o Postgres recusar o INSERT. NAO e fronteira de acesso: quem decide se o documento pode ser lido e a RLS de etapa1_clientes/cliente_minutas/cliente_croquis, com a sessao do usuario, ANTES desta chamada. p_documento_id aceita NULO porque o CONTRATO da ficha nao tem id proprio (colunas contrato_* de etapa1_clientes, ...214) e o [id] da URL e a string literal contrato -- manda-la num parametro uuid daria 22P02.';

-- 🔴 `revoke ... from public` e NÃO só `from anon`. Em 19/08/2026, auditando
-- as `fn_fin_*`, o `revoke from anon` executou SEM ERRO e SEM EFEITO em 3 de
-- 15 funções: `anon` não tinha grant próprio, herdava de PUBLIC (entrada
-- `=X/` no `proacl`, onde o grantee vazio antes do `=` É o pseudo-role
-- PUBLIC, e toda role herda dele). Função nova em schema exposto NASCE
-- executável por PUBLIC — e neste projeto o ALTER DEFAULT PRIVILEGES do
-- schema `gps` ainda dá `execute` a `authenticated` por cima.
-- ⚠️ Conferir o ACL DEPOIS (P3 do roteiro), não confiar no sucesso do comando.
revoke execute on function gps.cliente_documento_registrar_leitura(uuid, text, uuid) from public, anon;
grant  execute on function gps.cliente_documento_registrar_leitura(uuid, text, uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROTEIRO DE PROVA — Marcio roda no banco e cola o resultado aqui
--
-- ⚠️ NENHUM bloco abaixo foi executado por quem escreveu esta migração: o
-- executor NÃO tem acesso ao banco. Os `-- a colar:` ficam VAZIOS até a
-- medição real — não preencher com plano plausível.
--
-- ⚠️ P4, P5 e P6 ESCREVEM. `explain analyze` em INSERT **EXECUTA** o comando
-- (memória de 15/09/2026, SIC-HF: um `explain (analyze) update` gravou valor
-- em produção e deixou um par de chaves acopladas em estado intermediário).
-- Rodar cada bloco numa STRING ÚNICA `begin; ... rollback;` — o MCP do
-- Supabase é AUTOCOMMIT, e `begin`/`rollback` em chamadas separadas NÃO
-- protegem.
--
-- ── P1. O CHECK ficou com 39 valores, e os outros 4 CHECKs intactos ──────
--   select conname,
--          (length(pg_get_constraintdef(oid))
--           - length(replace(pg_get_constraintdef(oid), '''::text', ''))) / 7
--            as valores
--     from pg_constraint
--    where conrelid = 'gps.aluno_eventos'::regclass and contype = 'c'
--    order by conname;
--   -- esperado: 5 linhas. aluno_eventos_tipo_check = 39.
--   --           ator_check 3 · entidade_check 6 · origem_check 2 ·
--   --           rotulo_check 0 (não é lista de literais).
--   select pg_get_constraintdef(oid) like '%cliente_documento_lido%' as tem_o_novo,
--          pg_get_constraintdef(oid) like '%cliente_croqui_removido%' as manteve_croqui,
--          pg_get_constraintdef(oid) like '%cliente_entrevista_sem_contato%' as manteve_ancora_309
--     from pg_constraint
--    where conrelid = 'gps.aluno_eventos'::regclass and contype = 'c'
--      and conname = 'aluno_eventos_tipo_check';
--   -- esperado: true, true, true
--   -- 🔴 REPROVA se `manteve_croqui` ou `manteve_ancora_309` vier false:
--   --    significa que a lista foi reescrita de memória e apagou valor.
--   -- a colar:
--
-- ── P2. Nenhuma linha da trilha ficou órfã do CHECK ──────────────────────
--   select tipo, count(*) from gps.aluno_eventos group by tipo order by 2 desc;
--   -- esperado: só tipos que estão na lista dos 39. Se o `add constraint`
--   --           passou, isto já está provado pelo próprio Postgres (ele
--   --           valida a tabela inteira) — este bloco é para VER o perfil da
--   --           trilha antes de a feature começar a gravar.
--   select count(*) from gps.aluno_eventos where tipo = 'cliente_documento_lido';
--   -- esperado: 0 (esta migração não faz backfill)
--   -- a colar:
--
-- ── P3. ACL da função nova: nem PUBLIC nem anon ─────────────────────────
--   select p.proname, p.prosecdef, p.provolatile, p.proconfig, p.proacl::text
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'gps' and p.proname = 'cliente_documento_registrar_leitura';
--   -- esperado: prosecdef = t · provolatile = 'v' (VOLATILE — 🔴 se vier 's'
--   --           a função foi criada stable e o INSERT vai falhar em runtime) ·
--   --           proconfig = {search_path=""} ·
--   --           proacl = {postgres=X/postgres,authenticated=X/postgres,
--   --                     service_role=X/postgres}
--   select count(*) from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace,
--     lateral unnest(p.proacl) a
--    where n.nspname = 'gps' and p.proname = 'cliente_documento_registrar_leitura'
--      and a::text like '=%';
--   -- esperado: 0
--   -- 🔴 Entrada começando com `=` É o pseudo-role PUBLIC. Conferir a ENTRADA,
--   --    não `has_function_privilege`: `proacl::text like '%=X/%'` dá falso
--   --    positivo (casa `postgres=X/`). Usar `unnest` + `like '=%'`.
--   select has_function_privilege('anon',
--            'gps.cliente_documento_registrar_leitura(uuid,text,uuid)', 'EXECUTE'),
--          has_function_privilege('authenticated',
--            'gps.cliente_documento_registrar_leitura(uuid,text,uuid)', 'EXECUTE');
--   -- esperado: false, true
--   select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'gps' and p.proname = 'cliente_documento_registrar_leitura';
--   -- esperado: 1 (UMA função — sem sobrecarga)
--   -- a colar:
--
-- ── P4. ADMIN grava (EM ROLLBACK) — o caminho feliz ─────────────────────
--   -- Com JWT de ADMIN real (PostgREST), NÃO como `postgres`: a guarda é
--   -- `gp_is_admin()` e rodar como superusuário não prova nada.
--   -- Trocar <CLIENTE_UUID> por um id real de gps.etapa1_clientes.
--   begin;
--     select count(*) from gps.aluno_eventos where tipo='cliente_documento_lido';
--     -- esperado: 0
--     select gps.cliente_documento_registrar_leitura(
--              '<CLIENTE_UUID>'::uuid, 'croqui', '<CROQUI_UUID>'::uuid);
--     select aluno_id, tipo, entidade, entidade_id, rotulo, detalhe, ator,
--            ator_user_id, origem
--       from gps.aluno_eventos
--      where tipo = 'cliente_documento_lido'
--      order by ocorrido_em desc limit 1;
--     -- esperado: entidade='cliente' · entidade_id = <CLIENTE_UUID> ·
--     --           rotulo = o NOME do cliente (não o do arquivo) ·
--     --           detalhe = {"tipo":"croqui","documento_id":"<CROQUI_UUID>"} ·
--     --           ator='equipe' · ator_user_id = o uid do admin · origem='app' ·
--     --           aluno_id = o aluno_id DO CLIENTE (não o do admin)
--     -- 🔴 REPROVA se `detalhe` tiver qualquer chave além de tipo/documento_id.
--
--     -- Contrato: documento_id NULO é o caso normal, não erro.
--     select gps.cliente_documento_registrar_leitura(
--              '<CLIENTE_UUID>'::uuid, 'contrato', null);
--     select detalhe from gps.aluno_eventos
--      where tipo='cliente_documento_lido' order by ocorrido_em desc limit 1;
--     -- esperado: {"tipo":"contrato","documento_id":null}
--
--     explain (analyze, buffers)
--       select c.aluno_id, c.nome from gps.etapa1_clientes c
--        where c.id = '<CLIENTE_UUID>'::uuid;
--     -- esperado: Index Scan usando a PK de etapa1_clientes, 1 linha,
--     --           `Rows Removed by Filter` ausente ou 0, Buffers baixíssimo.
--     -- 🔴 REPROVA se aparecer Seq Scan com `rows` na casa dos milhares.
--   rollback;
--   select count(*) from gps.aluno_eventos where tipo='cliente_documento_lido';
--   -- esperado: 0 (o rollback desfez tudo)
--   -- a colar:
--
-- ── P5. PARCEIRO não gera evento — e não recebe erro (EM ROLLBACK) ──────
--   -- Com JWT de titular/sócio REAL (authenticated, não-admin), de um
--   -- ambiente que tenha <CLIENTE_UUID>.
--   begin;
--     select gps.cliente_documento_registrar_leitura(
--              '<CLIENTE_UUID>'::uuid, 'croqui', '<CROQUI_UUID>'::uuid);
--     -- esperado: SUCESSO (void), SEM erro — sair calado é o comportamento
--     --           correto, não uma falha.
--     select count(*) from gps.aluno_eventos where tipo='cliente_documento_lido';
--     -- esperado: 0 🔴 REPROVA se gravar: a decisão é que o dono lendo o
--     --           próprio documento NÃO vira evento.
--     --   ⚠️ Este count roda com a RLS do parceiro (uma policy de SELECT só
--     --      para gp_is_admin()), então ele leria 0 de qualquer jeito.
--     --      CONFERIR TAMBÉM como admin/postgres dentro da mesma transação,
--     --      ou o teste é vácuo.
--   rollback;
--   -- a colar:
--
-- ── P6. As recusas (EM ROLLBACK, com JWT de ADMIN) ──────────────────────
--   begin;
--     select gps.cliente_documento_registrar_leitura(
--              '<CLIENTE_UUID>'::uuid, 'recibo', null);
--     -- esperado: ERRO [22023] "Tipo de documento desconhecido."
--   rollback;
--   begin;
--     select gps.cliente_documento_registrar_leitura(
--              '<CLIENTE_UUID>'::uuid, 'CROQUI', null);
--     -- esperado: ERRO [22023] — o catálogo é case-sensitive de propósito
--     --           (a rota só manda minúsculo, vindo de TIPOS_DOCUMENTO).
--   rollback;
--   begin;
--     select gps.cliente_documento_registrar_leitura(
--              '00000000-0000-0000-0000-000000000000'::uuid, 'croqui', null);
--     -- esperado: ERRO [P0002] "Cliente não encontrado."
--   rollback;
--   begin;
--     select gps.cliente_documento_registrar_leitura(null, 'croqui', null);
--     -- esperado: ERRO [P0002] "Cliente não encontrado." (o select não casa)
--   rollback;
--   -- a colar:
--
-- ── P7. SEM JWT (anon) não executa ──────────────────────────────────────
--   -- Como `anon`, pelo PostgREST:
--   --   select gps.cliente_documento_registrar_leitura(
--   --            '<CLIENTE_UUID>'::uuid, 'croqui', null);
--   -- esperado: ERRO [42501] permission denied for function — o revoke de
--   --           `public` + `anon` é a trava; a guarda `gp_is_admin()` seria a
--   --           segunda camada (NULL → coalesce false → return calado).
--   -- a colar:
--
-- ── P8. Depois do deploy: o evento aparece e não vaza nome de arquivo ───
--   -- Abrir um croqui e uma minuta pela ficha, como ADMIN, e conferir:
--   select ocorrido_em, rotulo, detalhe, ator
--     from gps.aluno_eventos
--    where tipo = 'cliente_documento_lido'
--    order by ocorrido_em desc limit 10;
--   -- esperado: 1 linha por ABERTURA · detalhe só com tipo/documento_id ·
--   --           rotulo = nome do CLIENTE · ator = 'equipe'.
--   -- Depois abrir o MESMO documento como PARCEIRO (outra sessão):
--   --   esperado: NENHUMA linha nova.
--   -- 🔴 Se aparecer `42883` no log da Hostinger em `documento/trilha`, a
--   --    migração não foi aplicada naquele ambiente. Se aparecer `42501`,
--   --    é o `grant execute to authenticated` que ficou faltando.
--   -- ⚠️ No Diário o evento vai aparecer CRU ("cliente_documento_lido") até
--   --    `TIPOS_EVENTO` + `ROTULO_TIPO_EVENTO` ganharem o tipo — ver o
--   --    comentário do CHECK. Degrada, não explode.
--   -- a colar:
-- ═══════════════════════════════════════════════════════════════════════════


-- ---------------------------------------------------------------------------
-- APLICADA em 24/09/2026 ~15:20 UTC (apply_migration, sucesso). Provas no banco
-- VIVO, dentro de begin … rollback, com claims de JWT reais (set_config
-- request.jwt.claims): P1 CHECK = 39 valores, contem cliente_documento_lido ·
-- P3 provolatile=v, secdef=true, acl {postgres,authenticated,service_role} (sem
-- anon/PUBLIC) · P5 claims de TITULAR chamando ('minuta') -> 0 eventos (sai em
-- silencio) · P4/P6 claims de ADMIN: ('contrato', null) e ('croqui', uuid) ->
-- 2 eventos, detalhe {tipo, documento_id} sem nome de arquivo · p_tipo 'xyz' ->
-- 22023 · cliente inexistente -> P0002. Tudo desfeito no rollback (0 eventos
-- cliente_documento_lido em producao ate o primeiro admin abrir um documento).
-- P8 (log da Hostinger sem 42883) so depois do deploy.
-- ---------------------------------------------------------------------------
