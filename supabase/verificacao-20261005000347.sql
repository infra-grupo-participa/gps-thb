-- ═══════════════════════════════════════════════════════════════════════════
-- Provas da 20261005000347_gps_drive_provisionar — rodar DEPOIS de aplicar.
-- Nada persiste: o bloco A termina em RAISE (desfaz tudo, inclusive o que o
-- pg_net enfileiraria — net.http_request_queue é transacional) e devolve os
-- resultados na mensagem de erro (o execute_sql do MCP não mostra NOTICE).
-- Os EXPLAIN do bloco B são SELECT; os UPDATE vão em begin/rollback.
-- 2ª rodada (kirad): T6 (cliente sem raiz organizada), T8 (teto 3
-- retentativas), T9 (teto 20/dia), T10 (A adota B recusado), T11 (origem
-- 'parceiro' não rebaixa), T12 (revogar enfileirado pelos gatilhos).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── A. Guardas, RLS, fila, RPCs da edge, adoção e revogação (um DO desfeito) ─
do $prova$
declare
  r           jsonb := '{}'::jsonb;
  v_admin     uuid;
  v_tit_user  uuid;
  v_tit_mid   uuid;
  v_tit_email text;
  v_aluno     uuid;
  v_aluno_b   uuid;
  v_cli       uuid;
  v_cli_outro uuid;
  v_cli_link  uuid;
  v_t1 uuid; v_t2 uuid; v_t3 uuid; v_tb uuid; v_trev uuid;
  v_j  jsonb;
  v_n  int;
  v_url text;
begin
  set local lock_timeout = '2s';
  set local statement_timeout = '20s';

  select p.id into v_admin from public.perfis p
   where p.status = 'ativo' and p.cargo in ('dev', 'admin') limit 1;

  -- titular com login, ambiente SEM pasta, e um cliente sem link
  select m.user_id, m.aluno_id, m.id into v_tit_user, v_aluno, v_tit_mid
    from gps.membros m
    join gps.ambientes a on a.aluno_id = m.aluno_id and a.pasta_drive_url is null
   where m.papel = 'titular' and m.user_id is not null
     and exists (select 1 from gps.etapa1_clientes c
                  where c.aluno_id = m.aluno_id
                    and not exists (select 1 from gps.cliente_links_drive l
                                     where l.cliente_id = c.id and l.removido_em is null))
   limit 1;
  select lower(btrim(u.email)) into v_tit_email from auth.users u where u.id = v_tit_user;
  select c.id into v_cli from gps.etapa1_clientes c
   where c.aluno_id = v_aluno
     and not exists (select 1 from gps.cliente_links_drive l where l.cliente_id = c.id and l.removido_em is null)
   limit 1;
  select c.id into v_cli_outro from gps.etapa1_clientes c where c.aluno_id <> v_aluno limit 1;
  select l.cliente_id into v_cli_link from gps.cliente_links_drive l
    join gps.etapa1_clientes c on c.id = l.cliente_id and c.aluno_id = v_aluno
   where l.removido_em is null limit 1;
  -- parceiro B: outro ambiente qualquer
  select a.aluno_id into v_aluno_b from gps.ambientes a where a.aluno_id <> v_aluno limit 1;

  r := r || jsonb_build_object('P0_ids', jsonb_build_object(
    'admin', v_admin is not null, 'titular', v_tit_user is not null, 'email', v_tit_email is not null,
    'cliente', v_cli is not null, 'cliente_outro', v_cli_outro is not null,
    'cliente_com_link_mesmo_ambiente', v_cli_link is not null, 'aluno_b', v_aluno_b is not null));

  -- T1 superfície: anon nada; authenticated só as 3 do usuário; service_role
  -- só as 8 da edge; internas (enfileirar/marcar/gatilhos) ninguém
  select jsonb_object_agg(p.proname, jsonb_build_object(
           'anon', has_function_privilege('anon', p.oid, 'execute'),
           'auth', has_function_privilege('authenticated', p.oid, 'execute'),
           'srv',  has_function_privilege('service_role', p.oid, 'execute')))
    into v_j
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'gps' and p.proname like 'drive\_%' and p.proname <> 'drive_url_normalizar';
  r := r || jsonb_build_object('T1_funcoes', v_j);
  r := r || jsonb_build_object('T1_tabelas', jsonb_build_object(
    'auth_select_tarefas', has_table_privilege('authenticated', 'gps.drive_tarefas', 'select'),
    'auth_insert_tarefas', has_table_privilege('authenticated', 'gps.drive_tarefas', 'insert'),
    'auth_update_tarefas', has_table_privilege('authenticated', 'gps.drive_tarefas', 'update'),
    'auth_delete_tarefas', has_table_privilege('authenticated', 'gps.drive_tarefas', 'delete'),
    'auth_insert_pastas',  has_table_privilege('authenticated', 'gps.drive_pastas', 'insert'),
    'auth_insert_perms',   has_table_privilege('authenticated', 'gps.drive_permissoes', 'insert'),
    'auth_update_perms',   has_table_privilege('authenticated', 'gps.drive_permissoes', 'update'),
    'anon_select_tarefas', has_table_privilege('anon', 'gps.drive_tarefas', 'select'),
    'anon_select_perms',   has_table_privilege('anon', 'gps.drive_permissoes', 'select'),
    'srv_select_tarefas',  has_table_privilege('service_role', 'gps.drive_tarefas', 'select'),
    'srv_select_perms',    has_table_privilege('service_role', 'gps.drive_permissoes', 'select'),
    'rls', (select bool_and(relrowsecurity) from pg_class
             where oid in ('gps.drive_tarefas'::regclass, 'gps.drive_pastas'::regclass, 'gps.drive_permissoes'::regclass)),
    'gatilhos', (select jsonb_agg(tgname order by tgname) from pg_trigger
                  where tgname in ('trg_membros_drive_revogar', 'trg_acessos_log_drive_revogar') and not tgisinternal),
    'cron', (select count(*) from cron.job where jobname = 'drive-provisionar-varrer'),
    'ativo_nasce', (select valor from gps.config where chave = 'drive_provisionar_ativo')));

  -- T2 sem JWT → 42501
  begin
    perform set_config('request.jwt.claims', '', true);
    execute 'set local role authenticated';
    perform gps.drive_provisionar_parceiro(v_aluno);
    r := r || jsonb_build_object('T2_sem_jwt', 'PASSOU (ERRADO)');
  exception when others then r := r || jsonb_build_object('T2_sem_jwt', sqlstate);
  end;
  execute 'reset role';

  -- T3 parceiro pedindo a pasta do PARCEIRO → 42501 (só admin)
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_tit_user, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform gps.drive_provisionar_parceiro(v_aluno);
    r := r || jsonb_build_object('T3_parceiro_provisiona', 'PASSOU (ERRADO)');
  exception when others then r := r || jsonb_build_object('T3_parceiro_provisiona', sqlstate);
  end;
  execute 'reset role';

  -- T4 admin com interruptor DESLIGADO → P0001
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform gps.drive_provisionar_parceiro(v_aluno);
    r := r || jsonb_build_object('T4_desligado', 'PASSOU (ERRADO)');
  exception when others then r := r || jsonb_build_object('T4_desligado', sqlstate || ' ' || sqlerrm);
  end;
  execute 'reset role';

  update gps.config set valor = 'true' where chave = 'drive_provisionar_ativo';

  -- T5 admin enfileira; 2º clique devolve o MESMO id
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_t1 := gps.drive_provisionar_parceiro(v_aluno);
  v_t2 := gps.drive_provisionar_parceiro(v_aluno);
  select count(*) into v_n from gps.drive_tarefas where aluno_id = v_aluno;  -- RLS: admin vê
  execute 'reset role';
  r := r || jsonb_build_object('T5_idempotente', v_t1 = v_t2, 'T5_admin_le_fila', v_n);

  -- T6 parceiro: SEM raiz organizada pela equipe → P0001 (nunca provisiona);
  --    cliente de outro ambiente 42501; não lê a tabela; não insere direto
  perform set_config('request.jwt.claims', json_build_object('sub', v_tit_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform gps.drive_criar_pasta_cliente(v_cli);
    r := r || jsonb_build_object('T6_cliente_sem_raiz', 'PASSOU (ERRADO)');
  exception when others then r := r || jsonb_build_object('T6_cliente_sem_raiz', sqlstate || ' ' || sqlerrm);
  end;
  select count(*) into v_n from gps.drive_tarefas;
  r := r || jsonb_build_object('T6_parceiro_le_tabela', v_n);
  begin
    perform gps.drive_criar_pasta_cliente(v_cli_outro);
    r := r || jsonb_build_object('T6_cliente_de_outro', 'PASSOU (ERRADO)');
  exception when others then r := r || jsonb_build_object('T6_cliente_de_outro', sqlstate);
  end;
  begin
    insert into gps.drive_tarefas (tipo, aluno_id) values ('provisionar_parceiro', v_aluno);
    r := r || jsonb_build_object('T6_insert_direto', 'PASSOU (ERRADO)');
  exception when others then r := r || jsonb_build_object('T6_insert_direto', sqlstate);
  end;
  begin
    insert into gps.drive_permissoes (file_id, permission_id, email, papel, aluno_id)
    values ('XXXXXXXXXXXXXXXX', 'P1', 'a@b.co', 'reader', v_aluno);
    r := r || jsonb_build_object('T6_insert_perm_direto', 'PASSOU (ERRADO)');
  exception when others then r := r || jsonb_build_object('T6_insert_perm_direto', sqlstate);
  end;
  if v_cli_link is not null then
    begin
      perform gps.drive_criar_pasta_cliente(v_cli_link);
      r := r || jsonb_build_object('T6_cliente_com_link', 'PASSOU (ERRADO)');
    exception when others then r := r || jsonb_build_object('T6_cliente_com_link', sqlstate || ' ' || sqlerrm);
    end;
  end if;
  begin
    perform gps.drive_estado(v_aluno, v_cli_outro);
    r := r || jsonb_build_object('T6_estado_cliente_de_outro', 'PASSOU (ERRADO)');
  exception when others then r := r || jsonb_build_object('T6_estado_cliente_de_outro', sqlstate);
  end;
  execute 'reset role';

  -- T7 edge (service_role): pega a tarefa do parceiro; registra raiz, CLIENTES,
  -- grava link (origem equipe: o ambiente não tinha link), registra permissão
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  v_j := gps.drive_tarefa_pegar(3);
  r := r || jsonb_build_object('T7_pegou', jsonb_array_length(v_j),
                               'T7_tipo', v_j->0->>'tipo',
                               'T7_origem', v_j->0->>'pasta_drive_origem',
                               'T7_solicitado_por_admin', v_j->0->'solicitado_por_admin',
                               'T7_tem_email', (v_j->0->>'titular_email') is not null,
                               'T7_segunda_pegada', jsonb_array_length(gps.drive_tarefa_pegar(3)));
  perform gps.drive_pasta_registrar(v_t1, 'TESTE_FILE_ID_0001', 'raiz_parceiro', 'Teste — Implementação Assistida', false);
  perform gps.drive_pasta_registrar(v_t1, 'TESTE_FILE_ID_0003', 'clientes', '5) CLIENTES', false);
  begin
    perform gps.drive_parceiro_link_gravar(v_t1, 'OUTRO_FILE_ID_0002');
    r := r || jsonb_build_object('T7_link_de_pasta_nao_registrada', 'PASSOU (ERRADO)');
  exception when others then r := r || jsonb_build_object('T7_link_de_pasta_nao_registrada', sqlstate);
  end;
  v_url := gps.drive_parceiro_link_gravar(v_t1, 'TESTE_FILE_ID_0001');
  perform gps.drive_permissao_registrar(v_t1, 'TESTE_FILE_ID_0001', 'PERMTESTE01', v_tit_email, 'reader');
  perform gps.drive_permissao_registrar(v_t1, 'TESTE_FILE_ID_0003', 'PERMTESTE02', v_tit_email, 'writer');
  begin
    perform gps.drive_permissao_registrar(v_t1, 'OUTRO_FILE_ID_0002', 'PERMTESTE09', v_tit_email, 'writer');
    r := r || jsonb_build_object('T7_perm_em_pasta_nao_registrada', 'PASSOU (ERRADO)');
  exception when others then r := r || jsonb_build_object('T7_perm_em_pasta_nao_registrada', sqlstate);
  end;
  perform gps.drive_tarefa_concluir(v_t1, 'feito', null, null, 'email_nao_google');
  begin
    select count(*) into v_n from gps.drive_tarefas;
    r := r || jsonb_build_object('T7_srv_le_tabela', 'PASSOU (ERRADO)');
  exception when others then r := r || jsonb_build_object('T7_srv_le_tabela', sqlstate);
  end;
  execute 'reset role';

  select jsonb_build_object('url', a.pasta_drive_url, 'origem', a.pasta_drive_origem,
                            'por_nome', a.pasta_drive_por_nome, 'check_ok', a.pasta_drive_url = v_url)
    into v_j from gps.ambientes a where a.aluno_id = v_aluno;
  r := r || jsonb_build_object('T7_ambiente', v_j);
  select jsonb_build_object('estado', estado, 'aviso', aviso, 'concluido', concluido_em is not null)
    into v_j from gps.drive_tarefas where id = v_t1;
  r := r || jsonb_build_object('T7_tarefa', v_j);
  select jsonb_agg(jsonb_build_object('perm', permission_id, 'user_ok', user_id = v_tit_user,
                                      'marcada', revogar_desde is not null) order by permission_id)
    into v_j from gps.drive_permissoes where aluno_id = v_aluno;
  r := r || jsonb_build_object('T7_permissoes', v_j);

  -- T9 agora com raiz organizada: parceiro enfileira o cliente; teto 20/24 h
  perform set_config('request.jwt.claims', json_build_object('sub', v_tit_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_t3 := gps.drive_criar_pasta_cliente(v_cli);
  v_j := gps.drive_estado(v_aluno, v_cli);
  execute 'reset role';
  r := r || jsonb_build_object('T9_parceiro_cliente_proprio', v_t3 is not null,
                               'T9_estado_parceiro', v_j);
  insert into gps.drive_tarefas (tipo, aluno_id, cliente_id, estado, concluido_em)
  select 'criar_pasta_cliente', v_aluno, v_cli, 'feito', now() from generate_series(1, 19);
  update gps.drive_tarefas set estado = 'feito' where id = v_t3;   -- libera o "uma ativa por cliente"
  perform set_config('request.jwt.claims', json_build_object('sub', v_tit_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform gps.drive_criar_pasta_cliente(v_cli);
    r := r || jsonb_build_object('T9_vigesima_primeira', 'PASSOU (ERRADO)');
  exception when others then r := r || jsonb_build_object('T9_vigesima_primeira', sqlstate || ' ' || sqlerrm);
  end;
  execute 'reset role';

  -- T8 teto de retentativas: abandonada com 3 falhas → a 4ª vira erro
  update gps.drive_tarefas set estado = 'rodando', iniciado_em = now() - interval '11 minutes', tentativas = 3 where id = v_t3;
  perform gps.drive_varrer();
  select jsonb_build_object('estado', estado, 'tentativas', tentativas, 'erro', erro) into v_j
    from gps.drive_tarefas where id = v_t3;
  r := r || jsonb_build_object('T8_abandonada_4a_vira_erro', v_j);

  -- T13 e-mail trocado FORA do painel (updateUser/outro portal): simulado
  --     deixando a permissão com e-mail diferente do atual do titular. Ao
  --     pegar o 'compartilhar', o banco marca e enfileira a revogação.
  update gps.drive_permissoes set email = 'antigo.prova@exemplo.com'
   where aluno_id = v_aluno and permission_id = 'PERMTESTE02';
  delete from gps.drive_tarefas where tipo = 'revogar';
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_t2 := gps.drive_provisionar_parceiro(v_aluno);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  v_j := gps.drive_tarefa_pegar(3);
  execute 'reset role';
  select jsonb_build_object(
           'tipo_pego', v_j->0->>'tipo',
           'marcada_02', (select revogar_motivo from gps.drive_permissoes where aluno_id = v_aluno and permission_id = 'PERMTESTE02'),
           'intacta_01', (select revogar_desde is null from gps.drive_permissoes where aluno_id = v_aluno and permission_id = 'PERMTESTE01'),
           'revogar_pendente', (select count(*) from gps.drive_tarefas where tipo = 'revogar' and estado = 'pendente'))
    into v_j;
  r := r || jsonb_build_object('T13_email_trocado_fora_do_painel', v_j);
  update gps.drive_tarefas set estado = 'feito' where id = v_t2;

  -- T10 kirad: A (v_aluno_b agora faz papel de A) cola o link da pasta de B
  --     (v_aluno, já organizada: TESTE_FILE_ID_0001). Origem 'parceiro'.
  update gps.ambientes
     set pasta_drive_url = 'https://drive.google.com/drive/folders/TESTE_FILE_ID_0001',
         pasta_drive_origem = 'parceiro', pasta_drive_por_nome = 'Parceiro A'
   where aluno_id = v_aluno_b;
  delete from gps.drive_pastas where aluno_id = v_aluno_b;
  -- A pede pasta de cliente sem raiz organizada → P0001 (não provisiona)
  select c.id into v_cli_outro from gps.etapa1_clientes c
   where c.aluno_id = v_aluno_b
     and not exists (select 1 from gps.cliente_links_drive l where l.cliente_id = c.id and l.removido_em is null)
   limit 1;
  if v_cli_outro is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform gps.drive_criar_pasta_cliente(v_cli_outro);
      r := r || jsonb_build_object('T10_A_cliente_sem_raiz', 'PASSOU (ERRADO)');
    exception when others then r := r || jsonb_build_object('T10_A_cliente_sem_raiz', sqlstate || ' ' || sqlerrm);
    end;
    execute 'reset role';
  end if;
  -- equipe provisiona A; a edge tenta adotar a pasta de B → o banco recusa
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_tb := gps.drive_provisionar_parceiro(v_aluno_b);
  execute 'reset role';
  update gps.drive_tarefas set estado = 'rodando', iniciado_em = now() where id = v_tb;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  begin
    perform gps.drive_pasta_registrar(v_tb, 'TESTE_FILE_ID_0001', 'raiz_parceiro', 'Pasta de B', true);
    r := r || jsonb_build_object('T10_adotar_pasta_registrada_de_B', 'PASSOU (ERRADO)');
  exception when others then r := r || jsonb_build_object('T10_adotar_pasta_registrada_de_B', sqlstate || ' ' || sqlerrm);
  end;
  -- pasta manual de B (não registrada), no link de B: link de OUTRO ambiente
  execute 'reset role';
  update gps.ambientes set pasta_drive_url = 'https://drive.google.com/drive/folders/MANUAL_B_PASTA_01'
   where aluno_id = v_aluno;
  update gps.ambientes set pasta_drive_url = 'https://drive.google.com/drive/folders/MANUAL_B_PASTA_01',
                           pasta_drive_origem = 'equipe'
   where aluno_id = v_aluno_b;
  execute 'set local role service_role';
  begin
    perform gps.drive_pasta_registrar(v_tb, 'MANUAL_B_PASTA_01', 'raiz_parceiro', 'Pasta manual de B', true);
    r := r || jsonb_build_object('T10_adotar_link_de_outro_ambiente', 'PASSOU (ERRADO)');
  exception when others then r := r || jsonb_build_object('T10_adotar_link_de_outro_ambiente', sqlstate || ' ' || sqlerrm);
  end;
  begin
    perform gps.drive_pasta_registrar(v_tb, '1T-EiOQWQgu_qXK8rtbr7BzByNW_jzm3L', 'raiz_parceiro', 'Matriz', true);
    r := r || jsonb_build_object('T10_adotar_matriz', 'PASSOU (ERRADO)');
  exception when others then r := r || jsonb_build_object('T10_adotar_matriz', sqlstate || ' ' || sqlerrm);
  end;
  -- 0 shares: sem pasta registrada para A, nenhuma permissão é aceita
  begin
    perform gps.drive_permissao_registrar(v_tb, 'TESTE_FILE_ID_0001', 'PERMTESTE77', 'a@b.co', 'reader');
    r := r || jsonb_build_object('T10_permissao_em_pasta_de_B', 'PASSOU (ERRADO)');
  exception when others then r := r || jsonb_build_object('T10_permissao_em_pasta_de_B', sqlstate);
  end;
  execute 'reset role';
  -- origem 'parceiro' + adoção (pasta própria fora de qualquer outro link): recusa
  update gps.ambientes set pasta_drive_url = 'https://drive.google.com/drive/folders/PASTA_SO_DE_A_001',
                           pasta_drive_origem = 'parceiro'
   where aluno_id = v_aluno_b;
  execute 'set local role service_role';
  begin
    perform gps.drive_pasta_registrar(v_tb, 'PASTA_SO_DE_A_001', 'raiz_parceiro', 'Colada pelo parceiro', true);
    r := r || jsonb_build_object('T10_adotar_origem_parceiro', 'PASSOU (ERRADO)');
  exception when others then r := r || jsonb_build_object('T10_adotar_origem_parceiro', sqlstate || ' ' || sqlerrm);
  end;
  -- T11 pasta criada pelo sistema (não adotada) cujo link o parceiro colou:
  --     grava o espelho, mas o link e a origem 'parceiro' ficam intactos
  perform gps.drive_pasta_registrar(v_tb, 'PASTA_SO_DE_A_001', 'raiz_parceiro', 'Criada pelo sistema', false);
  v_url := gps.drive_parceiro_link_gravar(v_tb, 'PASTA_SO_DE_A_001');
  execute 'reset role';
  select jsonb_build_object('origem', a.pasta_drive_origem, 'por_nome', a.pasta_drive_por_nome,
                            'url_igual', a.pasta_drive_url = v_url)
    into v_j from gps.ambientes a where a.aluno_id = v_aluno_b;
  r := r || jsonb_build_object('T11_origem_parceiro_mantida', v_j);
  select count(*) into v_n from gps.drive_permissoes where aluno_id = v_aluno_b;
  r := r || jsonb_build_object('T10_permissoes_de_A', v_n);

  -- T12 revogar enfileirado pelos gatilhos
  --   a) troca de e-mail do login (log 'email_login_alterado') marca as 2
  delete from gps.drive_tarefas where tipo = 'revogar';
  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, detalhe, feito_por)
  values ('email_login_alterado', v_aluno, v_tit_user, 'novo.email.prova@exemplo.com', 'prova 347', v_admin);
  select jsonb_build_object(
           'marcadas', (select count(*) from gps.drive_permissoes
                         where aluno_id = v_aluno and revogar_motivo = 'email_trocado'),
           'revogar_pendente', (select count(*) from gps.drive_tarefas
                                 where tipo = 'revogar' and estado = 'pendente' and aluno_id is null))
    into v_j;
  r := r || jsonb_build_object('T12a_email_trocado', v_j);
  --   b) troca de titular (titular vira sócio): permissão nova também marcada,
  --      e continua UMA revogar pendente
  update gps.drive_permissoes set revogar_desde = null, revogar_motivo = null where aluno_id = v_aluno;
  update gps.membros set papel = 'socio' where id = v_tit_mid;
  select jsonb_build_object(
           'marcadas', (select count(*) from gps.drive_permissoes
                         where aluno_id = v_aluno and revogar_motivo = 'titular_trocado'),
           'revogar_pendente', (select count(*) from gps.drive_tarefas
                                 where tipo = 'revogar' and estado = 'pendente'))
    into v_j;
  r := r || jsonb_build_object('T12b_titular_trocado', v_j);
  --   c) a edge pega a revogar, lista (só file_id/permission_id) e conclui um item
  select id into v_trev from gps.drive_tarefas where tipo = 'revogar' and estado = 'pendente';
  update gps.drive_tarefas set estado = 'feito' where estado = 'pendente' and id <> v_trev;
  execute 'set local role service_role';
  v_j := gps.drive_tarefa_pegar(3);
  r := r || jsonb_build_object('T12c_pegou_revogar', v_j->0->>'tipo', 'T12c_aluno_nulo', (v_j->0->>'aluno_id') is null);
  v_j := gps.drive_revogacoes_listar(v_trev, 50);
  r := r || jsonb_build_object('T12c_itens', jsonb_array_length(v_j),
                               'T12c_sem_email', not (v_j->0 ? 'email'));
  perform gps.drive_revogacao_resultado(v_trev, (v_j->0->>'id')::uuid, 'revogada', null);
  perform gps.drive_revogacao_resultado(v_trev, (v_j->1->>'id')::uuid, 'transitorio', 'prova');
  perform gps.drive_tarefa_concluir(v_trev, 'transitorio', null, 'prova', null);
  execute 'reset role';
  select jsonb_build_object(
           'revogadas', (select count(*) from gps.drive_permissoes where aluno_id = v_aluno and revogado_em is not null),
           'pendentes', (select count(*) from gps.drive_permissoes where aluno_id = v_aluno and revogado_em is null and revogar_desde is not null),
           'tarefa', (select estado || '/' || tentativas from gps.drive_tarefas where id = v_trev))
    into v_j;
  r := r || jsonb_build_object('T12c_resultado', v_j);
  --   d) a revogar não morre no CASCADE de admin_excluir_acesso: aluno_id
  --      nulo (CHECK) e drive_permissoes sem FK para gps.ambientes
  select jsonb_build_object(
           'revogar_com_aluno', (select count(*) from gps.drive_tarefas where tipo = 'revogar' and aluno_id is not null),
           'fks_de_permissoes', (select count(*) from pg_constraint
                                  where conrelid = 'gps.drive_permissoes'::regclass and contype = 'f'))
    into v_j;
  r := r || jsonb_build_object('T12d_sobrevive_ao_cascade', v_j);

  -- T14 acessos_log sem escrita direta para authenticated/anon/PUBLIC
  r := r || jsonb_build_object('T14_acessos_log', jsonb_build_object(
    'auth_select', has_table_privilege('authenticated', 'gps.acessos_log', 'select'),
    'auth_insert', has_table_privilege('authenticated', 'gps.acessos_log', 'insert'),
    'auth_update', has_table_privilege('authenticated', 'gps.acessos_log', 'update'),
    'auth_delete', has_table_privilege('authenticated', 'gps.acessos_log', 'delete'),
    'anon_insert', has_table_privilege('anon', 'gps.acessos_log', 'insert')));

  -- T15 falha ao marcar a revogação NÃO desfaz a escrita em gps.membros:
  --     um CHECK provisório (desfeito no fim) faz a marcação falhar com 23514
  update gps.membros set papel = 'titular' where id = v_tit_mid;
  update gps.drive_permissoes set revogar_desde = null, revogar_motivo = null
   where aluno_id = v_aluno and permission_id = 'PERMTESTE02';
  alter table gps.drive_permissoes
    add constraint prova_t15_quebra check (revogar_desde is null) not valid;
  begin
    update gps.membros set papel = 'socio' where id = v_tit_mid;
    r := r || jsonb_build_object('T15_membros_atualizado_mesmo_com_falha',
      (select papel from gps.membros where id = v_tit_mid),
      'T15_permissao_nao_marcada',
      (select revogar_desde is null from gps.drive_permissoes
        where aluno_id = v_aluno and permission_id = 'PERMTESTE02'));
  exception when others then
    r := r || jsonb_build_object('T15_membros_atualizado_mesmo_com_falha', 'ABORTOU (ERRADO) ' || sqlstate);
  end;

  raise exception 'PROVA_347 %', r::text;
end
$prova$;
-- Esperado (resumo):
--   T1_funcoes: anon=false em todas; auth=true SÓ em drive_provisionar_parceiro,
--     drive_criar_pasta_cliente, drive_estado; srv=true SÓ nas 8 da edge
--     (pegar, registrar, parceiro_link_gravar, cliente_link_gravar, concluir,
--     permissao_registrar, revogacoes_listar, revogacao_resultado); as internas
--     (ativo, segredo, chamar, varrer, revogar_enfileirar, revogar_marcar,
--     membros_revogar, email_trocado_revogar) false nos três.
--   T1_tabelas: auth_select=true, insert/update/delete=false (tarefas, pastas,
--     permissoes), anon=false, srv_select=false, rls=true, 2 gatilhos, cron=1,
--     ativo_nasce='false'.
--   T2 42501 · T3 42501 · T4 'P0001 A criação automática de pastas está desligada.'
--   T5 idempotente=true · T6 cliente_sem_raiz='P0001 A pasta do parceiro ainda
--     não foi organizada pela equipe.', parceiro_le_tabela=0, de outro=42501,
--     insert_direto=42501, insert_perm_direto=42501, com link=P0001
--   T7 pegou=1, origem=null, solicitado_por_admin=true, segunda_pegada=0,
--     link de pasta não registrada 22023, perm em pasta não registrada 22023,
--     srv_le_tabela 42501, ambiente origem 'equipe' por_nome 'Equipe',
--     tarefa feito + aviso, 2 permissões com user_ok=true e marcada=false
--   T9 cliente_proprio=true; estado cliente.estado='pendente', sem erro_detalhe; 21ª →
--     'P0001 Limite de 20 pastas de cliente por dia atingido. Tente de novo amanhã.'
--   T8 estado 'erro', tentativas 4
--   T10 A_cliente_sem_raiz P0001 (não organizada); adotar_pasta_registrada_de_B
--     'P0001 Esta pasta já pertence a outro parceiro.'; link_de_outro_ambiente
--     idem; matriz 'P0001 Esta pasta não pode ser usada…'; permissao_em_pasta_de_B
--     22023; origem_parceiro 'P0001 A pasta ligada a este parceiro precisa ser
--     conferida…'; permissoes_de_A = 0
--   T11 origem='parceiro', por_nome='Parceiro A', url_igual=true
--   T12a marcadas=2, revogar_pendente=1 · T12b marcadas=2, revogar_pendente=1
--   T12c pegou 'revogar', aluno_nulo=true, itens=2, sem_email=true;
--     revogadas=1, pendentes=1, tarefa 'pendente/1'
--   T12d revogar_com_aluno=0, fks_de_permissoes=0
--   T13 tipo_pego='compartilhar', marcada_02='email_trocado', intacta_01=true,
--     revogar_pendente=1
--   T14 auth_select=true; auth_insert/update/delete=false; anon_insert=false
--   T15 'socio', permissao_nao_marcada=true (o gatilho só emite WARNING
--     "drive: revogacao nao marcada (23514)")


-- ── B. EXPLAIN (protocolo de sustentabilidade) ─────────────────────────────
-- B1 caminho quente do cron (1×/min): espera Index Scan em drive_tarefas_fila_idx
--    (com tabela pequena o planner pode preferir Seq Scan — conferir Rows Removed).
explain (analyze, buffers)
select 1 from gps.drive_tarefas
 where estado = 'pendente' and proxima_em <= now()
 limit 1;

-- B2 leitura da tela (gps.drive_estado, ramo do parceiro): drive_tarefas_aluno_idx
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

-- B4 candidatas do pegar (mesmo predicado da função, com "is not distinct from")
explain (analyze, buffers)
select distinct on (t.aluno_id) t.id, t.proxima_em
  from gps.drive_tarefas t
 where t.estado = 'pendente'
   and t.proxima_em <= now()
   and not exists (select 1 from gps.drive_tarefas r
                    where r.aluno_id is not distinct from t.aluno_id and r.estado = 'rodando')
 order by t.aluno_id, t.proxima_em;

-- B5 UPDATE da varredura — EXECUTA o update: SÓ dentro de begin/rollback.
begin;
set local statement_timeout = '20s';
explain (analyze, buffers)
update gps.drive_tarefas t
   set tentativas = t.tentativas + 1,
       estado = case when t.tentativas + 1 >= 4 then 'erro' else 'pendente' end,
       proxima_em = now()
 where t.estado = 'rodando'
   and t.iniciado_em < now() - interval '10 minutes';
rollback;

-- B6 teto diário de drive_criar_pasta_cliente: drive_tarefas_aluno_idx
explain (analyze, buffers)
select count(*) from gps.drive_tarefas t
 where t.aluno_id = (select aluno_id from gps.ambientes limit 1)
   and t.criado_em >= now() - interval '24 hours'
   and t.tipo = 'criar_pasta_cliente';

-- B7 marcação pelos gatilhos (roda dentro de admin_trocar_titular /
--    admin_excluir_acesso): espera Index Scan em drive_permissoes_dono_idx.
--    É UPDATE: SÓ dentro de begin/rollback.
begin;
set local statement_timeout = '20s';
explain (analyze, buffers)
update gps.drive_permissoes p
   set revogar_desde = now(), revogar_motivo = 'titular_trocado'
 where p.aluno_id = (select aluno_id from gps.ambientes limit 1)
   and p.user_id = (select user_id from gps.membros where papel = 'titular' and user_id is not null limit 1)
   and p.revogado_em is null
   and p.revogar_desde is null;
rollback;

-- B8 gatilho de gps.membros não pesa no caminho de quem não é titular:
--    o WHEN (old.papel = 'titular' ...) corta antes de chamar a função.
--    Medir um UPDATE de sócio sem efeito, em begin/rollback.
begin;
set local statement_timeout = '20s';
explain (analyze, buffers)
update gps.membros set papel = papel
 where id = (select id from gps.membros where papel = 'socio' limit 1);
rollback;
