-- ============================================================
-- Verificação da 338 (cadastro do sócio: só nome + CPF obrigatórios;
-- opcional em branco não apaga)
-- Ordem: 0) medir  1) P1–P2 do cabeçalho da 338  2) aplicar
--        3) explain  4) prova em rollback  5) grants
-- Nada aqui persiste: SELECT puro ou begin … rollback.
-- ============================================================

-- ── 0. MEDIR ANTES ─────────────────────────────────────────────────────────
select count(*) as socios_sem_pessoa
  from gps.membros where papel = 'socio' and pessoa_aluno_id is null;

-- ── 3. EXPLAIN (a gravação ESCREVE → só dentro de begin/rollback) ──────────
-- Trocar <SOCIO_USER_ID> por um sócio sem pessoa e <CPF_VALIDO_LIVRE> por um
-- CPF válido que NÃO exista em thb_alunos (o ramo de insert).
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<SOCIO_USER_ID>', 'role', 'authenticated')::text, true);
set local role authenticated;
explain (analyze, buffers)
select gps.socio_cadastro_gravar('Explain 338', '<CPF_VALIDO_LIVRE>', '', '', '', '', '', '', '', '');
rollback;

-- ── 4. PROVA EM ROLLBACK ───────────────────────────────────────────────────
-- Esperado:
--   r1_cpf_vazio = '22023: Informe o CPF.'          (CPF sempre obrigatório)
--   r2_so_nome_cpf: ok=true                          (opcionais em branco aceitos)
--   r2_nao_apagou = true  (telefone/cep/cidade/estado/bairro/endereço/número/
--                          país do cadastro existente seguem iguais)
--   r2_pessoa = true      (membro ligado ao cadastro do CPF — a linha tem o
--                          MESMO e-mail do login, a única que a regra aceita)
--   r3_tel_ruim = '22023: Telefone inválido.'        (formato vale se preenchido)
--   r4_anon = '42501'
--   r5_outro_email: ok=false, cpf_de_outro_membro=true · r5_sem_pessoa = true
--   r5_intacta = true  (a linha do terceiro — nome, telefone, endereço — igual)
begin;
do $p$
declare
  c1 text := '76467615913'; c2 text := '83401782452'; v_y uuid; v_t_antes jsonb;
  v_amb uuid; v_tit uuid; v_u uuid := gen_random_uuid(); v_u2 uuid := gen_random_uuid(); v_x uuid;
  v_e text; v_out jsonb := '{}'; v_antes jsonb; v_depois jsonb;
begin
  if exists (select 1 from public.thb_alunos
              where regexp_replace(coalesce(documento,''),'\D','','g') in (c1, c2)) then
    raise exception 'ABORTADA: CPF de prova existe na base';
  end if;

  select m.aluno_id, m.user_id into v_amb, v_tit from gps.membros m
   where m.papel = 'titular' and m.user_id is not null limit 1;

  -- sócios de prova sem pessoa
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', v_u, 'authenticated', 'authenticated',
          'prova338.a@exemplo.invalid', '', now(), now(), now(), '{"provider":"email"}', '{"origem":"prova338"}'),
         ('00000000-0000-0000-0000-000000000000', v_u2, 'authenticated', 'authenticated',
          'prova338.b@exemplo.invalid', '', now(), now(), now(), '{"provider":"email"}', '{"origem":"prova338"}');
  insert into gps.membros (aluno_id, user_id, papel) values (v_amb, v_u, 'socio'), (v_amb, v_u2, 'socio')
  on conflict (user_id) do update set aluno_id = excluded.aluno_id, papel = 'socio', pessoa_aluno_id = null;

  -- cadastro existente, livre, com todos os opcionais preenchidos
  insert into public.thb_alunos (nome, email, documento, tipo_documento, telefone, telefone_e164, cep,
                                 cidade, estado, bairro, endereco_logradouro, endereco_numero, pais, fonte)
  values ('Prova 338', 'prova338.a@exemplo.invalid', c1, 'CPF', '11999990000', '+5511999990000', '66000000',
          'Belém', 'PA', 'Nazaré', 'Av. Prova', '338', 'Brasil', 'prova338')
  returning id into v_x;
  select jsonb_build_object('tel', telefone, 'e164', telefone_e164, 'cep', cep, 'cid', cidade, 'uf', estado,
                            'bai', bairro, 'log', endereco_logradouro, 'num', endereco_numero, 'pais', pais)
    into v_antes from public.thb_alunos where id = v_x;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_u, 'role', 'authenticated')::text, true);

  -- R1 CPF vazio → recusa
  begin perform gps.socio_cadastro_gravar('Prova 338', '', '', '', '', '', '', '', '', ''); v_e := 'GRAVOU';
  exception when others then v_e := sqlstate || ': ' || sqlerrm; end;
  v_out := v_out || jsonb_build_object('r1_cpf_vazio', v_e);

  -- R2 só nome + CPF, opcionais em branco → grava e NÃO apaga
  v_out := v_out || jsonb_build_object('r2_so_nome_cpf',
             gps.socio_cadastro_gravar('Prova 338', c1, '', '', '', '', '', '', '', ''));
  perform set_config('role', 'postgres', true);
  select jsonb_build_object('tel', telefone, 'e164', telefone_e164, 'cep', cep, 'cid', cidade, 'uf', estado,
                            'bai', bairro, 'log', endereco_logradouro, 'num', endereco_numero, 'pais', pais)
    into v_depois from public.thb_alunos where id = v_x;
  v_out := v_out || jsonb_build_object('r2_nao_apagou', v_antes = v_depois,
             'r2_antes', v_antes, 'r2_depois', v_depois,
             'r2_pessoa', (select pessoa_aluno_id = v_x from gps.membros where user_id = v_u));

  -- R3 opcional preenchido com formato ruim → recusa (2º sócio, sem pessoa)
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_u2, 'role', 'authenticated')::text, true);
  begin perform gps.socio_cadastro_gravar('Outro 338', '83401782452', '1199', '', '', '', '', '', '', ''); v_e := 'GRAVOU';
  exception when others then v_e := sqlstate || ': ' || sqlerrm; end;
  v_out := v_out || jsonb_build_object('r3_tel_ruim', v_e);

  -- R5 CPF de linha EXISTENTE com OUTRO e-mail (a base do sip) → não grava,
  --    não liga, mesma saída de cpf_de_outro_membro
  perform set_config('role', 'postgres', true);
  insert into public.thb_alunos (nome, email, documento, tipo_documento, telefone, cep, cidade, estado,
                                 bairro, endereco_logradouro, endereco_numero, pais, fonte)
  values ('Terceiro 338', 'terceiro338@exemplo.invalid', c2, 'CPF', '91988887777', '01000000', 'São Paulo',
          'SP', 'Sé', 'Rua do Terceiro', '1', 'Brasil', 'prova338')
  returning id into v_y;
  select to_jsonb(a) - 'atualizado_em' into v_t_antes from public.thb_alunos a where a.id = v_y;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_u2, 'role', 'authenticated')::text, true);
  v_out := v_out || jsonb_build_object('r5_outro_email',
             gps.socio_cadastro_gravar('Atacante 338', c2, '', '', '', '', '', '', '', ''));
  perform set_config('role', 'postgres', true);
  v_out := v_out || jsonb_build_object(
    'r5_sem_pessoa', (select pessoa_aluno_id is null from gps.membros where user_id = v_u2),
    'r5_intacta', (select (to_jsonb(a) - 'atualizado_em') = v_t_antes from public.thb_alunos a where a.id = v_y));

  -- R4 anon não executa
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '', true);
  begin perform gps.socio_cadastro_gravar('X', c1, '', '', '', '', '', '', '', ''); v_e := 'EXECUTOU';
  exception when others then v_e := sqlstate; end;
  v_out := v_out || jsonb_build_object('r4_anon', v_e);
  perform set_config('role', 'postgres', true);

  raise exception 'PROVA 338: %', v_out;
end
$p$;
rollback;

-- ── 5. GRANTS E MARCADOR (depois de aplicar) ───────────────────────────────
-- Esperado: socio_cadastro_gravar anon=f authenticated=t public=f; a1_no_ar=t.
select p.proname,
       has_function_privilege('anon',          p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       has_function_privilege('public',        p.oid, 'execute') as public
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'gps' and p.proname = 'socio_cadastro_gravar';
select position('-- 338 opcionais' in pg_get_functiondef(
  'gps.socio_cadastro_gravar(text,text,text,text,text,text,text,text,text,text)'::regprocedure)) > 0 as a1_no_ar;
select count(*) as previa_existe from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'gps' and p.proname = 'socio_cadastro_previa';   -- esperado 0
