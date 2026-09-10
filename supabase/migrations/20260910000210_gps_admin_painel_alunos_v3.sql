-- Painel do admin — v3: `onboarding_status`, `em_fechamento` e `apto_ao_saldo`.
--
-- CORPO DE PARTIDA: `gps.admin_painel_alunos(integer, integer)` da migração
-- 20260909000120_gps_admin_painel_alunos_paginado.sql — o corpo vigente no
-- banco. As 14 colunas, os filtros de contagem, a ordem com desempate e os
-- comentários das CTEs vêm de lá LETRA POR LETRA; esta migração só acrescenta
-- 3 colunas no FIM. Se o corpo vigente não for esse, PARE: partir do arquivo
-- errado apaga em silêncio o `agendados` por evidência (...061), os honorários
-- (...091) ou a paginação (...120). Conferir antes de aplicar:
--   select pg_get_functiondef(p.oid) from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='gps' and p.proname='admin_painel_alunos';
--
-- 🔴 `drop function` E NÃO `create or replace`: mudar o RETURNS TABLE (14 → 17
-- colunas) é mudança de tipo de retorno, e `create or replace` recusa com
-- 42P13 ("cannot change return type of existing function"). O `drop` da
-- assinatura de 2 argumentos é o que torna a troca atômica.
-- `drop function` SEM `if exists`, de propósito: se a função não estiver lá, a
-- premissa deste arquivo está errada e a migração tem de abortar em vez de
-- criar uma segunda versão ao lado.
-- ⚠️ APLICAR COMO UMA TRANSAÇÃO ÚNICA (é o que `apply_migration` faz). A
-- janela sem função é a da transação.
-- ⚠️ `drop function` descarta as ACLs — o `revoke`/`grant` do fim não é
-- decorativo: sem ele a função nasce executável por `public` sendo SECURITY
-- DEFINER e lendo `auth.users`.
-- ⚠️ SOBRECARGA TEM DE FICAR = 1. Conferência obrigatória no fim do arquivo:
-- duas versões coexistindo deixam a chamada do PostgREST ambígua (PGRST203) e
-- o painel VAZIO em produção, sem erro no build. Este banco já foi mordido.
--
-- AS TRÊS COLUNAS NOVAS
--
--   `onboarding_status` text — 'nao_iniciado' | 'em_andamento' | 'concluido',
--     do TITULAR do ambiente. Por que o titular e não "qualquer membro": o
--     card do painel é do AMBIENTE e mostra o nome do titular; agregar sócio
--     ali (com `bool_or`) faria o chip dizer "concluído" por causa de um sócio
--     enquanto o titular nunca abriu o questionário. Quem quer ver pessoa por
--     pessoa tem `gps.admin_onboarding_do_aluno()` na Central.
--     Ambiente sem titular com pessoa vinculada → 'nao_iniciado' (é o
--     resultado honesto: ninguém respondeu).
--
--   `em_fechamento` integer — clientes em `fase='fechamento'`. Já existiam
--     `contratados` e `contratados_sem_valor`; faltava o meio do funil, que é
--     o que o card 4 do dashboard mostra e o que o filtro "tem cliente em
--     fechamento" precisa.
--
--   `apto_ao_saldo` boolean — DERIVADO, nunca armazenado (C-1):
--       existe cliente `fase='contratado'` com `valor_honorarios` não nulo
--       E existe anexo `contrato_honorarios` de alguma pessoa do ambiente.
--     É o sinal de "a implementação começou de verdade, com contrato na mão".
--     🔴 NENHUMA TELA ESCREVE VALOR EM REAIS a partir disto (B-S1, pendente do
--     João): o chip diz "Contrato de honorários enviado" e o filtro se chama
--     "com contrato enviado". Derivado e não armazenado porque não desatualiza,
--     não precisa de backfill e não precisa de trigger.
--
-- O QUE ESTA MIGRAÇÃO NÃO FAZ:
--   * não muda NENHUM dos 14 valores existentes (conferência no rodapé);
--   * não move busca nem ordenação para o servidor (Leitura B, recusada);
--   * não cria índice: a função agrega TODOS os ambientes antes de cortar, e
--     `onboarding_respostas`/`onboarding_anexos` entram por CTE agregada, no
--     mesmo plano de `cli`/`prog`. `onboarding_respostas_ambiente_idx`
--     (migração ...204) já existe para a leitura por ambiente da Central;
--   * não escreve em nenhuma linha de dado.
--
-- REVERSÃO (em UMA transação):
--   drop function gps.admin_painel_alunos(integer, integer);
--   -- e reaplicar 20260909000120 íntegro (ele faz `drop function
--   -- gps.admin_painel_alunos();` no topo — TROQUE por `(integer, integer)`,
--   -- senão aborta em 42883), incluindo o revoke/grant do fim.
--   ⚠️ Reverter exige que src/lib/data/alunos.ts pare de ler as 3 colunas: em
--   JS, coluna ausente vira `undefined`, não erro — o chip diria
--   "não iniciado" para todo mundo sem ninguém notar.

drop function gps.admin_painel_alunos(integer, integer);

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
  total_ambientes        integer,
  onboarding_status      text,
  em_fechamento          integer,
  apto_ao_saldo          boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- Saneamento ANTES de virar `limit`/`offset` (ver ...120): teto de 1000,
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
           )::integer                                                     as contratados_sem_valor,
           -- v3 (...210): o meio do funil, que faltava.
           count(*) filter (where c.fase = 'fechamento')::integer         as em_fechamento,
           -- v3: metade do `apto_ao_saldo`. A outra metade (o anexo) vem da
           -- CTE `onb` — as duas condições têm de valer JUNTAS.
           bool_or(c.fase = 'contratado' and c.valor_honorarios is not null)
                                                                          as tem_contratado_com_valor
      from gps.etapa1_clientes c
     group by c.aluno_id
  ),
  prog as (
    select p.aluno_id                                        as aluno_id,
           array_agg(p.tarefa order by p.tarefa)::integer[]   as tarefas
      from gps.progresso p
     where p.etapa = 1 and p.concluida
     group by p.aluno_id
  ),
  -- v3: o questionário do TITULAR do ambiente (ver cabeçalho).
  onb as (
    select m.aluno_id as aluno_id,
           max(case when r.pessoa_aluno_id is null   then 0
                    when r.concluido_em is not null  then 2
                    else 1 end)                       as estado
      from gps.membros m
      left join gps.onboarding_respostas r on r.pessoa_aluno_id = m.pessoa_aluno_id
     where m.papel = 'titular'
     group by m.aluno_id
  ),
  -- v3: existe contrato de honorários anexado por ALGUMA pessoa do ambiente?
  -- (o anexo é da pessoa; o sinal é do ambiente, como o contrato é do caso).
  anx as (
    select m.aluno_id as aluno_id, true as tem_contrato
      from gps.membros m
      join gps.onboarding_anexos a on a.pessoa_aluno_id = m.pessoa_aluno_id
     where a.tipo = 'contrato_honorarios'
     group by m.aluno_id
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
         (count(*) over ())::integer,
         case coalesce(ob.estado, 0)
           when 2 then 'concluido'
           when 1 then 'em_andamento'
           else        'nao_iniciado'
         end,
         coalesce(cl.em_fechamento, 0),
         coalesce(cl.tem_contratado_com_valor, false) and coalesce(ax.tem_contrato, false)
    from amb a
    left join cli  cl on cl.aluno_id = a.aluno_id
    left join prog pr on pr.aluno_id = a.aluno_id
    left join onb  ob on ob.aluno_id = a.aluno_id
    left join anx  ax on ax.aluno_id = a.aluno_id
   -- Ambiente com o membro mais recente primeiro (ordem de hoje), com
   -- DESEMPATE por aluno_id: sem ele, paginar duplica e perde linha quando
   -- dois ambientes têm o mesmo max(criado_em). Ver ...120, item 3.
   order by a.ultimo_membro_em desc, a.aluno_id
   limit v_limite
  offset v_offset;
end;
$$;

comment on function gps.admin_painel_alunos(integer, integer) is
  'Uma linha por AMBIENTE do GPS com o resumo da Etapa 01 para o painel /admin, PAGINADA (...120) e com 3 colunas novas na v3 (...210): onboarding_status (nao_iniciado|em_andamento|concluido, do TITULAR -- agregar socio faria o chip dizer "concluido" por causa de outra pessoa), em_fechamento (o meio do funil, que faltava) e apto_ao_saldo (DERIVADO: cliente contratado com valor_honorarios E anexo contrato_honorarios de alguma pessoa do ambiente; nenhuma tela escreve valor em reais a partir disto -- B-S1). p_limite (default 200, preso em [1,1000]) e p_offset (default 0, nunca negativo); total_ambientes vem de count(*) over () calculado antes do limit. A busca e os filtros do painel continuam EM MEMORIA sobre o lote carregado (Leitura A). `agendados` sai da EVIDENCIA desde a ...061; honorarios_contratados e NULL quando nenhum contratado tem valor -- NUNCA coalesce para 0. ultimo_acesso vem de auth.users.last_sign_in_at, NUNCA de gps.acessos_log. SECURITY DEFINER: abre com gp_is_admin() ou 42501.';

revoke execute on function gps.admin_painel_alunos(integer, integer) from public, anon;
grant  execute on function gps.admin_painel_alunos(integer, integer) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- BLOCO DE CONFERÊNCIA (rodar DEPOIS de aplicar, no SQL Editor, como admin)
-- Não faz parte da migração — é o roteiro de aceite. Nada aqui escreve.
-- ─────────────────────────────────────────────────────────────────────────
--
-- 1) SOBRECARGA = 1 (o `drop` no topo é o que garante):
--    select count(*) as sobrecargas,
--           string_agg(pg_get_function_identity_arguments(p.oid), ' | ') as assinaturas
--      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'gps' and p.proname = 'admin_painel_alunos';
--    -- ESPERADO: sobrecargas = 1 · assinaturas = 'integer, integer'
--
-- 2) PERMISSÃO (o `drop` apagou as ACLs antigas):
--    select has_function_privilege('anon',          'gps.admin_painel_alunos(integer,integer)', 'execute') as anon,
--           has_function_privilege('authenticated', 'gps.admin_painel_alunos(integer,integer)', 'execute') as authenticated;
--    -- ESPERADO: anon = false · authenticated = true
--
-- 3) NENHUM NÚMERO ANTIGO MUDOU. Rode ANTES da migração, guarde, rode DEPOIS:
--    select aluno_id, qtd_membros, tem_login, desde, ultimo_acesso,
--           clientes_preenchidos, clientes_com_dados, clientes_com_perda,
--           agendados, tarefas_concluidas, honorarios_contratados,
--           contratados, contratados_sem_valor, total_ambientes
--      from gps.admin_painel_alunos(1000, 0) order by aluno_id;
--
-- 4) AS TRÊS COLUNAS NOVAS, no dia da aplicação (base sem onboarding ainda):
--    select onboarding_status, count(*) from gps.admin_painel_alunos(1000,0) group by 1;
--    -- ESPERADO: nao_iniciado = 158 (o total de ambientes), e nada mais.
--    select count(*) filter (where apto_ao_saldo) as aptos,
--           sum(em_fechamento)                    as em_fechamento
--      from gps.admin_painel_alunos(1000, 0);
--    -- ESPERADO: aptos = 0 · em_fechamento = 37 (contador independente:
--    --   select count(*) from gps.etapa1_clientes where fase='fechamento';)
--
-- 5) TOTAL bate com contador independente:
--    select count(*) as linhas, max(total_ambientes) as total from gps.admin_painel_alunos(1000, 0);
--    select count(distinct aluno_id) from gps.membros;   -- o MESMO número
