-- Painel do admin: TETO e PAGINAÇÃO em `gps.admin_painel_alunos()`.
--
-- P5 do plano de polimento (tmp/squad/polimento.md): hoje a função devolve
-- TODOS os ambientes (125) e `/admin` renderiza todos. Sem teto, o payload
-- RSC e o custo de hidratação crescem linearmente — a 10× (1.250 ambientes) o
-- painel vira ~1 MB de HTML+RSC. Assintomático hoje, quebra sem aviso.
--
-- DECISÃO DE PRODUTO (Bloqueio 2 do plano, resolvido pelo orquestrador em
-- 09/09) — **Leitura A**: o servidor entrega um LOTE (200 por padrão) e a tela
-- ganha "Mostrar mais"; a busca e os filtros continuam EM MEMÓRIA, sobre o
-- que já foi carregado, e o rodapé diz "Mostrando X de Y carregados · Z no
-- programa". Mover a busca para o servidor (Leitura B) exigiria reescrever em
-- SQL a busca tolerante de src/lib/texto.ts — feature, não polimento, e com
-- risco de a busca ficar PIOR que a atual.
-- 🔑 Por isso o rodapé da tela é obrigatório: paginar sem dizer que a busca
-- só varre o lote carregado transformaria a tela numa meia-verdade.
--
-- CORPO DE PARTIDA: `gps.admin_painel_alunos()` da migração
-- 20260909000091_gps_admin_painel_alunos_honorarios.sql — o corpo vigente no
-- banco. As 13 colunas antigas, os filtros de contagem e os comentários das
-- CTEs vêm de lá LETRA POR LETRA; esta migração só acrescenta paginação e a
-- 14ª coluna. Se o corpo vigente não for esse, PARE: partir do arquivo errado
-- apaga em silêncio o `agendados` por evidência (...061) ou os honorários
-- (...091).
--
-- 🔴 SOBRECARGA — POR QUE `drop` E NÃO SÓ `create or replace`:
-- `create or replace function gps.admin_painel_alunos(integer, integer)` NÃO
-- substitui `gps.admin_painel_alunos()`: assinatura diferente é FUNÇÃO NOVA.
-- As duas coexistiriam e a chamada `rpc("admin_painel_alunos")` sem argumentos
-- ficaria AMBÍGUA (a nova tem defaults para os dois parâmetros, então também
-- casa com zero argumentos) — o PostgREST devolveria 300/PGRST203 e o painel
-- ficaria vazio em produção, sem erro no build. Este banco já foi mordido por
-- isso. O `drop` da assinatura de 0 argumentos é o que torna a troca atômica.
-- `drop function` SEM `if exists`, de propósito: se a função de 0 argumentos
-- não estiver lá, a premissa deste arquivo está errada e a migração tem de
-- abortar em vez de criar uma segunda versão ao lado da que existe.
-- ⚠️ APLICAR COMO UMA TRANSAÇÃO ÚNICA (é o que `supabase db push` /
-- `apply_migration` fazem). A janela sem função é a da transação.
-- ⚠️ `drop function` descarta as ACLs — o `revoke`/`grant` do fim não é
-- decorativo: sem ele a função nasce executável por `public` (default do
-- Postgres) sendo SECURITY DEFINER e lendo `auth.users`.
--
-- O QUE MUDA:
--   1. Dois parâmetros NOVOS, ambos com default:
--        p_limite integer default 200  -- teto de linhas devolvidas
--        p_offset integer default 0    -- deslocamento
--      Chamar sem argumento nenhum continua funcionando e devolve os 200
--      primeiros — hoje isso é a base inteira (125 ambientes).
--      Os dois são SANEADOS no corpo antes de virarem `limit`/`offset`:
--      `p_limite` é preso em [1, 1000] e `p_offset` em [0, ∞). Sem isso um
--      `p_limite = -1` vindo do cliente derrubaria a função com 2201W
--      ("LIMIT must not be negative") e a tela mostraria lista vazia; um
--      `p_limite = 100000` anularia o teto que esta migração existe para
--      criar. O teto de 1000 é o mesmo raciocínio do payload: acima disso a
--      tela não aguenta, independentemente de quem pediu.
--   2. Uma coluna NOVA no fim (nada removido, renomeado ou reordenado):
--        total_ambientes integer -- TOTAL de ambientes do GPS, repetido em
--                                   toda linha.
--      Vem de `count(*) over ()`, calculado ANTES do `limit` (window function
--      roda antes de LIMIT no Postgres). Repetir o total em toda linha é
--      redundante em bytes e simples em contrato: a alternativa (dois
--      retornos, ou uma segunda RPC de contagem) custaria uma varredura a
--      mais de `gps.membros` e um segundo round-trip só para exibir um número
--      no rodapé.
--      ⚠️ Com `p_offset` além do fim, o resultado é ZERO linha e o total fica
--      DESCONHECIDO (não há linha para carregá-lo). `getAlunosGps` trata isso
--      como 0 e a tela diria "0 de 0". Aceitável porque a UI escolhida NUNCA
--      usa offset (o "Mostrar mais" aumenta o LIMITE a partir de 0, mantendo
--      o lote anterior na tela); `p_offset` existe para conferência e para um
--      consumidor futuro que pagine de verdade.
--   3. Ordem DETERMINÍSTICA: `order by a.ultimo_membro_em desc, a.aluno_id`.
--      O `desc` é o de hoje, letra por letra; o desempate por `aluno_id` é
--      NOVO e é o que torna a paginação correta. Sem desempate, dois
--      ambientes com o MESMO `max(criado_em)` podem sair em ordem diferente
--      entre duas execuções do mesmo plano — e aí a página 2 repete uma linha
--      da página 1 e perde outra, em silêncio. Empate é real aqui: `desde`/
--      `ultimo_membro_em` saem de `gps.membros.criado_em`, e criar dois
--      ambientes na mesma operação dá o mesmo timestamp.
--      Para quem lê sem paginar, a mudança é invisível: o desempate só age
--      onde a ordem já era indefinida.
--
-- O QUE ESTA MIGRAÇÃO NÃO FAZ:
--   * não muda NENHUM número: qtd_membros, tem_login, desde, ultimo_acesso,
--     clientes_preenchidos, clientes_com_dados, clientes_com_perda, agendados,
--     tarefas_concluidas, honorarios_contratados, contratados e
--     contratados_sem_valor ficam idênticos aos da ...091 (conferência no
--     rodapé deste arquivo);
--   * não move busca nem ordenação para o servidor (Leitura B, recusada);
--   * não cria índice. A função agrega TODOS os ambientes antes de cortar:
--     todas as linhas de `gps.membros`/`gps.etapa1_clientes` qualificam, o
--     planner ignoraria um índice e sobraria só o custo de escrita. O `limit`
--     corta DEPOIS da agregação — ele reduz o PAYLOAD e a hidratação, que é o
--     problema medido, não a varredura;
--   * não escreve em nenhuma linha de dado.
--
-- REVERSÃO (literal, nesta ordem, em UMA transação):
--   drop function gps.admin_painel_alunos(integer, integer);
--   -- e reaplicar o arquivo íntegro
--   -- supabase/migrations/20260909000091_gps_admin_painel_alunos_honorarios.sql
--   -- (que faz `drop function gps.admin_painel_alunos();` no topo — TROQUE
--   --  esse drop pelo da assinatura de 2 argumentos acima, senão ele aborta
--   --  em 42883), incluindo o revoke/grant que aquele arquivo traz no fim.
--   ⚠️ Reverter exige que src/lib/data.ts pare de ler `total_ambientes` e de
--   passar `p_limite`/`p_offset`; em JS, coluna ausente vira `undefined`, não
--   erro — o rodapé diria "de 0" para sempre sem ninguém notar.

drop function gps.admin_painel_alunos();

create function gps.admin_painel_alunos(
  p_limite integer default 200,
  p_offset integer default 0
)
returns table (
  aluno_id               uuid,
  qtd_membros            integer,
  tem_login              boolean,
  desde                  timestamptz,
  ultimo_acesso          timestamptz,
  clientes_preenchidos   integer,
  clientes_com_dados     integer,
  clientes_com_perda     integer,
  agendados              integer,
  tarefas_concluidas     integer[],
  honorarios_contratados numeric,
  contratados            integer,
  contratados_sem_valor  integer,
  total_ambientes        integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- Saneamento ANTES de virar `limit`/`offset` (ver cabeçalho): teto de 1000,
  -- piso de 1, e nada de offset negativo. `coalesce` porque o PostgREST
  -- consegue passar `null` explícito, que NÃO aciona o default do parâmetro.
  v_limite integer := least(greatest(coalesce(p_limite, 200), 1), 1000);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not public.gp_is_admin() then
    raise exception 'apenas administradores' using errcode = '42501';
  end if;

  return query
  with amb as (
    select m.aluno_id                        as aluno_id,
           count(*)::integer                 as qtd_membros,
           bool_or(m.user_id is not null)    as tem_login,
           min(m.criado_em)                  as desde,
           max(m.criado_em)                  as ultimo_membro_em,
           max(u.last_sign_in_at)            as ultimo_acesso
      from gps.membros m
      left join auth.users u on u.id = m.user_id
     group by m.aluno_id
  ),
  cli as (
    -- Os filtros replicam LETRA POR LETRA calcularMetricasEtapa1
    -- (src/lib/etapa1.ts): em JS, string vazia é falsy, então '' conta como
    -- AUSENTE. `telefone is not null` sozinho daria número diferente.
    select c.aluno_id                                                     as aluno_id,
           count(*) filter (
             where coalesce(btrim(c.nome), '') <> ''
           )::integer                                                     as preenchidos,
           count(*) filter (
             where coalesce(btrim(c.nome), '') <> ''
               and coalesce(btrim(c.telefone), '') <> ''
               and c.nivel_relacionamento is not null
           )::integer                                                     as com_dados,
           count(*) filter (where c.perda_inercia is not null)::integer   as com_perda,
           -- EVIDÊNCIA, não `status` (migração ...061). `status` está
           -- congelado desde a ...060: contá-lo devolveria o número de
           -- ontem para sempre. Mesmo critério de calcularMetricasEtapa1 e
           -- do backfill de `fase` -- os três números têm de casar.
           count(*) filter (
             where c.data_reuniao_preliminar is not null or c.aderiu_reuniao
           )::integer                                                     as agendados,
           -- HONORÁRIOS (migração ...091). Só `fase = 'contratado'` conta na
           -- meta de R$ 150.000 (B8) -- a regra vive AQUI e em
           -- resumoHonorarios (src/lib/etapa1.ts), nunca numa constraint da
           -- coluna (B9-b: catraca que impediria o cliente voltar de fase).
           -- sum() SEM coalesce: NULL significa "nenhum contratado com valor
           -- registrado" e é diferente de zero.
           sum(c.valor_honorarios) filter (
             where c.fase = 'contratado'
           )                                                              as honorarios_contratados,
           count(*) filter (where c.fase = 'contratado')::integer         as contratados,
           count(*) filter (
             where c.fase = 'contratado'
               and c.valor_honorarios is null
           )::integer                                                     as contratados_sem_valor
      from gps.etapa1_clientes c
     group by c.aluno_id
  ),
  prog as (
    select p.aluno_id                                        as aluno_id,
           array_agg(p.tarefa order by p.tarefa)::integer[]   as tarefas
      from gps.progresso p
     where p.etapa = 1 and p.concluida
     group by p.aluno_id
  )
  select a.aluno_id,
         a.qtd_membros,
         a.tem_login,
         a.desde,
         a.ultimo_acesso,
         coalesce(cl.preenchidos, 0),
         coalesce(cl.com_dados, 0),
         coalesce(cl.com_perda, 0),
         coalesce(cl.agendados, 0),
         coalesce(pr.tarefas, '{}'::integer[]),
         -- sem coalesce, de propósito (ver ...091): NULL = não informado.
         cl.honorarios_contratados,
         coalesce(cl.contratados, 0),
         coalesce(cl.contratados_sem_valor, 0),
         -- TOTAL de ambientes, repetido em toda linha. Window function roda
         -- ANTES do `limit`, então isto é o total do universo, não do lote.
         -- Os parênteses são obrigatórios: `count(*) over ()::integer` tenta
         -- castar a definição da janela e é erro de sintaxe.
         (count(*) over ())::integer
    from amb a
    left join cli  cl on cl.aluno_id = a.aluno_id
    left join prog pr on pr.aluno_id = a.aluno_id
   -- Ambiente com o membro mais recente primeiro (ordem de hoje), com
   -- DESEMPATE por aluno_id: sem ele, paginar duplica e perde linha quando
   -- dois ambientes têm o mesmo max(criado_em). Ver cabeçalho, item 3.
   order by a.ultimo_membro_em desc, a.aluno_id
   limit v_limite
  offset v_offset;
end;
$$;

comment on function gps.admin_painel_alunos(integer, integer) is
  'Uma linha por AMBIENTE do GPS com o resumo da Etapa 01 para o painel /admin, PAGINADA (migracao ...120): p_limite (default 200, preso em [1,1000]) e p_offset (default 0, nunca negativo). Devolve tambem total_ambientes -- o total do universo, via count(*) over () calculado antes do limit -- repetido em toda linha, para o rodape "Mostrando X de Y carregados, Z no programa". Ordem: ultimo_membro_em desc, aluno_id (o desempate e o que torna a paginacao correta; sem ele empate de criado_em duplica e perde linha entre paginas). A busca e os filtros do painel continuam EM MEMORIA sobre o lote carregado (Leitura A do bloqueio 2) -- por isso a tela e obrigada a dizer quantos carregou. Substitui as 4 consultas de getAlunosGps, que traziam as 879 linhas inteiras de gps.etapa1_clientes para contar 4 numeros no Node. Os filtros de contagem replicam calcularMetricasEtapa1 (src/lib/etapa1.ts) exatamente, inclusive tratar string vazia como ausente. `agendados` sai da EVIDENCIA (data_reuniao_preliminar/aderiu_reuniao) desde a ...061, e nao mais de status in (agendado,realizada): status congelou na ...060 e devolveria o numero de ontem para sempre. honorarios_contratados e a soma de valor_honorarios dos clientes em fase=contratado; NULL quando nenhum contratado tem valor -- NUNCA coalesce para 0, que transformaria buraco em resultado. ultimo_acesso vem de auth.users.last_sign_in_at (mesma fonte de gps.admin_status_acesso), NUNCA de gps.acessos_log, que e log de acao administrativa. SECURITY DEFINER: abre com gp_is_admin() ou 42501.';

revoke execute on function gps.admin_painel_alunos(integer, integer) from public, anon;
grant  execute on function gps.admin_painel_alunos(integer, integer) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- BLOCO DE CONFERÊNCIA (rodar DEPOIS de aplicar, no SQL Editor, como admin)
-- Não faz parte da migração — é o roteiro de aceite. Nada aqui escreve.
-- ─────────────────────────────────────────────────────────────────────────
--
-- 1) SOBRECARGA: tem de existir UMA única `admin_painel_alunos`. Se der 2,
--    a versão de 0 argumentos sobreviveu e a chamada do PostgREST vira
--    ambígua (PGRST203) — reverter e investigar antes de qualquer deploy.
--
--    select count(*) as sobrecargas,
--           string_agg(pg_get_function_identity_arguments(p.oid), ' | ') as assinaturas
--      from pg_proc p
--      join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'gps' and p.proname = 'admin_painel_alunos';
--    -- ESPERADO: sobrecargas = 1 · assinaturas = 'integer, integer'
--
-- 2) PERMISSÃO (o `drop` apagou as ACLs antigas):
--    select has_function_privilege('anon',          'gps.admin_painel_alunos(integer,integer)', 'execute') as anon,
--           has_function_privilege('authenticated', 'gps.admin_painel_alunos(integer,integer)', 'execute') as authenticated;
--    -- ESPERADO: anon = false · authenticated = true
--
-- 3) TOTAL e teto padrão:
--    select count(*) as linhas, max(total_ambientes) as total
--      from gps.admin_painel_alunos();
--    -- ESPERADO (09/09/2026): linhas = 125 · total = 125
--    -- Contador INDEPENDENTE (não passa pela função que está sendo testada):
--    select count(distinct aluno_id) from gps.membros;
--    -- ESPERADO: 125, o MESMO número de `total_ambientes`.
--
-- 4) PAGINAÇÃO SEM DUPLICAR NEM PERDER (0..200 e 200..400):
--    with p1 as (select aluno_id from gps.admin_painel_alunos(200, 0)),
--         p2 as (select aluno_id from gps.admin_painel_alunos(200, 200)),
--         u  as (select aluno_id from p1 union all select aluno_id from p2)
--    select count(*)                     as linhas_somadas,
--           count(distinct aluno_id)     as distintos,
--           (select count(distinct aluno_id) from gps.membros) as universo
--      from u;
--    -- ESPERADO: linhas_somadas = distintos (zero duplicata)
--    --           e distintos = universo (zero linha perdida).
--    -- Hoje, com 125 ambientes, p2 vem vazia e os três números são 125.
--    -- Para exercitar a fronteira de verdade com a base atual, use lotes
--    -- pequenos — é o mesmo teste, com o corte no meio dos dados:
--    with p1 as (select aluno_id from gps.admin_painel_alunos(50,   0)),
--         p2 as (select aluno_id from gps.admin_painel_alunos(50,  50)),
--         p3 as (select aluno_id from gps.admin_painel_alunos(50, 100)),
--         u  as (select aluno_id from p1 union all
--                select aluno_id from p2 union all
--                select aluno_id from p3)
--    select count(*) as linhas_somadas, count(distinct aluno_id) as distintos from u;
--    -- ESPERADO: 125 e 125.
--
-- 5) SANEAMENTO DOS PARÂMETROS (não pode lançar exceção nem ignorar o teto):
--    select count(*) as com_limite_negativo from gps.admin_painel_alunos(-1, 0);      -- 1
--    select count(*) as com_offset_negativo from gps.admin_painel_alunos(200, -5);    -- 125
--    select count(*) as com_limite_absurdo  from gps.admin_painel_alunos(100000, 0);  -- 125 (teto 1000)
--    select count(*) as com_nulos           from gps.admin_painel_alunos(null, null); -- 125
--
-- 6) NENHUM NÚMERO MUDOU (as 13 colunas antigas continuam idênticas às da
--    ...091). Rode ANTES da migração, guarde o resultado, rode DEPOIS e
--    compare linha a linha:
--    select aluno_id, qtd_membros, tem_login, desde, ultimo_acesso,
--           clientes_preenchidos, clientes_com_dados, clientes_com_perda,
--           agendados, tarefas_concluidas, honorarios_contratados,
--           contratados, contratados_sem_valor
--      from gps.admin_painel_alunos()
--     order by aluno_id;
--
-- 7) NÃO-ADMIN CONTINUA BARRADO (42501). Com um JWT de aluno, via PostgREST:
--    POST /rest/v1/rpc/admin_painel_alunos  → 403, code 42501.
--
-- 8) CACHE DE SCHEMA do PostgREST: `supabase db push` / `apply_migration`
--    disparam o reload sozinhos. Se a chamada com `p_limite` voltar
--    PGRST202 ("function not found"), force:
--    notify pgrst, 'reload schema';
