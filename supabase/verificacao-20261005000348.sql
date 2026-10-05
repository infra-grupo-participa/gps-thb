-- ═══════════════════════════════════════════════════════════════════════════
-- Provas da 20261005000348_gps_drive_ajustes — rodar DEPOIS de aplicar.
-- Nada persiste: o bloco A termina em RAISE (desfaz tudo, inclusive a fila do
-- pg_net, que é transacional) e devolve o resultado na mensagem de erro.
-- O bloco B semeia dados (generate_series) DENTRO de begin/rollback, para o
-- plano ser o de tabela povoada, não o de tabela vazia. Sem ANALYZE (ele grava
-- reltuples fora da transação); o planner estima pelo número real de páginas.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── A. T16 (um DO desfeito) ────────────────────────────────────────────────
do $prova$
declare
  r          jsonb := '{}'::jsonb;
  v_admin    uuid;
  v_tit_user uuid;
  v_tit_mail text;
  v_aluno    uuid;
  v_cli      uuid;
  v_tp       uuid;
  v_tc       uuid;
  v_rev      uuid;
  v_j        jsonb;
  v_n        int;
  v_url      text;
begin
  set local lock_timeout = '2s';
  set local statement_timeout = '20s';

  select p.id into v_admin from public.perfis p
   where p.status = 'ativo' and p.cargo in ('dev', 'admin') limit 1;
  select m.user_id, m.aluno_id into v_tit_user, v_aluno
    from gps.membros m
    join gps.ambientes a on a.aluno_id = m.aluno_id and a.pasta_drive_url is null
   where m.papel = 'titular' and m.user_id is not null
     and not exists (select 1 from gps.drive_pastas dp where dp.aluno_id = m.aluno_id)
     and exists (select 1 from gps.etapa1_clientes c
                  where c.aluno_id = m.aluno_id
                    and not exists (select 1 from gps.cliente_links_drive l
                                     where l.cliente_id = c.id and l.removido_em is null))
   limit 1;
  select lower(btrim(u.email)) into v_tit_mail from auth.users u where u.id = v_tit_user;
  select c.id into v_cli from gps.etapa1_clientes c
   where c.aluno_id = v_aluno
     and not exists (select 1 from gps.cliente_links_drive l where l.cliente_id = c.id and l.removido_em is null)
   limit 1;
  r := r || jsonb_build_object('P0_ids', jsonb_build_object(
    'admin', v_admin is not null, 'titular', v_tit_user is not null, 'cliente', v_cli is not null));

  -- T16.0 superfície das 2 funções recriadas + índice novo
  r := r || jsonb_build_object('T16_0_superficie', jsonb_build_object(
    'varrer_anon', has_function_privilege('anon', 'gps.drive_varrer()', 'execute'),
    'varrer_auth', has_function_privilege('authenticated', 'gps.drive_varrer()', 'execute'),
    'varrer_srv',  has_function_privilege('service_role', 'gps.drive_varrer()', 'execute'),
    'estado_anon', has_function_privilege('anon', 'gps.drive_estado(uuid, uuid)', 'execute'),
    'estado_auth', has_function_privilege('authenticated', 'gps.drive_estado(uuid, uuid)', 'execute'),
    'search_path', (select jsonb_agg(p.proname || ':' || coalesce(array_to_string(p.proconfig, ','), 'NULL') order by p.proname)
                      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'gps' and p.proname in ('drive_varrer', 'drive_estado')),
    'indice', (select indexdef from pg_indexes where schemaname = 'gps' and indexname = 'drive_tarefas_revogar_criado_idx'),
    'ativo_hoje', (select valor from gps.config where chave = 'drive_provisionar_ativo')));

  -- T16.1 desligado → só {ativo:false}: admin, titular, sem JWT, aluno nulo
  update gps.config set valor = 'false' where chave = 'drive_provisionar_ativo';
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object('T16_1_admin', gps.drive_estado(v_aluno, v_cli));
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_tit_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object('T16_1_titular', gps.drive_estado(v_aluno, null));
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object('T16_1_sem_jwt_aluno_nulo', gps.drive_estado(null, null));
  execute 'reset role';
  r := r || jsonb_build_object('T16_1_varrer_desligado', gps.drive_varrer());

  update gps.config set valor = 'true' where chave = 'drive_provisionar_ativo';

  -- T16.2 organizada: false → só raiz: false → raiz + clientes: true
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object('T16_2_antes', gps.drive_estado(v_aluno, null)->'parceiro'->'organizada');
  v_tp := gps.drive_provisionar_parceiro(v_aluno);
  r := r || jsonb_build_object('T16_2_tipo_em_andamento', gps.drive_estado(v_aluno, null)->'parceiro'->>'tipo');
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  v_j := gps.drive_tarefa_pegar(10);
  r := r || jsonb_build_object('T16_2_pegou_parceiro',
         exists (select 1 from jsonb_array_elements(v_j) e where (e->>'id')::uuid = v_tp));
  perform gps.drive_pasta_registrar(v_tp, 'T16_RAIZ_PARC_0001', 'raiz_parceiro', 'T16 — Implementação Assistida', false);
  begin
    perform gps.drive_pasta_registrar(v_tp, 'T16_RAIZ_CLI_00009', 'raiz_cliente', 'Errado', false);
    r := r || jsonb_build_object('T16_2_raiz_cliente_em_tarefa_parceiro', 'PASSOU (ERRADO)');
  exception when others then r := r || jsonb_build_object('T16_2_raiz_cliente_em_tarefa_parceiro', sqlstate);
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object('T16_2_so_raiz', gps.drive_estado(v_aluno, null)->'parceiro'->'organizada');
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  perform gps.drive_pasta_registrar(v_tp, 'T16_CLIENTES_00001', 'clientes', '5) CLIENTES', false);
  perform gps.drive_parceiro_link_gravar(v_tp, 'T16_RAIZ_PARC_0001');
  perform gps.drive_permissao_registrar(v_tp, 'T16_RAIZ_PARC_0001', 'T16PERM01', v_tit_mail, 'reader');
  perform gps.drive_tarefa_concluir(v_tp, 'feito', null, null, null);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_tit_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_j := gps.drive_estado(v_aluno, null);
  r := r || jsonb_build_object('T16_2_titular_organizada', v_j->'parceiro'->'organizada',
                               'T16_2_titular_tem_chave_revogacao', (v_j->'parceiro') ? 'revogacao_pendente',
                               'T16_2_titular_tipo', v_j->'parceiro'->>'tipo');

  -- T16.3 raiz_cliente + drive_cliente_link_gravar (service_role, banco real)
  v_tc := gps.drive_criar_pasta_cliente(v_cli);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  v_j := gps.drive_tarefa_pegar(10);
  r := r || jsonb_build_object('T16_3_pegou_cliente',
         exists (select 1 from jsonb_array_elements(v_j) e where (e->>'id')::uuid = v_tc));
  perform gps.drive_pasta_registrar(v_tc, 'T16_RAIZ_CLI_00001', 'raiz_cliente', 'Cliente T16', false);
  perform gps.drive_pasta_registrar(v_tc, 'T16_SUB_CLI_000001', 'sub_cliente', '1) Documentos', false);
  begin
    perform gps.drive_cliente_link_gravar(v_tc, 'T16_NAO_REGIST_001');
    r := r || jsonb_build_object('T16_3_link_pasta_nao_registrada', 'PASSOU (ERRADO)');
  exception when others then r := r || jsonb_build_object('T16_3_link_pasta_nao_registrada', sqlstate);
  end;
  v_url := gps.drive_cliente_link_gravar(v_tc, 'T16_RAIZ_CLI_00001');
  r := r || jsonb_build_object('T16_3_url', v_url,
                               'T16_3_idempotente', gps.drive_cliente_link_gravar(v_tc, 'T16_RAIZ_CLI_00001') = v_url);
  perform gps.drive_tarefa_concluir(v_tc, 'feito', null, null, null);
  execute 'reset role';
  select jsonb_build_object(
           'links', (select count(*) from gps.cliente_links_drive l where l.cliente_id = v_cli and l.removido_em is null),
           'origem', (select l.origem || '/' || l.criado_por_nome from gps.cliente_links_drive l
                       where l.cliente_id = v_cli and l.removido_em is null),
           'evento', (select count(*) from gps.aluno_eventos e
                       where e.entidade_id = v_cli and e.tipo = 'cliente_link_drive_adicionado' and e.ator = 'sistema'),
           'pastas', (select count(*) from gps.drive_pastas p where p.cliente_id = v_cli))
    into v_j;
  r := r || jsonb_build_object('T16_3_banco', v_j);
  perform set_config('request.jwt.claims', json_build_object('sub', v_tit_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_j := gps.drive_estado(v_aluno, v_cli);
  execute 'reset role';
  r := r || jsonb_build_object('T16_3_estado_cliente', jsonb_build_object(
           'estado', v_j->'cliente'->>'estado', 'tipo', v_j->'cliente'->>'tipo',
           'url_ok', v_j->'cliente'->>'url' = v_url));

  -- T16.4 revogação presa: reenfileira, teto 1/h, fila não cresce 1/min
  delete from gps.drive_tarefas where tipo = 'revogar';
  update gps.drive_permissoes set revogar_desde = now(), revogar_motivo = 'titular_trocado'
   where aluno_id = v_aluno and permission_id = 'T16PERM01';
  -- a) 'revogar' em erro criada há 30 min → NÃO reenfileira (teto 1/h)
  insert into gps.drive_tarefas (tipo, aluno_id, estado, tentativas, erro, criado_em, concluido_em)
  values ('revogar', null, 'erro', 4, 'prova', now() - interval '30 minutes', now())
  returning id into v_rev;
  perform gps.drive_varrer(); perform gps.drive_varrer(); perform gps.drive_varrer();
  r := r || jsonb_build_object('T16_4a_30min_total_revogar',
           (select count(*) from gps.drive_tarefas where tipo = 'revogar'));
  -- b) a mesma, criada há 61 min → reenfileira UMA; varrer de novo não duplica
  update gps.drive_tarefas set criado_em = now() - interval '61 minutes' where id = v_rev;
  perform gps.drive_varrer(); perform gps.drive_varrer();
  r := r || jsonb_build_object('T16_4b_61min', jsonb_build_object(
           'total', (select count(*) from gps.drive_tarefas where tipo = 'revogar'),
           'pendentes', (select count(*) from gps.drive_tarefas where tipo = 'revogar' and estado = 'pendente')));
  -- c) a nova também falha (credencial morta) logo depois: 10 varreduras
  --    seguidas ("10 minutos") não criam linha — o criado_em dela é agora
  update gps.drive_tarefas set estado = 'erro', concluido_em = now()
   where tipo = 'revogar' and estado = 'pendente';
  for v_n in 1..10 loop perform gps.drive_varrer(); end loop;
  r := r || jsonb_build_object('T16_4c_credencial_morta_10_varreduras',
           (select count(*) from gps.drive_tarefas where tipo = 'revogar'));
  -- d) item desistido (tentativas = 4) não reenfileira, mesmo com a última
  --    'revogar' velha; mas a equipe vê revogacao_pendente = true
  update gps.drive_tarefas set criado_em = now() - interval '2 hours' where tipo = 'revogar';
  update gps.drive_permissoes set tentativas = 4 where aluno_id = v_aluno and permission_id = 'T16PERM01';
  perform gps.drive_varrer();
  r := r || jsonb_build_object('T16_4d_desistido_total',
           (select count(*) from gps.drive_tarefas where tipo = 'revogar'));
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object('T16_4d_admin_revogacao_pendente', gps.drive_estado(v_aluno, null)->'parceiro'->'revogacao_pendente');
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_tit_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object('T16_4d_titular_sem_chave', not ((gps.drive_estado(v_aluno, null)->'parceiro') ? 'revogacao_pendente'));
  execute 'reset role';
  -- e) revogada → nada pendente: admin vê false, varrer não cria
  update gps.drive_permissoes set revogado_em = now() where aluno_id = v_aluno and permission_id = 'T16PERM01';
  perform gps.drive_varrer();
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object('T16_4e_admin_revogacao_pendente', gps.drive_estado(v_aluno, null)->'parceiro'->'revogacao_pendente',
                               'T16_4e_total', (select count(*) from gps.drive_tarefas where tipo = 'revogar'));
  execute 'reset role';

  raise exception 'PROVA_348 %', r::text;
end
$prova$;
-- Esperado:
--   T16_0 varrer anon/auth/srv=false; estado anon=false auth=true;
--     search_path "search_path=\"\"" nas duas; índice presente; ativo_hoje='false'.
--   T16_1 admin/titular/sem_jwt_aluno_nulo = {"ativo": false} (EXATAMENTE essa
--     chave, sem parceiro/cliente; sem 42501/22023: nada é lido); varrer = 0.
--   T16_2 antes=false; tipo_em_andamento='provisionar_parceiro'; pegou=true;
--     raiz_cliente_em_tarefa_parceiro=22023; so_raiz=false; titular_organizada=true;
--     titular_tem_chave_revogacao=false; titular_tipo='provisionar_parceiro'.
--   T16_3 pegou=true; link_pasta_nao_registrada=22023; url
--     https://drive.google.com/drive/folders/T16_RAIZ_CLI_00001; idempotente=true;
--     banco links=1, origem 'equipe/Equipe', evento=1, pastas=2;
--     estado_cliente feito / criar_pasta_cliente / url_ok=true.
--   T16_4 a=1 (só a velha) · b total=2 pendentes=1 · c=2 · d total=2,
--     admin true, titular_sem_chave=true · e admin false, total=2.


-- ── B. EXPLAIN com dados semeados (tudo em begin/rollback) ─────────────────
begin;
set local statement_timeout = '60s';
set local lock_timeout = '2s';

-- ~13,5k tarefas de parceiro (100 por ambiente), 1 pendente por ambiente
-- com proxima_em no futuro (backoff), 5 vencidas
insert into gps.drive_tarefas (tipo, aluno_id, estado, criado_em, proxima_em, concluido_em)
select case when g % 2 = 0 then 'compartilhar' else 'provisionar_parceiro' end,
       a.aluno_id, 'feito', now() - (g || ' hours')::interval, now(), now()
  from gps.ambientes a cross join generate_series(1, 100) g;
insert into gps.drive_tarefas (tipo, aluno_id, estado, proxima_em)
select 'compartilhar', a.aluno_id, 'pendente', now() + interval '20 minutes'
  from gps.ambientes a
 where not exists (select 1 from gps.drive_tarefas t
                    where t.aluno_id = a.aluno_id and t.estado in ('pendente', 'rodando'));
update gps.drive_tarefas set proxima_em = now() - interval '1 minute'
 where id in (select id from gps.drive_tarefas where estado = 'pendente' limit 5);
-- 10 tarefas por cliente (feitas), de 5 em 5 h: 4 caem na janela de 24 h
insert into gps.drive_tarefas (tipo, aluno_id, cliente_id, estado, criado_em, concluido_em)
select 'criar_pasta_cliente', c.aluno_id, c.id, 'feito', now() - ((g * 5) || ' hours')::interval, now()
  from gps.etapa1_clientes c cross join generate_series(1, 10) g;
-- 2.000 revogar antigas (feito/erro), aluno nulo
insert into gps.drive_tarefas (tipo, aluno_id, estado, criado_em, concluido_em)
select 'revogar', null, case when g % 3 = 0 then 'erro' else 'feito' end, now() - (g || ' hours')::interval, now()
  from generate_series(1, 2000) g;
-- pastas de parceiro organizadas + 20k permissões (quase todas revogadas)
insert into gps.drive_pastas (file_id, aluno_id, papel, nome)
select 'SEED' || md5(a.aluno_id::text || x.papel), a.aluno_id, x.papel, x.papel
  from gps.ambientes a
 cross join (values ('raiz_parceiro'), ('clientes')) x(papel)
on conflict do nothing;
insert into gps.drive_permissoes (file_id, permission_id, email, papel, aluno_id, user_id,
                                  revogar_desde, revogar_motivo, revogado_em)
select 'SEED' || md5(a.aluno_id::text || 'raiz_parceiro'), 'SEEDP' || a.n || '_' || g,
       'seed' || g || '@exemplo.com', 'reader', a.aluno_id, null,
       now() - interval '1 day', 'titular_trocado',
       case when g = 150 then null else now() end
  from (select aluno_id, row_number() over () n from gps.ambientes) a
 cross join generate_series(1, 150) g;

select (select count(*) from gps.drive_tarefas) tarefas,
       (select count(*) from gps.drive_tarefas where estado = 'pendente') pendentes,
       (select count(*) from gps.drive_permissoes) permissoes,
       (select count(*) from gps.drive_permissoes where revogado_em is null) perms_vivas;

-- B1 caminho quente do cron (1×/min): Index Scan em drive_tarefas_fila_idx
explain (analyze, buffers)
select 1 from gps.drive_tarefas
 where estado = 'pendente' and proxima_em <= now()
 limit 1;

-- B2 leitura da tela (ramo do parceiro): drive_tarefas_aluno_idx
explain (analyze, buffers)
select t.id from gps.drive_tarefas t
 where t.aluno_id = (select aluno_id from gps.ambientes limit 1)
   and t.tipo in ('provisionar_parceiro', 'compartilhar')
 order by t.criado_em desc
 limit 1;

-- B3 ramo do cliente: drive_tarefas_cliente_idx
explain (analyze, buffers)
select t.id from gps.drive_tarefas t
 where t.cliente_id = (select id from gps.etapa1_clientes limit 1)
   and t.tipo = 'criar_pasta_cliente'
 order by t.criado_em desc
 limit 1;

-- B4 candidatas do pegar
explain (analyze, buffers)
select distinct on (t.aluno_id) t.id, t.proxima_em
  from gps.drive_tarefas t
 where t.estado = 'pendente'
   and t.proxima_em <= now()
   and not exists (select 1 from gps.drive_tarefas r
                    where r.aluno_id is not distinct from t.aluno_id and r.estado = 'rodando')
 order by t.aluno_id, t.proxima_em;

-- B6 teto diário de drive_criar_pasta_cliente: drive_tarefas_aluno_idx
explain (analyze, buffers)
select count(*) from gps.drive_tarefas t
 where t.aluno_id = (select aluno_id from gps.etapa1_clientes limit 1)
   and t.criado_em >= now() - interval '24 hours'
   and t.tipo = 'criar_pasta_cliente';

-- B9 (…348) varrer: item marcado vivo (drive_permissoes_revogar_idx)
explain (analyze, buffers)
select 1 from gps.drive_permissoes p
 where p.revogar_desde is not null and p.revogado_em is null and p.tentativas < 4
 limit 1;

-- B10 (…348) varrer: revogar ativa (drive_tarefas_revogar_ativa_uq)
explain (analyze, buffers)
select 1 from gps.drive_tarefas t
 where t.tipo = 'revogar' and t.estado in ('pendente', 'rodando')
 limit 1;

-- B11 (…348) varrer: última revogar (drive_tarefas_revogar_criado_idx, limit 1)
explain (analyze, buffers)
select t.criado_em from gps.drive_tarefas t
 where t.tipo = 'revogar'
 order by t.criado_em desc
 limit 1;

-- B12 (…348) drive_estado: organizada (drive_pastas_parceiro_papel_uq)
explain (analyze, buffers)
select count(*) = 2 from gps.drive_pastas p
 where p.aluno_id = (select aluno_id from gps.ambientes limit 1)
   and p.papel in ('raiz_parceiro', 'clientes');

-- B13 (…348) drive_estado: revogacao_pendente (drive_permissoes_dono_idx)
explain (analyze, buffers)
select exists (select 1 from gps.drive_permissoes p
                where p.aluno_id = (select aluno_id from gps.ambientes limit 1)
                  and p.revogado_em is null and p.revogar_desde is not null);

-- B14 funções inteiras (o que o cron e a tela pagam), ligadas e como admin
update gps.config set valor = 'true' where chave = 'drive_provisionar_ativo';
select set_config('request.jwt.claims',
         json_build_object('sub', (select id from public.perfis where status = 'ativo' and cargo in ('dev', 'admin') limit 1),
                           'role', 'authenticated')::text, true);
explain (analyze, buffers) select gps.drive_varrer();
explain (analyze, buffers) select gps.drive_estado((select aluno_id from gps.ambientes limit 1), null);

-- B15 desligado: drive_estado = 1 leitura de config
update gps.config set valor = 'false' where chave = 'drive_provisionar_ativo';
explain (analyze, buffers) select gps.drive_estado((select aluno_id from gps.ambientes limit 1), null);

rollback;
