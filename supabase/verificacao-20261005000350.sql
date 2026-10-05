-- ═══════════════════════════════════════════════════════════════════════════
-- Provas da 20261005000350_gps_drive_arquivar — rodar DEPOIS de aplicar.
-- Nada persiste: o bloco A termina em RAISE e devolve o resultado na
-- mensagem. 🔴 O T3 chama gps.admin_excluir_acesso de verdade num ambiente
-- real (apaga login, clientes, ambiente): só é seguro porque o RAISE final
-- desfaz a transação inteira. NÃO rodar o bloco A trocando o RAISE por commit.
-- O bloco B roda em begin/rollback (EXPLAIN ANALYZE de DELETE executa).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── A. Arquivar sobrevive ao cascade · excluir ambiente = UMA tarefa ───────
do $prova$
declare
  r          jsonb := '{}'::jsonb;
  v_admin    uuid;
  v_tit_user uuid;
  v_aluno    uuid;
  v_aluno_b  uuid;
  v_ca       uuid;
  v_cb       uuid;
  v_cc       uuid;
  v_cd       uuid;
  v_j        jsonb;
begin
  set local lock_timeout = '2s';
  set local statement_timeout = '30s';

  select p.id into v_admin from public.perfis p
   where p.status = 'ativo' and p.cargo in ('dev', 'admin') limit 1;
  -- titular que não é da equipe (admin_excluir_acesso recusa conta da equipe)
  select m.user_id, m.aluno_id into v_tit_user, v_aluno
    from gps.membros m
    join gps.ambientes a on a.aluno_id = m.aluno_id
   where m.papel = 'titular' and m.user_id is not null
     and not exists (select 1 from public.perfis p where p.id = m.user_id)
   limit 1;
  select a.aluno_id into v_aluno_b from gps.ambientes a where a.aluno_id <> v_aluno limit 1;

  insert into gps.etapa1_clientes (aluno_id, nome) values (v_aluno,   'T350 CLIENTE A') returning id into v_ca;
  insert into gps.etapa1_clientes (aluno_id, nome) values (v_aluno,   'T350 CLIENTE B') returning id into v_cb;
  insert into gps.etapa1_clientes (aluno_id, nome) values (v_aluno_b, 'T350 CLIENTE C') returning id into v_cc;
  insert into gps.etapa1_clientes (aluno_id, nome) values (v_aluno_b, 'T350 CLIENTE D') returning id into v_cd;

  -- T0 superfície e premissa da decisão (FK de clientes NÃO aponta para ambientes)
  r := r || jsonb_build_object('T0', jsonb_build_object(
    'ids', v_admin is not null and v_tit_user is not null and v_aluno_b is not null,
    'fk_clientes_aluno', (select c.confrelid::regclass::text from pg_constraint c
                           join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
                          where c.conrelid = 'gps.etapa1_clientes'::regclass and c.contype = 'f' and a.attname = 'aluno_id'),
    'fk_pastas', (select jsonb_object_agg(a.attname, c.confdeltype) from pg_constraint c
                   join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
                  where c.conrelid = 'gps.drive_pastas'::regclass and c.contype = 'f'),
    'tipo_check', (select pg_get_constraintdef(oid) from pg_constraint where conname = 'drive_tarefas_tipo_check'),
    'aluno_coerente', (select pg_get_constraintdef(oid) from pg_constraint where conname = 'drive_tarefas_aluno_coerente'),
    'cliente_coerente', (select pg_get_constraintdef(oid) from pg_constraint where conname = 'drive_pastas_cliente_coerente'),
    'gatilhos', (select jsonb_agg(tgname order by tgname) from pg_trigger
                  where tgname in ('trg_etapa1_clientes_drive_arquivar', 'trg_ambientes_drive_arquivar')),
    'fn_auth', has_function_privilege('authenticated', 'gps.drive_cliente_arquivar()', 'execute')
               or has_function_privilege('authenticated', 'gps.drive_ambiente_arquivar()', 'execute'),
    'pegar_auth', has_function_privilege('authenticated', 'gps.drive_tarefa_pegar(int)', 'execute'),
    'pegar_srv',  has_function_privilege('service_role', 'gps.drive_tarefa_pegar(int)', 'execute'),
    'pegar_path', (select array_to_string(proconfig, ',') from pg_proc where oid = 'gps.drive_tarefa_pegar(int)'::regprocedure)));

  -- Árvore de prova: parceiro A (raiz + CLIENTES), clientes A e B, cliente C de outro ambiente
  insert into gps.drive_pastas (file_id, aluno_id, cliente_id, papel, nome) values
    ('T350_RAIZ_PARC_A', v_aluno,   null,  'raiz_parceiro', 'Parceiro A — Implementação Assistida'),
    ('T350_CLIENTES_A1', v_aluno,   null,  'clientes',      '5) CLIENTES'),
    ('T350_RAIZ_CLI_A1', v_aluno,   v_ca,  'raiz_cliente',  'Cliente A Fulano'),
    ('T350_SUB03_CLI_A', v_aluno,   v_ca,  'sub_cliente',   '03 Minutas'),
    ('T350_RAIZ_CLI_B1', v_aluno,   v_cb,  'raiz_cliente',  'Cliente B Beltrano'),
    ('T350_RAIZ_CLI_C1', v_aluno_b, v_cc,  'raiz_cliente',  'Cliente C Ciclano'),
    ('T350_RAIZ_CLI_D1', v_aluno_b, v_cd,  'raiz_cliente',  'Cliente D Falha')
  on conflict do nothing;
  insert into gps.drive_permissoes (file_id, permission_id, email, papel, aluno_id, user_id)
  values ('T350_RAIZ_PARC_A', 'T350PERM1', 'titular@exemplo.com', 'reader', v_aluno, v_tit_user);
  insert into gps.drive_arquivos (file_id, cliente_id, aluno_id, pasta_file_id, subpasta, sub_chave, nome, modificado_em)
  values ('T350_ARQ_CLI_A01', v_ca, v_aluno, 'T350_SUB03_CLI_A', '03', '03', 'minuta.pdf', now()),
         ('T350_ARQ_CLI_C01', v_cc, v_aluno_b, 'T350_RAIZ_CLI_C1', 'raiz', null, 'rg.pdf', now());

  -- T1 excluir SÓ o cliente C: tarefa arquivar sem aluno/cliente, pasta anonimizada, arquivos somem
  delete from gps.etapa1_clientes where id = v_cc;
  r := r || jsonb_build_object('T1_cliente_sozinho', jsonb_build_object(
    'tarefas', (select jsonb_agg(jsonb_build_object('estado', t.estado, 'aluno_nulo', t.aluno_id is null,
                                                    'cliente_nulo', t.cliente_id is null, 'origem_b', t.origem_aluno_id = v_aluno_b))
                  from gps.drive_tarefas t where t.tipo = 'arquivar' and t.file_id = 'T350_RAIZ_CLI_C1'),
    'pasta', (select jsonb_build_object('cliente_nulo', p.cliente_id is null, 'aluno_mantido', p.aluno_id = v_aluno_b,
                                        'arquivada', p.arquivada_em is not null, 'nome', p.nome)
                from gps.drive_pastas p where p.file_id = 'T350_RAIZ_CLI_C1'),
    'arquivos_c', (select count(*) from gps.drive_arquivos where file_id = 'T350_ARQ_CLI_C01')));

  -- T1b FALHA FORÇADA: CHECK provisório recusa toda 'arquivar'. O gatilho
  -- engole (warning) e o DELETE do cliente PASSA.
  alter table gps.drive_tarefas add constraint t350_forca_falha check (tipo <> 'arquivar') not valid;
  begin
    delete from gps.etapa1_clientes where id = v_cd;
    r := r || jsonb_build_object('T1b_delete_com_falha', 'passou');
  exception when others then
    r := r || jsonb_build_object('T1b_delete_com_falha', 'BLOQUEOU (ERRADO) ' || sqlstate || ' ' || sqlerrm);
  end;
  r := r || jsonb_build_object('T1b_estado', jsonb_build_object(
    'cliente_existe', exists (select 1 from gps.etapa1_clientes where id = v_cd),
    'tarefa', (select count(*) from gps.drive_tarefas where file_id = 'T350_RAIZ_CLI_D1'),
    'pasta', (select jsonb_build_object('cliente_nulo', p.cliente_id is null, 'arquivada', p.arquivada_em is not null)
                from gps.drive_pastas p where p.file_id = 'T350_RAIZ_CLI_D1')));
  alter table gps.drive_tarefas drop constraint t350_forca_falha;

  -- T2 pegar devolve file_id da tarefa arquivar (service_role). Outras
  -- pendentes sem aluno são adiadas DENTRO desta transação, para o pegar
  -- (uma sem aluno por vez) pegar a de prova.
  update gps.drive_tarefas set proxima_em = now() + interval '1 day'
   where aluno_id is null and estado = 'pendente' and coalesce(file_id, '') <> 'T350_RAIZ_CLI_C1';
  update gps.config set valor = 'true' where chave = 'drive_provisionar_ativo';
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  v_j := gps.drive_tarefa_pegar(10);
  r := r || jsonb_build_object('T2_pegar_arquivar', (select jsonb_agg(jsonb_build_object('tipo', e->>'tipo', 'file_id', e->>'file_id',
                                                                                       'tem_chave', e ? 'file_id'))
                                                       from jsonb_array_elements(v_j) e where e->>'tipo' = 'arquivar'),
                               'T2_outras_tem_file_id_nulo', (select bool_and(e ? 'file_id' and e->'file_id' = 'null'::jsonb)
                                                                from jsonb_array_elements(v_j) e where e->>'tipo' <> 'arquivar'));
  perform gps.drive_tarefa_concluir((select (e->>'id')::uuid from jsonb_array_elements(v_j) e
                                      where e->>'file_id' = 'T350_RAIZ_CLI_C1'), 'feito', null, null, null);
  execute 'reset role';

  -- T3 excluir o AMBIENTE A pelo caminho real (apaga os clientes A e B ANTES do
  -- ambiente): sobra UMA tarefa, a da raiz do parceiro
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    v_j := gps.admin_excluir_acesso(v_aluno, true);
    r := r || jsonb_build_object('T3_excluir', 'ok');
  exception when others then
    r := r || jsonb_build_object('T3_excluir', sqlstate || ' ' || sqlerrm);
  end;
  execute 'reset role';
  r := r || jsonb_build_object('T3_ambiente', jsonb_build_object(
    'ambiente_existe', exists (select 1 from gps.ambientes where aluno_id = v_aluno),
    'tarefas_origem_a', (select jsonb_agg(t.estado || ':' || t.file_id) from gps.drive_tarefas t
                          where t.tipo = 'arquivar' and t.origem_aluno_id = v_aluno),
    'pastas', (select jsonb_object_agg(p.file_id, jsonb_build_object('aluno_nulo', p.aluno_id is null,
                                         'cliente_nulo', p.cliente_id is null, 'arquivada', p.arquivada_em is not null, 'nome', p.nome))
                 from gps.drive_pastas p where p.file_id like 'T350_%' and p.file_id <> 'T350_RAIZ_CLI_C1'),
    'permissao', (select jsonb_build_object('marcada', p.revogar_desde is not null, 'motivo', p.revogar_motivo)
                    from gps.drive_permissoes p where p.permission_id = 'T350PERM1'),
    'revogar_ativa', exists (select 1 from gps.drive_tarefas where tipo = 'revogar' and estado in ('pendente', 'rodando')),
    'arquivos_a', (select count(*) from gps.drive_arquivos where file_id = 'T350_ARQ_CLI_A01')));

  -- T4 CHECKs e índice de ativa
  begin
    insert into gps.drive_tarefas (tipo, aluno_id) values ('arquivar', null);
    r := r || jsonb_build_object('T4_arquivar_sem_file', 'PASSOU (ERRADO)');
  exception when others then r := r || jsonb_build_object('T4_arquivar_sem_file', sqlstate);
  end;
  begin
    insert into gps.drive_tarefas (tipo, aluno_id, file_id) values ('arquivar', null, 'T350_RAIZ_PARC_A');
    r := r || jsonb_build_object('T4_arquivar_duplicada', 'PASSOU (ERRADO)');
  exception when others then r := r || jsonb_build_object('T4_arquivar_duplicada', sqlstate);
  end;
  begin
    insert into gps.drive_tarefas (tipo, aluno_id, file_id) values ('arquivar', v_aluno_b, 'T350_QUALQUER_01');
    r := r || jsonb_build_object('T4_arquivar_com_aluno', 'PASSOU (ERRADO)');
  exception when others then r := r || jsonb_build_object('T4_arquivar_com_aluno', sqlstate);
  end;
  begin
    insert into gps.drive_pastas (file_id, aluno_id, cliente_id, papel, nome)
    values ('T350_SUB_SEM_CLI', v_aluno_b, null, 'sub_cliente', '02 Viabilidade e Croqui');
    r := r || jsonb_build_object('T4_sub_sem_cliente_viva', 'PASSOU (ERRADO)');
  exception when others then r := r || jsonb_build_object('T4_sub_sem_cliente_viva', sqlstate);
  end;
  begin
    insert into gps.drive_pastas (file_id, aluno_id, papel, nome) values ('T350_SEM_ALUNO_1', null, 'clientes', 'x');
    r := r || jsonb_build_object('T4_pasta_sem_aluno_viva', 'PASSOU (ERRADO)');
  exception when others then r := r || jsonb_build_object('T4_pasta_sem_aluno_viva', sqlstate);
  end;

  raise exception 'PROVA_350 %', r::text;
end
$prova$;
-- Esperado:
--   T0 ids=true; fk_clientes_aluno 'thb_alunos' (NÃO gps.ambientes: é por isso
--      que o gatilho do ambiente absorve as tarefas dos clientes); fk_pastas
--      {"aluno_id":"n","cliente_id":"n"}; tipo_check com 'arquivar' + os 4
--      vivos; aluno_coerente com revogar/arquivar; cliente_coerente com o ramo
--      arquivada_em; 2 gatilhos; fn_auth=false; pegar_auth=false pegar_srv=true;
--      pegar_path 'search_path=""'.
--   T1 tarefas [{pendente, aluno_nulo, cliente_nulo, origem_b}]; pasta
--      cliente_nulo=true aluno_mantido=true arquivada=true nome '(cliente excluído)';
--      arquivos_c 0.
--   T1b delete_com_falha 'passou'; estado cliente_existe=false tarefa=0
--      pasta cliente_nulo=true arquivada=false (rollback do bloco do gatilho;
--      a pasta fica para conferência por SQL).
--   T2 pegar_arquivar [{tipo arquivar, file_id T350_RAIZ_CLI_C1, tem_chave true}];
--      outras_tem_file_id_nulo true (ou null se o lote só tinha a de prova).
--   T3 excluir 'ok'; ambiente_existe false; tarefas_origem_a ["pendente:T350_RAIZ_PARC_A"]
--      (UMA; as dos clientes A e B desta transação foram absorvidas); pastas
--      todas aluno_nulo=true arquivada=true, raiz do parceiro '(parceiro excluído)',
--      raízes de cliente '(cliente excluído)', sub '03 Minutas'; permissao
--      marcada=true (membro_removido); revogar_ativa true; arquivos_a 0.
--   T4 sem_file 23514; duplicada 23505; com_aluno 23514; sub_sem_cliente_viva
--      'PASSOU (ERRADO)' é o esperado agora (CHECK relaxado: pasta de cliente
--      aceita cliente_id null para a exclusão nunca depender do gatilho);
--      pasta_sem_aluno_viva 23502 só se aluno_id NOT NULL — hoje PASSA
--      (aluno_id é nullable desde a 350).


-- ── B. EXPLAIN dos gatilhos com dados semeados (begin/rollback) ────────────
begin;
set local statement_timeout = '120s';
set local lock_timeout = '2s';

-- 1 raiz + 9 subpastas por cliente de ambiente existente (~16k linhas)
insert into gps.drive_pastas (file_id, aluno_id, cliente_id, papel, nome)
select 'SEEDR' || md5(c.id::text), c.aluno_id, c.id, 'raiz_cliente', 'Seed'
  from gps.etapa1_clientes c join gps.ambientes a on a.aluno_id = c.aluno_id
on conflict do nothing;
insert into gps.drive_pastas (file_id, aluno_id, cliente_id, papel, nome)
select 'SEEDS' || md5(c.id::text || g), c.aluno_id, c.id, 'sub_cliente', '0' || (1 + g % 6) || ' Seed'
  from gps.etapa1_clientes c join gps.ambientes a on a.aluno_id = c.aluno_id
 cross join generate_series(1, 9) g
on conflict do nothing;
-- 2000 arquivar antigas (feito)
insert into gps.drive_tarefas (tipo, aluno_id, file_id, origem_aluno_id, estado, criado_em, concluido_em)
select 'arquivar', null, 'SEEDT' || md5(g::text), null, 'feito', now() - (g || ' hours')::interval, now()
  from generate_series(1, 2000) g;

select (select count(*) from gps.drive_pastas) pastas,
       (select count(*) from gps.drive_tarefas where tipo = 'arquivar') arquivar;

-- B1 caminho do gatilho do cliente (lookups que ele faz)
explain (analyze, buffers)
select p.file_id, p.aluno_id from gps.drive_pastas p
 where p.cliente_id = (select cliente_id from gps.drive_pastas where file_id like 'SEEDR%' limit 1)
   and p.papel = 'raiz_cliente';

-- B2 DELETE real de um cliente de prova com 10 pastas (gatilho + SET NULL + cascade)
insert into gps.etapa1_clientes (aluno_id, nome)
select aluno_id, 'B350 CLIENTE DE PROVA' from gps.ambientes limit 1;
insert into gps.drive_pastas (file_id, aluno_id, cliente_id, papel, nome)
select 'B350R' || md5(c.id::text), c.aluno_id, c.id, 'raiz_cliente', 'Prova'
  from gps.etapa1_clientes c where c.nome = 'B350 CLIENTE DE PROVA';
explain (analyze, buffers)
delete from gps.etapa1_clientes where nome = 'B350 CLIENTE DE PROVA'
  and id = (select id from gps.etapa1_clientes where nome = 'B350 CLIENTE DE PROVA' limit 1);

-- B3 caminho do gatilho do ambiente (update por aluno_id; absorção por origem)
explain (analyze, buffers)
select count(*) from gps.drive_pastas p
 where p.aluno_id = (select aluno_id from gps.ambientes limit 1);
explain (analyze, buffers)
select count(*) from gps.drive_tarefas t
 where t.tipo = 'arquivar' and t.estado = 'pendente'
   and t.origem_aluno_id = (select aluno_id from gps.ambientes limit 1);

rollback;
