-- ═══════════════════════════════════════════════════════════════════════════
-- O botão de pânico da pré-visualização de documentos existia só no comentário
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 🔴 ACHADO MÉDIO do pentester na reforma da ficha do cliente (24/09/2026).
--
-- `src/app/clientes/[clienteId]/documento/[tipo]/[id]/route.ts` chama
-- `supabase.schema('gps').rpc('documento_inline_ativo')` em `inlineAtivo()`.
-- A RPC NUNCA FOI CRIADA. Consequências, as três juntas:
--
--   1. TODA abertura de documento cai em `42883` (undefined_function),
--      cai no `catch` e devolve `true`.
--   2. O interruptor de reversão prometido no cabeçalho da rota (`:58`,
--      "REVERSÃO: interruptor `documento_inline_ativo` em `gps.config`") é
--      FALSO: não há como desligar a rota sem deploy. A pergunta 5 do
--      PROTOCOLO-SUSTENTABILIDADE ("como desligo isso se der errado?") estava
--      respondida por um comentário, não por código.
--   3. O log da Hostinger enche a cada clique em documento — ruído que
--      esconde erro de verdade.
--
-- Esta migração cria a RPC que faltava e acrescenta a chave à allowlist de
-- `gps.config_definir`, NA MESMA MIGRAÇÃO.
--
-- 🔑 INTERRUPTOR NOVO TOCA TRÊS LUGARES — `gps.<nome>_ativo()` (leitura pelo
-- usuário), a allowlist de `gps.config_definir` (escrita pelo admin) e
-- `INTERRUPTORES_CONFIG` em `src/lib/config-tipos.ts` (a tela). Em 17/09 a
-- `minuta_contexto_obrigatorio` entrou só no TypeScript e ficou 5 DIAS sendo
-- recusada com `[22023] "Este interruptor não existe."`: a equipe via o botão,
-- clicava, e acreditava ter desligado. Corrigida só na …299. `tsc`, `eslint` e
-- `next build` ficam verdes nos dois casos — a allowlist vive no CORPO de uma
-- função no Postgres, fora do alcance do compilador.
--
-- ── AUSENTE = LIGADO (o contrário de `convite_socio_ativo`) ──
-- A rota JÁ ESTÁ NO AR e a equipe já depende dela para ler minuta/contrato sem
-- baixar. Se a chave nunca for populada (e esta migração NÃO a popula, de
-- propósito — ver abaixo), o default tem de ser FUNCIONAR. Mesmo raciocínio,
-- e mesmo idioma SQL (`<> 'false'`), de `gps.chamados_abertos()` (…110) e
-- `gps.videos_ativo()` (…251): "o default tem de ser funcionar, senão o canal
-- morre no dia em que alguém esquecer de popular a linha".
--
-- `gps.convite_socio_ativo()` (…245) faz o OPOSTO (`coalesce(…, false)`) e
-- está certo lá: aquele é um botão que LIBERA uma feature nova; este é um
-- freio de mão de uma feature viva. Copiar o default do molde sem pensar
-- apagaria a pré-visualização para todo mundo no deploy.
--
-- ── POR QUE A RPC, E NÃO `select` DIRETO EM `gps.config` ──
-- A única policy de `gps.config` é `gps_config_admin` (`gp_is_admin()`,
-- migração …110). Para o PARCEIRO a tabela responde VAZIO — medido em
-- 11/09/2026 com JWT de titular real (ver …245 e `src/lib/data/equipe.ts`).
-- Com `default true` no ausente, a leitura direta devolveria `true` para todo
-- não-admin SEMPRE: o botão de pânico existiria no código e não desligaria
-- nada justamente para o público que ele precisa desligar. E `gps.config`
-- guarda `resend_api_key`/`email_from` na mesma tabela — abrir a tabela para
-- ler um booleano é vazamento.
--
-- ── ESTA MIGRAÇÃO NÃO INSERE A LINHA EM `gps.config` ──
-- Deliberado. `insert … on conflict do nothing` com valor `'true'` seria
-- inócuo (ausente já é `true`) e criaria a ilusão de estado onde não há. A
-- linha nasce no primeiro clique do admin na tela de Interruptores, com autor
-- registrado em `gps.acessos_log`. Se alguém quiser semear:
--   insert into gps.config (chave, valor) values ('documento_inline_ativo','true')
--     on conflict (chave) do nothing;
--
-- ── SUSTENTABILIDADE (as 5 perguntas) ──
-- escala      — a função lê UMA linha por chave primária de uma tabela de 21
--               linhas. Não cresce com cliente, com aluno nem com documento.
-- índice      — `gps.config` tem PK em `chave`; nenhuma expressão funcional
--               envolvida, então a armadilha `lower(btrim())` × `btrim(lower())`
--               não se aplica aqui. Nenhum índice novo se justifica: em tabela
--               de 21 linhas o `Seq Scan` é a escolha CERTA do planner.
-- frequência  — 1 chamada por ABERTURA de documento (clique), não por render
--               de lista nem por troca de aba. Unidades a dezenas por dia.
-- repetição   — chamador único (a rota). Não há N telas pedindo o mesmo.
-- reversão    — `drop function gps.documento_inline_ativo();` e reaplicar
--               `gps.config_definir` com as 15 chaves de antes. Nenhum dado
--               muda; `gps.config` não é tocada por esta migration.
--
-- REVERSÃO COMPLETA:
--   drop function gps.documento_inline_ativo();
--   -- + reaplicar a …299 (allowlist de 15 chaves)
--   delete from gps.config where chave = 'documento_inline_ativo';
--   -- + tirar a chave de INTERRUPTORES_CONFIG (src/lib/config-tipos.ts)
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- 1. `gps.documento_inline_ativo()` — leitura do interruptor pelo usuário
--
-- Molde EXATO de `gps.convite_socio_ativo()` (…245) / `gps.chamados_abertos()`
-- (…110): `sql`, `stable`, `security definer`, `search_path ''`, revoke de
-- public+anon, grant nominal a authenticated.
--
-- ⚠️ `revoke … from public` e NÃO só `from anon`: em 19/08/2026, auditando as
-- `fn_fin_*`, o `revoke from anon` executou sem erro e SEM EFEITO em 3 de 15
-- funções — `anon` não tinha grant próprio, herdava de PUBLIC (entrada `=X/`
-- no `proacl`). Função nova nasce executável por PUBLIC; revogar de `anon` sem
-- revogar de `public` é um comando que "funciona" e não faz nada.
-- ---------------------------------------------------------------------------
create or replace function gps.documento_inline_ativo()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(
           (select c.valor from gps.config c where c.chave = 'documento_inline_ativo'),
           'true'
         ) <> 'false';
$function$;

revoke execute on function gps.documento_inline_ativo() from public, anon;
grant  execute on function gps.documento_inline_ativo() to authenticated;

comment on function gps.documento_inline_ativo() is
  'Botao de panico da rota de pre-visualizacao INLINE de documento da ficha do cliente (src/app/clientes/[clienteId]/documento/[tipo]/[id]/route.ts). Quem chama e a ROTA, com a sessao do usuario (role authenticated) -- nunca service_role. AUSENTE = LIGADO (`<> ''false''`): a rota ja esta no ar e o default tem de ser funcionar, igual a gps.chamados_abertos() e gps.videos_ativo(); o oposto de gps.convite_socio_ativo(), que libera feature nova e falha fechado. Desligar faz a rota responder 404 com a mesma frase de todo o resto (nao vira oraculo sobre documento de terceiro) e a equipe volta a SO BAIXAR o documento. SECURITY DEFINER porque a unica policy de gps.config e gps_config_admin e o parceiro le ZERO linha da tabela -- e porque a tabela guarda resend_api_key/email_from. NAO e a trava de acesso: a fronteira real continua sendo a RLS do Storage (gps_minutas_select / gps_onboarding_anexo_select).';

-- ---------------------------------------------------------------------------
-- 2. `gps.config_definir` — a allowlist vai de 15 para 16 chaves
--
-- 🔑 Corpo reescrito por INTEIRO (não `replace` textual), copiado da função
-- VIVA do banco em 24/09/2026 (retrato em `C:/tmp/ficha-abas/banco-vivo-minutas.sql`,
-- idêntico ao da …299 já aplicada). Tudo que não é a lista permanece
-- literalmente igual: guarda `coalesce(gp_is_admin(), false)` → `42501`,
-- allowlist → `22023`, valor só 'true'/'false' → `22023`, upsert por
-- `on conflict (chave)` e trilha em `gps.acessos_log`.
--
-- ⚠️ `create or replace` com a MESMA assinatura `(text, text)` — substitui, não
-- cria sobrecarga (e preserva o ACL existente). Conferir com
-- `pg_get_function_arguments` se um dia a assinatura mudar: assinatura
-- diferente deixa DUAS funções vivas e o chamador antigo fica na velha.
-- ---------------------------------------------------------------------------
create or replace function gps.config_definir(p_chave text, p_valor text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode='42501'; end if;
  if p_chave is null or p_chave not in (
    'chamados_aberto','chamados_categorias_ativo','convite_socio_ativo','entrada_codigo_ativa',
    'minuta_contexto_obrigatorio',
    'plantao_inscricao_aberta','resgate_ativo','slack_mencoes_ativo','socio_cadastro_obrigatorio',
    'troca_email_login_ativa','tutoriais_ativo','videos_ativo',
    -- Agenda de Sessões (…293 e …294). Desligar `sessoes_email_ativo` é o
    -- freio de mão do disparo por cron; as outras duas relaxam exigências
    -- de fluxo sem deploy.
    'sessoes_email_ativo','sessoes_exige_disc','sessoes_exige_confirmacao',
    -- Pré-visualização INLINE de documento na ficha do cliente (…310). Lido
    -- por `gps.documento_inline_ativo()`. AUSENTE = LIGADO: desligar faz a
    -- equipe voltar a só BAIXAR o documento; a leitura continua existindo.
    'documento_inline_ativo'
  ) then raise exception 'Este interruptor não existe.' using errcode='22023'; end if;
  if p_valor not in ('true','false') then
    raise exception 'Este interruptor só aceita ligado ou desligado.' using errcode='22023'; end if;
  insert into gps.config (chave, valor, atualizado_por)
  values (p_chave, p_valor, auth.uid())
  on conflict (chave) do update set valor=excluded.valor, atualizado_por=excluded.atualizado_por;
  insert into gps.acessos_log (acao, aluno_id, detalhe, feito_por)
  values ('interruptor_alterado', null,
    format('interruptor "%s" definido para %s', p_chave, p_valor), auth.uid());
end; $function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROTEIRO DE PROVA — Marcio roda no banco de produção e cola o resultado aqui
--
-- ⚠️ P4 e P5 ESCREVEM. Rodar DENTRO de `begin … rollback`, sem exceção.
-- `explain analyze` em INSERT/UPDATE **executa** o comando — em 15/09/2026 no
-- SIC-HF um `explain (analyze) update` gravou valor em produção e deixou um
-- par de chaves acopladas em estado intermediário. Aqui vale a mesma regra
-- para o INSERT/upsert de `config_definir`.
--
-- Sem `explain (analyze)` de query quente: esta migração não cria query nova
-- de volume. A única leitura é `select valor from gps.config where chave = $1`
-- — PK sobre 21 linhas, O(1), 1 clique por abertura de documento. P2 mede o
-- plano assim mesmo, porque a regra da casa é medir, não supor.
--
-- ── P1. Ausente = LIGADO ────────────────────────────────────────────────
--   select count(*) from gps.config where chave = 'documento_inline_ativo';
--   -- esperado: 0 (esta migração NÃO popula a linha).
--   select gps.documento_inline_ativo();
--   -- esperado: true
--   -- a colar:
--
-- ── P2. Com a linha em 'false' → false (em transação, SEM persistir) ────
--   begin;
--     insert into gps.config (chave, valor) values ('documento_inline_ativo','false')
--       on conflict (chave) do update set valor = 'false';
--     select gps.documento_inline_ativo();          -- esperado: false
--     update gps.config set valor = 'true' where chave = 'documento_inline_ativo';
--     select gps.documento_inline_ativo();          -- esperado: true
--     update gps.config set valor = 'talvez' where chave = 'documento_inline_ativo';
--     select gps.documento_inline_ativo();          -- esperado: true (só 'false' desliga)
--     explain (analyze, buffers)
--       select c.valor from gps.config c where c.chave = 'documento_inline_ativo';
--     -- esperado: 1 linha, Buffers baixíssimo, tempo < 0,1 ms. Seq Scan em
--     --           tabela de 21 linhas é a escolha CERTA do planner — o que
--     --           reprovaria aqui é `rows` na casa dos milhares, não o nó.
--   rollback;
--   -- a colar:
--
-- ── P3. ACL da função nova: nem PUBLIC nem anon ─────────────────────────
--   select p.proname, p.prosecdef, p.provolatile, p.proconfig, p.proacl::text
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'gps' and p.proname = 'documento_inline_ativo';
--   -- esperado: prosecdef = t · provolatile = 's' (stable) ·
--   --           proconfig = {search_path=""} ·
--   --           proacl = {postgres=X/postgres,authenticated=X/postgres,
--   --                     service_role=X/postgres}  (o mesmo das outras 6)
--   -- 🔴 REPROVA se aparecer entrada começando com `=` (isso é PUBLIC) ou
--   --    qualquer `anon=X`. Conferir a entrada, não `has_function_privilege`:
--   --    `proacl::text like '%=X/%'` dá falso positivo (casa `postgres=X/`).
--   select count(*) from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace,
--     lateral unnest(p.proacl) a
--    where n.nspname='gps' and p.proname='documento_inline_ativo'
--      and a::text like '=%';
--   -- esperado: 0
--   select has_function_privilege('anon','gps.documento_inline_ativo()','EXECUTE'),
--          has_function_privilege('authenticated','gps.documento_inline_ativo()','EXECUTE');
--   -- esperado: false, true
--   -- a colar:
--
-- ── P4. A allowlist VIVA tem a chave nova (16) ──────────────────────────
--   select pg_get_functiondef(p.oid) like '%documento_inline_ativo%' as tem_a_chave
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'gps' and p.proname = 'config_definir';
--   -- esperado: true
--   select count(*) from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='gps' and p.proname='config_definir';
--   -- esperado: 1 (UMA função, não duas — `create or replace` com a mesma
--   --           assinatura substitui; assinatura diferente criaria sobrecarga)
--   -- a colar:
--
-- ── P5. Admin grava a chave nova + trilha (EM ROLLBACK) ─────────────────
--   -- Com JWT de ADMIN real (PostgREST), não como `postgres`: a guarda é
--   -- `gp_is_admin()` e rodar como superusuário não prova nada.
--   begin;
--     select gps.config_definir('documento_inline_ativo','false');
--     select chave, valor, atualizado_por from gps.config
--      where chave = 'documento_inline_ativo';
--     -- esperado: 1 linha, valor='false', atualizado_por = o uid do admin
--     select gps.documento_inline_ativo();          -- esperado: false
--     select acao, detalhe, feito_por from gps.acessos_log
--      where acao = 'interruptor_alterado' order by criado_em desc limit 1;
--     -- esperado: detalhe = 'interruptor "documento_inline_ativo" definido para false'
--     select gps.config_definir('documento_inline_ativo','talvez');
--     -- esperado: ERRO [22023] "Este interruptor só aceita ligado ou desligado."
--   rollback;
--   select count(*) from gps.config where chave = 'documento_inline_ativo';
--   -- esperado: 0 (o rollback desfez tudo, inclusive a trilha)
--   -- a colar:
--
-- ── P6. Sem JWT e com JWT de não-admin ──────────────────────────────────
--   -- anon (sem sessão):      esperado ERRO [42501] "Sem permissão." — e a
--   --                         função de LEITURA nem executa (revoke).
--   -- parceiro (authenticated, não-admin):
--   --   select gps.documento_inline_ativo();  -- esperado: true (lê, e é para ler)
--   --   select gps.config_definir('documento_inline_ativo','false');
--   --                         -- esperado: ERRO [42501] "Sem permissão."
--   -- 🔑 Esta é a assimetria de propósito: TODO autenticado LÊ o interruptor
--   --    (a rota precisa, com a sessão de quem pede); só o ADMIN escreve.
--   -- a colar:
--
-- ── P7. O log da Hostinger para de encher ───────────────────────────────
--   -- Depois do deploy, abrir um documento pela ficha e conferir que NÃO há
--   -- mais linha `documento/inlineAtivo` com `42883` no log.
--   -- 🔴 Se o `42883` sumir e aparecer `42501`, é o GRANT faltando — não o
--   --    revoke de mais. Voltar ao P3.
--   -- a colar:
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- APLICADA em 24/09/2026 ~14:55 UTC (apply_migration, sucesso). Provas P1–P6
-- rodadas no banco VIVO dentro de begin … rollback logo depois:
--   P1 sem linha em gps.config ....................... documento_inline_ativo() = true
--   P2 valor 'false' ................................. = false
--      valor lixo 'off' (update direto por SQL) ....... = true (só 'false' desliga — por desenho)
--   P3 proacl ........ {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--   P4 pg_proc config_definir ........................ 1 função (sem sobrecarga)
--      pg_get_functiondef contém 'documento_inline_ativo' ... true
--   P5 config_definir('documento_inline_ativo','false') com claims de admin:
--      gps.config gravou 'false' · acessos_log +1 'interruptor_alterado' ·
--      documento_inline_ativo() passou a false — tudo desfeito no rollback.
--   P7 (42883 sumindo do log) só se prova em produção depois do deploy.
-- ---------------------------------------------------------------------------
