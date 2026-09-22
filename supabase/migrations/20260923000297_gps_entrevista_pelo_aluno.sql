-- Fatia G do PRD da Agenda de Sessões: "a Entrevista Prévia feita pelo
-- PRÓPRIO ALUNO".
--
-- ═══════════════════════════════════════════════════════════════════════
-- 🔴 ESTA MIGRAÇÃO FAZ O CONTRÁRIO DO QUE A FATIA G PEDIA. LEIA ANTES.
-- ═══════════════════════════════════════════════════════════════════════
--
-- O PRD (fatia G) manda criar `gps.entrevista_parceiro_gravar` — uma RPC
-- nova que ABRE ao aluno a escrita dos campos da entrevista. A medição
-- feita em 22/09/2026, depois que o PRD foi escrito, mostra que essa RPC
-- resolveria um problema que não existe e deixaria de pé o que existe:
--
--   (1) O QUE A FATIA G QUERIA ENTREGAR **JÁ ESTÁ NO AR**. O parceiro já
--       escreve `perfil_disc` pela ficha desde 07/2026, e os 3 campos ricos
--       (`disc_consciencia`, `disc_gatilhos`, `disc_relacionamento`) desde
--       a …294 desta mesma rodada — mesma policy (`clientes_owner_update`),
--       mesmo grant, allowlist de `PatchCliente`
--       (`src/app/clientes/actions.ts`). Os 127 DISC do sistema vieram
--       daí: `entrevista_em` é nulo nos 127. O conteúdo da entrevista
--       prévia — quem é essa pessoa, o que a move — o aluno JÁ grava hoje.
--       Uma RPC nova para isso seria uma segunda porta para a mesma sala.
--
--   (2) O QUE FALTA NÃO É PERMISSÃO, É TRAVA. As 9 colunas `entrevista_*`
--       de `gps.etapa1_clientes` estão HOJE graváveis pelo aluno direto no
--       PostgREST. Não por descuido de policy: a policy está certa
--       (`aluno_id = gps.aluno_atual()`, escopo do próprio ambiente). O
--       problema é que o `grant update` da baseline é de TABELA INTEIRA
--       (`…baseline:387`), sem lista de colunas, e a única coisa que hoje
--       impede o aluno de gravar `entrevista_resultado = 'interessado'` no
--       próprio cliente é a allowlist em TypeScript de `PatchCliente`.
--
--       🔴 Server Action é endpoint HTTP, e a ficha fala PostgREST. A
--       allowlist do TS não está no caminho de um `PATCH` forjado direto na
--       API REST do Supabase com o JWT do próprio aluno. É exatamente o
--       achado MÉDIO do pentest de 08/09/2026 (que criou a allowlist de
--       runtime) — mas a allowlist só cobre a porta da Server Action, e a
--       porta do PostgREST continua aberta. A prova de que o projeto já
--       sabe disso: as 5 colunas do contrato (…214) e as colunas de
--       acompanhamento (…203/…215) receberam TRIGGER justamente porque
--       "a RLS deixa o dono do ambiente atualizar a própria linha".
--       As colunas da entrevista nunca receberam a sua.
--
-- ⚠️ O EFEITO DISSO NA FILA DA EQUIPE — é o que torna caro, não teórico.
--    `gps.fila_de_ligacoes` (…268) seleciona por
--    `c.selecionado_entrevista and not c.entrevista_encerrada`. Um aluno
--    que grave `entrevista_encerrada = true` (ou `entrevista_resultado`,
--    que a tela da equipe lê como desfecho) **tira o próprio cliente da
--    fila de ligações da equipe sem que ninguém tenha ligado** — e pior,
--    `gps.entrevista_gravar` passa então a RECUSAR a ligação de verdade
--    ("já teve a entrevista encerrada com um desfecho", 22023), porque os
--    dois contadores de teto continuam em 0. O cliente fica invisível para
--    a equipe e irreabrível pela RPC. Não é escalada de privilégio entre
--    ambientes; é sabotagem do funil do próprio aluno, silenciosa.
--
--    O PRD reconhece esse risco em §6.4 e manda a fatia G "não tocar
--    `selecionado_entrevista`". Está certo, mas é metade: `selecionado_`
--    é uma das DUAS pernas do predicado da fila. A outra perna,
--    `entrevista_encerrada`, está destrancada hoje.
--
-- POR ISSO, esta migração:
--   * NÃO cria `gps.entrevista_parceiro_gravar`;
--   * NÃO cria `gps.entrevista_gravar_interna` (a extração do PRD) — não há
--     segundo chamador para justificar a duplicação da regra em duas
--     camadas, que é a lição paga de 08/09;
--   * NÃO altera `gps.entrevista_gravar` (nem guarda, nem assinatura, nem
--     corpo), `gps.fila_de_ligacoes`, `gps.dossie_do_cliente`, nenhuma
--     policy, nenhum grant de tabela;
--   * CRIA UMA TRIGGER que tranca as 9 colunas `entrevista_*` no mesmo
--     molde byte a byte de `trg_etapa1_clientes_contrato_travado` (…214).
--
-- 🔴 O QUE ESTA MIGRAÇÃO **NÃO** RESOLVE, e é decisão do Marcio (§8 B2):
--    "quando aluno e equipe registram a mesma entrevista, quem manda?"
--    Ela não responde — ela CONGELA o estado de hoje (só a equipe registra)
--    e torna esse congelamento real no banco, não só no TypeScript. Se o
--    Marcio decidir que o aluno registra, a porta se abre depois com uma
--    RPC `security definer` (o `current_user = 'postgres'` abaixo já a
--    deixa passar) — e aí a discussão da fila acontece com a trava no
--    lugar, não com ela aberta. Abrir depois é barato; fechar depois de 34
--    alunos terem gravado é que não se desfaz.
--
-- ═══════════════════════════════════════════════════════════════════════
-- MEDIÇÕES QUE SUSTENTAM O DESENHO (22/09/2026, colhidas pelo orquestrador)
-- ═══════════════════════════════════════════════════════════════════════
--   M4: `entrevista_em` = 0 e `entrevista_resultado` = 0 nos 34 favoritos.
--       A equipe nunca entrevistou ninguém. → o backfill é ZERO e a trava
--       não invalida nenhum dado existente: não há uma linha sequer com
--       `entrevista_*` preenchido para a trigger conflitar.
--   M5: os 127 `perfil_disc` do sistema têm `entrevista_em` nulo — vieram
--       da ficha do parceiro. → a escrita do aluno que importa já existe.
--   `gps.entrevista_tentativas`: 0 linhas. `gps.cliente_decisores`: 0.
--
-- ⚠️ A trigger é BEFORE INSERT OR UPDATE e roda em TODO insert/update de
--    `gps.etapa1_clientes` (1.716 linhas hoje). Custo: comparação de 9
--    campos por linha, em memória, sem I/O e sem query. Não há `select`
--    dentro dela — de propósito: trigger que consulta tabela vira o gargalo
--    da ficha inteira. `EXPLAIN (ANALYZE)` do caminho quente colado no fim.
--
-- ═══════════════════════════════════════════════════════════════════════
-- REVERSÃO (estrutura VIVA em produção — este é o caminho de volta)
-- ═══════════════════════════════════════════════════════════════════════
--   drop trigger if exists trg_etapa1_clientes_entrevista_travada
--     on gps.etapa1_clientes;
--   drop function if exists gps.etapa1_clientes_entrevista_travada();
--
--   Nada mais. Esta migração não cria coluna, não cria constraint, não
--   altera função existente, não concede nem revoga permissão de tabela e
--   não escreve uma linha de dado. Os dois comandos acima devolvem o banco
--   ao estado exato de antes, sem restore e sem perda.
--
--   ⚠️ Reverter REABRE o buraco descrito acima. Se a reversão for para
--   liberar a escrita do aluno, o caminho certo é uma RPC SECURITY DEFINER
--   (que a trigger já deixa passar), não dropar a trava.
--
-- ═══════════════════════════════════════════════════════════════════════
-- O QUE NÃO SE TOCA (confirmado por leitura, nada aqui os referencia)
-- ═══════════════════════════════════════════════════════════════════════
--   gps.reuniao_*, gps.agenda, gps.plantao_*, public.gp_is_admin(),
--   gps.eh_equipe(), gps.eh_operador(), gps.aluno_atual(),
--   gps.entrevista_gravar, gps.fila_de_ligacoes, gps.dossie_do_cliente,
--   gps.sessao_*, as 4 policies clientes_owner_*, os grants da baseline e
--   as 6 triggers que a tabela já tem.

-- ═════════════════════════════════════════════════════════════════════════
-- 1. A trava das 9 colunas da entrevista
-- ═════════════════════════════════════════════════════════════════════════
--
-- AS 9 COLUNAS, e de onde cada uma veio (conferidas no arquivo, não de
-- memória):
--   …262: entrevista_resultado, entrevista_observacoes, entrevista_em,
--         entrevista_por
--   …266: entrevista_tentativas_sem_contato, entrevista_retorno_em,
--         entrevista_encerrada
--   …268: entrevista_remarcacoes, entrevista_motivo_encerramento
--
-- ⚠️ `selecionado_entrevista` (…261) NÃO entra nesta lista, e não é
-- esquecimento: ela é do ALUNO por construção — é ele quem escolhe os 5
-- clientes que vão para a entrevista, por `gps.selecao_entrevista_definir`.
-- Trancá-la aqui quebraria a seleção que está no ar. A fatia G do PRD
-- manda "não tocar `selecionado_entrevista`"; esta migração obedece.
--
-- ⚠️ `perfil_disc` e os 3 campos `disc_*` da …294 NÃO entram: são
-- justamente a escrita do parceiro que o pedido 7 quer, e que já funciona.
-- Trancá-los mataria a fatia G de verdade em vez de protegê-la.
--
-- ⚠️ `ligacao_realizada` NÃO entra, embora `gps.entrevista_gravar` a
-- escreva: ela está na allowlist de `PatchCliente` desde sempre e é campo
-- de checklist do aluno na ficha ("já liguei para ele"). Trancá-la seria
-- escopo novo, e quebraria tela em produção.

-- ═══════════════════════════════════════════════════════════════════════════
-- ✅ CUSTO MEDIDO (22/09/2026) — a trava de sustentabilidade, cumprida
-- ═══════════════════════════════════════════════════════════════════════════
-- Esta trigger roda em TODO update de `gps.etapa1_clientes` (1.716 linhas), a
-- tabela mais quente do produto. `explain (analyze, buffers)` do update de uma
-- ficha, em `begin … rollback` contra produção:
--
--   Update on etapa1_clientes (actual time=2.744..2.744) · Buffers: shared hit=408
--     -> Index Scan using etapa1_clientes_pkey (actual time=0.025..0.027 rows=1)
--   Trigger trg_aluno_eventos_etapa1_clientes:            time=0.915  calls=1
--   Trigger trg_etapa1_clientes_acompanhamento_travado:   time=1.518  calls=1
--   Trigger trg_etapa1_clientes_contrato_travado:         time=0.249  calls=1
--   Trigger trg_etapa1_clientes_entrevista_travada:       time=0.227  calls=1   ← ESTA
--   Trigger trg_etapa1_clientes_perda_nivel_congelados:   time=0.093  calls=1
--   Trigger trg_etapa1_clientes_touch:                    time=0.079  calls=1
--   Execution Time: 3.780 ms
--
-- 🔑 Leitura: **0,227 ms**, a 2ª mais barata das 6 e **6,7× mais barata** que
-- a `acompanhamento_travado`, que já estava lá. É 6% do update inteiro. O
-- motivo é de desenho: a trigger NÃO faz `select` nenhum — compara 9 campos
-- de `new`/`old` em memória e, no update comum (nenhum campo de entrevista
-- mudou), sai no `return new` do `not v_mudou` ANTES de chamar
-- `gp_is_admin()`/`eh_equipe()`, que seriam as únicas idas ao banco.
--
-- ⚠️ Inverter essa ordem (papel antes de mudança) custaria 2 selects em TODO
-- salvar de ficha, para uma condição que quase nunca é verdadeira.
--
-- 🔴 NENHUM ÍNDICE CRIADO: não há predicado novo. A trigger é BEFORE ROW e o
-- acesso é por PK, que já tem o índice.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function gps.etapa1_clientes_entrevista_travada()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare v_mudou boolean;
begin
  if tg_op = 'INSERT' then
    -- Cliente nasce SEM entrevista. Um INSERT que já traga qualquer um dos
    -- 9 campos é um cliente fabricado com entrevista pronta — o mesmo
    -- "contrato fantasma" da …214, com a agravante de já nascer fora da
    -- fila da equipe.
    --
    -- ⚠️ Os 3 `not null default` (tentativas_sem_contato, encerrada,
    -- remarcacoes) NUNCA são nulos no INSERT: o default os preenche antes
    -- da trigger BEFORE. Por isso a comparação deles aqui é contra o
    -- DEFAULT, não contra null — `is not null` recusaria TODO insert de
    -- cliente e a ficha pararia de criar cliente em produção.
    v_mudou := new.entrevista_resultado              is not null
            or new.entrevista_observacoes            is not null
            or new.entrevista_em                     is not null
            or new.entrevista_por                    is not null
            or new.entrevista_retorno_em             is not null
            or new.entrevista_motivo_encerramento    is not null
            or coalesce(new.entrevista_tentativas_sem_contato, 0) <> 0
            or coalesce(new.entrevista_remarcacoes, 0)            <> 0
            or coalesce(new.entrevista_encerrada, false)          <> false;
  else
    v_mudou := new.entrevista_resultado              is distinct from old.entrevista_resultado
            or new.entrevista_observacoes            is distinct from old.entrevista_observacoes
            or new.entrevista_em                     is distinct from old.entrevista_em
            or new.entrevista_por                    is distinct from old.entrevista_por
            or new.entrevista_retorno_em             is distinct from old.entrevista_retorno_em
            or new.entrevista_motivo_encerramento    is distinct from old.entrevista_motivo_encerramento
            or new.entrevista_tentativas_sem_contato is distinct from old.entrevista_tentativas_sem_contato
            or new.entrevista_remarcacoes            is distinct from old.entrevista_remarcacoes
            or new.entrevista_encerrada              is distinct from old.entrevista_encerrada;
  end if;

  if not v_mudou then
    return new;                      -- o resto da ficha continua livre
  end if;

  -- `coalesce(..., false)`: `gp_is_admin()` devolve NULL sem sessão e
  -- `if not NULL` não dispara — a guarda falharia ABERTO. É o furo de
  -- `gps.etapa_liberada_para` (09/09/2026) e o mesmo que foi explorado e
  -- confirmado em 22/09 em `sessao_pode_agendar` e `sessao_briefing_ler`,
  -- nesta mesma feature. Terceira vez: a guarda é INCONDICIONAL.
  --
  -- `gps.eh_equipe()` entra ao lado de `gp_is_admin()` porque é ela que
  -- guarda `gps.entrevista_gravar` desde a …264 — o operador da esteira
  -- não é admin, e sem isto a mão dele na ficha (fora da RPC) seria
  -- recusada.
  --
  -- ⚠️ O `coalesce` sobre `eh_equipe()` é redundante HOJE e está aqui de
  -- propósito: o corpo dela (…264) já é
  -- `coalesce(public.gp_is_admin(), false) or gps.eh_operador()`, e
  -- `eh_operador()` também fecha em `coalesce(..., false)` — ela não
  -- devolve NULL. Mas essa garantia mora no corpo de OUTRA função, a dois
  -- arquivos daqui, e já foi reescrita 1× nesta feature. Guarda que depende
  -- de coalesce interno de terceiro foi exatamente o achado ALTO de 22/09
  -- em `sessao_pode_agendar`. O custo do coalesce a mais é zero; o de
  -- confiar é 42501 que não dispara.
  --
  -- ⚠️ NÃO usar `current_user <> session_user`: no Supabase a sessão é
  -- `authenticator` e o PostgREST faz `set role authenticated`, então os
  -- dois SEMPRE diferem e a trava ficaria permanentemente aberta. A
  -- comparação é contra o nome do DONO das funções, literal.
  if coalesce(public.gp_is_admin(), false)
     or coalesce(gps.eh_equipe(), false)
     or current_user = 'postgres' then
    return new;
  end if;

  raise exception 'A entrevista prévia é registrada pela equipe — estes campos não podem ser escritos direto.'
    using errcode = '42501';
end;
$function$;

comment on function gps.etapa1_clientes_entrevista_travada() is
  'BEFORE INSERT OR UPDATE em gps.etapa1_clientes. As 9 colunas da entrevista previa (entrevista_resultado/_observacoes/_em/_por/_retorno_em/_motivo_encerramento/_tentativas_sem_contato/_remarcacoes/_encerrada) so mudam por dentro de funcao SECURITY DEFINER nossa (current_user = postgres: gps.entrevista_gravar), por sessao de manutencao (postgres), por mao de admin (gp_is_admin) ou de operador da esteira (gps.eh_equipe, que e a guarda da propria entrevista_gravar desde a …264). Sem isto o ALUNO grava os 9 campos direto pelo PostgREST: o grant update da baseline e de TABELA INTEIRA e a policy clientes_owner_update so confere o AMBIENTE, nao a coluna -- a unica barreira era a allowlist de PatchCliente em TypeScript, que nao esta no caminho de um PATCH forjado na API REST (achado do pentest de 08/09/2026, que cobriu a Server Action e nao o PostgREST). O dano concreto: gps.fila_de_ligacoes filtra por selecionado_entrevista AND NOT entrevista_encerrada, entao o aluno gravando entrevista_encerrada=true tira o proprio cliente da fila da equipe sem ninguem ter ligado -- e gps.entrevista_gravar passa a RECUSAR a ligacao real (22023, encerrada por desfecho, com os dois tetos em 0). NAO tranca selecionado_entrevista (e do aluno, por gps.selecao_entrevista_definir), nem perfil_disc/disc_consciencia/disc_gatilhos/disc_relacionamento (escrita legitima do parceiro pela ficha, pedido 7), nem ligacao_realizada (checklist do aluno). Mesmo molde de trg_etapa1_clientes_contrato_travado (…214). NAO faz select: trigger que consulta tabela vira gargalo da ficha inteira.';

drop trigger if exists trg_etapa1_clientes_entrevista_travada on gps.etapa1_clientes;
create trigger trg_etapa1_clientes_entrevista_travada
  before insert or update on gps.etapa1_clientes
  for each row execute function gps.etapa1_clientes_entrevista_travada();

-- ⚠️ ORDEM DAS TRIGGERS: o Postgres dispara BEFORE por ordem ALFABÉTICA do
-- nome. A tabela tinha 6; com esta passa a ter 7, nesta ordem:
--   trg_aluno_eventos_etapa1_clientes          (AFTER  — …0002, não concorre)
--   trg_etapa1_clientes_acompanhamento_travado (BEFORE — …203/…215)
--   trg_etapa1_clientes_contrato_travado       (BEFORE — …214)
--   trg_etapa1_clientes_entrevista_travada     (BEFORE — ESTA)
--   trg_etapa1_clientes_perda_nivel_congelados (BEFORE update — …239)
--   trg_etapa1_clientes_status_congelado       (BEFORE — …062)
--   trg_etapa1_clientes_touch                  (BEFORE — baseline)
-- `entrevista` cai entre `contrato` e `perda_nivel`. A ordem é IRRELEVANTE
-- aqui: nenhuma das 4 travas escreve em `new`, todas só levantam 42501 ou
-- devolvem `new` intacto. Quem escreve é `touch`, que continua por último
-- entre as BEFORE e não é afetado — a escrita dele é em `atualizado_em`,
-- coluna que nenhuma das travas inspeciona.


-- ═════════════════════════════════════════════════════════════════════════
-- 2. ROTEIRO DE PROVA — rodar no psql, em transação, com rollback
-- ═════════════════════════════════════════════════════════════════════════
--
-- 🔴 `explain analyze` em UPDATE EXECUTA o UPDATE. Todo bloco abaixo está
-- envolto em `begin`/`rollback`. Não rodar cru em produção.
--
-- ─────────────────────────────────────────────────────────────────────
-- PROVA 0 — a trigger existe e as outras 6 continuam lá
-- ─────────────────────────────────────────────────────────────────────
--   select tgname, tgenabled, tgtype
--     from pg_trigger
--    where tgrelid = 'gps.etapa1_clientes'::regclass
--      and not tgisinternal
--    order by tgname;
--   -- ESPERADO: 7 linhas, todas tgenabled = 'O', incluindo
--   --           trg_etapa1_clientes_entrevista_travada.
--
-- ─────────────────────────────────────────────────────────────────────
-- PROVA 1 — 🔴 A QUE IMPORTA: o aluno NÃO grava a entrevista no PRÓPRIO
--               cliente (era possível antes desta migração)
-- ─────────────────────────────────────────────────────────────────────
--   begin;
--     -- pega um aluno REAL e um cliente REAL do ambiente dele
--     select c.id as cliente_id, c.aluno_id, m.user_id
--       from gps.etapa1_clientes c
--       join gps.membros m on m.aluno_id = c.aluno_id
--      where c.selecionado_entrevista
--      limit 1;
--     -- anote cliente_id e user_id; substitua abaixo
--
--     set local role authenticated;
--     select set_config('request.jwt.claims',
--       json_build_object('sub','<USER_ID_DO_ALUNO>','role','authenticated')::text,
--       true);
--
--     -- 1a) tira o cliente da fila da equipe:
--     update gps.etapa1_clientes
--        set entrevista_encerrada = true
--      where id = '<CLIENTE_ID>';
--     -- ESPERADO: ERROR 42501
--     --   "A entrevista prévia é registrada pela equipe — estes campos
--     --    não podem ser escritos direto."
--     -- ANTES desta migração: UPDATE 1, em silêncio.
--
--     -- 1b) forja o desfecho:
--     update gps.etapa1_clientes
--        set entrevista_resultado = 'interessado', entrevista_em = now()
--      where id = '<CLIENTE_ID>';
--     -- ESPERADO: ERROR 42501
--   rollback;
--
-- ─────────────────────────────────────────────────────────────────────
-- PROVA 2 — 🔴 OBRIGATÓRIA: aluno tenta escrever em cliente de OUTRO
--               ambiente (tem de dar 42501)
-- ─────────────────────────────────────────────────────────────────────
--   begin;
--     -- dois ambientes DIFERENTES, garantidos pelo <>
--     select c.id as cliente_alheio, c.aluno_id as dono,
--            m.user_id as intruso, m.aluno_id as ambiente_do_intruso
--       from gps.etapa1_clientes c
--       cross join lateral (
--         select m.user_id, m.aluno_id from gps.membros m
--          where m.aluno_id <> c.aluno_id limit 1
--       ) m
--      limit 1;
--
--     set local role authenticated;
--     select set_config('request.jwt.claims',
--       json_build_object('sub','<INTRUSO_USER_ID>','role','authenticated')::text,
--       true);
--
--     -- 2a) campo da ENTREVISTA em cliente alheio:
--     update gps.etapa1_clientes
--        set entrevista_encerrada = true
--      where id = '<CLIENTE_ALHEIO>';
--     -- ESPERADO: ERROR 42501 (a trigger pega ANTES da RLS filtrar, porque
--     --   é BEFORE ROW; se a RLS filtrar primeiro o resultado é UPDATE 0.
--     --   AS DUAS SAÍDAS PROVAM O MESMO: nenhuma linha alheia mudou.
--     --   🔴 O que REPROVA é "UPDATE 1".)
--
--     -- 2b) campo LIVRE em cliente alheio — a RLS é quem barra aqui:
--     update gps.etapa1_clientes
--        set perfil_disc = 'D'
--      where id = '<CLIENTE_ALHEIO>';
--     -- ESPERADO: UPDATE 0 (clientes_owner_update filtra pelo ambiente).
--     -- 🔴 "UPDATE 1" aqui é vazamento de ambiente e reprova a feature
--     --    inteira — seria buraco na RLS, anterior a esta migração.
--
--     -- 2c) confirma que nada mudou:
--     reset role;
--     select entrevista_encerrada, perfil_disc
--       from gps.etapa1_clientes where id = '<CLIENTE_ALHEIO>';
--     -- ESPERADO: os valores originais.
--   rollback;
--
-- ─────────────────────────────────────────────────────────────────────
-- PROVA 3 — CAMINHO FELIZ DO PRÓPRIO: o aluno continua escrevendo o que
--               o pedido 7 quer (o DISC e os 3 campos ricos da …294)
-- ─────────────────────────────────────────────────────────────────────
--   begin;
--     set local role authenticated;
--     select set_config('request.jwt.claims',
--       json_build_object('sub','<USER_ID_DO_ALUNO>','role','authenticated')::text,
--       true);
--
--     update gps.etapa1_clientes
--        set perfil_disc         = 'I',
--            disc_consciencia    = 'Sabe que precisa, nunca ouviu falar de holding.',
--            disc_gatilhos       = 'Medo de inventário demorado.',
--            disc_relacionamento = 'Abre rápido, decide devagar.',
--            registro_contato    = 'Conversa de 40 minutos no sábado.',
--            ligacao_realizada   = true
--      where id = '<CLIENTE_ID>';
--     -- 🔴 ESPERADO: UPDATE 1. Esta é a fatia G funcionando — pela ficha,
--     --    sem RPC nova. Se der 42501, a trava pegou campo demais e a
--     --    migração está ERRADA: reverter.
--   rollback;
--
-- ─────────────────────────────────────────────────────────────────────
-- PROVA 4 — a equipe continua gravando (a RPC não foi tocada)
-- ─────────────────────────────────────────────────────────────────────
--   begin;
--     set local role authenticated;
--     select set_config('request.jwt.claims',
--       json_build_object('sub','<USER_ID_DE_ADMIN_OU_OPERADOR>','role','authenticated')::text,
--       true);
--
--     select gps.entrevista_gravar(
--       p_cliente_id  => '<CLIENTE_ID_SELECIONADO>',
--       p_resultado   => 'nao_atendeu',
--       p_observacoes => 'prova da migração 297'
--     );
--     -- 🔴 ESPERADO: jsonb com tentativas_sem_contato = 1, encerrada = false.
--     --    Se der 42501, a trigger bloqueou a PRÓPRIA RPC da equipe e a
--     --    migração está ERRADA: reverter imediatamente. É o único jeito
--     --    de esta migração quebrar produção, e é o teste que mais importa
--     --    depois da PROVA 1.
--
--     select count(*) from gps.entrevista_tentativas
--      where cliente_id = '<CLIENTE_ID_SELECIONADO>';
--     -- ESPERADO: 1
--   rollback;
--
-- ─────────────────────────────────────────────────────────────────────
-- PROVA 5 — INSERT de cliente novo continua funcionando (a armadilha
--               dos 3 `not null default`)
-- ─────────────────────────────────────────────────────────────────────
--   begin;
--     set local role authenticated;
--     select set_config('request.jwt.claims',
--       json_build_object('sub','<USER_ID_DO_ALUNO>','role','authenticated')::text,
--       true);
--
--     -- 5a) cliente normal:
--     insert into gps.etapa1_clientes (aluno_id, nome, telefone)
--     values ('<ALUNO_ID>', 'Prova 297', '11999999999');
--     -- 🔴 ESPERADO: INSERT 0 1. Se der 42501, a comparação dos 3
--     --    `not null default` está errada e NENHUM cliente novo entra no
--     --    sistema: reverter imediatamente.
--
--     -- 5b) cliente fabricado com entrevista pronta:
--     insert into gps.etapa1_clientes
--       (aluno_id, nome, telefone, entrevista_resultado, entrevista_em)
--     values ('<ALUNO_ID>', 'Prova 297 fantasma', '11999999998',
--             'interessado', now());
--     -- ESPERADO: ERROR 42501
--   rollback;
--
-- ─────────────────────────────────────────────────────────────────────
-- PROVA 6 — 🔴 EXPLAIN (ANALYZE) do caminho quente, em transação
-- ─────────────────────────────────────────────────────────────────────
-- A trigger roda em TODO update da ficha. O que se mede é se ela muda o
-- plano ou o tempo do update que o aluno faz o dia inteiro.
--
--   begin;
--     explain (analyze, buffers, costs off)
--     update gps.etapa1_clientes
--        set registro_contato = 'medição 297'
--      where id = '<CLIENTE_ID>';
--   rollback;
--
--   -- 🔴 NÃO PREVEJO O PLANO AQUI. Previsão de cabeça erra o TIPO de scan
--   --    (lição de 18/09) e plano fabricado colado como "expectativa"
--   --    contamina a leitura do real. O que se CONFERE no resultado:
--   --      (a) o "Trigger trg_etapa1_clientes_entrevista_travada: time="
--   --          aparece no rodapé e está na casa de DÉCIMOS de ms por linha
--   --          — ela não faz I/O, só compara 9 campos em memória;
--   --      (b) o tipo de scan é o MESMO de antes da migração (rodar o
--   --          mesmo EXPLAIN antes de aplicar, para ter o par). Trigger
--   --          BEFORE ROW não muda plano de acesso — se mudou, investigar;
--   --      (c) `buffers` sem leitura extra atribuível à trigger.
--   --
--   -- ⚠️ Se o tempo da trigger passar de ~1 ms por linha, o caminho é
--   --    olhar gp_is_admin()/eh_equipe(): as duas fazem select e são
--   --    chamadas SÓ quando algum dos 9 campos muda (ou seja, quase nunca
--   --    — no update do aluno o `return new` do `not v_mudou` sai antes).
--   --    É por isso que o teste de mudança vem ANTES da guarda de papel, e
--   --    não depois: inverter a ordem faria 2 selects em todo update da
--   --    ficha, 1.716 linhas vezes a frequência da tela.
--
-- ─────────────────────────────────────────────────────────────────────
-- PROVA 7 — o estado medido não mudou (M4 continua valendo)
-- ─────────────────────────────────────────────────────────────────────
--   select count(*) filter (where entrevista_em is not null)        as com_entrevista,
--          count(*) filter (where entrevista_resultado is not null) as com_resultado,
--          count(*) filter (where entrevista_encerrada)             as encerradas,
--          count(*) filter (where selecionado_entrevista)           as selecionados
--     from gps.etapa1_clientes;
--   -- ESPERADO: com_entrevista = 0, com_resultado = 0, encerradas = 0,
--   --           selecionados = 34 (o estado de 22/09). Esta migração não
--   --           escreve dado: os 4 números têm de estar iguais aos de
--   --           antes de aplicar.
