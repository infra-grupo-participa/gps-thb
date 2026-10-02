-- ============================================================
-- Verificação da 343 (gps.socio_cadastro_recusado). Aplicar DEPOIS da 338.
-- Nada persiste: SELECT puro ou begin … rollback.
-- ============================================================

-- 0. Quantos sócios já estão no laço hoje (recusados e sem pessoa)
select count(distinct m.user_id) as socios_recusados_sem_pessoa
  from gps.membros m
  join gps.acessos_log l on l.aluno_id = m.aluno_id and l.user_id_alvo = m.user_id
 where m.papel = 'socio' and m.pessoa_aluno_id is null
   and l.acao = 'socio_cadastro_preenchido' and l.detalhe like '%outra pessoa do programa%';

-- 1. EXPLAIN como o próprio sócio (função só lê). Trocar <SOCIO_USER_ID>.
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<SOCIO_USER_ID>', 'role', 'authenticated')::text, true);
set local role authenticated;
explain (analyze, buffers) select gps.socio_cadastro_recusado();
rollback;

-- 2. PROVA EM ROLLBACK. Esperado:
--   a_antes=false · a_depois_da_recusa=true (gravar com CPF de cadastro de
--   outro e-mail grava a trilha e a função passa a responder true)
--   b_titular=false · c_outro_socio=false (só responde sobre o próprio uid)
--   d_anon='42501'
begin;
do $p$
declare
  c2 text := '11144477735';
  v_amb uuid; v_tit uuid; v_u uuid := gen_random_uuid(); v_u3 uuid := gen_random_uuid();
  v_e text; v_out jsonb := '{}';
begin
  if exists (select 1 from public.thb_alunos
              where regexp_replace(coalesce(documento,''),'\D','','g') = c2) then
    raise exception 'ABORTADA: CPF de prova existe na base';
  end if;
  select m.aluno_id, m.user_id into v_amb, v_tit from gps.membros m
   where m.papel = 'titular' and m.user_id is not null limit 1;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', v_u, 'authenticated', 'authenticated',
          'prova343.a@exemplo.invalid', '', now(), now(), now(), '{"provider":"email"}', '{"origem":"prova343"}'),
         ('00000000-0000-0000-0000-000000000000', v_u3, 'authenticated', 'authenticated',
          'prova343.b@exemplo.invalid', '', now(), now(), now(), '{"provider":"email"}', '{"origem":"prova343"}');
  insert into gps.membros (aluno_id, user_id, papel) values (v_amb, v_u, 'socio'), (v_amb, v_u3, 'socio')
  on conflict (user_id) do update set aluno_id = excluded.aluno_id, papel = 'socio', pessoa_aluno_id = null;
  insert into public.thb_alunos (nome, email, documento, tipo_documento, fonte)
  values ('Terceiro 343', 'terceiro343@exemplo.invalid', c2, 'CPF', 'prova343');
  update gps.config set valor = 'true' where chave = 'socio_cadastro_obrigatorio';

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_u, 'role', 'authenticated')::text, true);
  v_out := v_out || jsonb_build_object('a_antes', gps.socio_cadastro_recusado());
  perform gps.socio_cadastro_gravar('Socio 343', c2, '', '', '', '', '', '', '', '');
  v_out := v_out || jsonb_build_object('a_depois_da_recusa', gps.socio_cadastro_recusado());

  perform set_config('request.jwt.claims', json_build_object('sub', v_tit, 'role', 'authenticated')::text, true);
  v_out := v_out || jsonb_build_object('b_titular', gps.socio_cadastro_recusado());
  perform set_config('request.jwt.claims', json_build_object('sub', v_u3, 'role', 'authenticated')::text, true);
  v_out := v_out || jsonb_build_object('c_outro_socio', gps.socio_cadastro_recusado());

  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '', true);
  begin perform gps.socio_cadastro_recusado(); v_e := 'EXECUTOU';
  exception when others then v_e := sqlstate; end;
  v_out := v_out || jsonb_build_object('d_anon', v_e);
  perform set_config('role', 'postgres', true);

  raise exception 'PROVA 343: %', v_out;
end
$p$;
rollback;

-- 3. GRANTS. Esperado: anon=f authenticated=t public=f
select has_function_privilege('anon', 'gps.socio_cadastro_recusado()', 'execute') as anon,
       has_function_privilege('authenticated', 'gps.socio_cadastro_recusado()', 'execute') as authenticated,
       has_function_privilege('public', 'gps.socio_cadastro_recusado()', 'execute') as public;
