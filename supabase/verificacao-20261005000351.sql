-- ═══════════════════════════════════════════════════════════════════════════
-- Provas da 20261005000351_gps_drive_ajustes_fase2 — rodar DEPOIS de aplicar.
-- Nada persiste: o bloco A termina em RAISE. 🔴 T3/T4 chamam
-- gps.admin_excluir_acesso de verdade em DOIS ambientes reais: só é seguro
-- porque o RAISE final desfaz tudo. NÃO trocar o RAISE por commit.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── A. Pai do mesmo lote, nome apagado, dois blocos no gatilho ─────────────
do $prova$
declare
  r        jsonb := '{}'::jsonb;
  v_admin  uuid;
  v_a1     uuid;
  v_a2     uuid;
  v_cli    uuid;
  v_tok    text;
begin
  set local lock_timeout = '2s';
  set local statement_timeout = '30s';

  select p.id into v_admin from public.perfis p
   where p.status = 'ativo' and p.cargo in ('dev', 'admin') limit 1;
  select m.aluno_id into v_a1 from gps.membros m
   where m.papel = 'titular' and m.user_id is not null
     and not exists (select 1 from public.perfis p where p.id = m.user_id)
   order by m.aluno_id limit 1;
  select m.aluno_id into v_a2 from gps.membros m
   where m.papel = 'titular' and m.user_id is not null and m.aluno_id <> v_a1
     and not exists (select 1 from public.perfis p where p.id = m.user_id)
   order by m.aluno_id limit 1;
  insert into gps.etapa1_clientes (aluno_id, nome) values (v_a1, 'T351 CLIENTE') returning id into v_cli;

  -- T0 superfície
  r := r || jsonb_build_object('T0', jsonb_build_object(
    'ids', v_admin is not null and v_a1 is not null and v_a2 is not null,
    'aplicar_auth', has_function_privilege('authenticated', 'gps.drive_atividade_aplicar(jsonb, text, text, text)', 'execute'),
    'aplicar_srv',  has_function_privilege('service_role', 'gps.drive_atividade_aplicar(jsonb, text, text, text)', 'execute'),
    'amb_auth',     has_function_privilege('authenticated', 'gps.drive_ambiente_arquivar()', 'execute'),
    'nome_checks',  (select jsonb_agg(conname order by conname) from pg_constraint
                      where conrelid = 'gps.drive_arquivos'::regclass and conname like 'drive_arquivos_nome%'),
    'removidos_com_nome', (select count(*) from gps.drive_arquivos where removido and nome is not null)));

  -- Árvore: raiz + 03 do cliente; pasta F do usuário dentro da 03
  insert into gps.drive_pastas (file_id, aluno_id, cliente_id, papel, nome) values
    ('T351_RAIZ_CLI_01', v_a1, v_cli, 'raiz_cliente', 'Cliente T351'),
    ('T351_S03_CLI_001', v_a1, v_cli, 'sub_cliente',  '03 Minutas');
  update gps.config set valor = 'true' where chave = 'drive_atividade_ativo';
  select page_token into v_tok from gps.drive_cursor;
  execute 'set local role service_role';
  perform gps.drive_atividade_aplicar(jsonb_build_array(
    jsonb_build_object('file_id', 'T351_F_PASTA_001', 'parent_id', 'T351_S03_CLI_001', 'nome', 'Pasta F', 'mime', 'application/vnd.google-apps.folder', 'eh_pasta', true, 'modificado_em', '2026-10-05T10:00:00Z', 'removed', false, 'trashed', false),
    jsonb_build_object('file_id', 'T351_Y_ARQ_00001', 'parent_id', 'T351_F_PASTA_001', 'nome', 'Y antigo.pdf', 'mime', 'application/pdf', 'eh_pasta', false, 'modificado_em', '2026-10-05T10:00:00Z', 'removed', false, 'trashed', false)
  ), v_tok, 'T351_TOK1');

  -- T1 (kirad 1) lote com X ANTES de F: F sai da árvore, X criado em F
  r := r || jsonb_build_object('T1_aplicar', gps.drive_atividade_aplicar(jsonb_build_array(
    jsonb_build_object('file_id', 'T351_X_ARQ_00001', 'parent_id', 'T351_F_PASTA_001', 'nome', 'X pessoal.pdf', 'mime', 'application/pdf', 'eh_pasta', false, 'modificado_em', '2026-10-05T11:00:00Z', 'removed', false, 'trashed', false),
    jsonb_build_object('file_id', 'T351_F_PASTA_001', 'parent_id', 'T351_FORA_ARVORE', 'nome', 'Pasta F', 'mime', 'application/vnd.google-apps.folder', 'eh_pasta', true, 'modificado_em', '2026-10-05T11:00:00Z', 'removed', false, 'trashed', false)
  ), 'T351_TOK1', 'T351_TOK2'));
  execute 'reset role';
  r := r || jsonb_build_object('T1_linhas', (select coalesce(jsonb_object_agg(file_id, jsonb_build_object(
                                                'removido', removido, 'nome', coalesce(nome, 'NULO'))), '{}'::jsonb)
                                               from gps.drive_arquivos where file_id like 'T351_%'));

  -- T2 nome null não pode existir em item vivo
  begin
    update gps.drive_arquivos set removido = false, removido_em = null where file_id = 'T351_F_PASTA_001';
    r := r || jsonb_build_object('T2_vivo_sem_nome', 'PASSOU (ERRADO)');
  exception when others then r := r || jsonb_build_object('T2_vivo_sem_nome', sqlstate);
  end;

  -- Permissões que SÓ o gatilho do ambiente marca (user_id que não é titular)
  insert into gps.drive_permissoes (file_id, permission_id, email, papel, aluno_id, user_id) values
    ('T351_RAIZ_PAR_01', 'T351PERM1', 'x@exemplo.com', 'reader', v_a1, gen_random_uuid()),
    ('T351_RAIZ_PAR_02', 'T351PERM2', 'y@exemplo.com', 'reader', v_a2, gen_random_uuid());
  insert into gps.drive_pastas (file_id, aluno_id, papel, nome) values
    ('T351_RAIZ_PAR_01', v_a1, 'raiz_parceiro', 'Parceiro 1'),
    ('T351_RAIZ_PAR_02', v_a2, 'raiz_parceiro', 'Parceiro 2')
  on conflict do nothing;
  -- (se o ambiente já tinha raiz_parceiro, a de prova não entra; a prova lê
  --  a raiz real pelo origem_aluno_id)

  -- T3 (kirad 2) arquivar FALHA → exclusão passa E a revogação é marcada
  alter table gps.drive_tarefas add constraint t351_falha_arquivar check (tipo <> 'arquivar') not valid;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform gps.admin_excluir_acesso(v_a1, true);
    r := r || jsonb_build_object('T3_excluir', 'ok');
  exception when others then r := r || jsonb_build_object('T3_excluir', 'BLOQUEOU ' || sqlstate || ' ' || sqlerrm);
  end;
  execute 'reset role';
  alter table gps.drive_tarefas drop constraint t351_falha_arquivar;
  r := r || jsonb_build_object('T3_estado', jsonb_build_object(
    'ambiente_existe', exists (select 1 from gps.ambientes where aluno_id = v_a1),
    'tarefa_arquivar', (select count(*) from gps.drive_tarefas where tipo = 'arquivar' and origem_aluno_id = v_a1),
    'perm_marcada', (select revogar_desde is not null from gps.drive_permissoes where permission_id = 'T351PERM1')));

  -- T4 revogação FALHA → exclusão passa E o arquivar é enfileirado
  alter table gps.drive_permissoes add constraint t351_falha_revogar check (revogar_desde is null) not valid;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform gps.admin_excluir_acesso(v_a2, true);
    r := r || jsonb_build_object('T4_excluir', 'ok');
  exception when others then r := r || jsonb_build_object('T4_excluir', 'BLOQUEOU ' || sqlstate || ' ' || sqlerrm);
  end;
  execute 'reset role';
  alter table gps.drive_permissoes drop constraint t351_falha_revogar;
  r := r || jsonb_build_object('T4_estado', jsonb_build_object(
    'ambiente_existe', exists (select 1 from gps.ambientes where aluno_id = v_a2),
    'tarefa_arquivar', (select count(*) from gps.drive_tarefas where tipo = 'arquivar' and estado = 'pendente' and origem_aluno_id = v_a2),
    'perm_marcada', (select revogar_desde is not null from gps.drive_permissoes where permission_id = 'T351PERM2')));

  raise exception 'PROVA_351 %', r::text;
end
$prova$;
-- Esperado:
--   T0 ids=true; aplicar_auth=false aplicar_srv=true; amb_auth=false;
--      nome_checks ["drive_arquivos_nome_check","drive_arquivos_nome_removido"];
--      removidos_com_nome 0.
--   T1 aplicar gravados 0 removidos 1 descartados 1 passadas 2 (X esperou F;
--      F saiu; X, já sem pai vivo, foi descartado). Linhas: F removido=true
--      nome NULO · Y (filho antigo de F) removido=true nome NULO · X AUSENTE.
--   T2 vivo_sem_nome 23514.
--   T3 excluir 'ok'; ambiente_existe=false; tarefa_arquivar 0; perm_marcada=true.
--   T4 excluir 'ok'; ambiente_existe=false; tarefa_arquivar 1; perm_marcada=false.


-- ── B. EXPLAIN do aplicar com 1000 itens (custo do v_feitos) ───────────────
begin;
set local statement_timeout = '120s';
set local lock_timeout = '2s';

insert into gps.drive_pastas (file_id, aluno_id, cliente_id, papel, nome)
select 'SEEDS' || md5(c.id::text || '03'), c.aluno_id, c.id, 'sub_cliente', '03 Minutas'
  from gps.etapa1_clientes c join gps.ambientes a on a.aluno_id = c.aluno_id
on conflict do nothing;
update gps.config set valor = 'true' where chave = 'drive_atividade_ativo';
update gps.drive_cursor set page_token = 'B0', rodando_desde = null;

-- 500 pastas novas + 500 arquivos, cada arquivo ANTES da sua pasta (pior caso:
-- todos esperam uma passada).
create temp table b_lote on commit drop as
select jsonb_agg(x.item order by x.ord) as itens
  from (select g * 2 - 1 as ord, jsonb_build_object(
               'file_id', 'SEEDX' || md5(g::text), 'parent_id', 'SEEDF' || md5(g::text),
               'nome', 'arq ' || g, 'mime', 'application/pdf', 'eh_pasta', false,
               'modificado_em', '2026-10-05T12:00:00Z', 'removed', false, 'trashed', false) as item
          from generate_series(1, 500) g
        union all
        select g * 2, jsonb_build_object(
               'file_id', 'SEEDF' || md5(g::text), 'parent_id', s.file_id,
               'nome', 'pasta ' || g, 'mime', 'application/vnd.google-apps.folder', 'eh_pasta', true,
               'modificado_em', '2026-10-05T12:00:00Z', 'removed', false, 'trashed', false)
          from generate_series(1, 500) g
          join (select file_id, row_number() over (order by file_id) - 1 as n
                  from gps.drive_pastas where file_id like 'SEEDS%' limit 50) s on s.n = g % 50) x;
grant select on b_lote to service_role;

set local role service_role;
explain (analyze, buffers)
select gps.drive_atividade_aplicar((select itens from b_lote), 'B0', 'B1');
reset role;
select count(*) gravados_semente from gps.drive_arquivos where file_id like 'SEEDX%' or file_id like 'SEEDF%';

rollback;
