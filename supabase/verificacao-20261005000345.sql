-- Provas da …345 (trajetória + funil). Rodar DEPOIS de aplicar a migração.
-- Tudo em transação desfeita: nenhuma linha fica.

-- V0 — objetos e grants (só leitura)
select 'catalogo' k, count(*)::text v from gps.cliente_etapa_tipos
union all select 'proacl_marcar',    proacl::text from pg_proc where oid = 'gps.cliente_trajetoria_marcar(uuid,text)'::regprocedure
union all select 'proacl_desmarcar', proacl::text from pg_proc where oid = 'gps.cliente_trajetoria_desmarcar(uuid,text)'::regprocedure
union all select 'proacl_trigger_fn', proacl::text from pg_proc where oid = 'gps.aluno_eventos_capturar_funil_origem()'::regprocedure
union all select 'grants_trajetoria', string_agg(grantee || ':' || privilege_type, ',' order by grantee, privilege_type)
  from information_schema.role_table_grants where table_schema = 'gps' and table_name = 'cliente_trajetoria'
union all select 'grants_tipos', string_agg(grantee || ':' || privilege_type, ',' order by grantee, privilege_type)
  from information_schema.role_table_grants where table_schema = 'gps' and table_name = 'cliente_etapa_tipos'
union all select 'chk_funil', pg_get_constraintdef(oid) from pg_constraint
  where conrelid = 'gps.etapa1_clientes'::regclass and conname = 'chk_etapa1_clientes_funil_origem'
union all select 'indexdef', indexdef from pg_indexes where schemaname = 'gps' and tablename = 'cliente_trajetoria';
-- esperado: catalogo 11; proacl sem '=X/' (PUBLIC) e sem 'anon='; grants só authenticated:SELECT (+ postgres/service_role)

-- V1..V4 — chamada real com JWT, transação desfeita
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

create temp table _p on commit drop as
select c.id as cliente_id, c.aluno_id, m.user_id as dono,
       (select m2.user_id from gps.membros m2
         where m2.user_id is not null and m2.aluno_id <> c.aluno_id
         limit 1) as outro
  from gps.etapa1_clientes c
  join gps.membros m on m.aluno_id = c.aluno_id and m.user_id is not null and m.papel = 'titular'
 limit 1;
grant select on _p to authenticated, anon;

select count(*) as eventos_antes from gps.aluno_eventos where aluno_id = (select aluno_id from _p);

-- V1 dono marca (mudou=true), repete (no-op mudou=false), marca subetapa, desmarca
select set_config('request.jwt.claims',
       json_build_object('sub', dono, 'role', 'authenticated')::text, true) from _p;
set local role authenticated;
select public.gp_is_admin() as dono_e_admin;  -- tem de ser false/null, senão escolher outro
select gps.cliente_trajetoria_marcar((select cliente_id from _p), 'croqui_estrutural') as v1a;
select gps.cliente_trajetoria_marcar((select cliente_id from _p), 'croqui_estrutural') as v1b_noop;
select gps.cliente_trajetoria_marcar((select cliente_id from _p), 'processamento_itbi') as v1c_sub;
select gps.cliente_trajetoria_desmarcar((select cliente_id from _p), 'processamento_itbi') as v1d;
select gps.cliente_trajetoria_desmarcar((select cliente_id from _p), 'processamento_itbi') as v1e_noop;

-- V2 leitura da ficha (mesma forma do embed do PostgREST), com RLS
explain (analyze, buffers)
select t.codigo, t.nome, t.pai_codigo, t.ordem, t.ativo,
       coalesce((select json_agg(json_build_object('etapa_codigo', tr.etapa_codigo, 'marcado_em', tr.marcado_em))
                   from gps.cliente_trajetoria tr
                  where tr.etapa_codigo = t.codigo
                    and tr.cliente_id = (select cliente_id from _p)
                    and tr.desmarcado_em is null), '[]'::json) as cliente_trajetoria
  from gps.cliente_etapa_tipos t
 order by t.ordem;

-- V3 outro parceiro: 42501
reset role;
select set_config('request.jwt.claims',
       json_build_object('sub', outro, 'role', 'authenticated')::text, true) from _p;
set local role authenticated;
do $$
begin
  perform gps.cliente_trajetoria_marcar((select cliente_id from _p), 'prospeccao');
  raise exception 'FALHOU: outro parceiro marcou';
exception when sqlstate '42501' then
  raise notice 'V3 ok: outro parceiro recebeu 42501 (%)', sqlerrm;
end $$;
select count(*) as v3_outro_le_marcacoes from gps.cliente_trajetoria where cliente_id = (select cliente_id from _p); -- 0 pela RLS

-- V4 anon: sem execute
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
begin
  perform gps.cliente_trajetoria_marcar((select cliente_id from _p), 'prospeccao');
  raise exception 'FALHOU: anon executou';
exception when insufficient_privilege then
  raise notice 'V4 ok: anon sem execute (%)', sqlerrm;
end $$;

-- V5 funil_origem: CHECK + evento pela trigger própria
reset role;
select set_config('request.jwt.claims',
       json_build_object('sub', dono, 'role', 'authenticated')::text, true) from _p;
set local role authenticated;
update gps.etapa1_clientes set funil_origem = 'sessao_viabilidade' where id = (select cliente_id from _p);
do $$
begin
  update gps.etapa1_clientes set funil_origem = 'outro' where id = (select cliente_id from _p);
  raise exception 'FALHOU: CHECK aceitou';
exception when check_violation then
  raise notice 'V5 ok: CHECK recusou (%)', sqlerrm;
end $$;
reset role;

select tipo, detalhe from gps.aluno_eventos
 where aluno_id = (select aluno_id from _p) and ocorrido_em >= now() - interval '1 minute'
   and tipo in ('cliente_etapa_marcada','cliente_etapa_desmarcada','cliente_funil_origem_definido')
 order by ocorrido_em;
-- esperado: marcada croqui, marcada itbi, desmarcada itbi, funil {de:null, para:sessao_viabilidade} (4 linhas; no-op não grava)

rollback;
