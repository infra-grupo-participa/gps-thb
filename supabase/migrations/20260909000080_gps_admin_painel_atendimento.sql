-- Painel do admin (/admin) — o que a equipe precisa saber sobre cada aluno ANTES
-- de abrir o ambiente: pendência aberta, quando foi a última nota e um trecho dela.
--
-- MOTIVAÇÃO: o Diário existe desde 08/09 e o Marcio pediu a feature de novo (B2) —
-- ele não sabe que existe. O defeito é de DESCOBERTA, não de modelo. A tabela
-- gps.aluno_notas continua EXCLUSIVA DO ADMIN (migração 20260908000001, LGPD);
-- esta função não muda nada disso, ela só leva o resumo para a lista.
--
-- SUBSTITUI getPendenciasPorAluno (src/lib/data.ts), que lia todas as pendências
-- abertas da base e agregava num laço em JavaScript. Aqui a agregação acontece
-- onde o dado está e o painel continua com o MESMO número de idas ao banco
-- (4 consultas no Promise.all de src/app/admin/page.tsx, antes e depois).
--
-- NOME: `atendimento`, não `diario`. A Fase 6 (chamados) acrescenta uma coluna
-- nesta mesma função — batizar de `diario` obrigaria a renomear depois.
--
-- SECURITY INVOKER de propósito (NÃO é definer): a RLS de gps.aluno_notas já é a
-- fonte de verdade (só gp_is_admin() faz select). Um DEFINER teria de reimplementar
-- essa regra e viraria um segundo lugar para esquecer de mantê-la. A guarda
-- explícita com 42501 existe para a falha ser BARULHENTA — sem ela, um não-admin
-- receberia lista vazia, idêntica a "nenhuma nota no sistema".
--
-- `left(n.texto, 140)`: o texto integral da nota NUNCA sai do banco para uma tela
-- de LISTA. O público é o mesmo (admin), o volume não precisa ser — a maior nota
-- real tem 5.100 caracteres e são 125 ambientes.
--
-- ÍNDICES: nenhum novo. `distinct on (aluno_id) ... order by aluno_id, criado_em desc`
-- é servido por idx_aluno_notas_timeline (aluno_id, criado_em desc) e a contagem de
-- pendência por idx_aluno_notas_pendencia_aberta — os dois já existem (migração
-- 20260908000001) e os predicados batem letra por letra:
--   timeline          -> gps.aluno_notas (aluno_id, criado_em desc)
--   pendencia_aberta  -> gps.aluno_notas (aluno_id) where tipo='pendencia'
--                        and resolvido_em is null
--
-- O QUE ESTA MIGRAÇÃO NÃO FAZ:
--   * não cria tabela, coluna nem índice, e NÃO ESCREVE NENHUMA LINHA (0 linhas
--     mudam de valor);
--   * não cria policy nenhuma para o aluno em gps.aluno_notas (C3 continua valendo);
--   * não devolve `texto` integral, `autor_id` nem `evento_id`;
--   * não toca gps.admin_painel_alunos() — são duas funções com donos diferentes
--     (números da Etapa 01 x atendimento), e fundir as duas faria toda mudança de
--     uma exigir revalidar a outra.
--
-- REVERSÃO (literal): `drop function gps.admin_painel_atendimento();` e reverter o
-- commit de src/lib/data.ts (que restaura getPendenciasPorAluno). Nenhum dado é
-- escrito, então a reversão não precisa de backfill nem de restore.

create or replace function gps.admin_painel_atendimento()
returns table (
  aluno_id           uuid,
  pendencias_abertas integer,
  ultima_nota_em     timestamptz,
  ultima_nota_tipo   text,
  ultima_nota_resumo text
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
  )
  select u.aluno_id,
         coalesce(p.abertas, 0),
         u.criado_em,
         u.tipo,
         u.resumo
    from ult u
    left join pend p on p.aluno_id = u.aluno_id;
end;
$$;

comment on function gps.admin_painel_atendimento() is
  'Uma linha por aluno COM NOTA: pendencias abertas + data/tipo/trecho da ultima nota, para os cards de /admin. Substitui getPendenciasPorAluno (agregacao em JavaScript sobre a base inteira). SECURITY INVOKER: a RLS so-admin de gps.aluno_notas continua sendo a unica fonte de verdade; a guarda gp_is_admin() existe para a falha ser barulhenta em vez de virar lista vazia. Devolve no maximo 140 caracteres do texto -- nota integral nao vai para tela de lista.';

revoke execute on function gps.admin_painel_atendimento() from public, anon;
grant  execute on function gps.admin_painel_atendimento() to authenticated;
