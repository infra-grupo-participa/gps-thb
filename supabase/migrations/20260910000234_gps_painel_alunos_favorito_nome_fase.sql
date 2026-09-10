-- War-room 10/09 — o favorito aparece na lista de alunos.
--
-- Pedido do Marcio: *"o favorito como subnome na lista de alunos, com o
-- status do cliente"*. Hoje o card diz quantos clientes o aluno tem, mas
-- não QUEM é o cliente que a equipe acompanha — justo o único que importa
-- na hora da reunião.
--
-- ═══════════════════════════════════════════════════════════════════════
-- 🔴 POR QUE `drop function` ANTES
-- ═══════════════════════════════════════════════════════════════════════
--
-- `create or replace` recusa mudança no tipo de retorno
-- (`cannot change return type of existing function`) — e acrescentar
-- coluna a um `returns table` É mudar o tipo. A primeira versão desta
-- migration não tinha o `drop` e falhou no banco.
--
-- ⚠️ ESTE CORPO FOI EXTRAÍDO DO BANCO EM 10/09, não copiado da `…210`.
--    A `…210` não tem `classe` nem a regra de Execução corrigida hoje
--    (que passou a exigir contratado **E** honorários, não só honorários).
--    Reescrever a partir dela reverteria os 5 cards de fase em silêncio,
--    sem erro nenhum.
--
--    🔑 REGRA: migration que RECRIA função grande parte do corpo VIGENTE
--    (`pg_get_functiondef`), nunca da última migration que a tocou.
--
-- ═══════════════════════════════════════════════════════════════════════
-- 🔑 ZERO CONSULTA NOVA
-- ═══════════════════════════════════════════════════════════════════════
--
-- As 3 colunas saem de um `filter` dentro da CTE `cli`, que JÁ varre
-- `gps.etapa1_clientes` agrupando por aluno. `acompanhado_equipe` é único
-- por aluno (índice parcial), então `max(...) filter` devolve o favorito,
-- não uma escolha arbitrária entre vários.
--
-- MEDIDO (`explain (analyze, buffers)`, `p_limite := 200`, 137 ambientes):
--   ANTES:  10,40 ms · 1.910 buffers
--   DEPOIS: 11,55 ms · 1.942 buffers   (+11% de tempo, +32 buffers)
--
--   Os 32 buffers a mais são o custo de ler `nome` e
--   `acompanhamento_confirmado_em` na varredura que já acontecia. A
--   alternativa (uma segunda consulta pelos favoritos) custaria uma ida ao
--   banco por abertura do painel — e o painel abre o tempo todo.
--
-- CONFERÊNCIA DE NÃO-REGRESSÃO (a classe não pode ter mudado):
--   ANTES:  captacao 19 · inicial 118
--   DEPOIS: captacao 19 · inicial 118   ✅  (23 com favorito, 0 confirmados)
--
-- REVERSÃO
--   Reaplicar este mesmo corpo sem as 3 colunas do favorito. A remoção
--   exige o deploy do TS junto (`AlunoGps` declara os 3 campos).

drop function if exists gps.admin_painel_alunos(integer, integer);

create function gps.admin_painel_alunos(p_limite integer default 200, p_offset integer default 0)
returns table(
  aluno_id uuid, qtd_membros integer, tem_login boolean, desde timestamptz,
  ultimo_acesso timestamptz, clientes_preenchidos integer, clientes_com_dados integer,
  clientes_com_perda integer, agendados integer, tarefas_concluidas integer[],
  honorarios_contratados numeric, contratados integer, contratados_sem_valor integer,
  total_ambientes integer, onboarding_status text, em_fechamento integer,
  apto_ao_saldo boolean, classe text,
  favorito_nome text, favorito_fase text, favorito_confirmado boolean
)
language plpgsql stable security definer set search_path to ''
as $function$
declare v_limite integer := least(greatest(coalesce(p_limite, 200), 1), 1000); v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not public.gp_is_admin() then raise exception 'apenas administradores' using errcode = '42501'; end if;
  return query
  with amb as (
    select m.aluno_id as aluno_id, count(*)::integer as qtd_membros, bool_or(m.user_id is not null) as tem_login,
           min(m.criado_em) as desde, max(m.criado_em) as ultimo_membro_em, max(u.last_sign_in_at) as ultimo_acesso
      from gps.membros m left join auth.users u on u.id = m.user_id group by m.aluno_id
  ),
  cli as (
    select c.aluno_id as aluno_id,
           count(*) filter (where coalesce(btrim(c.nome), '') <> '')::integer as preenchidos,
           count(*) filter (where coalesce(btrim(c.nome), '') <> '' and coalesce(btrim(c.telefone), '') <> '' and c.nivel_relacionamento is not null)::integer as com_dados,
           count(*) filter (where c.perda_inercia is not null)::integer as com_perda,
           count(*) filter (where c.data_reuniao_preliminar is not null or c.aderiu_reuniao)::integer as agendados,
           sum(c.valor_honorarios) filter (where c.fase = 'contratado') as honorarios_contratados,
           count(*) filter (where c.fase = 'contratado')::integer as contratados,
           count(*) filter (where c.fase = 'contratado' and c.valor_honorarios is null)::integer as contratados_sem_valor,
           count(*) filter (where c.fase = 'fechamento')::integer as em_fechamento,
           bool_or(c.fase = 'contratado' and c.valor_honorarios is not null) as tem_contratado_com_valor,
           count(*) filter (where c.valor_honorarios is not null)::integer as com_honorarios,
           -- O favorito. `acompanhado_equipe` e unico por aluno (indice
           -- parcial), entao o max() devolve o favorito, nao uma escolha
           -- arbitraria entre varios.
           max(c.nome) filter (where c.acompanhado_equipe) as fav_nome,
           max(c.fase) filter (where c.acompanhado_equipe) as fav_fase,
           bool_or(c.acompanhado_equipe and c.acompanhamento_confirmado_em is not null) as fav_confirmado
      from gps.etapa1_clientes c group by c.aluno_id
  ),
  prog as (select p.aluno_id as aluno_id, array_agg(p.tarefa order by p.tarefa)::integer[] as tarefas from gps.progresso p where p.etapa = 1 and p.concluida group by p.aluno_id),
  entregues as (select p.aluno_id as aluno_id from gps.progresso p where p.etapa = 6 and p.concluida group by p.aluno_id),
  onb as (
    select m.aluno_id as aluno_id, max(case when r.pessoa_aluno_id is null then 0 when r.concluido_em is not null then 2 else 1 end) as estado
      from gps.membros m left join gps.onboarding_respostas r on r.pessoa_aluno_id = m.pessoa_aluno_id
     where m.papel = 'titular' group by m.aluno_id
  ),
  anx as (
    select m.aluno_id as aluno_id, true as tem_contrato from gps.membros m join gps.onboarding_anexos a on a.pessoa_aluno_id = m.pessoa_aluno_id
     where a.tipo = 'contrato_honorarios' group by m.aluno_id
  )
  select a.aluno_id, a.qtd_membros, a.tem_login, a.desde, a.ultimo_acesso,
         coalesce(cl.preenchidos, 0), coalesce(cl.com_dados, 0), coalesce(cl.com_perda, 0), coalesce(cl.agendados, 0),
         coalesce(pr.tarefas, '{}'::integer[]), cl.honorarios_contratados, coalesce(cl.contratados, 0), coalesce(cl.contratados_sem_valor, 0),
         (count(*) over ())::integer,
         case coalesce(ob.estado, 0) when 2 then 'concluido' when 1 then 'em_andamento' else 'nao_iniciado' end,
         coalesce(cl.em_fechamento, 0),
         coalesce(cl.tem_contratado_com_valor, false) and coalesce(ax.tem_contrato, false),
         case
           when coalesce(cl.honorarios_contratados, 0) >= 150000 then 'finalizado'
           when en.aluno_id is not null then 'orientacao'
           when coalesce(cl.contratados, 0) > 0 and coalesce(cl.com_honorarios, 0) > 0 then 'execucao'
           when coalesce(cl.com_dados, 0) >= 30 or coalesce(cl.agendados, 0) > 0 then 'captacao'
           else 'inicial'
         end,
         cl.fav_nome, cl.fav_fase, coalesce(cl.fav_confirmado, false)
    from amb a
    left join cli cl on cl.aluno_id = a.aluno_id
    left join prog pr on pr.aluno_id = a.aluno_id
    left join onb ob on ob.aluno_id = a.aluno_id
    left join anx ax on ax.aluno_id = a.aluno_id
    left join entregues en on en.aluno_id = a.aluno_id
   order by a.ultimo_membro_em desc, a.aluno_id
   limit v_limite offset v_offset;
end;
$function$;

revoke execute on function gps.admin_painel_alunos(integer, integer) from public, anon;
grant execute on function gps.admin_painel_alunos(integer, integer) to authenticated;

comment on function gps.admin_painel_alunos(integer, integer) is
  'Painel /admin: uma linha por ambiente, ja agregada. Inclui o cliente favorito (nome, fase, se a equipe confirmou) sem consulta extra - sai da mesma varredura de etapa1_clientes. Corpo extraido do banco em 10/09/2026: preserva classe e a regra de Execucao (contratado E honorarios).';
