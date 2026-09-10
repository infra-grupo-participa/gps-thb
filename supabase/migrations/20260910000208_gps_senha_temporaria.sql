-- Mega feature — marca `gps_senha_temp_em` em quem recebeu senha TEMPORÁRIA.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- C-4 — O PEDIDO LITERAL NÃO PASSA; A INTENÇÃO PASSA INTEIRA
-- ═══════════════════════════════════════════════════════════════════════════
--   O João pediu "senha padrão para os que não tiverem acesso acessar e
--   redefinir a senha". `auth.users` é COMPARTILHADO por 7 sistemas do grupo:
--   não existe senha "só do GPS". Uma senha única para 19 pessoas significa
--   (a) qualquer uma delas entra na conta das outras enquanto ninguém trocar e
--   (b) para quem já tem conta em outro portal, definir a senha padrão troca a
--   senha do Workbook/Rede/Central e derruba a sessão da pessoa lá. O Plantão
--   já viveu esse modelo (422 pessoas, a mesma senha, ninguém trocou) e foi
--   abandonado.
--   → Senha temporária INDIVIDUAL (`gerarSenha()`, que já existe) + TROCA
--     OBRIGATÓRIA no 1º acesso, que é o passo 0 do onboarding. Ninguém fica de
--     fora.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ ISTO É UX, NÃO FRONTEIRA DE SEGURANÇA — e está escrito de propósito
-- ═══════════════════════════════════════════════════════════════════════════
--   `raw_user_meta_data` é editável pelo próprio usuário (`updateUser({data}}`
--   do GoTrue). Ele pode limpar a marca e pular o passo. Não importa: o passo
--   existe para o bem dele, e a alternativa (RPC própria de troca de senha)
--   reimplementaria o GoTrue com bcrypt à mão. Registrado aqui em vez de
--   fingir que é trava. A marca NÃO concede nada — nenhuma policy, nenhuma
--   RPC e nenhuma guarda a lê.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- MERGE, NUNCA SOBRESCRITA — e chave prefixada `gps_`
-- ═══════════════════════════════════════════════════════════════════════════
--   `raw_user_meta_data` é do usuário, não do GPS: os outros 6 sistemas do
--   grupo escrevem lá. MEDIDO na Onda 0 (M2): os 3 usuários com login que
--   nunca entraram têm as chaves `nome`, `sistema`, `telefone`. Um
--   `set raw_user_meta_data = jsonb_build_object(...)` apagaria as três. Por
--   isso `coalesce(raw_user_meta_data,'{}'::jsonb) || jsonb_build_object(...)`
--   em TODOS os quatro pontos (as 3 RPCs e o backfill). O prefixo `gps_` na
--   chave existe para não colidir com o metadata dos outros sistemas.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- RECRIADAS A PARTIR DO CORPO VIGENTE
-- ═══════════════════════════════════════════════════════════════════════════
--   `gps.admin_definir_senha(uuid,text)`        → corpo da migração ...118
--   `gps.admin_definir_senha_membro(uuid,text)` → corpo da migração ...132
--   `gps.admin_adotar_login_existente(uuid,text,boolean)` → corpo da ...020
--   Conferido em 10/09/2026: nenhuma migração posterior redefine as três
--   (`grep -l "function gps.<nome>(" supabase/migrations/*.sql`). Se o corpo
--   vigente NO BANCO não for esse, PARE: partir do arquivo errado apaga em
--   silêncio uma correção feita direto no banco — foi assim que
--   `admin_adotar_login_existente` viveu 15 dias quebrada.
--   Conferência antes de aplicar:
--     select pg_get_functiondef(p.oid) from pg_proc p
--       join pg_namespace n on n.oid = p.pronamespace
--      where n.nspname='gps' and p.proname in ('admin_definir_senha',
--            'admin_definir_senha_membro','admin_adotar_login_existente');
--
--   ASSINATURA IDÊNTICA nas três → `create or replace`, SEM `drop`: dropar
--   descartaria as ACLs e a função nasceria executável por `public` sendo
--   SECURITY DEFINER sobre `auth.users`. Os `revoke`/`grant` do fim são
--   repetidos mesmo assim, por idempotência.
--
-- O QUE MUDA EM CADA UMA: UMA linha no `update auth.users` (o merge). Nenhuma
--   guarda, nenhuma validação, nenhum log e nenhum retorno mudam.
--
-- REVERSÃO: reaplicar as ...118/...132/...020 (o texto integral está lá,
--   versionado) e, se quiser limpar a marca:
--     update auth.users set raw_user_meta_data = raw_user_meta_data - 'gps_senha_temp_em'
--      where raw_user_meta_data ? 'gps_senha_temp_em';

-- ═════════════════════════════════════════════════════════════════════════
-- 1. gps.admin_definir_senha — corpo da ...118 + o merge
-- ═════════════════════════════════════════════════════════════════════════

create or replace function gps.admin_definir_senha(p_aluno_id uuid, p_senha text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_user uuid; v_email text;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_senha is null or length(trim(p_senha)) < 8 then
    raise exception 'A senha precisa ter ao menos 8 caracteres.' using errcode = '22023';
  end if;

  v_user := gps.admin_user_do_aluno(p_aluno_id);
  if v_user is null then
    raise exception 'Este aluno ainda não tem login. Use "Criar acesso".' using errcode = 'P0002';
  end if;
  if gps.admin_alvo_e_equipe(v_user) then
    raise exception 'Esta conta é da equipe — a senha não pode ser trocada por aqui.' using errcode = '42501';
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         -- 🔑 A MARCA (migração ...208). MERGE, nunca sobrescrita: as chaves
         -- dos outros 6 sistemas do grupo continuam todas lá.
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                              || jsonb_build_object('gps_senha_temp_em', now()),
         recovery_token = '', recovery_sent_at = null, confirmation_token = '',
         email_change = '', email_change_token_new = '', email_change_token_current = '',
         updated_at = now()
   where id = v_user
   returning email into v_email;

  delete from auth.refresh_tokens where user_id = v_user::text;
  delete from auth.sessions where user_id = v_user;

  -- conflito por user_id (constraint que realmente existe)
  insert into gps.membros (aluno_id, user_id, papel)
  values (p_aluno_id, v_user,
          case when exists (select 1 from gps.membros m
                             where m.aluno_id = p_aluno_id and m.papel='titular' and m.user_id <> v_user)
               then 'socio' else 'titular' end)
  on conflict (user_id) do nothing;

  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, feito_por)
  values ('senha_definida', p_aluno_id, v_user, v_email, auth.uid());

  return jsonb_build_object('user_id', v_user, 'email', v_email);
end $function$;

comment on function gps.admin_definir_senha(uuid, text) is
  'Define a senha do titular do ambiente na hora (corpo da ...118). Desde a ...208 carimba raw_user_meta_data.gps_senha_temp_em por MERGE: e o que faz o portal pedir uma senha propria no primeiro acesso (passo 0 do onboarding). A marca e UX, nao fronteira de seguranca -- o proprio usuario pode limpa-la, e ela nao concede nada.';

revoke execute on function gps.admin_definir_senha(uuid, text) from public, anon;
grant  execute on function gps.admin_definir_senha(uuid, text) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 2. gps.admin_definir_senha_membro — corpo da ...132 + o merge
-- ═════════════════════════════════════════════════════════════════════════

create or replace function gps.admin_definir_senha_membro(p_membro_id uuid, p_senha text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare m record; v_email text;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_senha is null or length(trim(p_senha)) < 8 then
    raise exception 'A senha precisa ter ao menos 8 caracteres.' using errcode = '22023';
  end if;

  select * into m from gps.membros where id = p_membro_id;
  if not found then
    raise exception 'Membro não encontrado.' using errcode = 'P0002';
  end if;
  if m.user_id is null then
    raise exception 'Este membro ainda não tem login.' using errcode = 'P0002';
  end if;
  if gps.admin_alvo_e_equipe(m.user_id) then
    raise exception 'Esta conta é da equipe — a senha não pode ser trocada por aqui.' using errcode = '42501';
  end if;
  if m.user_id = auth.uid() then
    raise exception 'Você não pode trocar a própria senha por aqui — use o seu perfil.' using errcode = '42501';
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         -- 🔑 A MARCA (migração ...208). MERGE, nunca sobrescrita.
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                              || jsonb_build_object('gps_senha_temp_em', now()),
         recovery_token = '', recovery_sent_at = null, confirmation_token = '',
         email_change = '', email_change_token_new = '', email_change_token_current = '',
         updated_at = now()
   where id = m.user_id
   returning email into v_email;

  -- `found` (não `v_email is null`): e-mail pode ser nulo num auth.users
  -- válido; o que precisa existir é a LINHA. Sem esta guarda, um membro
  -- apontando para login já apagado sairia "com sucesso" sem trocar nada.
  if not found then
    raise exception 'O login deste membro não existe mais.' using errcode = 'P0002';
  end if;

  -- Trocar a senha e deixar a sessão antiga de pé é troca pela metade.
  delete from auth.refresh_tokens where user_id = m.user_id::text;
  delete from auth.sessions where user_id = m.user_id;

  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, detalhe, feito_por)
  values ('senha_definida', m.aluno_id, m.user_id, v_email,
          'membro ' || coalesce(m.papel, '?'), auth.uid());

  return jsonb_build_object('user_id', m.user_id, 'email', v_email, 'papel', m.papel);
end $function$;

comment on function gps.admin_definir_senha_membro(uuid, text) is
  'Define a senha de UM membro do ambiente (corpo da ...132). Desde a ...208 carimba raw_user_meta_data.gps_senha_temp_em por MERGE, para o portal pedir senha propria no primeiro acesso. Guardas proprias mantidas: o membro precisa ter user_id, o alvo nao pode ser quem executa e nao pode ser conta de equipe.';

revoke execute on function gps.admin_definir_senha_membro(uuid, text) from public, anon;
grant  execute on function gps.admin_definir_senha_membro(uuid, text) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 3. gps.admin_adotar_login_existente — corpo da ...020 + o merge
-- ═════════════════════════════════════════════════════════════════════════
--
-- ⚠️ O merge entra como um SEGUNDO `||`, DEPOIS do `jsonb_strip_nulls` que já
-- existia. Dentro dele, `now()` nunca é nulo e o strip não o tiraria — mas
-- separar deixa claro que a marca não depende de nenhum campo do cadastro.

create or replace function gps.admin_adotar_login_existente(
  p_aluno_id uuid,
  p_senha text,
  p_forcar boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_user uuid; v_email text; v_aluno record; v_dono uuid; v_papel text;
        v_direito jsonb;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_senha is null or length(trim(p_senha)) < 8 then
    raise exception 'A senha precisa ter ao menos 8 caracteres.' using errcode = '22023';
  end if;

  select id, nome, email, documento, telefone into v_aluno
    from public.thb_alunos where id = p_aluno_id;
  if not found then
    raise exception 'Aluno não encontrado.' using errcode = 'P0002';
  end if;
  if coalesce(trim(v_aluno.email),'') = '' then
    raise exception 'Este aluno não tem e-mail no cadastro.' using errcode = '22023';
  end if;

  -- o acesso segue o pagamento
  v_direito := gps.admin_direito_ao_acesso(p_aluno_id);
  if not (v_direito->>'tem_direito')::boolean and not coalesce(p_forcar,false) then
    raise exception 'Sem direito ao acesso: %', v_direito->>'motivo' using errcode = '42501';
  end if;

  select id, email into v_user, v_email from auth.users
   where lower(trim(email)) = lower(trim(v_aluno.email));
  if v_user is null then
    raise exception 'Não existe login com este e-mail. Use "Criar acesso".' using errcode = 'P0002';
  end if;
  if gps.admin_alvo_e_equipe(v_user) then
    raise exception 'Esta conta é da equipe — não pode virar acesso de aluno.' using errcode = '42501';
  end if;

  select aluno_id into v_dono from gps.membros where user_id = v_user;
  if v_dono is not null and v_dono <> p_aluno_id then
    raise exception 'Este login já pertence a outro ambiente do GPS.' using errcode = '23505';
  end if;

  v_papel := case when exists (select 1 from gps.membros m
                                where m.aluno_id = p_aluno_id
                                  and m.papel = 'titular'
                                  and m.user_id <> v_user)
                  then 'socio' else 'titular' end;

  update auth.users
     set encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                              || jsonb_strip_nulls(jsonb_build_object(
                                   'nome', v_aluno.nome,
                                   'origem', 'gps',
                                   'telefone', v_aluno.telefone,
                                   'documento', v_aluno.documento))
                              -- 🔑 A MARCA (migração ...208).
                              || jsonb_build_object('gps_senha_temp_em', now()),
         recovery_token = '', recovery_sent_at = null, confirmation_token = '',
         email_change = '', email_change_token_new = '', email_change_token_current = '',
         updated_at = now()
   where id = v_user;

  delete from auth.refresh_tokens where user_id = v_user::text;
  delete from auth.sessions where user_id = v_user;

  insert into gps.membros (aluno_id, user_id, papel)
  values (p_aluno_id, v_user, v_papel)
  on conflict (user_id) do nothing;

  insert into gps.ambientes (aluno_id)
  values (p_aluno_id)
  on conflict (aluno_id) do nothing;

  -- 🔑 `(v_direito->>'motivo')` entre parênteses: `||` e `->>` têm a mesma
  -- precedência e associam à esquerda. Sem eles, a expressão vira
  -- `(text || jsonb) ->> text` — o 42883 que deixou esta função quebrada de
  -- 25/08 a 08/09/2026. NÃO REMOVER.
  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, feito_por, detalhe)
  values ('senha_definida', p_aluno_id, v_user, v_email, auth.uid(),
          'Login preexistente adotado como acesso do GPS (papel ' || v_papel || '). '
          || (v_direito->>'motivo')
          || case when coalesce(p_forcar,false) then ' [LIBERADO MANUALMENTE pelo admin]' else '' end);

  return jsonb_build_object('user_id', v_user, 'email', v_email, 'papel', v_papel,
                            'adotado', true, 'direito', v_direito);
end $function$;

comment on function gps.admin_adotar_login_existente(uuid, text, boolean) is
  'Adota um login preexistente de auth.users como acesso do GPS (corpo da ...020, inclusive os parenteses que corrigiram a precedencia de || e ->>). Desde a ...208 carimba raw_user_meta_data.gps_senha_temp_em por MERGE, DEPOIS do jsonb_strip_nulls que ja existia. ⚠️ Esta funcao TROCA A SENHA DA PESSOA EM TODOS OS PORTAIS DO GRUPO e derruba as sessoes dela -- por isso o lote de criacao de acesso NAO a chama (permitirAdocao:false); quem cai nesse caso vai para "precisa de decisao" e e resolvido um a um em Gerenciar acesso, que ja confirma nomeando os sistemas.';

revoke execute on function gps.admin_adotar_login_existente(uuid, text, boolean) from public, anon;
grant  execute on function gps.admin_adotar_login_existente(uuid, text, boolean) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 4. BACKFILL — só quem tem login e NUNCA entrou
-- ═════════════════════════════════════════════════════════════════════════
--
-- Medido na Onda 0 (M2): 3 pessoas. Elas receberam uma senha temporária do
-- admin em algum momento e nunca usaram — são exatamente quem o passo 0
-- precisa alcançar. Quem JÁ ENTROU (136) fica de fora: a senha dele pode ser a
-- que ele mesmo escolheu, e pedir troca a quem já trocou é ruído.
--
-- IDEMPOTENTE pelo `not ... ? 'gps_senha_temp_em'`: reaplicar não recarimba
-- (o que moveria a data para hoje e mentiria sobre quando a senha foi dada).
-- MERGE: as chaves `nome`, `sistema`, `telefone` medidas em M2 continuam lá.

update auth.users u
   set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
                            || jsonb_build_object('gps_senha_temp_em', now())
 where u.last_sign_in_at is null
   and exists (select 1 from gps.membros m where m.user_id = u.id)
   and not (coalesce(u.raw_user_meta_data, '{}'::jsonb) ? 'gps_senha_temp_em');

-- CONFERÊNCIA (rodar depois; nada aqui escreve):
--   select count(*) as marcados from auth.users u
--    where u.raw_user_meta_data ? 'gps_senha_temp_em';         -- esperado: 3
--   select u.id, jsonb_object_keys(u.raw_user_meta_data) from auth.users u
--    where u.raw_user_meta_data ? 'gps_senha_temp_em';
--   -- as chaves antigas (nome, sistema, telefone) continuam TODAS lá.
