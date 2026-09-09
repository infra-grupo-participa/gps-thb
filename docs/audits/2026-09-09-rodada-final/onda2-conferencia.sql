-- ═══════════════════════════════════════════════════════════════════════════
-- ONDA 2 — bloco de conferência (o backend NÃO tem banco; quem roda é o
-- orquestrador/João). Ordem: 1 e 2 ANTES de aplicar as migrations, 3 e 4
-- DEPOIS. O passo 5 é teste de escrita real e roda SEMPRE em transação com
-- rollback.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1) CD9 — ANTES de aplicar a ...130: o valor que a função devolve hoje
-- ───────────────────────────────────────────────────────────────────────────
select gps.plantao_escrita_liberada()                                    as escrita_liberada_antes,
       (select valor from gps.plantao_config where chave='inscricao_aberta') as plantao_config_antes,
       (select valor from gps.config        where chave='plantao_inscricao_aberta') as config_antes, -- esperado: null
       current_setting('app.plantao_inscricao_aberta', true)              as setting_antes;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) CD10/F.3 — ACL ANTES (retrato para comparar depois)
-- ───────────────────────────────────────────────────────────────────────────
select p.oid::regprocedure::text as funcao, p.prosecdef as security_definer,
       p.proconfig, p.proacl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'gps'
   and p.proname in ('admin_direito_ao_acesso','admin_excluir_membro',
                     'admin_programas_do_email','aluno_por_documento',
                     'admin_definir_senha_membro','plantao_escrita_liberada')
 order by 1;
-- Esperado ANTES: as 3 admin_* = {postgres=X/postgres,authenticated=X/postgres,
-- service_role=X/postgres}; aluno_por_documento com "=X/postgres" (PUBLIC);
-- admin_definir_senha_membro ausente; plantao_escrita_liberada com proacl NULL
-- (default = execute to public — e é assim que tem de continuar).


-- ═══ APLICAR AS 3 MIGRATIONS (...130, ...131, ...132) ═══════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 3) CD9 — DEPOIS: mesmo valor, agora vindo de gps.config
-- ───────────────────────────────────────────────────────────────────────────
select gps.plantao_escrita_liberada()                                    as escrita_liberada_depois,
       (select valor from gps.config        where chave='plantao_inscricao_aberta') as config_depois,
       (select valor from gps.plantao_config where chave='inscricao_aberta')        as plantao_config_depois;
-- ACEITE: escrita_liberada_depois = escrita_liberada_antes (esperado: true)
--         e config_depois = plantao_config_antes ('true').

-- 3.b) A precedência é real? (roda tudo com rollback — não muda config nenhuma)
begin;
  update gps.config set valor='false' where chave='plantao_inscricao_aberta';
  select gps.plantao_escrita_liberada() as deve_ser_false;  -- gps.config manda
  update gps.plantao_config set valor='false' where chave='inscricao_aberta';
  update gps.config set valor='true'  where chave='plantao_inscricao_aberta';
  select gps.plantao_escrita_liberada() as deve_ser_true;   -- gps.config vence o degrau velho
  delete from gps.config where chave='plantao_inscricao_aberta';
  select gps.plantao_escrita_liberada() as deve_ser_false_2; -- cai no degrau de compatibilidade
  delete from gps.plantao_config where chave='inscricao_aberta';
  select gps.plantao_escrita_liberada() as deve_ser_true_2;  -- sem linha nenhuma = ABERTO (default)
rollback;
-- ACEITE: false, true, false, true — e nenhum NULL/erro em nenhuma linha.

-- 3.c) Depois do deploy do Next: a tela de /admin/plantao alterna o estado
--      (pausar → gps.config vira 'false' → botão do aluno em /p/plantao recusa;
--      reabrir → volta 'true'). Conferir com:
--      select chave, valor, atualizado_em, atualizado_por from gps.config
--       where chave = 'plantao_inscricao_aberta';

-- ───────────────────────────────────────────────────────────────────────────
-- 4) ACL DEPOIS (mesma consulta do passo 2)
-- ───────────────────────────────────────────────────────────────────────────
select p.oid::regprocedure::text as funcao, p.prosecdef as security_definer,
       p.proconfig, p.proacl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'gps'
   and p.proname in ('admin_direito_ao_acesso','admin_excluir_membro',
                     'admin_programas_do_email','aluno_por_documento',
                     'admin_definir_senha_membro','plantao_escrita_liberada')
 order by 1;
-- ACEITE: nenhuma das 5 tem "=X/" solto (PUBLIC) nem 'anon=X';
--         admin_definir_senha_membro aparece com authenticated=X e prosecdef=t
--         e proconfig = {search_path=""};
--         plantao_escrita_liberada continua com proacl NULL (o /p/plantao é
--         anônimo por decisão de produto — mudar isso fecha o Plantão público).

-- 4.b) O caminho anônimo continua fechado? (has_function_privilege responde
--      sem precisar trocar de role — vale para anon E para public)
select has_function_privilege('anon','gps.aluno_por_documento(text)','execute')              as anon_doc,   -- false
       has_function_privilege('anon','gps.admin_definir_senha_membro(uuid,text)','execute')  as anon_senha, -- false
       has_function_privilege('anon','gps.admin_excluir_membro(uuid)','execute')             as anon_excl,  -- false
       has_function_privilege('authenticated','gps.aluno_por_documento(text)','execute')     as auth_doc,   -- true
       has_function_privilege('anon','gps.plantao_escrita_liberada()','execute')             as anon_plantao; -- true (intencional)


-- ───────────────────────────────────────────────────────────────────────────
-- 5) F.3 — senha do SÓCIO, em transação com ROLLBACK
--    Alvo: membro sócio f508c710-d0b2-4c08-8be2-da041fb57613
--    (ambiente 191699db-…). NADA fica gravado: o rollback desfaz a senha,
--    o corte de sessão e a linha de log.
-- ───────────────────────────────────────────────────────────────────────────
begin;

-- 5.1 Estado ANTES (como postgres, sem RLS no caminho)
select m.id as membro_id, m.papel, m.aluno_id, u.id as user_id, u.email,
       md5(u.encrypted_password)                                as hash_antes,
       u.email_confirmed_at is not null                         as email_confirmado_antes,
       (select count(*) from auth.sessions s where s.user_id = u.id)       as sessoes_antes,
       (select count(*) from auth.refresh_tokens r where r.user_id = u.id::text) as refresh_antes,
       (select count(*) from gps.acessos_log l
         where l.user_id_alvo = u.id and l.acao = 'senha_definida')        as logs_antes
  from gps.membros m join auth.users u on u.id = m.user_id
 where m.id = 'f508c710-d0b2-4c08-8be2-da041fb57613';

-- 5.2 Assinar como um admin real (auth.uid() vazio faria gp_is_admin() = false)
select set_config('request.jwt.claims',
                  json_build_object('sub', p.id::text, 'role', 'authenticated')::text,
                  true) as claims_setados
  from public.perfis p
 where p.status = 'ativo' and p.cargo in ('dev','admin')
 order by p.id
 limit 1;

set local role authenticated;
select auth.uid() as assinando_como, public.gp_is_admin() as e_admin;  -- e_admin TEM de ser true

-- 5.3 A troca de verdade
select gps.admin_definir_senha_membro(
         'f508c710-d0b2-4c08-8be2-da041fb57613',
         'Rollback-teste-2609') as resultado;
-- Esperado: {"user_id": "...", "email": "...", "papel": "socio"}

-- 5.4 Guardas (cada bloco tem de CAIR — o notice diz se caiu certo)
do $$ begin
  perform gps.admin_definir_senha_membro('f508c710-d0b2-4c08-8be2-da041fb57613','curta');
  raise notice 'FALHOU: senha curta passou';
exception when others then raise notice 'OK senha curta -> % (%)', sqlerrm, sqlstate;
end $$;

do $$ begin
  perform gps.admin_definir_senha_membro('00000000-0000-0000-0000-000000000000','Rollback-teste-2609');
  raise notice 'FALHOU: membro inexistente passou';
exception when others then raise notice 'OK membro inexistente -> % (%)', sqlerrm, sqlstate;
end $$;

do $$
declare v_membro uuid;
begin
  -- membro SEM login (user_id nulo), se houver algum no banco
  select id into v_membro from gps.membros where user_id is null limit 1;
  if v_membro is null then
    raise notice 'PULADO: nao ha membro sem user_id para testar';
  else
    begin
      perform gps.admin_definir_senha_membro(v_membro,'Rollback-teste-2609');
      raise notice 'FALHOU: membro sem login passou';
    exception when others then raise notice 'OK membro sem login -> % (%)', sqlerrm, sqlstate;
    end;
  end if;
end $$;

do $$
declare v_membro uuid;
begin
  -- alvo que é conta de EQUIPE (escalada) — só se existir um membro assim
  select m.id into v_membro from gps.membros m
   where m.user_id is not null and gps.admin_alvo_e_equipe(m.user_id) limit 1;
  if v_membro is null then
    raise notice 'PULADO: nenhum membro do GPS e conta de equipe (bom sinal)';
  else
    begin
      perform gps.admin_definir_senha_membro(v_membro,'Rollback-teste-2609');
      raise notice 'FALHOU: conta de equipe passou';
    exception when others then raise notice 'OK conta de equipe -> % (%)', sqlerrm, sqlstate;
    end;
  end if;
end $$;

reset role;

-- 5.5 Estado DEPOIS (o hash mudou? a senha nova confere? sessões caíram? logou?)
select md5(u.encrypted_password)                                  as hash_depois,
       u.encrypted_password = extensions.crypt('Rollback-teste-2609', u.encrypted_password)
                                                                  as senha_nova_confere,
       u.email_confirmed_at is not null                           as email_confirmado_depois,
       (select count(*) from auth.sessions s where s.user_id = u.id)        as sessoes_depois,
       (select count(*) from auth.refresh_tokens r where r.user_id = u.id::text) as refresh_depois
  from gps.membros m join auth.users u on u.id = m.user_id
 where m.id = 'f508c710-d0b2-4c08-8be2-da041fb57613';

select acao, aluno_id, user_id_alvo, email_alvo, detalhe, feito_por, criado_em
  from gps.acessos_log
 where user_id_alvo = (select user_id from gps.membros
                        where id = 'f508c710-d0b2-4c08-8be2-da041fb57613')
 order by criado_em desc
 limit 3;
-- ACEITE: hash_depois <> hash_antes · senha_nova_confere = true ·
--         sessoes_depois = 0 e refresh_depois = 0 ·
--         a linha do topo do log é acao='senha_definida',
--         detalhe='membro socio', feito_por = o admin do passo 5.2.

rollback;

-- 5.6 Prova de que o rollback desfez tudo (fora da transação)
select md5(u.encrypted_password) as hash_final,   -- tem de ser IGUAL ao hash_antes
       (select count(*) from gps.acessos_log l
         where l.user_id_alvo = u.id and l.acao = 'senha_definida') as logs_final
  from gps.membros m join auth.users u on u.id = m.user_id
 where m.id = 'f508c710-d0b2-4c08-8be2-da041fb57613';
