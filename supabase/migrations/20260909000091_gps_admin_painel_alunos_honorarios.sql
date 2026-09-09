-- Painel do admin passa a devolver a COMPROVAÇÃO DE FATURAMENTO do ambiente:
-- soma dos honorários contratados, quantos contratados existem e quantos
-- desses ainda estão sem valor registrado.
--
-- CORPO DE PARTIDA: `gps.admin_painel_alunos()` da migração
-- 20260909000061_gps_admin_painel_alunos_agendados_por_evidencia.sql, que o
-- orquestrador conferiu no banco real (09/09) ser o corpo VIGENTE --
-- `select pg_get_functiondef('gps.admin_painel_alunos()'::regprocedure);`
-- bate com o arquivo. O repo tem também a ...050; partir dela apagaria o
-- `agendados` por evidência em silêncio.
--
-- 🔴 POR QUE `drop` + `create` E NÃO `create or replace`:
-- `create or replace function` NÃO consegue mudar a lista de colunas do
-- `returns table` -- o Postgres recusa com 42P13 ("cannot change return type
-- of existing function"). Três colunas novas exigem recriar. Não há sobrecarga
-- possível (a função não tem argumentos), então o `drop` é inequívoco e não
-- deixa duas versões coexistindo -- a armadilha da sobrecarga ambígua, em que
-- a nova assinatura NÃO substitui a velha e a chamada passa a falhar em
-- runtime.
-- ⚠️ ESTE ARQUIVO TEM DE SER APLICADO COMO UMA TRANSAÇÃO ÚNICA (é o que
-- `supabase db push` / `apply_migration` fazem por padrão). A janela em que a
-- função não existe é a da transação; fora dela, uma leitura do painel entre
-- o drop e o create devolveria "função não encontrada" para o admin.
-- ⚠️ `drop function` descarta as ACLs. O `revoke`/`grant` do fim do arquivo
-- não é decorativo: sem ele a função nasce executável por `public` (o default
-- do Postgres) sendo SECURITY DEFINER e lendo auth.users. Ele reproduz
-- literalmente o par da ...050/...061.
-- ⚠️ `drop function` SEM `if exists`, de propósito: se a função com esta
-- assinatura não estiver lá, a premissa deste arquivo (o corpo vigente é o da
-- ...061) está errada e a migração tem de abortar em vez de criar uma segunda
-- versão ao lado da que existe.
--
-- O QUE MUDA NO RETORNO (3 colunas ACRESCENTADAS no fim, nada removido nem
-- renomeado, nada reordenado):
--   honorarios_contratados numeric  -- soma de valor_honorarios dos clientes
--                                      em fase='contratado'. NULL quando
--                                      nenhum contratado tem valor (sum()
--                                      ignora NULL e devolve NULL sobre
--                                      conjunto vazio). NÃO recebe coalesce:
--                                      é exatamente o que permite à UI
--                                      distinguir "nenhum valor registrado"
--                                      de "R$ 0,00" -- campo novo nasce
--                                      vazio, e um coalesce aqui viraria
--                                      "faturamento zero" plausível e errado.
--   contratados            integer  -- quantos clientes em fase='contratado'.
--   contratados_sem_valor  integer  -- desses, quantos com valor_honorarios
--                                      NULL. É o que a tela usa para dizer
--                                      "3 de 7 contratados ainda sem valor"
--                                      em vez de exibir meta subnotificada
--                                      como se fosse desempenho.
-- As duas CONTAGENS levam coalesce(...,0) no select final (ambiente sem
-- nenhum cliente não tem linha em `cli`); a SOMA não leva, de propósito.
--
-- O QUE ESTA MIGRAÇÃO NÃO FAZ:
--   * não muda NENHUM número existente: qtd_membros, tem_login, desde,
--     ultimo_acesso, clientes_preenchidos, clientes_com_dados,
--     clientes_com_perda, agendados, tarefas_concluidas e o `order by
--     a.ultimo_membro_em desc` ficam letra por letra iguais aos da ...061.
--     A conferência é rodar a função ANTES e DEPOIS e comparar as 10 colunas
--     antigas (bloco de conferência do plano, item 5);
--   * não acrescenta consulta nem varredura: os três agregados entram na CTE
--     `cli`, que já varria gps.etapa1_clientes inteira. Mesmo plano, mesmo
--     custo -- 3 `filter` a mais sobre linhas já lidas;
--   * não cria índice. A função agrega TODOS os ambientes: todas as linhas
--     qualificam, o planner ignoraria o índice e sobraria só o custo de
--     escrita (raciocínio completo no cabeçalho da ...050);
--   * não escreve em nenhuma linha de dado.
--
-- REVERSÃO (literal, nesta ordem, em UMA transação):
--   drop function gps.admin_painel_alunos();
--   -- e reaplicar o arquivo íntegro
--   -- supabase/migrations/20260909000061_gps_admin_painel_alunos_agendados_por_evidencia.sql
--   -- (que é `create or replace` e voltará a existir com as 10 colunas),
--   -- incluindo o revoke/grant que aquele arquivo já traz no fim.
--   ⚠️ Reverter exige que src/lib/data.ts volte a NÃO ler as 3 colunas novas
--   (getAlunosGps as lê como `honorarios_contratados` / `contratados` /
--   `contratados_sem_valor`); em JS, coluna ausente vira `undefined`, não
--   erro -- a tela mostraria "—" para sempre sem ninguém notar.

drop function gps.admin_painel_alunos();

create function gps.admin_painel_alunos()
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
  contratados_sem_valor  integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
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
         -- sem coalesce, de propósito (ver cabeçalho): NULL = não informado.
         cl.honorarios_contratados,
         coalesce(cl.contratados, 0),
         coalesce(cl.contratados_sem_valor, 0)
    from amb a
    left join cli  cl on cl.aluno_id = a.aluno_id
    left join prog pr on pr.aluno_id = a.aluno_id
   -- Mesma ordem de hoje: getAlunosGps lê gps.membros por criado_em desc e
   -- agrupa na ordem de primeira aparição -- ou seja, ambiente com o membro
   -- mais recente primeiro. Sem este order by, a lista do painel muda de
   -- ordem sem ninguém ter pedido.
   order by a.ultimo_membro_em desc;
end;
$$;

comment on function gps.admin_painel_alunos() is
  'Uma linha por AMBIENTE do GPS com o resumo da Etapa 01 para o painel /admin. Substitui as 4 consultas de getAlunosGps, que traziam as 879 linhas inteiras de gps.etapa1_clientes para contar 4 numeros no Node. Os filtros de contagem replicam calcularMetricasEtapa1 (src/lib/etapa1.ts) exatamente, inclusive tratar string vazia como ausente. `agendados` sai da EVIDENCIA (data_reuniao_preliminar/aderiu_reuniao) desde a migracao ...061, e nao mais de status in (agendado,realizada): status congelou na ...060 e devolveria o numero de ontem para sempre. NAO conta fase = fechamento, que o aluno edita arrastando card -- meta se mede por fato, nao por leitura. Desde a migracao ...091 devolve tambem honorarios_contratados (soma de valor_honorarios dos clientes em fase=contratado; NULL quando nenhum contratado tem valor -- NUNCA coalesce para 0, que transformaria buraco em resultado), contratados e contratados_sem_valor; a regra "so contratado conta na meta de R$ 150.000" vive aqui e em resumoHonorarios (src/lib/etapa1.ts), nao em constraint. ultimo_acesso vem de auth.users.last_sign_in_at (mesma fonte de gps.admin_status_acesso), NUNCA de gps.acessos_log, que e log de acao administrativa. SECURITY DEFINER: abre com gp_is_admin() ou 42501.';

revoke execute on function gps.admin_painel_alunos() from public, anon;
grant  execute on function gps.admin_painel_alunos() to authenticated;
