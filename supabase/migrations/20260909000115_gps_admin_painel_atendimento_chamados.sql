-- `gps.admin_painel_atendimento()` passa a devolver `chamados_abertos`.
--
-- MOTIVAÇÃO: o card de /admin já mostra pendência do Diário e a última nota; com
-- os chamados (Fase 6) a equipe precisa ver, na MESMA lista, quem está esperando
-- resposta. Sem isto, a fila de suporte só existiria em /admin/chamados e o card
-- do aluno mentiria por omissão ("nada pendente" com um chamado aberto há 3 dias).
--
-- ZERO CONSULTA NOVA NO PAINEL: a coluna entra na função que /admin já chama
-- (uma ida ao banco, como antes). A alternativa -- uma segunda leitura em
-- gps.chamados a partir do TS -- acrescentaria uma query por render da lista.
-- É a parcela de otimização desta migração: a Fase 6 não deixa o painel mais caro.
--
-- 🔴 `drop` + `create`, não `create or replace`: mudar o `returns table` de uma
-- função exige drop (o Postgres recusa "cannot change return type of existing
-- function"). Por isso esta migração é separada da ...110-...114 e vem por
-- último: entre o drop e o create, /admin fica sem o resumo de atendimento --
-- aplicar as duas instruções na MESMA transação (o MCP faz isso).
--
-- CORPO VIGENTE: parte da migração 20260909000080 (a única que define a função).
-- Conferir com `select pg_get_functiondef('gps.admin_painel_atendimento()'::regprocedure);`
-- antes de aplicar.
--
-- MUDANÇA DE SEMÂNTICA (a única): antes a função devolvia uma linha por
-- ambiente COM NOTA. Agora devolve uma linha por ambiente com nota OU com
-- chamado não-fechado — o ambiente que nunca teve nota mas tem chamado aberto
-- passa a aparecer, com `ultima_nota_em` nulo (a tela já sabe dizer "Sem nota no
-- Diário"). Sem isso, o único aluno que a equipe PRECISA ver seria justamente o
-- que ficaria fora da lista.
--
-- SECURITY INVOKER continua (não é definer): a RLS só-admin de gps.aluno_notas e
-- a de gps.chamados são a fonte de verdade; a guarda gp_is_admin() existe para a
-- falha ser BARULHENTA (42501) em vez de virar lista vazia.
--
-- ÍNDICES: nenhum novo. A contagem de chamados é
-- `where status <> 'fechado' group by aluno_id`, servida pelo índice PARCIAL
-- idx_chamados_fila (migração ...110), cujo predicado bate letra por letra.
--
-- O QUE ESTA MIGRAÇÃO NÃO FAZ: não escreve nenhuma linha, não cria índice, não
-- devolve texto de mensagem de chamado (só a CONTAGEM — o card é lista, e o
-- texto do suporte fica na thread), não toca gps.admin_painel_alunos().
--
-- REVERSÃO (literal): `drop function gps.admin_painel_atendimento();` seguido do
-- corpo da migração 20260909000080.

drop function if exists gps.admin_painel_atendimento();

create function gps.admin_painel_atendimento()
returns table (
  aluno_id           uuid,
  pendencias_abertas integer,
  ultima_nota_em     timestamptz,
  ultima_nota_tipo   text,
  ultima_nota_resumo text,
  chamados_abertos   integer
)
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.gp_is_admin() then
    raise exception 'apenas administradores' using errcode = '42501';
  end if;

  return query
  with ult as (
    select distinct on (n.aluno_id)
           n.aluno_id       as aluno_id,
           n.criado_em      as criado_em,
           n.tipo           as tipo,
           left(n.texto, 140) as resumo
      from gps.aluno_notas n
     order by n.aluno_id, n.criado_em desc
  ),
  pend as (
    -- Toda pendência é uma nota, então `pend` é sempre subconjunto de `ult`:
    -- left join basta, full join seria ruído.
    select n.aluno_id as aluno_id, count(*)::integer as abertas
      from gps.aluno_notas n
     where n.tipo = 'pendencia' and n.resolvido_em is null
     group by n.aluno_id
  ),
  cham as (
    -- 'aberto' E 'respondido' contam: os dois são chamado VIVO. O rótulo da
    -- tela diz de quem é a bola; o card só precisa saber que há conversa aberta.
    select c.aluno_id as aluno_id, count(*)::integer as abertos
      from gps.chamados c
     where c.status <> 'fechado'
     group by c.aluno_id
  ),
  base as (
    select u.aluno_id from ult u
    union
    select ch.aluno_id from cham ch
  )
  select b.aluno_id,
         coalesce(p.abertas, 0),
         u.criado_em,
         u.tipo,
         u.resumo,
         coalesce(ch.abertos, 0)
    from base b
    left join ult  u  on u.aluno_id  = b.aluno_id
    left join pend p  on p.aluno_id  = b.aluno_id
    left join cham ch on ch.aluno_id = b.aluno_id;
end;
$$;

comment on function gps.admin_painel_atendimento() is
  'Uma linha por ambiente COM NOTA OU COM CHAMADO VIVO: pendencias abertas, data/tipo/trecho da ultima nota e quantidade de chamados nao-fechados, para os cards de /admin. UMA ida ao banco -- a Fase 6 nao acrescentou consulta ao painel. SECURITY INVOKER: a RLS so-admin de gps.aluno_notas e a de gps.chamados continuam sendo a unica fonte de verdade; a guarda gp_is_admin() existe para a falha ser barulhenta em vez de virar lista vazia. Devolve no maximo 140 caracteres do texto da nota -- nota integral nao vai para tela de lista, e texto de chamado nao vai de jeito nenhum.';

revoke execute on function gps.admin_painel_atendimento() from public, anon;
grant  execute on function gps.admin_painel_atendimento() to authenticated;
