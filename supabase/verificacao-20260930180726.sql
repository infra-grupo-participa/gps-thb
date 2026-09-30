-- ═══════════════════════════════════════════════════════════════════════════
-- Verificação da migração 20260930180726_gps_pasta_drive_pelo_parceiro
-- Rodar DEPOIS de aplicar, como postgres. Tudo termina em ROLLBACK.
-- ═══════════════════════════════════════════════════════════════════════════

begin;
set local lock_timeout = '3s';
set local statement_timeout = '20s';

-- Resultado dos testes vai para esta tabela (o execute_sql do MCP não devolve
-- NOTICE). Lida no fim, ANTES do rollback.
create temp table _r (em timestamptz default clock_timestamp(), res text) on commit drop;
grant insert, select on pg_temp._r to authenticated, anon;

-- ── V1. grants vivos de gps.ambientes (tabela e coluna) ─────────────────
-- Esperado: authenticated = DELETE, SELECT de tabela; UPDATE só nas colunas
-- data_agendamento_disponivel e atualizado_em. anon/PUBLIC: nada.
select grantee, string_agg(privilege_type, ', ' order by privilege_type) tabela
  from information_schema.role_table_grants
 where table_schema = 'gps' and table_name = 'ambientes'
 group by grantee order by grantee;

select grantee, column_name, string_agg(privilege_type, ', ' order by privilege_type) coluna
  from information_schema.column_privileges
 where table_schema = 'gps' and table_name = 'ambientes'
   and grantee in ('authenticated', 'anon', 'PUBLIC')
   and privilege_type = 'UPDATE'
 group by grantee, column_name order by grantee, column_name;

-- ── V2. policies vivas ───────────────────────────────────────────────────
select policyname, cmd, roles, qual, with_check
  from pg_policies where schemaname = 'gps' and tablename = 'ambientes'
 order by policyname;

-- ── V3. constraints ──────────────────────────────────────────────────────
select conname, convalidated, pg_get_constraintdef(oid)
  from pg_constraint
 where conrelid = 'gps.ambientes'::regclass and contype = 'c'
 order by conname;

-- ── V4. ACL da RPC (nenhuma entrada '=' = PUBLIC; sem anon) ──────────────
select a::text acl
  from pg_proc p, unnest(p.proacl) a
 where p.oid = 'gps.pasta_drive_definir(uuid,text,text)'::regprocedure;
select has_function_privilege('anon', 'gps.pasta_drive_definir(uuid,text,text)', 'EXECUTE') anon_pode,
       has_function_privilege('authenticated', 'gps.pasta_drive_definir(uuid,text,text)', 'EXECUTE') auth_pode;

-- ── V5. contagens ────────────────────────────────────────────────────────
select count(*) ambientes,
       count(pasta_drive_url) com_link,
       count(*) filter (where pasta_drive_url is not null and not (
             pasta_drive_url ~ '^https://(drive|docs)\.google\.com/'
         and pasta_drive_url !~ '^https://(drive|docs)\.google\.com/url'
         and pasta_drive_url !~ '\s'
         and length(pasta_drive_url) <= 2048)) fora_da_regex,
       count(*) filter (where pasta_drive_url is not null and pasta_drive_origem is null) link_sem_origem
  from gps.ambientes;

-- ── Preparação dos testes (como postgres) ────────────────────────────────
-- A = ambiente com titular E sócio com login; O = membro de OUTRO ambiente;
-- ADM = equipe ativa. Guardados em GUCs locais para sobreviver ao set role.
select set_config('t.amb',     x.aluno_id::text, true),
       set_config('t.titular', x.tit::text,      true),
       set_config('t.socio',   x.soc::text,      true)
  from (select t.aluno_id, t.user_id tit, s.user_id soc
          from gps.membros t
          join gps.membros s on s.aluno_id = t.aluno_id and s.papel <> 'titular'
         where t.papel = 'titular' and t.user_id is not null and s.user_id is not null
         limit 1) x;
select set_config('t.outro', (select m.user_id::text from gps.membros m
                               where m.aluno_id <> current_setting('t.amb')::uuid
                                 and m.user_id is not null limit 1), true);
select set_config('t.adm', (select p.id::text from public.perfis p
                             where p.status = 'ativo' and p.cargo in ('dev','admin')
                             limit 1), true);
select current_setting('t.amb') amb, current_setting('t.titular') titular,
       current_setting('t.socio') socio, current_setting('t.outro') outro,
       current_setting('t.adm') adm;

-- estado inicial conhecido para A
update gps.ambientes set pasta_drive_url = null, pasta_drive_por = null,
       pasta_drive_por_nome = null, pasta_drive_em = null, pasta_drive_origem = null
 where aluno_id = current_setting('t.amb')::uuid;

-- ── EXPLAIN (ANALYZE) das duas queries da RPC (dentro da transação) ──────
explain (analyze, buffers)
select a.pasta_drive_url, a.pasta_drive_origem from gps.ambientes a
 where a.aluno_id = current_setting('t.amb')::uuid for update;
explain (analyze, buffers)
select 1 from gps.membros m
 where m.user_id = current_setting('t.titular')::uuid
   and m.aluno_id = current_setting('t.amb')::uuid;
explain (analyze, buffers)
update gps.ambientes set pasta_drive_em = now()
 where aluno_id = current_setting('t.amb')::uuid;   -- desfeito pelo rollback final

-- Macro de teste: cada bloco imprime OK/FALHOU com o SQLSTATE.

-- T1 titular insere (vazio → L1): espera OK
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.titular'), 'role', 'authenticated')::text, true);
do $$ begin
  perform gps.pasta_drive_definir(current_setting('t.amb')::uuid,
    'https://drive.google.com/drive/folders/L1', null);
  insert into pg_temp._r(res) values (format('T1 titular insere: OK'));
exception when others then insert into pg_temp._r(res) values (format('T1 titular insere: FALHOU %s %s', sqlstate, sqlerrm)); end $$;
reset role;
select pasta_drive_url, pasta_drive_origem, pasta_drive_por_nome, pasta_drive_por = current_setting('t.titular')::uuid por_ok
  from gps.ambientes where aluno_id = current_setting('t.amb')::uuid;

-- T2 sócio troca L1 → L2: espera OK
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.socio'), 'role', 'authenticated')::text, true);
do $$ begin
  perform gps.pasta_drive_definir(current_setting('t.amb')::uuid,
    'https://drive.google.com/drive/folders/L2', 'https://drive.google.com/drive/folders/L1');
  insert into pg_temp._r(res) values (format('T2 socio troca: OK'));
exception when others then insert into pg_temp._r(res) values (format('T2 socio troca: FALHOU %s %s', sqlstate, sqlerrm)); end $$;

-- T3 sócio com anterior velho (L1): espera P0001 "O link mudou…"
do $$ begin
  perform gps.pasta_drive_definir(current_setting('t.amb')::uuid,
    'https://drive.google.com/drive/folders/L3', 'https://drive.google.com/drive/folders/L1');
  insert into pg_temp._r(res) values (format('T3 anterior velho: PASSOU (ERRADO)'));
exception when others then insert into pg_temp._r(res) values (format('T3 anterior velho: recusado %s %s', sqlstate, sqlerrm)); end $$;

-- T4 sócio remove (url vazia): espera 22023
do $$ begin
  perform gps.pasta_drive_definir(current_setting('t.amb')::uuid, '',
    'https://drive.google.com/drive/folders/L2');
  insert into pg_temp._r(res) values (format('T4 parceiro remove: PASSOU (ERRADO)'));
exception when others then insert into pg_temp._r(res) values (format('T4 parceiro remove: recusado %s %s', sqlstate, sqlerrm)); end $$;

-- T5 redirecionador do Google: espera 22023
do $$ begin
  perform gps.pasta_drive_definir(current_setting('t.amb')::uuid,
    'https://docs.google.com/url?q=https://evil.example', 'https://drive.google.com/drive/folders/L2');
  insert into pg_temp._r(res) values (format('T5 /url: PASSOU (ERRADO)'));
exception when others then insert into pg_temp._r(res) values (format('T5 /url: recusado %s %s', sqlstate, sqlerrm)); end $$;
reset role;

-- T6 membro de OUTRO ambiente: espera 42501
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.outro'), 'role', 'authenticated')::text, true);
do $$ begin
  perform gps.pasta_drive_definir(current_setting('t.amb')::uuid,
    'https://drive.google.com/drive/folders/X', 'https://drive.google.com/drive/folders/L2');
  insert into pg_temp._r(res) values (format('T6 outro ambiente: PASSOU (ERRADO)'));
exception when others then insert into pg_temp._r(res) values (format('T6 outro ambiente: recusado %s %s', sqlstate, sqlerrm)); end $$;
reset role;

-- T7 anon: espera 42501 (permission denied for function)
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  perform gps.pasta_drive_definir(current_setting('t.amb')::uuid,
    'https://drive.google.com/drive/folders/X', null);
  insert into pg_temp._r(res) values (format('T7 anon: PASSOU (ERRADO)'));
exception when others then insert into pg_temp._r(res) values (format('T7 anon: recusado %s %s', sqlstate, sqlerrm)); end $$;
reset role;

-- T8 PATCH direto em pasta_drive_url pelo titular: espera 42501
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.titular'), 'role', 'authenticated')::text, true);
do $$ begin
  update gps.ambientes set pasta_drive_url = 'https://drive.google.com/drive/folders/PATCH'
   where aluno_id = current_setting('t.amb')::uuid;
  insert into pg_temp._r(res) values (format('T8 PATCH direto: PASSOU (ERRADO)'));
exception when others then insert into pg_temp._r(res) values (format('T8 PATCH direto: recusado %s %s', sqlstate, sqlerrm)); end $$;

-- T9 titular atualiza data_agendamento_disponivel: espera OK, 1 linha
do $$ declare n int; begin
  update gps.ambientes set data_agendamento_disponivel = current_date
   where aluno_id = current_setting('t.amb')::uuid;
  get diagnostics n = row_count;
  insert into pg_temp._r(res) values (format('T9 data agendamento: OK linhas=%s', n));
exception when others then insert into pg_temp._r(res) values (format('T9 data agendamento: FALHOU %s %s', sqlstate, sqlerrm)); end $$;
reset role;

-- T10 equipe troca L2 → L3: espera OK, origem equipe, nome 'Equipe'
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.adm'), 'role', 'authenticated')::text, true);
do $$ begin
  perform gps.pasta_drive_definir(current_setting('t.amb')::uuid,
    'https://drive.google.com/drive/folders/L3', 'https://drive.google.com/drive/folders/L2');
  insert into pg_temp._r(res) values (format('T10 equipe troca: OK'));
exception when others then insert into pg_temp._r(res) values (format('T10 equipe troca: FALHOU %s %s', sqlstate, sqlerrm)); end $$;
reset role;
select pasta_drive_url, pasta_drive_origem, pasta_drive_por_nome
  from gps.ambientes where aluno_id = current_setting('t.amb')::uuid;

-- T11 titular tenta trocar link da equipe: espera 42501 "A pasta já foi definida pela equipe."
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.titular'), 'role', 'authenticated')::text, true);
do $$ begin
  perform gps.pasta_drive_definir(current_setting('t.amb')::uuid,
    'https://drive.google.com/drive/folders/L4', 'https://drive.google.com/drive/folders/L3');
  insert into pg_temp._r(res) values (format('T11 parceiro sobre equipe: PASSOU (ERRADO)'));
exception when others then insert into pg_temp._r(res) values (format('T11 parceiro sobre equipe: recusado %s %s', sqlstate, sqlerrm)); end $$;
reset role;

-- T12 equipe remove: espera OK e as 5 colunas nulas
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.adm'), 'role', 'authenticated')::text, true);
do $$ begin
  perform gps.pasta_drive_definir(current_setting('t.amb')::uuid, '',
    'https://drive.google.com/drive/folders/L3');
  insert into pg_temp._r(res) values (format('T12 equipe remove: OK'));
exception when others then insert into pg_temp._r(res) values (format('T12 equipe remove: FALHOU %s %s', sqlstate, sqlerrm)); end $$;
reset role;
select pasta_drive_url, pasta_drive_por, pasta_drive_por_nome, pasta_drive_em, pasta_drive_origem
  from gps.ambientes where aluno_id = current_setting('t.amb')::uuid;

-- T13 CHECK como postgres (rede do banco): espera 23514
do $$ begin
  update gps.ambientes set pasta_drive_url = 'https://drive.google.com/url?q=x'
   where aluno_id = current_setting('t.amb')::uuid;
  insert into pg_temp._r(res) values (format('T13 CHECK: PASSOU (ERRADO)'));
exception when others then insert into pg_temp._r(res) values (format('T13 CHECK: recusado %s %s', sqlstate, sqlerrm)); end $$;


-- Esperado: T1,T2,T9(linhas=1),T10,T12 = OK; T3 P0001; T4,T5 22023;
-- T6,T7,T8,T11 42501; T13 23514. Qualquer "PASSOU (ERRADO)" ou "FALHOU" reprova.
select res from pg_temp._r order by em;

rollback;
