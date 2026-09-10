-- Fila de atendimento: aluno fantasma ressuscitava depois de perder o ambiente.
--
-- `gps.admin_painel_atendimento()` montava a lista de `gps.aluno_notas` ∪
-- `gps.chamados`, sem NENHUM join com `gps.membros`. Quem perde o ambiente
-- continua com nota e chamado no banco — e é certo que continue, é histórico —
-- então voltava a aparecer na fila: a equipe via um nome para atender que não
-- é aluno de ninguém.
--
-- Achado em 10/09/2026: `aluno_id = df20f2ce-c024-4c41-a7bd-b8eac1e469bd`,
-- 0 ambientes, 1 nota, 0 chamados abertos. A RPC devolvia 21 linhas; 20 tinham
-- membro, 1 era o fantasma.
--
-- O corte é `exists` em `gps.membros` DENTRO da CTE `base`, antes dos joins e
-- não depois: o órfão nem entra na montagem, em vez de entrar e ser filtrado
-- no fim.
--
-- ⚠️ Note o `from (...) b` com alias próprio no subselect. Reusar o nome de uma
-- CTE como alias externo faz o `exists` resolver contra a CTE, não contra a
-- linha corrente, e o filtro vira sempre-verdadeiro — passa calado.
--
-- Custo medido (explain analyze, 10/09/2026), não estimado:
--   Hash Semi Join → Index Only Scan using membros_aluno_id_idx on membros
--   rows=148, Heap Fetches=32, Buffers: shared hit=44
--   Execution Time: 0.730 ms
-- O planner USA o índice que já existe; nenhum índice novo foi criado. `base`
-- é a fila de um dia (dezenas de linhas), com o lado interno indexado — a
-- ordem de grandeza não muda com 10× mais aluno.
--
-- Reversão: reaplicar a definição anterior (esta função sem o bloco `where
-- exists`). Nenhum dado é escrito nem apagado — a mudança é só de leitura.
create or replace function gps.admin_painel_atendimento()
 returns table(aluno_id uuid, pendencias_abertas integer, ultima_nota_em timestamp with time zone, ultima_nota_tipo text, ultima_nota_resumo text, chamados_abertos integer)
 language plpgsql
 stable
 set search_path to ''
as $function$
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
    select n.aluno_id as aluno_id, count(*)::integer as abertas
      from gps.aluno_notas n
     where n.tipo = 'pendencia' and n.resolvido_em is null
     group by n.aluno_id
  ),
  cham as (
    select c.aluno_id as aluno_id, count(*)::integer as abertos
      from gps.chamados c
     where c.status <> 'fechado'
     group by c.aluno_id
  ),
  base as (
    select b.aluno_id
      from (
        select u.aluno_id from ult u
        union
        select ch.aluno_id from cham ch
      ) b
     -- 🔑 a trava: só continua na fila quem AINDA tem ambiente.
     where exists (
       select 1 from gps.membros m where m.aluno_id = b.aluno_id
     )
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
$function$;
