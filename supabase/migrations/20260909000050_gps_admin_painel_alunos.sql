-- Painel do admin (/admin) — uma consulta agregada no lugar de trazer a base
-- inteira para o Node.
--
-- ANTES (medido no levantamento de 08/09): getAlunosGps (src/lib/data.ts:134)
-- fazia 4 idas ao banco e trazia `select *` de gps.etapa1_clientes -- 879
-- linhas, width=307, ~270 KB, Seq Scan -- e de gps.progresso, só para contar
-- 4 números por ambiente em JavaScript. O custo por abertura do painel crescia
-- com o TOTAL de clientes do sistema, não com os 127 ambientes exibidos: com
-- 10x a base são ~8.800 linhas trafegadas por abertura.
--
-- DEPOIS: o mesmo cálculo vira count(*) filter (...) no banco; trafegam 127
-- linhas estreitas. O plano continua Seq Scan em etapa1_clientes -- e ESTÁ
-- CERTO: a consulta agrega TODOS os ambientes, então todas as linhas
-- qualificam e um índice em (aluno_id) seria ignorado. O ganho não é de
-- índice, é de NÃO SERIALIZAR as linhas: a agregação acontece onde o dado já
-- está. A leitura POR aluno já é servida por etapa1_clientes_aluno_idx
-- (aluno_id), que existe no banco (conferido em pg_indexes em 08/09).
--
-- ultimo_acesso vem de auth.users.last_sign_in_at -- a MESMA fonte de
-- gps.admin_status_acesso, que hoje é chamada uma vez por aluno em loop. NÃO
-- vem de gps.acessos_log: aquilo é log de AÇÃO ADMINISTRATIVA (a equipe
-- mexendo na conta), não de acesso do aluno; usá-lo mostraria a data errada
-- com o rótulo certo.
--
-- SECURITY DEFINER é obrigatório (lê auth.users, onde `authenticated` não tem
-- grant) e por isso abre com gp_is_admin() + 42501, tem search_path = '' e
-- só `authenticated` recebe execute.
--
-- O QUE ESTA MIGRAÇÃO NÃO FAZ: não muda nenhuma regra de negócio. `agendados`
-- continua sendo status in ('agendado','realizada') -- de propósito, para os
-- números do painel ficarem IDÊNTICOS antes e depois e a troca ser provável.
-- A mudança de `agendados` para evidência é da Fase 4 (migração ...061).
--
-- Reversão: `drop function gps.admin_painel_alunos();` e reverter o commit de
-- src/lib/data.ts -- nenhum dado é escrito, nada a restaurar.

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
           count(*) filter (
             where c.status in ('agendado', 'realizada')
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
  'Uma linha por AMBIENTE do GPS com o resumo da Etapa 01 para o painel /admin. Substitui as 4 consultas de getAlunosGps, que traziam as 879 linhas inteiras de gps.etapa1_clientes para contar 4 numeros no Node. Os filtros de contagem replicam calcularMetricasEtapa1 (src/lib/etapa1.ts) exatamente, inclusive tratar string vazia como ausente. ultimo_acesso vem de auth.users.last_sign_in_at (mesma fonte de gps.admin_status_acesso), NUNCA de gps.acessos_log, que e log de acao administrativa. SECURITY DEFINER: abre com gp_is_admin() ou 42501.';

revoke execute on function gps.admin_painel_alunos() from public, anon;
grant  execute on function gps.admin_painel_alunos() to authenticated;
