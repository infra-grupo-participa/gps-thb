-- ═══════════════════════════════════════════════════════════════════════════
-- Evolução da Agenda de Sessões — FATIA D: o link da sala, com dono por
-- precedência (P3).
--
-- PRD: docs/specs/2026-09-23-sessoes-disc-link-resumo-PRD.md
--      (§3 fatia D, os 7 itens · §4 P3 · §6.3 · §5.5)
--
-- Entrega DUAS funções e UMA coluna de apoio:
--   gps.sessao_link_definir(uuid, text)
--   gps.sessao_link_remover(uuid)
--   gps.sessao_agendamentos.link_por_equipe  (boolean, ver seção 1)
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 ESTA MIGRAÇÃO ENTRA POR CIMA DE ESTRUTURA VIVA
-- ═══════════════════════════════════════════════════════════════════════════
-- Já estão APLICADAS em produção (medido pelo Marcio em 23/09/2026):
--   · …291 — as 5 tabelas, a RLS, os grants POR COLUNA, o CHECK
--            `chk_sessao_agend_link` (`link_reuniao ~ '^https://'`);
--   · …292 — as RPCs da agenda (o padrão de guarda que este arquivo copia);
--   · …293 — o cron `sessao-emails` (*/5), que **põe `link_reuniao` DENTRO
--            do corpo do e-mail**, em `href` HTML e em texto puro
--            (…293:834-859). É esse fato que torna o CR/LF um problema de
--            segurança aqui e não um capricho — item 7 do PRD;
--   · fatia A (…294) — `link_definido_por`, `link_em`, o CHECK
--            `chk_sessao_agend_link_dono` e o `grant select` das duas
--            colunas novas a `authenticated`.
--
-- E o estado que governa as escolhas abaixo:
--   · **0 sessões agendadas hoje** → nenhum backfill, nenhuma linha a
--     reconciliar. A coluna nova nasce NULL em zero linhas;
--   · `gps.sessao_agendamentos` **não tem grant de UPDATE para
--     `authenticated`** — toda escrita é por RPC `security definer`. Esta
--     migração NÃO reabre isso e não concede grant de tabela nenhum.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 REVERSÃO — o caminho de volta, NESTA ORDEM
-- ═══════════════════════════════════════════════════════════════════════════
-- O botão de pânico REAL é o passo 1: derruba a escrita sem deploy, sem
-- migration e sem tocar em dado nenhum (§5.5 do PRD). Os passos 2 a 4 só
-- fazem sentido para desfazer a feature inteira.
--
--   -- 1) BOTÃO DE PÂNICO (segundos, sem deploy): ninguém mais define link.
--   --    O que já está gravado continua visível e continua indo no e-mail.
--   revoke execute on function gps.sessao_link_definir(uuid, text) from authenticated;
--   revoke execute on function gps.sessao_link_remover(uuid)       from authenticated;
--
--   -- 2) As funções:
--   drop function if exists gps.sessao_link_remover(uuid);
--   drop function if exists gps.sessao_link_definir(uuid, text);
--
--   -- 3) O grant de coluna desta migração (a tabela segue viva):
--   revoke select (link_por_equipe) on gps.sessao_agendamentos from authenticated;
--
--   -- 4) A coluna de apoio:
--   --    🔴 `link_definido_por` e `link_em` NÃO entram aqui — são da fatia A
--   --    (…294) e a reversão delas está no cabeçalho DAQUELE arquivo.
--   alter table gps.sessao_agendamentos
--     drop column if exists link_por_equipe;
--
--   -- NÃO se reverte: `chk_sessao_agend_link_dono` e `chk_sessao_agend_link`
--   -- são da fatia A e da …291. Este arquivo não os cria, não os altera e
--   -- não os dropa.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 O QUE ESTA MIGRAÇÃO **NÃO** TOCA
-- ═══════════════════════════════════════════════════════════════════════════
-- `gps.reuniao_*`, `gps.agenda`, `gps.plantao_*` — órfãs/proibidas, escopo
-- fechado pelo Marcio. `public.gp_is_admin()` é CONSUMIDA, nunca alterada (é
-- lida por policies de 50 tabelas em 3 schemas). `gps.eh_equipe()` e
-- `gps.aluno_atual()` idem. A migração `…295` (fatia C, `sessao_concluir`) é
-- de outro executor e roda em paralelo: NENHUM objeto é compartilhado — ela
-- escreve `estado/resumo/resumo_em/resumo_por`, esta escreve
-- `link_reuniao/link_definido_por/link_em/link_por_equipe`. Os 4 CHECKs da
-- …291 e os 3 da …294 ficam byte a byte como estão; esta migração não roda
-- `drop constraint` nenhum.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 CONFERÊNCIA OBRIGATÓRIA ANTES DE APLICAR (P0)
-- ═══════════════════════════════════════════════════════════════════════════
-- CHECK reescrito de memória apaga valor em silêncio. Esta migração NÃO
-- reescreve CHECK algum — mas ela DEPENDE da forma exata de dois deles, e
-- depender de memória é o mesmo erro com outro nome. Rodar e comparar:
--
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid = 'gps.sessao_agendamentos'::regclass
--      and conname in ('chk_sessao_agend_link', 'chk_sessao_agend_link_dono')
--    order by conname;
--
--   Esperado (lido do banco em 23/09/2026, não de cabeça):
--     chk_sessao_agend_link
--       CHECK ((link_reuniao IS NULL) OR (link_reuniao ~ '^https://'::text))
--     chk_sessao_agend_link_dono
--       CHECK (((link_definido_por IS NULL) AND (link_em IS NULL))
--              OR (link_em IS NOT NULL))
--
-- 🔑 POR QUE ISSO IMPORTA PARA O CÓDIGO ABAIXO, em uma linha cada:
--
--   · `chk_sessao_agend_link` aceita **null**. Logo `sessao_link_remover`
--     pode zerar `link_reuniao` sem violar nada — e por isso a validação de
--     `^https://` da RPC de definir é DEFESA EM PROFUNDIDADE (mensagem
--     legível), não a única guarda. O CHECK continua sendo o piso.
--
--   · `chk_sessao_agend_link_dono` permite `link_em` SEM
--     `link_definido_por` (a FK é `on delete set null`), mas **proíbe o
--     inverso**: dono sem carimbo. Consequência dura para `sessao_link_remover`:
--     ela NÃO pode zerar só `link_em` deixando `link_definido_por` para trás
--     — violaria. A RPC zera os três campos do link de uma vez, no mesmo
--     UPDATE, e é por isso, não por estética.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- 1) gps.sessao_agendamentos.link_por_equipe — o PAPEL, congelado na escrita
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 DECISÃO (o PRD deixou a escolha aberta entre (a) consultar o papel na
-- hora da escrita nova e (b) gravar o papel junto). **Escolhido (b).**
--
-- A opção (a) — guardar só o uuid em `link_definido_por` e perguntar
-- `gp_is_admin(aquele_uuid)` na escrita seguinte — é mais barata e tem um
-- modo de falha que não se percebe: **o papel muda, e a precedência já
-- decidida muda junto, retroativamente**. Dois casos concretos nesta base,
-- nenhum hipotético:
--
--   · A doutora cola o link. Meses depois o acesso dela é desativado ou o
--     cargo em `public.perfis` sai de 'admin'. Na leitura (a), aquele link
--     **deixa de ser "da equipe"** e o parceiro passa a poder sobrescrever um
--     link que a equipe pôs — sem nenhum evento dizendo que a regra mudou.
--   · O contrário: o parceiro cola o link e depois vira operador/admin (o
--     GPS já converte titular em sócio, já promove operador — …264, …287).
--     Na leitura (a), o link dele **retroage a "da equipe"** e a própria
--     equipe passa a receber o aviso de "sobrescrevendo o do parceiro"
--     errado.
--
-- E há o caso que (a) simplesmente não resolve: `link_definido_por` é
-- `on delete set null`. Apagado o login, o uuid vira NULL e **não há papel
-- nenhum a consultar** — a precedência ficaria indefinida justamente na linha
-- mais antiga.
--
-- (b) grava o fato no instante em que ele foi verdade. Precedência é decisão
-- tomada numa data; relê-la contra o cadastro de hoje é reescrever o passado.
-- Mesma família da lição já paga aqui: `duracao_min` e `briefing_snapshot`
-- são CÓPIAS CONGELADAS no ato, justamente para o catálogo de amanhã não
-- reescrever o compromisso de ontem (…291).
--
-- Custo declarado de (b): uma coluna a mais e a obrigação de escrevê-la em
-- toda gravação de link. As duas RPCs abaixo são os ÚNICOS caminhos de
-- escrita (não há grant de UPDATE), então não existe caminho que grave o link
-- e esqueça o papel.
--
-- ⚠️ `link_por_equipe` NÃO entra em `chk_sessao_agend_link_dono` e nenhum
-- CHECK novo é criado para ela. Amarrar a tripla por CHECK travaria o
-- `on delete set null` da FK (o mesmo raciocínio que o comentário daquele
-- CHECK já registra) e não compraria nada: as RPCs são a única escrita.
alter table gps.sessao_agendamentos
  add column if not exists link_por_equipe boolean;

comment on column gps.sessao_agendamentos.link_por_equipe is
  'PAPEL de quem colou o link VIGENTE, congelado no instante da escrita: true = equipe (admin ou a responsavel da sessao), false = parceiro (membro do ambiente). null = nenhum link definido por RPC. 🔴 E O QUE DECIDE A PRECEDENCIA P3, e e coluna em vez de consulta ao vivo DE PROPOSITO: perguntar hoje "aquele uuid e equipe?" faz a precedencia MUDAR RETROATIVAMENTE quando o cargo em public.perfis muda (a doutora desativada faria o link dela deixar de ser da equipe; o parceiro promovido a operador faria o link dele virar da equipe) -- e nao responde nada quando o login e apagado, porque link_definido_por e `on delete set null`. Mesma familia de duracao_min e briefing_snapshot: copia congelada no ato. Escrita SO por gps.sessao_link_definir / gps.sessao_link_remover.';

-- ── GRANT DE COLUNA ───────────────────────────────────────────────────────
-- 🔴 `gps.sessao_agendamentos` tem grant POR COLUNA (…291 seção 6), não por
-- tabela: coluna nova nasce INVISÍVEL para `authenticated`. Aqui isso seria o
-- defeito, não a proteção.
--
-- DENTRO, pela mesma razão que a fatia A pôs `link_definido_por` dentro: o
-- parceiro precisa saber **antes de tentar** se pode trocar o link. Sem esta
-- coluna a tela dele só saberia comparando `link_definido_por` com o próprio
-- id — o que dá a resposta errada quando quem colou foi a doutora E o login
-- dela já não existe (uuid null). Com ela, a tela diz "colado pela equipe" e
-- o parceiro não descobre a regra por um 22023.
--
-- Não há dado pessoal aqui: é um boolean sobre uma sessão que o aluno já lê
-- por RLS (`aluno_id = gps.aluno_atual()`).
--
-- ⚠️ `grant select (col)` é ADITIVO: este comando NÃO mexe na lista anterior,
-- e `briefing_snapshot` e `resumo` continuam FORA como estão desde a …291 e a
-- …294. A prova P2 do roteiro confere isso em vez de confiar.
grant select (link_por_equipe) on gps.sessao_agendamentos to authenticated;

-- 🔴 NENHUM grant de UPDATE/INSERT/DELETE. `grant select` NÃO revoga escrita
-- — a lição de `gps.entrevista_tentativas` (…266), onde a tabela nasceu
-- gravável por `authenticated` porque o schema `gps` tem ALTER DEFAULT
-- PRIVILEGES permissivo e o revoke só nomeava `public`/`anon`. Aqui não há
-- escrita a revogar (a …291 já fez `revoke all ... from public, anon,
-- authenticated` ANTES de qualquer grant), e esta migração não reabre nada.
-- A prova P2 confirma em vez de deduzir.


-- ═══════════════════════════════════════════════════════════════════════════
-- 2) gps.sessao_link_dominio — o que PODE ir para a trilha
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 A TRILHA LEVA SÓ O DOMÍNIO, NUNCA A URL INTEIRA (item 6 do PRD).
--
-- Link de sala é CREDENCIAL DE ACESSO, não endereço. Não é teoria nesta base:
-- em 10/09/2026 o Marcio mandou tirar o link do Zoom do e-mail do Plantão
-- (…222) porque a sala era FIXA — 12 slots compartilhavam uma URL, e o link
-- de um e-mail abria todos os plantões futuros. `gps.sessao_eventos` é lida
-- por policy de admin, ou seja **pelos 16 admins**, e é append-only: o que
-- entrar ali fica. Gravar a URL na trilha desfaria, pela porta dos fundos, a
-- decisão de 10/09.
--
-- O domínio responde o que a auditoria precisa ("mudou de meet.google.com
-- para zoom.us?") sem entregar a chave.
--
-- IMMUTABLE + STRICT: não lê tabela, não lê `now()`, não lê `auth.uid()`.
-- `strict` devolve null para entrada null sem executar o corpo.
--
-- Extração sem regex frágil: corta o esquema, corta tudo a partir da primeira
-- `/`, `?` ou `#`, corta credencial embutida (`user:senha@host`, que é
-- justamente o pedaço que NÃO pode vazar) e corta a porta. O que sobra é o
-- host. `lower()` porque host é case-insensitive e a trilha não pode gerar
-- duas grafias do mesmo domínio.
create or replace function gps.sessao_link_dominio(p_link text)
returns text
language sql
immutable
strict
set search_path = ''
as $function$
  -- 🔴 CORRIGIDO ao aplicar (22/09): a versão anterior fechava com
  -- `split_part(<texto>, 1)` — SEM o delimitador — e o Postgres recusava com
  -- 42883 "function split_part(text, integer) does not exist". O executor
  -- simulou a lógica em Python, e a simulação reproduz o RACIOCÍNIO, não a
  -- assinatura: parêntese no lugar errado passa na simulação e morre no
  -- parser. Lição: expressão SQL só se prova no Postgres.
  select nullif(
    lower(
      -- 4) fora a porta
      split_part(
        -- 3) fora credencial embutida user:senha@ (fica o que vem DEPOIS do
        --    último '@'; sem '@' o reverse/split devolve o próprio host)
        reverse(split_part(reverse(
          -- 2) fora path/query/fragmento: corta no primeiro / ? #
          split_part(split_part(split_part(
            -- 1) fora o esquema
            regexp_replace(btrim(p_link), '^[A-Za-z][A-Za-z0-9+.-]*://', ''),
          '/', 1), '?', 1), '#', 1)
        ), '@', 1)),
      ':', 1)
    ),
  '');
$function$;

comment on function gps.sessao_link_dominio(text) is
  'Extrai SO o host de uma URL, para a trilha. 🔴 Existe porque gps.sessao_eventos e append-only e lida pelos 16 admins, e link de sala e CREDENCIAL DE ACESSO -- em 10/09/2026 o Marcio mandou tirar o link do Zoom do e-mail do Plantao (…222) porque a sala e fixa e um e-mail abria todos os encontros futuros; gravar a URL inteira na trilha desfaria aquela decisao pela porta dos fundos. Descarta esquema, path, query, fragmento, credencial embutida (user:senha@) e porta. IMMUTABLE/STRICT: nao le tabela nem contexto.';

revoke all on function gps.sessao_link_dominio(text) from public, anon, authenticated;
grant execute on function gps.sessao_link_dominio(text) to service_role;
-- ⚠️ `authenticated` aparece no revoke DE PROPÓSITO: no schema `gps` o ALTER
-- DEFAULT PRIVILEGES dá execute a `authenticated` em função nova, e esta aqui
-- é auxiliar — ninguém do front a chama. E `revoke from anon` sozinho NÃO
-- pega quando a permissão vem de `PUBLIC` (lição de 19/08: 3 das 15
-- `fn_fin_*` continuaram executáveis depois de um revoke que "funcionou"),
-- por isso `public` está nomeado. As duas RPCs abaixo são SECURITY DEFINER e
-- a chamam como owner, sem depender de grant.


-- ═══════════════════════════════════════════════════════════════════════════
-- 3) gps.sessao_link_definir — a precedência P3, os 7 itens
-- ═══════════════════════════════════════════════════════════════════════════
-- Os 7 itens do PRD, e onde cada um está no corpo:
--   1. quem escreve: admin · responsável · membro do ambiente   → bloco GUARDA
--   2. equipe vence parceiro, com frase própria (22023)         → bloco P3
--   3. parceiro põe o primeiro e troca o próprio                → bloco P3
--   4. equipe sobrescreve qualquer um                           → bloco P3
--   5. tudo sob `for update`                                    → bloco SELECT
--   6. evento com domínio de/para + papel, NUNCA a URL          → bloco TRILHA
--   7. https (CHECK) + teto 500 + recusa CR/LF                  → bloco VALIDA
--
-- 🔴 A ORDEM DOS BLOCOS É PARTE DA CORREÇÃO, não estilo:
--   guarda de entrada  →  lock  →  precedência  →  validação  →  escrita.
-- A guarda incondicional vem ANTES de qualquer leitura da linha. Quem não tem
-- papel nenhum recebe 42501 sem que a função revele se a sessão existe.
--
-- 🔴 VOLATILE (default), nunca `stable`: a função escreve em
-- `gps.sessao_eventos`. `stable` faz o Postgres RECUSAR o INSERT em execução
-- — o mesmo motivo que `sessao_briefing_ler` documenta na …292.
create or replace function gps.sessao_link_definir(
  p_agendamento_id uuid,
  p_link           text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid       uuid    := auth.uid();
  v_admin     boolean := coalesce(public.gp_is_admin(), false);
  v_ambiente  uuid    := gps.aluno_atual();
  v_a         record;
  v_link      text;
  v_quem      text;
  v_equipe    boolean;
  v_dom_de    text;
  v_dom_para  text;
begin
  -- ── ENTRADA ────────────────────────────────────────────────────────────
  if p_agendamento_id is null then
    raise exception 'sessao nao informada' using errcode = '22023';
  end if;

  -- 🔴 GUARDA INCONDICIONAL, ANTES DE TUDO. Sem sessão não há papel possível.
  -- `auth.uid()` null é o caso do `service_role` batendo direto na RPC e o do
  -- JWT ausente: os dois param aqui, e nenhuma linha é lida.
  if v_uid is null then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  -- ── LOCK (item 5) ──────────────────────────────────────────────────────
  -- 🔴 `for update` OBRIGATÓRIO e é o ponto inteiro desta fatia. Sem ele,
  -- dois cliques simultâneos (a doutora e o parceiro, ou dois membros do
  -- mesmo ambiente) leem os dois "ainda não tem dono", os dois passam pela
  -- precedência e os dois gravam — o segundo apaga o primeiro, ninguém vê
  -- erro, e o perdedor só descobre quando a sala não abre. É a corrida que o
  -- Marcio apontou (§6.3 do PRD): não gera conflito no git, não gera erro no
  -- banco, e é silenciosa dos dois lados.
  --
  -- O lock é na LINHA do agendamento, a mesma técnica de `sessao_cancelar`
  -- (…292) e de `cliente_minuta_anexar` (…273). O segundo clique fica
  -- bloqueado até o primeiro commitar, e então relê o estado JÁ com dono —
  -- e é aí que a precedência do item 2 dispara para valer.
  select a.id, a.aluno_id, a.responsavel_id, a.estado,
         a.link_reuniao, a.link_definido_por, a.link_em, a.link_por_equipe
    into v_a
    from gps.sessao_agendamentos a
   where a.id = p_agendamento_id
   for update;

  if v_a.id is null then
    raise exception 'Sessão não encontrada.' using errcode = 'P0002';
  end if;

  -- ── GUARDA DE PAPEL (item 1) ───────────────────────────────────────────
  -- 🔴 CADA RAMO DENTRO DE `coalesce(..., false)`. Nulo em guarda LIBERA:
  -- um `if` com condição NULL não dispara o `raise`. Isso já vazou DUAS vezes
  -- nesta mesma feature — `sessao_pode_agendar` (achado ALTO do pentester em
  -- 22/09) e `sessao_briefing_ler` — e o PRD registra as duas. Aqui os três
  -- ramos são coalesced e o `else` fecha: com `v_ambiente` null (usuário sem
  -- ambiente) o terceiro ramo dá false, não NULL, e cai no 42501.
  --
  -- "Equipe" = admin OU a responsável da sessão. **NÃO é `gps.eh_equipe()`**:
  -- aquela inclui qualquer operador ativo da esteira, e operador não conduz
  -- reunião — dar a ele o poder de sobrescrever o link da doutora seria
  -- ampliar o papel por acidente. Mesmo recorte que `sessao_cancelar` usa.
  if coalesce(v_admin, false) then
    v_quem := 'admin';  v_equipe := true;
  elsif coalesce(v_a.responsavel_id = v_uid, false) then
    v_quem := 'responsavel';  v_equipe := true;
  elsif coalesce(v_ambiente = v_a.aluno_id, false) then
    v_quem := 'aluno';  v_equipe := false;
  else
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  -- ── ESTADO ─────────────────────────────────────────────────────────────
  -- Link de sala só faz sentido em sessão marcada. Sessão cancelada, falta ou
  -- já realizada não recebe link novo — e o e-mail da …293 lê a linha viva.
  if v_a.estado <> 'agendado' then
    raise exception 'Esta sessão não está marcada — não há sala para definir.'
      using errcode = '22023';
  end if;

  -- ── PRECEDÊNCIA P3 (itens 2, 3 e 4) ────────────────────────────────────
  -- 🔴 A EQUIPE VENCE O PARCEIRO, SEMPRE.
  --
  -- Lê-se do estado CONGELADO (`link_por_equipe`), nunca do cargo de hoje —
  -- ver a seção 1. `coalesce(..., false)` de novo: `link_por_equipe` é NULL
  -- quando ninguém definiu link ainda, e `if NULL and ...` não dispararia o
  -- raise, liberando o parceiro sobre o link da equipe. Exatamente o defeito
  -- que esta feature já pagou duas vezes.
  --
  -- A condição é "há link vigente E ele é da equipe E quem está tentando não
  -- é equipe". Os três termos importam:
  --   · sem link vigente → o parceiro põe o primeiro (item 3);
  --   · link do próprio parceiro → ele troca (item 3);
  --   · quem tenta é equipe → passa por cima de qualquer um (item 4).
  -- 🔴 FALHA FECHADO (corrigido 22/09 após achado do pentest, EXPLORADO):
  -- `coalesce(link_por_equipe, TRUE)`. A policy gps_sessao_agend_admin é
  -- `for all`, então um admin grava `link_reuniao` por SQL direto ou pelo
  -- painel -- caminho que este projeto usa rotineiramente -- e a linha fica
  -- com link da equipe e papel NULO. Com `false` aqui, o parceiro
  -- SOBRESCREVIA o link da doutora: provado por exploração.
  if coalesce(v_a.link_reuniao is not null
              and coalesce(v_a.link_por_equipe, true)
              and not v_equipe, false) then
    raise exception 'A equipe já definiu o link desta sessão. Se estiver errado, fale pelo Suporte.'
      using errcode = '22023';
  end if;

  -- ── VALIDAÇÃO (item 7) ─────────────────────────────────────────────────
  -- `nullif(btrim(...), '')`: espaço em branco colado não vira link vazio que
  -- passa no CHECK por acidente.
  v_link := nullif(btrim(coalesce(p_link, '')), '');

  if v_link is null then
    raise exception 'Cole o link da sala.' using errcode = '22023';
  end if;

  -- 🔴 CR/LF RECUSADO. Não é higiene genérica: a …293 monta o e-mail da
  -- sessão concatenando `link_reuniao` DENTRO de um `href` HTML e dentro do
  -- corpo em texto puro (…293:834-859). Um `\r\n` no meio do valor é injeção
  -- de cabeçalho na Resend. É o MESMO tratamento que `gps.config.valor` leva
  -- desde a …110 (`valor !~ '[\r\n]'`), pela mesma razão e com a mesma
  -- expressão — `chamados_email_equipe` guarda endereço que vira cabeçalho.
  --
  -- A classe inteira, não só a ocorrência: `[[:cntrl:]]` barra CR, LF, TAB,
  -- NUL e o resto dos controles. Um TAB no href também quebra o link, e
  -- caractere de controle não tem uso legítimo numa URL — o que precisa
  -- aparecer numa URL é percent-encoded por definição.
  if v_link ~ '[[:cntrl:]]' then
    raise exception 'O link não pode conter quebra de linha. Cole a URL numa linha só.'
      using errcode = '22023';
  end if;

  -- Teto de 500 (item 7). O CHECK da coluna não tem teto; sem este limite, um
  -- link de 8 KB entraria no corpo do e-mail e na tela.
  if char_length(v_link) > 500 then
    raise exception 'O link passa de 500 caracteres.' using errcode = '22023';
  end if;

  -- `^https://` já é o CHECK `chk_sessao_agend_link` da …291. Repetido aqui
  -- para dar FRASE LEGÍVEL em vez do 23514 cru do Postgres — defesa em
  -- profundidade, não substituição: o CHECK continua sendo o piso, e é ele
  -- que protege qualquer caminho futuro que não passe por esta RPC.
  -- 🔴 `https` e não `http`: o link vai por e-mail para o cliente.
  if v_link !~ '^https://' then
    raise exception 'O link precisa começar com https://'
      using errcode = '22023';
  end if;

  -- Nada a fazer se o link é idêntico ao vigente: evita evento de trilha que
  -- registra uma mudança que não houve (e, do lado do parceiro, evita que
  -- reenviar o mesmo link pareça uma troca).
  if v_a.link_reuniao is not distinct from v_link then
    return jsonb_build_object(
      'agendamento_id', v_a.id,
      'alterado',       false,
      'por',            v_quem,
      'por_equipe',     v_equipe);
  end if;

  -- ── ESCRITA ────────────────────────────────────────────────────────────
  -- Os quatro campos do link num UPDATE só, dentro do lock. `link_em` e
  -- `link_definido_por` juntos satisfazem `chk_sessao_agend_link_dono`.
  update gps.sessao_agendamentos
     set link_reuniao      = v_link,
         link_definido_por = v_uid,
         link_em           = now(),
         link_por_equipe   = v_equipe
   where id = p_agendamento_id;

  -- ── TRILHA (item 6) ────────────────────────────────────────────────────
  -- 🔴 SÓ O DOMÍNIO, NUNCA A URL. Ver a seção 2 para o porquê.
  -- ⚠️ `gps.sessao_eventos.acao` é texto livre 3..60 (`chk_sessao_eventos_acao`),
  -- NÃO catálogo fechado — a …291 decidiu isso de propósito, para ação nova
  -- não virar migration. Logo NÃO há CHECK de catálogo a reescrever aqui, e
  -- esta migração de fato não toca CHECK nenhum. (É o contrário de
  -- `gps.acessos_log.acao`, esse sim catálogo fechado, que a …292 teve de
  -- reescrever inteiro lendo `pg_get_constraintdef` antes.)
  v_dom_de   := gps.sessao_link_dominio(v_a.link_reuniao);
  v_dom_para := gps.sessao_link_dominio(v_link);

  insert into gps.sessao_eventos (agendamento_id, acao, ator_id, detalhe)
  values (p_agendamento_id, 'sessao_link_definido', v_uid,
          jsonb_build_object(
            'por',              v_quem,
            'por_equipe',       v_equipe,
            'dominio_de',       v_dom_de,
            'dominio_para',     v_dom_para,
            'sobrescreveu',     (v_a.link_reuniao is not null),
            'anterior_da_equipe', v_a.link_por_equipe,
            'tamanho',          char_length(v_link)));

  return jsonb_build_object(
    'agendamento_id', v_a.id,
    'alterado',       true,
    'por',            v_quem,
    'por_equipe',     v_equipe,
    'dominio',        v_dom_para);
end;
$function$;

comment on function gps.sessao_link_definir(uuid, text) is
  'Define o link da sala de uma sessao marcada, com a precedencia P3 do PRD. Escrevem: admin, a responsavel (responsavel_id = auth.uid()) e qualquer membro do ambiente (aluno_id = gps.aluno_atual()). 🔴 A EQUIPE VENCE O PARCEIRO: se o link vigente foi posto por equipe, o parceiro recebe 22023 com frase propria e vai ao Suporte -- custo declarado no PRD §3 fatia D, e o preco de nao ter corrida. O parceiro poe o primeiro link e troca o que ele mesmo pos. 🔴 Tudo sob `for update` na linha: sem o lock, dois cliques simultaneos leem os dois "ainda nao tem dono", os dois gravam, e o perdedor so descobre quando a sala nao abre. 🔴 O papel vem de link_por_equipe (congelado na escrita), NUNCA de consulta ao cargo de hoje -- senao a precedencia muda retroativamente quando alguem e promovido ou desativado. 🔴 A trilha leva SO O DOMINIO de origem e destino, nunca a URL: link de sala e credencial e sessao_eventos e lida pelos 16 admins (mesma decisao de …222, o link do Zoom fora do e-mail). Valida https (o CHECK da …291 e o piso; aqui e frase legivel), teto 500 e RECUSA caractere de controle -- o link entra em href e em corpo de e-mail na …293, e CR/LF ali e injecao de cabecalho, o mesmo tratamento de chamados_email_equipe. Toda guarda em coalesce(..., false): nulo em guarda LIBERA, defeito ja pago 2x nesta feature.';

-- 🔴 `revoke all ... from public, anon` ANTES do grant, com `public` NOMEADO.
-- `revoke from anon` sozinho NÃO pega quando a permissão vem de `PUBLIC` —
-- medido em 19/08/2026 em 3 das 15 `fn_fin_*`, onde o revoke rodou sem erro e
-- sem efeito porque o ACL trazia `=X/postgres` (a entrada de PUBLIC) e toda
-- role herda de PUBLIC. E no schema `gps` o ALTER DEFAULT PRIVILEGES já dá
-- execute a `authenticated` em função nova: sem o revoke, a função nasce
-- pública. `authenticated` fica de fora do revoke aqui porque o grant logo
-- abaixo é justamente para ele — a ordem é revoke-depois-grant.
revoke all on function gps.sessao_link_definir(uuid, text) from public, anon;
grant execute on function gps.sessao_link_definir(uuid, text) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4) gps.sessao_link_remover — mesma guarda, mesma precedência
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 ZERA OS QUATRO CAMPOS. Não é escolha estética: `chk_sessao_agend_link_dono`
-- proíbe `link_definido_por` sem `link_em`, então limpar pela metade violaria
-- o CHECK. E deixar `link_por_equipe = true` numa linha sem link faria a
-- precedência do item 2 barrar o parceiro por causa de um link que não existe
-- mais — a equipe removeria o link e trancaria o parceiro fora, em silêncio.
--
-- ⚠️ O rastro de quem tinha posto o link NÃO se perde: ele fica em
-- `gps.sessao_eventos`, que é append-only. A linha guarda o estado vigente; a
-- trilha guarda a história. O comentário de `chk_sessao_agend_link_dono` prevê
-- o caminho oposto (limpar o link mantendo o dono) e o permite — esta RPC
-- simplesmente não o usa, porque manter o dono sem link é o que trancaria o
-- parceiro.
create or replace function gps.sessao_link_remover(p_agendamento_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid      uuid    := auth.uid();
  v_admin    boolean := coalesce(public.gp_is_admin(), false);
  v_ambiente uuid    := gps.aluno_atual();
  v_a        record;
  v_quem     text;
  v_equipe   boolean;
begin
  if p_agendamento_id is null then
    raise exception 'sessao nao informada' using errcode = '22023';
  end if;

  -- 🔴 Guarda incondicional na entrada, igual à de definir.
  if v_uid is null then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  -- 🔴 `for update`: remover e definir concorrentes são a MESMA corrida. Sem o
  -- lock, o parceiro removeria o link no exato instante em que a equipe o
  -- define, e a linha ficaria sem sala com a trilha dizendo que há uma.
  select a.id, a.aluno_id, a.responsavel_id, a.estado,
         a.link_reuniao, a.link_definido_por, a.link_em, a.link_por_equipe
    into v_a
    from gps.sessao_agendamentos a
   where a.id = p_agendamento_id
   for update;

  if v_a.id is null then
    raise exception 'Sessão não encontrada.' using errcode = 'P0002';
  end if;

  if coalesce(v_admin, false) then
    v_quem := 'admin';  v_equipe := true;
  elsif coalesce(v_a.responsavel_id = v_uid, false) then
    v_quem := 'responsavel';  v_equipe := true;
  elsif coalesce(v_ambiente = v_a.aluno_id, false) then
    v_quem := 'aluno';  v_equipe := false;
  else
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if v_a.link_reuniao is null then
    raise exception 'Esta sessão não tem link para remover.' using errcode = '22023';
  end if;

  -- MESMA PRECEDÊNCIA de definir, e por um motivo prático: sem ela, o parceiro
  -- barrado de SOBRESCREVER o link da equipe contornaria a regra removendo
  -- primeiro e definindo depois. Regra que tem porta dos fundos não é regra.
  -- Mesma correção do `definir`: papel nulo conta como da equipe.
  if coalesce(coalesce(v_a.link_por_equipe, true) and not v_equipe, false) then
    raise exception 'A equipe já definiu o link desta sessão. Se estiver errado, fale pelo Suporte.'
      using errcode = '22023';
  end if;

  update gps.sessao_agendamentos
     set link_reuniao      = null,
         link_definido_por = null,
         link_em           = null,
         link_por_equipe   = null
   where id = p_agendamento_id;

  -- 🔴 Só o domínio do que foi removido. Mesma regra da seção 2.
  insert into gps.sessao_eventos (agendamento_id, acao, ator_id, detalhe)
  values (p_agendamento_id, 'sessao_link_removido', v_uid,
          jsonb_build_object(
            'por',                v_quem,
            'por_equipe',         v_equipe,
            'dominio_removido',   gps.sessao_link_dominio(v_a.link_reuniao),
            'anterior_da_equipe', v_a.link_por_equipe));

  return jsonb_build_object(
    'agendamento_id', v_a.id,
    'alterado',       true,
    'por',            v_quem);
end;
$function$;

comment on function gps.sessao_link_remover(uuid) is
  'Remove o link da sala. Mesma guarda e MESMA PRECEDENCIA de gps.sessao_link_definir -- sem a precedencia aqui, o parceiro barrado de sobrescrever o link da equipe contornaria removendo primeiro e definindo depois. 🔴 Zera os QUATRO campos (link_reuniao, link_definido_por, link_em, link_por_equipe): limpar pela metade violaria chk_sessao_agend_link_dono, e deixar link_por_equipe = true sem link trancaria o parceiro fora por causa de um link que nao existe mais. O rastro de quem tinha posto fica em gps.sessao_eventos, que e append-only -- a linha guarda o estado, a trilha guarda a historia. Sob `for update`: remover e definir concorrentes sao a mesma corrida.';

revoke all on function gps.sessao_link_remover(uuid) from public, anon;
grant execute on function gps.sessao_link_remover(uuid) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 AS 5 PERGUNTAS (~/.claude/PROTOCOLO-SUSTENTABILIDADE.md)
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. ESCALA — as duas RPCs tocam UMA linha por chamada, localizada pela PK.
--    Não há `select` que cresça com a tabela: nenhum `order by`, nenhum
--    agregado, nenhuma varredura. Com 10x ou 100x mais sessões o custo é o
--    mesmo. O `insert` na trilha é 1 linha.
--
-- 2. ÍNDICE — 🔴 **NENHUM ÍNDICE CRIADO.** Os dois acessos são por
--    `sessao_agendamentos.id` (chave primária, índice único que já existe) e
--    um `insert` em `sessao_eventos` (bigserial, sem índice secundário por
--    decisão medida da …291). Não há filtro novo, não há `order by` novo, não
--    há join novo — logo não há expressão para o planner casar e nada a
--    indexar. Criar índice aqui seria escrita em toda ação sem plano que o
--    justifique, o oposto do que o protocolo pede.
--    ⚠️ E a medição já existe para este caso: a …291 mediu
--    `explain (analyze, buffers)` nesta tabela em 4.160 linhas (10 anos) e o
--    planner escolheu **Seq Scan em 0,833 ms** — por isso o índice
--    `sessao_agend_responsavel_janela` NÃO foi criado. Acesso por PK, que é o
--    desta fatia, é ainda mais barato que aquilo.
--    🔑 O `explain (analyze)` desta migração está no roteiro abaixo (P4) e é
--    rodado pelo Marcio: eu não tenho conexão com o banco, e **plano previsto
--    de cabeça erra o tipo de scan** (já aconteceu nesta operação em 18/09:
--    previ `Index Scan`, era `Seq Scan`). Não fabrico saída de `explain`.
--    ⚠️ P4 roda `explain (analyze)` de um **UPDATE**, e `explain analyze` em
--    DML **EXECUTA o comando** — por isso o roteiro o envolve em
--    `begin; ... rollback;`, sem exceção.
--
-- 3. FREQUÊNCIA — uma vez por sessão, quando alguém cola o link. 4
--    sessões/semana por doutora (§5.1 do PRD) = ~8 chamadas/semana, mais as
--    correções. Ordem de grandeza: **dezenas por mês**, não por dia.
--
-- 4. REPETIÇÃO — zero. É escrita disparada por clique, não leitura de tela:
--    N telas abertas não geram N chamadas. O que a tela LÊ (`link_reuniao`,
--    `link_em`, `link_definido_por`, `link_por_equipe`) vem na mesma linha do
--    agendamento que ela já carrega — nenhuma query nova, nenhuma coluna
--    pesada (`resumo` e `briefing_snapshot` continuam fora do grant).
--
-- 5. REVERSÃO — `revoke execute` derruba a escrita em segundos, sem deploy e
--    sem tocar em dado; o que já está gravado continua visível e continua indo
--    no e-mail. Cabeçalho, passo 1.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 ROTEIRO DE PROVA — rodar APÓS aplicar. NÃO É RELATÓRIO DE MEDIÇÃO.
-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito por quem NÃO tem conexão com este banco. Nada aqui está medido, e
-- nenhuma saída foi fabricada: o que está abaixo é o comando e o resultado
-- ESPERADO, para comparar. Se a saída divergir, o esperado está errado, não o
-- banco.
--
-- ⚠️ Os testes P5 a P11 GRAVAM. Rodar cada bloco dentro de
-- `begin; ... rollback;`. Há **0 sessões hoje**, então os testes criam a linha
-- de mentira que usam, e o rollback a leva embora.
--
-- ── P0-a · os CHECKs de que este arquivo depende (ANTES de aplicar) ───────
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid = 'gps.sessao_agendamentos'::regclass
--      and conname in ('chk_sessao_agend_link','chk_sessao_agend_link_dono')
--    order by conname;
--   Esperado: as duas definições do cabeçalho, byte a byte.
--
-- ── P0-b · os 4 CHECKs da …291 continuam intactos (ANTES e DEPOIS) ────────
--   select conname, md5(pg_get_constraintdef(oid))
--     from pg_constraint
--    where conrelid = 'gps.sessao_agendamentos'::regclass and contype = 'c'
--    order by conname;
--   Esperado: o conjunto DEPOIS é idêntico ao de ANTES. Esta migração não
--   cria, não altera e não dropa CHECK nenhum.
--
-- ── P1 · a coluna nova existe e nasce NULL ────────────────────────────────
--   select count(*) as sessoes,
--          count(link_por_equipe) as com_papel
--     from gps.sessao_agendamentos;
--   Esperado hoje: 0 e 0.
--
-- ── P2 · GRANTS — o que `authenticated` pode, coluna a coluna ─────────────
--   select privilege_type, column_name
--     from information_schema.column_privileges
--    where table_schema='gps' and table_name='sessao_agendamentos'
--      and grantee='authenticated'
--    order by privilege_type, column_name;
--   Esperado: SÓ `SELECT`, e `link_por_equipe` entre as colunas.
--   🔴 `resumo` e `briefing_snapshot` NÃO podem aparecer.
--
--   select grantee, string_agg(distinct privilege_type, ', ' order by privilege_type)
--     from information_schema.role_table_grants
--    where table_schema='gps' and table_name='sessao_agendamentos'
--    group by grantee;
--   Esperado: `anon` e `PUBLIC` ausentes; `authenticated` sem
--   INSERT/UPDATE/DELETE. 🔴 `grant select` NÃO revoga escrita — é esta query
--   que prova, não a leitura da migration.
--
-- ── P3 · EXECUTE das 3 funções, lendo o ACL (não `has_*_privilege`) ───────
--   select p.proname, p.proacl::text
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='gps'
--      and p.proname in ('sessao_link_definir','sessao_link_remover','sessao_link_dominio');
--   Esperado: NENHUMA entrada começando com `=` (essa é PUBLIC).
--   `sessao_link_definir` e `sessao_link_remover` com `authenticated=X/`;
--   `sessao_link_dominio` SEM `authenticated`.
--   ⚠️ `has_function_privilege` responde "pode?", não "por quê pode?" — e
--   `proacl::text like '%=X/%'` dá falso positivo (casa `postgres=X/`).
--   Lição de 19/08: 3 revokes rodaram sem erro e sem efeito.
--
-- ── P4 · 🔴 `explain (analyze, buffers)` do UPDATE, EM TRANSAÇÃO ──────────
--   🔴 `explain analyze` em UPDATE **EXECUTA O UPDATE**. Isto não é teoria:
--   em 15/09/2026 um `explain (analyze)` de UPDATE gravou valor em produção
--   no SIC-HF. O `begin`/`rollback` é OBRIGATÓRIO.
--
--   ⚠️ SEM `\gset`: é meta-comando de psql, não roda no SQL Editor do painel,
--   e não pode seguir um `returning` sem `;`. O bloco abaixo é um `do` +
--   `explain` que funciona nos dois lugares, com a linha de mentira criada e
--   descartada no mesmo `begin`.
--
--   begin;
--     -- a linha de mentira (há 0 sessões hoje, então nada colide)
--     insert into gps.sessao_agendamentos
--       (id, tipo_id, responsavel_id, aluno_id, cliente_id, data, hora_inicio, duracao_min)
--     select '00000000-0000-4000-8000-0000000000d4'::uuid,
--            t.id, a.responsavel_id, c.aluno_id, c.id,
--            (now() at time zone 'America/Sao_Paulo')::date + 7, '10:00', t.duracao_min
--       from gps.sessao_tipos t
--       cross join lateral (select responsavel_id from gps.sessao_disponibilidade limit 1) a
--       cross join lateral (select id, aluno_id from gps.etapa1_clientes limit 1) c
--      where t.id = 1;
--
--     explain (analyze, buffers)
--     update gps.sessao_agendamentos
--        set link_reuniao      = 'https://meet.google.com/abc-defg-hij',
--            link_definido_por = responsavel_id,
--            link_em           = now(),
--            link_por_equipe   = true
--      where id = '00000000-0000-4000-8000-0000000000d4'::uuid;
--   rollback;
--
--   ⚠️ O `insert` depende de existir ao menos 1 linha em
--   `gps.sessao_disponibilidade` e 1 em `gps.etapa1_clientes`. A grade da
--   Dra. Cristiane já está semeada (…291), então as duas existem — mas se o
--   insert devolver `0 rows`, é isso que falhou, não o `explain`.
--
--   Esperado: `Update on sessao_agendamentos` + `Index Scan using
--   sessao_agendamentos_pkey`, 1 linha, tempo abaixo de 1 ms.
--   ⚠️ Se vier `Seq Scan`, NÃO é erro: a tabela tem 0 linhas e o planner está
--   certo. O que se confere é `rows=1` e a ausência de varredura ampla —
--   **plano previsto de cabeça erra o tipo de scan** (18/09), então vale a
--   saída, não esta previsão.
--
-- ── CONVENÇÃO DE P5 a P11 ────────────────────────────────────────────────
-- 🔴 P5..P11 exigem JWT de gente diferente (parceiro, responsável, admin), e
-- por isso NÃO rodam no SQL Editor do painel, que é sempre `postgres` — ali
-- `auth.uid()` é null e toda chamada devolve 42501 (o que, aliás, é a própria
-- prova da guarda de entrada, e vale registrar: **P5-zero**, chamar a RPC
-- como `postgres` no painel tem de dar 42501, não 'Sessão não encontrada').
-- Rodar pelo PostgREST autenticado (o app, ou `curl` com o access token de
-- cada pessoa), ou em psql com `set request.jwt.claims` + `set role
-- authenticated` dentro da transação.
--
-- `:'id'`, `:'id2'`, `:'id3'` são TRÊS agendamentos de mentira, criados como
-- em P4 e descartados no `rollback` — trocar cada um pelo uuid literal que
-- você inseriu. Não são variáveis de psql, são marcadores de leitura.
-- Precisam ser três porque P8 deixa a linha com link da equipe e P9/P10
-- precisam de linha limpa.
--
-- ── P5 · o parceiro põe o PRIMEIRO link (ACEITA) ──────────────────────────
--   Como `authenticated`, com o JWT de um membro do ambiente dono da sessão:
--     select gps.sessao_link_definir(:'id', 'https://meet.google.com/abc-defg-hij');
--   Esperado: json com `"alterado": true`, `"por": "aluno"`,
--   `"por_equipe": false`, `"dominio": "meet.google.com"`.
--   E na linha: link_por_equipe = false, link_em preenchido.
--
-- ── P6 · o parceiro TROCA O PRÓPRIO (ACEITA) ──────────────────────────────
--   Mesmo JWT:
--     select gps.sessao_link_definir(:'id', 'https://us06web.zoom.us/j/9999');
--   Esperado: `"alterado": true`, `"por": "aluno"`.
--   Evento `sessao_link_definido` com `dominio_de = 'meet.google.com'`,
--   `dominio_para = 'us06web.zoom.us'`, `sobrescreveu = true`,
--   `anterior_da_equipe = false`.
--   🔴 CONFERIR NA TRILHA: nenhum `detalhe` pode conter `/j/9999` nem
--   `abc-defg-hij`.
--     select detalhe from gps.sessao_eventos
--      where agendamento_id = :'id' and detalhe::text ~ '/j/|abc-defg';
--     Esperado: **0 linhas.**
--
-- ── P7 · a EQUIPE SOBRESCREVE o do parceiro (ACEITA) ──────────────────────
--   Com o JWT da responsável (ou de um admin):
--     select gps.sessao_link_definir(:'id', 'https://teams.microsoft.com/l/meetup/xyz');
--   Esperado: `"alterado": true`, `"por": "responsavel"` (ou `"admin"`),
--   `"por_equipe": true`. Na linha: link_por_equipe = true.
--   No evento: `anterior_da_equipe = false`, `sobrescreveu = true` — é o que a
--   UI da equipe usa para avisar que sobrescreveu o do parceiro.
--
-- ── P8 · 🔴 o PARCEIRO tenta sobrescrever o DA EQUIPE (RECUSA) ────────────
--   Voltando ao JWT do membro do ambiente:
--     select gps.sessao_link_definir(:'id', 'https://meet.google.com/zzz-zzzz-zzz');
--   Esperado: **erro 22023** com a frase EXATA
--     "A equipe já definiu o link desta sessão. Se estiver errado, fale pelo Suporte."
--   E, na mesma sessão, a porta dos fundos fechada:
--     select gps.sessao_link_remover(:'id');
--   Esperado: **o MESMO 22023 com a MESMA frase.**
--   Conferir que a linha NÃO mudou: link_reuniao continua o do Teams.
--
-- ── P9 · link sem https (RECUSA) ──────────────────────────────────────────
--   select gps.sessao_link_definir(:'id2', 'http://meet.google.com/abc');
--   Esperado: 22023, "O link precisa começar com https://".
--   E o piso, sem passar pela RPC (como owner, em transação):
--     begin;
--       update gps.sessao_agendamentos set link_reuniao='http://x' where id=:'id2';
--     rollback;
--   Esperado: **23514**, `chk_sessao_agend_link`. O CHECK é o piso; a RPC só
--   dá a frase legível.
--
-- ── P10 · link com CR/LF (RECUSA) ─────────────────────────────────────────
--   select gps.sessao_link_definir(:'id2',
--     'https://meet.google.com/abc' || chr(13) || chr(10) || 'Bcc: alguem@x.com');
--   Esperado: 22023, "O link não pode conter quebra de linha...".
--   Repetir com `chr(9)` (TAB): mesma recusa — a guarda é `[[:cntrl:]]`, a
--   classe inteira, não só CR/LF.
--   ⚠️ NÃO testar com `chr(0)`: o Postgres não admite NUL em valor `text` e o
--   erro vem do parser (22021), ANTES da função — o teste passaria "verde"
--   sem provar nada sobre a guarda.
--   🔴 POR QUE IMPORTA: a …293 concatena `link_reuniao` dentro de um `href`
--   HTML e do corpo em texto puro. Sem esta recusa, o valor vira cabeçalho.
--   E o teto:
--     select gps.sessao_link_definir(:'id2', 'https://x.com/' || repeat('a', 600));
--   Esperado: 22023, "O link passa de 500 caracteres."
--
-- ── P11 · 🔴 DOIS CLIQUES SIMULTÂNEOS — o `for update` resolve ────────────
--   Dois psql lado a lado, na MESMA linha:
--     Sessão A: begin; select gps.sessao_link_definir(:'id3','https://a.example/1');
--               -- NÃO commitar ainda
--     Sessão B: begin; select gps.sessao_link_definir(:'id3','https://b.example/2');
--               -- 🔴 B DEVE FICAR BLOQUEADA aqui, esperando A
--     Confirmar o bloqueio, de um terceiro psql:
--       select pid, wait_event_type, wait_event, query from pg_stat_activity
--        where wait_event_type = 'Lock';
--       Esperado: 1 linha, a sessão B.
--     Sessão A: commit;
--     Sessão B: destrava e SÓ ENTÃO avalia a precedência, já com o dono
--               gravado por A. commit;
--
--   Esperado, nos dois cenários que importam:
--     · A = equipe, B = parceiro → B recebe o **22023 da precedência**. Sem o
--       `for update`, B teria lido "sem dono" e SOBRESCRITO a equipe.
--     · A e B ambos parceiros    → B sobrescreve (é permitido), mas a trilha
--       registra os DOIS eventos em ordem, com `sobrescreveu = true` no
--       segundo. Ninguém "perde em silêncio".
--   🔴 Sem o `for update`, os dois cenários terminam com o último UPDATE
--   vencendo, zero erro e zero rastro do conflito. É a corrida do §6.3.
--
-- ── P12 · o domínio sai limpo (função pura, não grava nada) ───────────────
--   select gps.sessao_link_dominio(v) from (values
--     ('https://meet.google.com/abc-defg-hij'),
--     ('https://us06web.zoom.us:443/j/99?pwd=SEGREDO'),
--     ('https://user:senha@sala.example.com/x#frag'),
--     ('https://TEAMS.microsoft.com/l/meetup/xyz')
--   ) t(v);
--   Esperado, nesta ordem: meet.google.com · us06web.zoom.us ·
--   sala.example.com · teams.microsoft.com.
--   🔴 Nenhuma saída pode conter `SEGREDO`, `senha`, `pwd` ou path.
-- ═══════════════════════════════════════════════════════════════════════════
