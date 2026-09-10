-- Os 30 clientes são a ÚNICA porta de saída da fase Inicial.
--
-- Decisão do Marcio (10/09/2026): *"para sair da fase inicial para a
-- próxima, ele tenha que obrigatoriamente registrar os 30 clientes, essa é a
-- única condição"* e *"temos pessoas que nem registraram os 30, mas só por
-- ter alguém em reunião agendada ele vai pra próxima fase, não podemos
-- permitir isso"*.
--
-- ═══════════════════════════════════════════════════════════════════════
-- 🔴 O DEFEITO: um `or` que deixava pular a etapa
-- ═══════════════════════════════════════════════════════════════════════
--
-- A regra vigente era:
--
--   when com_dados >= 30 OR agendados > 0 then 'captacao'
--
-- Ou seja: **um único cliente com reunião agendada** tirava a pessoa da
-- fase Inicial, mesmo com a lista dos 30 pela metade. E "agendado" não é
-- sequer uma tarefa marcada — é evidência derivada
-- (`data_reuniao_preliminar is not null or aderiu_reuniao`), que aparece
-- assim que o aluno preenche uma data na ficha de um cliente.
--
-- MEDIDO em 10/09/2026, antes de corrigir:
--
--   Captação: 19 ambientes
--     · com os 30 de verdade ..........  5
--     · 🔴 SEM os 30, subiram por 1 agendado .. 14
--
--   **14 de 19 estavam na fase errada** — 74% da Captação.
--
-- ═══════════════════════════════════════════════════════════════════════
-- 🔑 A REGRA NOVA: os 30 vêm ANTES de tudo
-- ═══════════════════════════════════════════════════════════════════════
--
-- A trava é a SEGUNDA linha do `case`, logo depois de "finalizado":
--
--   when clientes_com_dados < 30 then 'inicial'
--
-- Posição importa. Colocada depois de `execucao`/`captacao`, ela seria letra
-- morta — o `case` para na primeira condição verdadeira. Aqui ela é
-- soberana: **sem os 30, nenhuma outra evidência move a pessoa de fase.**
--
-- "Os 30" = `clientes_com_dados`, que é a mesma contagem que a tarefa 1.1
-- cobra: nome + telefone + nível de relacionamento preenchidos
-- (`META_CLIENTES` em `src/lib/etapa1.ts`). Não é "30 linhas criadas" —
-- 30 fichas completas. A trava da fase e a trava da tarefa passam a falar
-- do MESMO número, que é o que faz a tela ser coerente com o card.
--
-- ⚠️ `finalizado` fica ACIMA da trava, de propósito: quem já somou
--    R$ 150 mil em honorários contratados evidentemente passou da fase
--    inicial, e rebaixá-lo por causa de uma lista incompleta seria absurdo.
--    Medido: 0 ambientes nessa situação hoje, então a exceção não muda nada
--    na prática — está ali para não criar um caso constrangedor no futuro.
--
-- EFEITO MEDIDO (simulado com o dado real antes de aplicar):
--
--   captacao -> inicial ...... 14   (voltam para a fase certa)
--   captacao -> captacao .....  5   (cumpriram os 30)
--   inicial  -> inicial ...... 118  (intactos)
--   Nenhum outro movimento. Ninguém em execucao/orientacao/finalizado hoje.
--
-- 🔑 NADA É APAGADO. A fase é DERIVADA na leitura, não uma coluna gravada:
-- os 14 que voltam para a Inicial mantêm clientes, agendamentos e progresso
-- exatamente como estão. No instante em que completarem os 30, sobem de
-- novo sozinhos — desta vez tendo feito o trabalho que a fase cobra.
--
-- REVERSÃO
--   Reaplicar a `20260910000234` (o corpo anterior está lá, íntegro).

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
           -- Quem ja bateu a meta evidentemente passou da fase inicial.
           when coalesce(cl.honorarios_contratados, 0) >= 150000 then 'finalizado'
           -- 🔴 A TRAVA. Sem os 30 fichas completas, nenhuma outra evidencia
           -- (reuniao agendada, contrato, honorarios) move a pessoa de fase.
           -- Precisa vir ANTES de captacao/execucao/orientacao: o `case` para
           -- na primeira condicao verdadeira, entao aqui embaixo seria letra
           -- morta. Decisao do Marcio, 10/09/2026.
           when coalesce(cl.com_dados, 0) < 30 then 'inicial'
           when en.aluno_id is not null then 'orientacao'
           when coalesce(cl.contratados, 0) > 0 and coalesce(cl.com_honorarios, 0) > 0 then 'execucao'
           else 'captacao'
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
  'Painel /admin: uma linha por ambiente, ja agregada. A fase INICIAL so se deixa com 30 fichas completas (nome+telefone+nivel) - decisao do Marcio 10/09/2026; antes um unico cliente com reuniao agendada bastava, e 14 de 19 ambientes da Captacao estavam ali sem ter os 30. Fase e DERIVADA na leitura: ninguem perde dado ao voltar.';
