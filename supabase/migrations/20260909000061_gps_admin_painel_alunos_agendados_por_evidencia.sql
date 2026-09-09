-- Painel do admin: `agendados` passa a sair da EVIDÊNCIA, não de `status`.
--
-- POR QUE AGORA: a migração 20260909000060 congelou `gps.etapa1_clientes.status`
-- -- nenhum caminho de escrita da aplicação toca mais nessa coluna. O filtro
-- `status in ('agendado','realizada')` de `gps.admin_painel_alunos()` (corpo
-- vigente em 20260909000050) continuaria RODANDO e continuaria devolvendo
-- número: o valor de ontem, congelado para sempre. A métrica "Reuniões
-- agendadas N/15" pararia no tempo sem quebrar nada e sem avisar ninguém --
-- que é o pior modo de uma métrica morrer.
--
-- A evidência (`data_reuniao_preliminar is not null or aderiu_reuniao`) é o
-- MESMO critério que o backfill da ...060 usou para decidir quem entra em
-- `fechamento`, e o mesmo que `calcularMetricasEtapa1` (src/lib/etapa1.ts)
-- passa a usar na tela do aluno. Os três têm de casar: número de painel que
-- diverge do número da tela do próprio aluno é número que ninguém usa.
--
-- POR QUE NÃO CONTAR `fase = 'fechamento'`: `fase` é editável pelo aluno (o
-- quadro permite arrastar em qualquer direção, de propósito). Arrastar um card
-- para "Fechamento" viraria uma reunião agendada na meta do programa, sem
-- reunião nenhuma. `data_reuniao_preliminar`/`aderiu_reuniao` são fatos
-- registrados campo a campo; `fase` é uma leitura do aluno sobre esses fatos.
-- Meta se mede por fato.
--
-- ANTES / DEPOIS -- rodar ANTES de aplicar e colar o resultado aqui:
--   select count(*) filter (where status in ('agendado','realizada')) as regra_antiga,
--          count(*) filter (where data_reuniao_preliminar is not null
--                              or aderiu_reuniao)                     as regra_nova
--     from gps.etapa1_clientes;
--
--   MEDIDO EM 08/09 (levantamento do orquestrador, seções E e F do plano):
--     regra_antiga = 10   (soma de `agendados` conferida na validação da ...050)
--     regra_nova   = 36   (22 'pendente' + 5 'contatado' + 4 'agendado'
--                          + 5 'realizada' com data e/ou adesão)
--   A diferença NÃO é regressão: são 26 clientes com reunião registrada que a
--   regra antiga não contava porque o aluno nunca voltou para mexer no campo
--   `status`. O painel estava subnotificando a própria meta do programa.
--
-- O QUE ESTA MIGRAÇÃO NÃO FAZ:
--   * não muda nenhuma outra contagem da função (preenchidos, com_dados,
--     com_perda, membros, ultimo_acesso, tarefas) -- o único `count(*) filter`
--     alterado é `agendados`. Todo o resto é o corpo da ...050, letra por letra;
--   * não muda a assinatura nem o retorno -- `create or replace` puro.
--     `create or replace` preserva as ACLs da função existente, mas o
--     revoke/grant é repetido no fim mesmo assim: é idempotente, e a regra do
--     projeto (SECURITY DEFINER = revoke de public/anon ANTES do grant a
--     authenticated) não pode depender de a ...050 ter sido aplicada antes;
--   * não cria índice: a função agrega TODOS os ambientes, então todas as
--     linhas qualificam e um índice seria ignorado (raciocínio completo no
--     cabeçalho da ...050).
--
-- Reversão: reaplicar o `create or replace function` do arquivo
-- supabase/migrations/20260909000050_gps_admin_painel_alunos.sql, que está
-- versionado íntegro. Nenhum dado é escrito, nada a restaurar.

create or replace function gps.admin_painel_alunos()
returns table (
  aluno_id             uuid,
  qtd_membros          integer,
  tem_login            boolean,
  desde                timestamptz,
  ultimo_acesso        timestamptz,
  clientes_preenchidos integer,
  clientes_com_dados   integer,
  clientes_com_perda   integer,
  agendados            integer,
  tarefas_concluidas   integer[]
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
           )::integer                                                     as agendados
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
         coalesce(pr.tarefas, '{}'::integer[])
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
  'Uma linha por AMBIENTE do GPS com o resumo da Etapa 01 para o painel /admin. Substitui as 4 consultas de getAlunosGps, que traziam as 879 linhas inteiras de gps.etapa1_clientes para contar 4 numeros no Node. Os filtros de contagem replicam calcularMetricasEtapa1 (src/lib/etapa1.ts) exatamente, inclusive tratar string vazia como ausente. `agendados` sai da EVIDENCIA (data_reuniao_preliminar/aderiu_reuniao) desde a migracao ...061, e nao mais de status in (agendado,realizada): status congelou na ...060 e devolveria o numero de ontem para sempre. NAO conta fase = fechamento, que o aluno edita arrastando card -- meta se mede por fato, nao por leitura. ultimo_acesso vem de auth.users.last_sign_in_at (mesma fonte de gps.admin_status_acesso), NUNCA de gps.acessos_log, que e log de acao administrativa. SECURITY DEFINER: abre com gp_is_admin() ou 42501.';

revoke execute on function gps.admin_painel_alunos() from public, anon;
grant  execute on function gps.admin_painel_alunos() to authenticated;
