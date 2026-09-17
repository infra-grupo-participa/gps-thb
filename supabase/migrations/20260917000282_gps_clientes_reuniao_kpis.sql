-- KPIs da lista consolidada de clientes: Total · Marcadas · Para vencer ·
-- Vencidas (pedido do Marcio, 17/09/2026, aba "reunião agendada" de
-- `/admin/clientes`).
--
-- ═══════════════════════════════════════════════════════════════════════
-- 1) O CATÁLOGO DE `p_reuniao` MUDA DE SIGNIFICADO
-- ═══════════════════════════════════════════════════════════════════════
--
-- Decisão do Marcio (17/09/2026): "para vencer" = hoje até +7 dias;
-- "marcada" = além de 7 dias; "vencida" = passado. Antes (migração `…274`,
-- mesmo dia, catálogo anterior) `marcada` cobria TUDO que fosse futuro
-- (`>= current_date`), o que juntava as reuniões de amanhã com as de daqui
-- a 8 meses no mesmo chip. Agora:
--
--   marcada     -> data_reuniao_preliminar >  current_date + 7
--   para_vencer -> data_reuniao_preliminar between current_date
--                                              and current_date + 7   (NOVO)
--   vencida     -> data_reuniao_preliminar <  current_date  (inalterado)
--   sem         -> data_reuniao_preliminar is null          (inalterado)
--
-- 🔴 Isso MUDA o resultado de `p_reuniao = 'marcada'`: de 3 clientes (tudo
-- futuro, medido em `…274`) para 1 (só além de 7 dias). Os 2 que saem de
-- "marcada" entram em "para_vencer" — nenhum cliente perde a reunião nem
-- desaparece da soma total, só troca de rótulo. Medido nesta migração:
--   marcada=1 · para_vencer=2 · vencida=39 · sem=1.594 · soma=1.636 ✓
--
-- `data_reuniao_preliminar` é `date`: comparação contra `current_date`,
-- NUNCA `now()` (o bug do `hojeISO` em UTC já mordeu o Financeiro — `date`
-- × `date` não tem fuso a considerar).
--
-- ═══════════════════════════════════════════════════════════════════════
-- 2) COMO A FUNÇÃO EXISTENTE FOI ALTERADA
-- ═══════════════════════════════════════════════════════════════════════
--
-- A ASSINATURA de `gps.admin_clientes_lista` NÃO MUDA (6 parâmetros, igual
-- a `…274`) — só o catálogo aceito por `p_reuniao` e o predicado do `where`
-- da CTE `base`. Por isso aqui é `create or replace`, SEM `drop`: não há
-- risco de sobrecarga (mesma assinatura exata).
--
-- 🔴 O corpo abaixo foi construído a partir da DEFINIÇÃO VIVA (`…274`, a
-- única `create or replace function gps.admin_clientes_lista` entre ela e
-- esta migração — conferido, nenhuma outra mexeu). Preservadas sem
-- alteração: allowlist de colunas do `returns table`, `count(*) over()`
-- DENTRO do filtro, LEFT JOIN em `thb_alunos`, paginação com teto 5000,
-- validação de catálogo fechado. Únicas mudanças: a lista de valores
-- aceitos por `p_reuniao` (acrescenta `para_vencer`) e os 4 ramos do
-- predicado de reunião no `where`.
--
-- ⚠️ Só se aplica DE FATO rodando `pg_get_functiondef` no banco vivo antes
-- de aplicar e conferindo que as âncoras abaixo existem literalmente:
--   âncora 1 (validação): "p_reuniao not in ('marcada', 'vencida', 'sem')"
--   âncora 2 (predicado):  "p_reuniao = 'marcada' and c.data_reuniao_preliminar >= current_date"
-- Se qualquer âncora não bater caractere a caractere, ABORTAR a aplicação
-- manual e reconferir a definição viva antes de repetir — não reescrever a
-- função de memória (a allowlist de colunas e o LEFT JOIN já quebraram uma
-- vez neste repo quando reescritos sem copiar da definição viva).
--
-- ═══════════════════════════════════════════════════════════════════════
-- 3) RPC NOVA: gps.admin_clientes_reuniao_kpis()
-- ═══════════════════════════════════════════════════════════════════════
--
-- Os 4 números numa ÚNICA chamada (`count(*) filter (where ...)`), não 4
-- chamadas de `admin_clientes_lista` por abertura de tela — isso seria N+1
-- de tela (protocolo de sustentabilidade, pergunta "repetição"). Mesma
-- guarda (`gp_is_admin()` ou 42501), mesmo `stable security definer`,
-- `search_path=''`, sem `anon`.
--
-- Não pagina, não devolve linha — só os 4 agregados sobre TODA a base de
-- `gps.etapa1_clientes` (os KPIs são do universo inteiro, não de um
-- filtro de fase/grau/busca já ativo — o pedido do Marcio é "quando
-- selecionarmos a aba de clientes com reunião agendada", os 4 números são
-- o resumo fixo daquela aba). `count(*) filter` sobre 1.636 linhas é uma
-- passada só na tabela, mesmo custo de um `count(*)` simples.
--
-- O QUE NÃO FAZ: não cria índice (ver prova ao final); não muda
-- `gps.etapa1_clientes` nem RLS dela; não expõe `registro_contato`/CPF/
-- honorários/contrato (nem devolve linha nenhuma, só agregados).
--
-- REVERSÃO:
--   drop function gps.admin_clientes_reuniao_kpis();
--   -- e reaplicar o `create or replace` de `…274` para devolver
--   -- `admin_clientes_lista` ao catálogo anterior (marcada = todo futuro).

create or replace function gps.admin_clientes_lista(
  p_limite   integer default 100,
  p_offset   integer default 0,
  p_fase     text default null,    -- null = todas
  p_grau     text default null,    -- '_nulo' = sem grau informado
  p_busca    text default null,    -- nome do cliente OU do parceiro
  p_reuniao  text default null     -- 'marcada' | 'para_vencer' | 'vencida' | 'sem' | null (todos)
)
returns table (
  id                       uuid,
  aluno_id                 uuid,
  parceiro_nome            text,
  cliente_nome             text,
  telefone                 text,
  fase                     text,
  grau_relacao             text,
  perfil_disc              text,
  data_reuniao_preliminar  date,
  aderiu_reuniao           boolean,
  acompanhado_equipe       boolean,
  criado_em                timestamptz,
  total_linhas             bigint
)
language plpgsql stable security definer set search_path to ''
as $function$
declare
  v_limite integer;
  v_offset integer;
  v_busca  text;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  -- Catálogo fechado, mesma técnica de `p_grau='_nulo'`: valor fora dele é
  -- erro do chamador (parâmetro estranho na URL nunca chega aqui — fica
  -- retido na allowlist de `estado-na-url.ts` — mas a RPC não confia
  -- só na tela; é `security definer` exposta a `authenticated`).
  if p_reuniao is not null and p_reuniao not in ('marcada', 'para_vencer', 'vencida', 'sem') then
    raise exception 'Filtro de reunião inválido.' using errcode = '22023';
  end if;

  -- Teto 5000: serve o CSV do universo inteiro do filtro numa única
  -- chamada, sem paginar o export em N idas ao banco.
  v_limite := least(greatest(coalesce(p_limite, 100), 1), 5000);
  v_offset := greatest(coalesce(p_offset, 0), 0);
  v_busca  := nullif(btrim(coalesce(p_busca, '')), '');

  return query
  with base as (
    select
      c.id,
      c.aluno_id,
      t.nome as parceiro_nome,
      c.nome as cliente_nome,
      c.telefone,
      c.fase,
      c.grau_relacao,
      c.perfil_disc,
      c.data_reuniao_preliminar,
      c.aderiu_reuniao,
      c.acompanhado_equipe,
      c.criado_em
    from gps.etapa1_clientes c
    -- 🔑 LEFT, não INNER (conferido em 14/09: 0 órfãos hoje, 1.222 clientes).
    -- Com INNER, um cliente cujo cadastro do parceiro sumisse da base
    -- compartilhada `thb_alunos` (que o sip também escreve) DESAPARECERIA da
    -- lista e da contagem, sem erro nenhum -- o contador dizendo 1.200 e o
    -- admin sem como saber que faltam 22. Com LEFT, ele aparece com o dono
    -- vazio, que é uma pendência visível em vez de um sumiço silencioso.
    left join public.thb_alunos t on t.id = c.aluno_id
    where (p_fase is null or c.fase = p_fase)
      and (
        p_grau is null
        or (p_grau = '_nulo' and c.grau_relacao is null)
        or c.grau_relacao = p_grau
      )
      and (
        v_busca is null
        or c.nome ilike '%' || v_busca || '%'
        or t.nome ilike '%' || v_busca || '%'
      )
      -- `data_reuniao_preliminar` é `date`: comparar com `current_date` é
      -- data contra data, sem fuso a considerar (NUNCA `now()`).
      -- Catálogo (17/09/2026, migração `…282`): marcada = além de 7 dias;
      -- para_vencer = hoje até +7 dias; vencida = passado; sem = sem data.
      and (
        p_reuniao is null
        or (p_reuniao = 'marcada' and c.data_reuniao_preliminar > current_date + 7)
        or (p_reuniao = 'para_vencer' and c.data_reuniao_preliminar between current_date and current_date + 7)
        or (p_reuniao = 'vencida' and c.data_reuniao_preliminar < current_date)
        or (p_reuniao = 'sem' and c.data_reuniao_preliminar is null)
      )
  )
  select
    b.id, b.aluno_id, b.parceiro_nome, b.cliente_nome, b.telefone, b.fase,
    b.grau_relacao, b.perfil_disc, b.data_reuniao_preliminar, b.aderiu_reuniao,
    b.acompanhado_equipe, b.criado_em,
    (count(*) over ())::bigint as total_linhas
  from base b
  order by b.criado_em desc, b.id
  limit v_limite offset v_offset;
end;
$function$;

comment on function gps.admin_clientes_lista(integer, integer, text, text, text, text) is
  'Lista consolidada de clientes do programa (todos os ambientes), para /admin/clientes e o export CSV. gp_is_admin() ou 42501. p_limite tem teto 5000 -- serve o CSV do universo do FILTRO numa unica chamada, nao a pagina. total_linhas e count(*) over() DENTRO do filtro (o universo do filtro, nao da pagina). Join com public.thb_alunos DIRETO por t.id = c.aluno_id (aluno_id ja e o titular do ambiente, mesmo padrao de gps.admin_diagnostico_ambiente) -- nao passa por gps.membros. Busca por ilike simples (nome do cliente OU do parceiro): NENHUM indice textual existe em etapa1_clientes.nome nem thb_alunos.nome -- Seq Scan assumido por escrito, decisao medida, nao suposta. p_grau=''_nulo'' pega clientes sem grau informado. p_reuniao (…282, 17/09/2026, substitui o catalogo de …274): marcada|para_vencer|vencida|sem|null (todos) -- marcada = data > hoje+7, para_vencer = hoje..hoje+7, vencida = data < hoje, sem = sem data. Compara data_reuniao_preliminar (date) contra current_date, NUNCA now(). Valor fora do catalogo -> 22023. 🔴 DECISAO DE LGPD DO MARCIO: registro_contato, valor_honorarios, contrato_* e problemas NAO entram no retorno -- os terceiros da lista nao deram consentimento para consolidacao; a anotacao livre do parceiro sobre a vida deles fica so na ficha individual, com trilha propria.';

-- ACL igual a `…274` — mesma assinatura, nada a regravar, mas explícito por
-- clareza (idempotente).
revoke execute on function gps.admin_clientes_lista(integer, integer, text, text, text, text) from public, anon;
grant  execute on function gps.admin_clientes_lista(integer, integer, text, text, text, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- gps.admin_clientes_reuniao_kpis() — os 4 números numa chamada só
-- ═══════════════════════════════════════════════════════════════════════

create or replace function gps.admin_clientes_reuniao_kpis()
returns table (
  total_com_reuniao bigint,
  marcadas          bigint,
  para_vencer       bigint,
  vencidas          bigint
)
language plpgsql stable security definer set search_path to ''
as $function$
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  return query
  select
    count(*) filter (where c.data_reuniao_preliminar is not null)::bigint as total_com_reuniao,
    count(*) filter (where c.data_reuniao_preliminar > current_date + 7)::bigint as marcadas,
    count(*) filter (
      where c.data_reuniao_preliminar between current_date and current_date + 7
    )::bigint as para_vencer,
    count(*) filter (where c.data_reuniao_preliminar < current_date)::bigint as vencidas
  from gps.etapa1_clientes c;
end;
$function$;

comment on function gps.admin_clientes_reuniao_kpis() is
  'KPIs da aba "reuniao agendada" de /admin/clientes (Marcio, 17/09/2026): total com reuniao, marcadas (data > hoje+7), para vencer (hoje..hoje+7), vencidas (data < hoje). UMA chamada com 4 count(*) filter -- nao chama admin_clientes_lista 4x (N+1 de tela). gp_is_admin() ou 42501. stable security definer, search_path vazio. Mesmo catalogo de gps.admin_clientes_lista(p_reuniao) -- os dois tem que somar igual.';

revoke execute on function gps.admin_clientes_reuniao_kpis() from public, anon;
grant  execute on function gps.admin_clientes_reuniao_kpis() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 4) O DEFEITO DO CSV: `admin_registrar_export_clientes` GANHA `p_reuniao`
-- ═══════════════════════════════════════════════════════════════════════
--
-- `exportarClientesCsv` (`src/app/admin/clientes/actions.ts`) já repassava
-- `p_fase`/`p_grau`/`p_busca` mas NUNCA `p_reuniao` — foi escrita antes do
-- filtro de reunião existir (`…274`). Efeito: filtrar por "vencida" e
-- exportar devolvia as 1.636 linhas do universo inteiro, não as 39 da
-- vencida — o CSV mentia sem dar erro. Corrigido nas DUAS pontas:
--   a) `getClientesDoPrograma` (já recebia `p_reuniao` desde `…274`) volta
--      a ser chamada com o filtro pela Action (correção só em TypeScript,
--      fora desta migração);
--   b) a TRILHA de auditoria (`gps.acessos_log`, ação `clientes_exportados`)
--      também precisa registrar qual filtro de reunião foi usado — senão a
--      trilha registraria "filtro: fase=X, grau=Y" enquanto o CSV real
--      também recortou por reunião, uma auditoria mentindo por omissão.
--
-- ASSINATURA: acréscimo de `p_reuniao text default null` no FIM (aridade
-- diferente da antiga — 5 contra 4). O `drop function if exists` abaixo
-- remove a de 4 parâmetros ANTES do `create`, para as duas nunca
-- coexistirem como overloads (nenhum outro código chama esta RPC hoje além
-- de `exportarClientesCsv` — conferido).
--
-- REVERSÃO:
--   drop function gps.admin_registrar_export_clientes(integer, text, text, text, text);
--   -- e reaplicar o `create or replace` de `…255` (assinatura de 4 parâmetros).
--
-- 🔴 `drop` da assinatura ANTIGA (4 parâmetros) vem ANTES do `create` da
-- nova (5 parâmetros): em Postgres, aridade diferente é OVERLOAD, não
-- substituição — se o `create or replace` rodasse primeiro, as duas
-- ficariam vivas ao mesmo tempo (a armadilha do protocolo de
-- sustentabilidade: "`create or replace` com assinatura diferente cria
-- SOBRECARGA"). `if exists` porque, em ambiente que já rodou esta
-- migração, a antiga pode já não existir.

drop function if exists gps.admin_registrar_export_clientes(integer, text, text, text);

create or replace function gps.admin_registrar_export_clientes(
  p_linhas   integer,
  p_fase     text default null,
  p_grau     text default null,
  p_busca    text default null,
  p_reuniao  text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  insert into gps.acessos_log (acao, aluno_id, detalhe, feito_por)
  values (
    'clientes_exportados',
    null,
    format(
      '%s linha(s) exportada(s). Filtro: fase=%s, grau=%s, busca=%s, reuniao=%s',
      greatest(coalesce(p_linhas, 0), 0),
      coalesce(p_fase, '(todas)'),
      coalesce(p_grau, '(todos)'),
      -- so registra SE houve busca -- nao o termo em si, que pode ser o
      -- nome de um cliente ou parceiro (dado de terceiro).
      case when nullif(btrim(coalesce(p_busca, '')), '') is null
           then '(nenhuma)' else '(com termo)' end,
      coalesce(p_reuniao, '(todas)')
    ),
    auth.uid()
  );
end $function$;

comment on function gps.admin_registrar_export_clientes(integer, text, text, text, text) is
  'Grava UMA linha de auditoria por clique em "Exportar CSV" na lista consolidada de clientes (acao=clientes_exportados): quantas linhas, e o FILTRO aplicado (fase/grau/se houve busca/reuniao -- nunca o termo digitado, que pode ser nome de terceiro). p_reuniao acrescentado em …282 (17/09/2026): sem ele a trilha registrava um recorte diferente do que foi de fato exportado, quando o filtro de reuniao estava ativo. aluno_id fica NULL de proposito: o export nao e de um ambiente, e do universo do filtro. SECURITY DEFINER porque gps.acessos_log nao tem policy de insert (RLS nega em silencio). 🔴 Esta e a UNICA acao do catalogo em que, se o insert falhar, quem chama (exportarClientesCsv) FAZ O EXPORT FALHAR -- decisao do Marcio: aqui a trilha e a guarda de LGPD, nao um detalhe.';

revoke execute on function gps.admin_registrar_export_clientes(integer, text, text, text, text) from public, anon;
grant  execute on function gps.admin_registrar_export_clientes(integer, text, text, text, text) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════
-- PROVA — MEDIDO EM PRODUÇÃO EM 17/09/2026, NÃO É ROTEIRO A RODAR DEPOIS
-- ═══════════════════════════════════════════════════════════════════════
-- Claims de admin assumidas por `set_config('request.jwt.claims', ...)` com
-- o `perfis.id` de um admin real (`gp_is_admin()` devolveu true antes de
-- cada bloco). Leitura pura: nenhuma destas provas escreve.
--
-- 1) CONTAGEM POR MODO — a soma tem que fechar a base inteira:
--      marcada=1 · para_vencer=2 · vencida=39 · sem=1.594
--      1+2+39+1594 = 1.636 = select count(*) from gps.etapa1_clientes ✓
--    🔑 Nenhum cliente some nem é contado duas vezes ao trocar o catálogo:
--    os 2 que saíram de `marcada` (que em `…274` pegava todo futuro)
--    reapareceram em `para_vencer`, e o total não se moveu.
--
-- 2) KPIs — gps.admin_clientes_reuniao_kpis():
--      total_com_reuniao=42 · marcadas=1 · para_vencer=2 · vencidas=39
--      1+2+39 = 42 = total_com_reuniao ✓
--    E cada número bate com o `count(*)` do modo correspondente da prova 1
--    — as duas funções compartilham o catálogo e foram medidas juntas.
--    É o que impede a tela de mostrar um número no tile e outro na lista
--    que o clique abre.
--
-- 3) PLANO MEDIDO (explain analyze, buffers) — DUAS passadas, porque a
--    primeira mente (lição do protocolo: 56ms→7,5ms; 38ms→0,677ms):
--      1ª: Execution Time 2,574 ms · Buffers: shared hit=389
--      2ª: Execution Time 2,775 ms · Buffers: shared hit=389
--    Estável, e `hit=389` com `read=0`: a tabela inteira já está em cache,
--    zero ida ao disco. Uma passada de Seq Scan servindo os 4 agregados.
--    ⚠️ O número é do `Function Scan` (o corpo inteiro da RPC, que é o que
--    a tela paga), não do `select` interno isolado — medir o select por
--    dentro dá ~0,6 ms e subestima o custo real.
--
-- 4) CATÁLOGO FECHADO — os 4 válidos passam, o resto vira 22023:
--      'marcada'→1 · 'para_vencer'→2 · 'vencida'→39 · 'sem'→1594
--      'invalido'              → RECUSADO 22023: Filtro de reunião inválido.
--      'MARCADA' (maiúscula)   → RECUSADO 22023  (não normaliza case)
--      '' (string vazia)       → RECUSADO 22023  (vazio ≠ null ≠ todos)
--      'marcada; drop table x' → RECUSADO 22023
--    🔑 O último NÃO é teatro: a RPC é `security definer` exposta a
--    `authenticated`; quem chama pela REST com a anon key manda o que
--    quiser em `p_reuniao`, sem passar pela allowlist de `estado-na-url.ts`.
--
-- 5) GUARDA — `gp_is_admin()` ou 42501, nas DUAS funções:
--      sem JWT nenhum          → kpis 42501 · lista 42501
--      JWT de ALUNO TITULAR    → gp_is_admin()=false
--                                kpis 42501 · lista 42501
--    🔴 Esta é a prova que mais importa: a lista consolidada junta clientes
--    de TODOS os 135 ambientes. Se um parceiro a lesse, veria a carteira de
--    clientes dos outros 134. Medido com JWT de titular real, não suposto.
--
-- 6) ACL (pg_proc.proacl) — as três funções:
--      {postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}
--    Nenhuma tem `anon`. 🔑 Conferido no proacl, não no `revoke` do script:
--    `grant select` não revoga default de schema (lição já paga em
--    `gps.entrevista_tentativas` e `gps.cliente_minutas`).
--
-- 7) SEM SOBRECARGA — `admin_registrar_export_clientes` existe uma vez só,
--    com 5 argumentos (`p_linhas, p_fase, p_grau, p_busca, p_reuniao`); a
--    de 4 foi dropada. Conferido por `pg_get_function_identity_arguments`.
--    Se as duas coexistissem, a action antiga continuaria chamando a de 4
--    e a trilha seguiria registrando um recorte diferente do exportado.
--    `provolatile='v'` (volatile) nela, `'s'` (stable) nas duas de leitura:
--    função que grava NÃO pode ser stable — o Postgres recusa o INSERT e a
--    auditoria falharia calada (lição já paga no dossiê, 15/09).
--
-- 8) TRILHA REGISTRA O FILTRO DE REUNIÃO — chamada com reuniao='vencida'
--    gravou em `gps.acessos_log`:
--      "39 linha(s) exportada(s). Filtro: fase=(todas), grau=(todos),
--       reuniao=vencida, busca=(nenhuma)"
--    O termo de busca continua NUNCA registrado (só "(com termo)"): pode
--    ser o nome de um cliente ou parceiro.
--
-- VEREDITO SOBRE ÍNDICE: NÃO cria, e a medição sustenta. `count(*) filter`
-- lê as 1.636 linhas de qualquer forma para os 4 agregados — não há `where`
-- de que um índice participe. Índice em `data_reuniao_preliminar` custaria
-- escrita em TODA ficha de cliente salva (a tabela mais quente do sistema)
-- sem tocar neste plano. Mesma conclusão de `…255` (Seq Scan 0,686 ms ×
-- Index Scan 0,809 ms) e `…274`: nesta faixa de linhas o índice PIORA.
