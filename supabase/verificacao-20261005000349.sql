-- ═══════════════════════════════════════════════════════════════════════════
-- Provas da 20261005000349_gps_drive_atividade — rodar DEPOIS de aplicar.
-- Nada persiste: o bloco A termina em RAISE (desfaz tudo, inclusive a fila do
-- pg_net) e devolve o resultado na mensagem de erro. Cliente e pastas de
-- prova são criados dentro do bloco (nenhum dado real é apagado).
-- O bloco B semeia dados (generate_series) DENTRO de begin/rollback.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── A. Guardas, RLS, cursor otimista, árvore, movido/lixeira, cascade ──────
do $prova$
declare
  r          jsonb := '{}'::jsonb;
  v_admin    uuid;
  v_tit_user uuid;
  v_aluno    uuid;
  v_aluno_b  uuid;
  v_cli      uuid;
  v_cli_b    uuid;
  v_j        jsonb;
  v_n        int;
begin
  set local lock_timeout = '2s';
  set local statement_timeout = '20s';

  select p.id into v_admin from public.perfis p
   where p.status = 'ativo' and p.cargo in ('dev', 'admin') limit 1;
  select m.user_id, m.aluno_id into v_tit_user, v_aluno
    from gps.membros m
    join gps.ambientes a on a.aluno_id = m.aluno_id
   where m.papel = 'titular' and m.user_id is not null
     and not exists (select 1 from public.perfis p where p.id = m.user_id)
   limit 1;
  select a.aluno_id into v_aluno_b from gps.ambientes a where a.aluno_id <> v_aluno limit 1;

  insert into gps.etapa1_clientes (aluno_id, nome) values (v_aluno, 'T349 CLIENTE DE TESTE A') returning id into v_cli;
  insert into gps.etapa1_clientes (aluno_id, nome) values (v_aluno_b, 'T349 CLIENTE DE TESTE B') returning id into v_cli_b;

  r := r || jsonb_build_object('P0_ids', jsonb_build_object(
    'admin', v_admin is not null, 'titular', v_tit_user is not null,
    'aluno_b', v_aluno_b is not null, 'clientes', v_cli is not null and v_cli_b is not null));

  -- T0 superfície
  r := r || jsonb_build_object('T0_superficie', jsonb_build_object(
    'pegar_anon',    has_function_privilege('anon', 'gps.drive_atividade_pegar()', 'execute'),
    'pegar_auth',    has_function_privilege('authenticated', 'gps.drive_atividade_pegar()', 'execute'),
    'pegar_srv',     has_function_privilege('service_role', 'gps.drive_atividade_pegar()', 'execute'),
    'aplicar_anon',  has_function_privilege('anon', 'gps.drive_atividade_aplicar(jsonb, text, text, text)', 'execute'),
    'aplicar_auth',  has_function_privilege('authenticated', 'gps.drive_atividade_aplicar(jsonb, text, text, text)', 'execute'),
    'aplicar_srv',   has_function_privilege('service_role', 'gps.drive_atividade_aplicar(jsonb, text, text, text)', 'execute'),
    'chamar_auth',   has_function_privilege('authenticated', 'gps.drive_atividade_chamar()', 'execute'),
    'chamar_srv',    has_function_privilege('service_role', 'gps.drive_atividade_chamar()', 'execute'),
    'ativo_auth',    has_function_privilege('authenticated', 'gps.drive_atividade_ativo()', 'execute'),
    'subchave_auth', has_function_privilege('authenticated', 'gps.drive_sub_chave(text, text)', 'execute'),
    'arq_auth_sel',  has_table_privilege('authenticated', 'gps.drive_arquivos', 'select'),
    'arq_auth_ins',  has_table_privilege('authenticated', 'gps.drive_arquivos', 'insert'),
    'arq_auth_upd',  has_table_privilege('authenticated', 'gps.drive_arquivos', 'update'),
    'arq_anon_sel',  has_table_privilege('anon', 'gps.drive_arquivos', 'select'),
    'arq_srv_sel',   has_table_privilege('service_role', 'gps.drive_arquivos', 'select'),
    'cur_auth_upd',  has_table_privilege('authenticated', 'gps.drive_cursor', 'update'),
    'view_anon',     has_table_privilege('anon', 'gps.vw_cliente_drive_atividade', 'select'),
    'view_auth',     has_table_privilege('authenticated', 'gps.vw_cliente_drive_atividade', 'select'),
    'view_invoker',  (select c.reloptions from pg_class c where c.oid = 'gps.vw_cliente_drive_atividade'::regclass),
    'rls',           (select jsonb_agg(c.relname || ':' || c.relrowsecurity) from pg_class c
                       where c.oid in ('gps.drive_arquivos'::regclass, 'gps.drive_cursor'::regclass)),
    'cron',          (select command from cron.job where jobname = 'drive-atividade'),
    'ativo_hoje',    (select valor from gps.config where chave = 'drive_atividade_ativo'),
    'cursor',        (select jsonb_build_object('linhas', count(*), 'token_nulo', bool_and(page_token is null)) from gps.drive_cursor),
    'sub_chave',     (select jsonb_object_agg(coalesce(sub_chave, 'NULO'), n)
                        from (select sub_chave, count(*) n from gps.drive_pastas
                               where papel = 'sub_cliente' group by 1) x)));

  -- T1 desligado: pegar null, aplicar P0001, chamar null
  update gps.config set valor = 'false' where chave = 'drive_atividade_ativo';
  r := r || jsonb_build_object('T1_pegar_desligado', coalesce(gps.drive_atividade_pegar()::text, 'NULL'),
                               'T1_chamar_desligado', coalesce(gps.drive_atividade_chamar()::text, 'NULL'));
  begin
    perform gps.drive_atividade_aplicar('[]'::jsonb, null, 'TOK1');
    r := r || jsonb_build_object('T1_aplicar_desligado', 'PASSOU (ERRADO)');
  exception when others then r := r || jsonb_build_object('T1_aplicar_desligado', sqlstate);
  end;
  update gps.config set valor = 'true' where chave = 'drive_atividade_ativo';
  update gps.drive_cursor set page_token = null, rodando_desde = null, ultimo_erro = null;

  -- Árvore de prova (o que a edge drive-provisionar registraria)
  insert into gps.drive_pastas (file_id, aluno_id, cliente_id, papel, nome) values
    ('T349_RAIZ_A_0001', v_aluno,   v_cli,   'raiz_cliente', 'Cliente A'),
    ('T349_S03_A_00001', v_aluno,   v_cli,   'sub_cliente',  '03 Minutas'),
    ('T349_S01P_A_0001', v_aluno,   v_cli,   'sub_cliente',  'Pessoais'),
    ('T349_RAIZ_B_0001', v_aluno_b, v_cli_b, 'raiz_cliente', 'Cliente B'),
    ('T349_S05_B_00001', v_aluno_b, v_cli_b, 'sub_cliente',  '05 Junta Comercial');
  r := r || jsonb_build_object('T1_sub_chave_gerada', (select jsonb_object_agg(file_id, coalesce(sub_chave, 'NULO'))
                                                         from gps.drive_pastas where file_id like 'T349_%'));

  -- T2 cursor: 1ª vez, trava, otimista
  execute 'set local role service_role';
  r := r || jsonb_build_object('T2_pegar_1', gps.drive_atividade_pegar(),
                               'T2_pegar_2_travado', coalesce(gps.drive_atividade_pegar()::text, 'NULL'));
  begin
    perform gps.drive_atividade_aplicar('[]'::jsonb, 'ERRADO', 'TOK1');
    r := r || jsonb_build_object('T2_token_errado', 'PASSOU (ERRADO)');
  exception when others then r := r || jsonb_build_object('T2_token_errado', sqlstate);
  end;
  r := r || jsonb_build_object('T2_primeira_vez', gps.drive_atividade_aplicar('[]'::jsonb, null, 'TOK1'));
  execute 'reset role';
  r := r || jsonb_build_object('T2_cursor', (select jsonb_build_object('token', page_token, 'solto', rodando_desde is null)
                                                from gps.drive_cursor));

  -- T3 lote: filho antes do pai, fora da árvore, pasta do sistema, e-mail no nome
  execute 'set local role service_role';
  r := r || jsonb_build_object('T3_aplicar', gps.drive_atividade_aplicar(jsonb_build_array(
    jsonb_build_object('file_id', 'T349_F2_FILHO_01', 'parent_id', 'T349_P1_PASTA_01', 'nome', 'rg.pdf', 'mime', 'application/pdf', 'eh_pasta', false, 'modificado_em', '2026-10-05T12:00:00.000Z', 'modificado_por_nome', 'Ana Souza', 'removed', false, 'trashed', false),
    jsonb_build_object('file_id', 'T349_P1_PASTA_01', 'parent_id', 'T349_S01P_A_0001', 'nome', 'Docs do pai', 'mime', 'application/vnd.google-apps.folder', 'eh_pasta', true, 'modificado_em', '2026-10-05T11:00:00Z', 'modificado_por_nome', 'Ana Souza', 'removed', false, 'trashed', false),
    jsonb_build_object('file_id', 'T349_F1_MINUTA_1', 'parent_id', 'T349_S03_A_00001', 'nome', 'minuta.docx', 'mime', 'application/msword', 'eh_pasta', false, 'modificado_em', '2026-10-05T13:00:00Z', 'modificado_por_nome', 'Maria Silva', 'removed', false, 'trashed', false),
    jsonb_build_object('file_id', 'T349_F3_FORA_001', 'parent_id', 'T349_FORA_ARVORE', 'nome', 'outro.pdf', 'mime', 'application/pdf', 'eh_pasta', false, 'modificado_em', '2026-10-05T13:00:00Z', 'modificado_por_nome', 'X', 'removed', false, 'trashed', false),
    jsonb_build_object('file_id', 'T349_F4_RAIZ_001', 'parent_id', 'T349_RAIZ_A_0001', 'nome', 'solto.pdf', 'mime', 'application/pdf', 'eh_pasta', false, 'modificado_em', 'lixo', 'modificado_por_nome', 'joao@exemplo.com', 'removed', false, 'trashed', false),
    jsonb_build_object('file_id', 'T349_S03_A_00001', 'parent_id', 'T349_RAIZ_A_0001', 'nome', '03 Minutas', 'mime', 'application/vnd.google-apps.folder', 'eh_pasta', true, 'modificado_em', '2026-10-05T13:00:00Z', 'removed', false, 'trashed', false),
    jsonb_build_object('file_id', 'T349_F5_JUNTA_01', 'parent_id', 'T349_S05_B_00001', 'nome', 'dbe.pdf', 'mime', 'application/pdf', 'eh_pasta', false, 'modificado_em', '2026-10-05T14:00:00Z', 'modificado_por_nome', 'Bruno', 'removed', false, 'trashed', false),
    jsonb_build_object('file_id', 'T349_DESCONHECID', 'nome', null, 'mime', null, 'eh_pasta', null, 'parent_id', null, 'modificado_em', null, 'modificado_por_nome', null, 'removed', true, 'trashed', false)
  ), 'TOK1', 'TOK2'));
  execute 'reset role';
  r := r || jsonb_build_object('T3_linhas', (select jsonb_object_agg(file_id, subpasta || '/' || coalesce(sub_chave, '-') || '/' || coalesce(modificado_por_nome, 'NULO'))
                                               from gps.drive_arquivos where file_id like 'T349_%'));

  -- T4 otimista (token já andou) + movido + removido só com file_id + saiu da árvore
  execute 'set local role service_role';
  begin
    perform gps.drive_atividade_aplicar('[]'::jsonb, 'TOK1', 'TOK9');
    r := r || jsonb_build_object('T4_token_velho', 'PASSOU (ERRADO)');
  exception when others then r := r || jsonb_build_object('T4_token_velho', sqlstate);
  end;
  r := r || jsonb_build_object('T4_aplicar', gps.drive_atividade_aplicar(jsonb_build_array(
    jsonb_build_object('file_id', 'T349_P1_PASTA_01', 'parent_id', 'T349_S03_A_00001', 'nome', 'Docs do pai', 'mime', 'application/vnd.google-apps.folder', 'eh_pasta', true, 'modificado_em', '2026-10-05T15:00:00Z', 'modificado_por_nome', 'Ana Souza', 'removed', false, 'trashed', false),
    jsonb_build_object('file_id', 'T349_F1_MINUTA_1', 'nome', null, 'mime', null, 'eh_pasta', null, 'parent_id', null, 'modificado_em', null, 'modificado_por_nome', null, 'removed', true, 'trashed', false),
    jsonb_build_object('file_id', 'T349_F4_RAIZ_001', 'parent_id', 'T349_FORA_ARVORE', 'nome', 'solto.pdf', 'mime', 'application/pdf', 'eh_pasta', false, 'modificado_em', '2026-10-05T15:00:00Z', 'removed', false, 'trashed', false)
  ), 'TOK2', 'TOK3'));
  execute 'reset role';
  r := r || jsonb_build_object('T4_linhas', (select jsonb_object_agg(file_id, subpasta || '/' || removido)
                                               from gps.drive_arquivos where file_id like 'T349_%'));

  -- T5 RLS e view: titular do ambiente A, admin, anon
  perform set_config('request.jwt.claims', json_build_object('sub', v_tit_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object('T5_titular_view', (select jsonb_agg(jsonb_build_object(
             'cli', case when v.cliente_id = v_cli then 'A' when v.cliente_id = v_cli_b then 'B' else 'outro' end,
             'sub', v.subpasta, 'arq', v.arquivos, 'pastas', v.pastas, 'por', v.ultima_modificacao_por,
             'alt03', v.ultima_alteracao_03_em is not null, 'sugere', v.sugere_etapa) order by v.subpasta)
             from gps.vw_cliente_drive_atividade v where v.cliente_id in (v_cli, v_cli_b)),
         'T5_titular_le_B', (select count(*) from gps.drive_arquivos a where a.cliente_id = v_cli_b));
  begin
    insert into gps.drive_arquivos (file_id, cliente_id, aluno_id, pasta_file_id, subpasta, nome, modificado_em)
    values ('T349_INSERT_DIR1', v_cli, v_aluno, 'T349_RAIZ_A_0001', 'raiz', 'x', now());
    r := r || jsonb_build_object('T5_insert_direto', 'PASSOU (ERRADO)');
  exception when others then r := r || jsonb_build_object('T5_insert_direto', sqlstate);
  end;
  begin
    perform gps.drive_atividade_aplicar('[]'::jsonb, 'TOK3', 'TOK4');
    r := r || jsonb_build_object('T5_aplicar_authenticated', 'PASSOU (ERRADO)');
  exception when others then r := r || jsonb_build_object('T5_aplicar_authenticated', sqlstate);
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object('T5_admin_B', (select jsonb_agg(v.subpasta || ':' || coalesce(v.sugere_etapa, '-'))
                                                from gps.vw_cliente_drive_atividade v where v.cliente_id = v_cli_b));
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  begin
    perform 1 from gps.vw_cliente_drive_atividade limit 1;
    r := r || jsonb_build_object('T5_anon_view', 'PASSOU (ERRADO)');
  exception when others then r := r || jsonb_build_object('T5_anon_view', sqlstate);
  end;
  execute 'reset role';
  -- etapa marcada → sugestão some
  insert into gps.cliente_trajetoria (cliente_id, etapa_codigo) values (v_cli, 'elaboracao_minutas');
  r := r || jsonb_build_object('T5_sugere_apos_marcar', (select coalesce(v.sugere_etapa, 'NULO')
                                                          from gps.vw_cliente_drive_atividade v
                                                         where v.cliente_id = v_cli and v.subpasta = '03'));

  -- T6 lixeira e restauração da pasta do usuário: a subárvore acompanha
  execute 'set local role service_role';
  perform gps.drive_atividade_aplicar(jsonb_build_array(
    jsonb_build_object('file_id', 'T349_P1_PASTA_01', 'parent_id', 'T349_S03_A_00001', 'nome', 'Docs do pai', 'mime', 'application/vnd.google-apps.folder', 'eh_pasta', true, 'modificado_em', '2026-10-05T16:00:00Z', 'removed', false, 'trashed', true)
  ), 'TOK3', 'TOK4');
  execute 'reset role';
  r := r || jsonb_build_object('T6_lixeira', (select jsonb_object_agg(file_id, removido) from gps.drive_arquivos
                                                where file_id in ('T349_P1_PASTA_01', 'T349_F2_FILHO_01')));
  execute 'set local role service_role';
  perform gps.drive_atividade_aplicar(jsonb_build_array(
    jsonb_build_object('file_id', 'T349_P1_PASTA_01', 'parent_id', 'T349_S03_A_00001', 'nome', 'Docs do pai', 'mime', 'application/vnd.google-apps.folder', 'eh_pasta', true, 'modificado_em', '2026-10-05T17:00:00Z', 'removed', false, 'trashed', false)
  ), 'TOK4', 'TOK5');
  execute 'reset role';
  r := r || jsonb_build_object('T6_restaurada', (select jsonb_object_agg(file_id, removido) from gps.drive_arquivos
                                                   where file_id in ('T349_P1_PASTA_01', 'T349_F2_FILHO_01')));

  -- T7 p_erro: grava, solta, não mexe no token
  update gps.drive_cursor set rodando_desde = now();
  execute 'set local role service_role';
  r := r || jsonb_build_object('T7_erro', gps.drive_atividade_aplicar(null, null, null, 'credencial expirou'));
  execute 'reset role';
  r := r || jsonb_build_object('T7_cursor', (select jsonb_build_object('token', page_token, 'erro', ultimo_erro,
                                                                      'solto', rodando_desde is null) from gps.drive_cursor));

  -- T8 chamar: trava viva não cutuca; solta cutuca (pg_net transacional)
  update gps.drive_cursor set rodando_desde = now();
  r := r || jsonb_build_object('T8_chamar_travado', coalesce(gps.drive_atividade_chamar()::text, 'NULL'));
  update gps.drive_cursor set rodando_desde = null;
  r := r || jsonb_build_object('T8_chamar_livre', gps.drive_atividade_chamar() is not null);

  -- T9 cascade: excluir o cliente apaga a lista de arquivos dele
  select count(*) into v_n from gps.drive_arquivos where cliente_id = v_cli;
  delete from gps.etapa1_clientes where id = v_cli;
  r := r || jsonb_build_object('T9_cascade', jsonb_build_object(
    'antes', v_n, 'depois', (select count(*) from gps.drive_arquivos where file_id like 'T349_%' and cliente_id = v_cli),
    'outro_cliente_fica', (select count(*) from gps.drive_arquivos where cliente_id = v_cli_b)));

  raise exception 'PROVA_349 %', r::text;
end
$prova$;
-- Esperado:
--   P0 tudo true.
--   T0 pegar/aplicar: anon=false auth=false srv=true; chamar auth/srv=false;
--      ativo_auth=false; subchave_auth=false; arq auth sel=true ins/upd=false;
--      arq anon sel=false; arq srv sel=false; cur auth upd=false; view anon=false
--      auth=true; view_invoker ["security_invoker=true"]; rls :true nas duas;
--      cron "select gps.drive_atividade_chamar();"; ativo_hoje 'false';
--      cursor 1 linha token_nulo=true; sub_chave: NENHUM 'NULO' (se houver,
--      subpasta renomeada antes do registro — arquivos dela são descartados).
--   T1 pegar/chamar 'NULL'; aplicar P0001; sub_chave_gerada RAIZ_A/RAIZ_B=NULO,
--      S03=03, S01P=01p, S05=05.
--   T2 pegar_1 {"page_token": null}; pegar_2 'NULL'; token_errado P0001;
--      primeira_vez gravados 0; cursor token TOK1, solto=true.
--   T3 gravados 5, removidos 0, descartados 3, passadas 2. Linhas:
--      F2 01/01p/Ana Souza · P1 01/01p/Ana Souza · F1 03/03/Maria Silva ·
--      F4 raiz/-/NULO · F5 05/05/Bruno; F3, S03 e DESCONHECID ausentes.
--   T4 token_velho P0001; aplicar gravados 1 removidos 2 descartados 0;
--      P1 03/false · F2 03/false (seguiu a pasta) · F1 03/true · F4 raiz/true · F5 05/false.
--   T5 titular vê só A: 03 arq 1 pastas 1 por 'Ana Souza' alt03 true sugere
--      elaboracao_minutas (F1 removido não conta; F2 conta); le_B 0;
--      insert_direto 42501; aplicar_authenticated 42501; admin_B ["05:junta_comercial"];
--      anon_view 42501; sugere_apos_marcar NULO.
--   T6 lixeira P1=true F2=true; restaurada P1=false F2=false.
--   T7 erro_gravado true; cursor token TOK5, erro 'credencial expirou', solto=true.
--   T8 travado 'NULL'; livre true (com segredo no Vault; sem segredo = false + warning).
--   T9 antes >= 2, depois 0, outro_cliente_fica 1.


-- ── B. EXPLAIN com dados semeados (tudo em begin/rollback) ─────────────────
begin;
set local statement_timeout = '120s';
set local lock_timeout = '2s';

-- Raiz + 03 de prova para TODO cliente de ambiente existente.
insert into gps.drive_pastas (file_id, aluno_id, cliente_id, papel, nome)
select 'SEEDR' || md5(c.id::text), c.aluno_id, c.id, 'raiz_cliente', 'Seed'
  from gps.etapa1_clientes c join gps.ambientes a on a.aluno_id = c.aluno_id
on conflict do nothing;
insert into gps.drive_pastas (file_id, aluno_id, cliente_id, papel, nome)
select 'SEEDS' || md5(c.id::text || '03'), c.aluno_id, c.id, 'sub_cliente', '03 Minutas'
  from gps.etapa1_clientes c join gps.ambientes a on a.aluno_id = c.aluno_id
on conflict do nothing;

-- 60 itens por cliente (~100k linhas), 10% removidos, 7 subpastas.
insert into gps.drive_arquivos (file_id, cliente_id, aluno_id, pasta_file_id, subpasta, sub_chave,
                                nome, mime, eh_pasta, modificado_em, modificado_por_nome, removido, removido_em)
select 'SEEDA' || md5(c.id::text || g), c.id, c.aluno_id, 'SEEDR' || md5(c.id::text),
       x.sub, case when x.sub = 'raiz' then null else x.sub end,
       'arquivo ' || g, 'application/pdf', g % 15 = 0,
       now() - (g || ' hours')::interval, 'Fulano ' || (g % 7),
       g % 10 = 0, case when g % 10 = 0 then now() end
  from gps.etapa1_clientes c
  join gps.ambientes a on a.aluno_id = c.aluno_id
 cross join generate_series(1, 60) g
 cross join lateral (select (array['raiz','01','02','03','04','05','06'])[1 + g % 7] as sub) x;

select (select count(*) from gps.drive_arquivos) arquivos,
       (select count(*) from gps.drive_pastas) pastas,
       (select count(distinct cliente_id) from gps.drive_arquivos) clientes;

update gps.config set valor = 'true' where chave = 'drive_atividade_ativo';
update gps.drive_cursor set page_token = 'B0', rodando_desde = null;

-- B1 view por cliente, como ADMIN (RLS real, security_invoker)
select set_config('request.jwt.claims',
         json_build_object('sub', (select id from public.perfis where status = 'ativo' and cargo in ('dev', 'admin') limit 1),
                           'role', 'authenticated')::text, true);
set local role authenticated;
explain (analyze, buffers)
select * from gps.vw_cliente_drive_atividade
 where cliente_id = (select cliente_id from gps.drive_arquivos limit 1);

-- B2 view .in() de 50 ids (o que a lista de clientes pede), como ADMIN
explain (analyze, buffers)
select * from gps.vw_cliente_drive_atividade
 where cliente_id = any (array(select c.id from gps.etapa1_clientes c order by c.id limit 50));
reset role;

-- B3 a mesma .in() como TITULAR (a RLS com exists por linha)
select set_config('request.jwt.claims',
         json_build_object('sub', (select m.user_id from gps.membros m
                                    where m.papel = 'titular' and m.user_id is not null
                                      and exists (select 1 from gps.etapa1_clientes c where c.aluno_id = m.aluno_id)
                                    order by (select count(*) from gps.etapa1_clientes c where c.aluno_id = m.aluno_id) desc
                                    limit 1),
                           'role', 'authenticated')::text, true);
set local role authenticated;
explain (analyze, buffers)
select * from gps.vw_cliente_drive_atividade
 where cliente_id = any (array(select c.id from gps.etapa1_clientes c where c.aluno_id = gps.aluno_atual() limit 50));
reset role;

-- B4 aplicar com 1000 itens (750 dentro da árvore, 250 fora), service_role.
-- O lote é montado ANTES (tabela temporária), para o plano medir só a RPC.
create temp table b4_lote on commit drop as
select jsonb_agg(jsonb_build_object(
         'file_id', 'SEEDN' || md5(g::text),
         'parent_id', case when g % 4 = 0 then 'FORA_DA_ARVORE_' || g else s.file_id end,
         'nome', 'novo ' || g, 'mime', 'application/pdf', 'eh_pasta', false,
         'modificado_em', '2026-10-05T12:00:00Z', 'modificado_por_nome', 'Edge',
         'removed', false, 'trashed', false)) as itens
  from generate_series(1, 1000) g
  join (select file_id, row_number() over (order by file_id) - 1 as n
          from gps.drive_pastas where file_id like 'SEEDS%' limit 50) s
    on s.n = g % 50;
grant select on b4_lote to service_role;
select jsonb_array_length(itens) itens_no_lote from b4_lote;

set local role service_role;
explain (analyze, buffers)
select gps.drive_atividade_aplicar((select itens from b4_lote), 'B0', 'B1');
reset role;

-- B5 cron (5 min): desligado e com trava = 1 leitura de config + 1 PK
explain (analyze, buffers) select gps.drive_atividade_chamar();

rollback;
