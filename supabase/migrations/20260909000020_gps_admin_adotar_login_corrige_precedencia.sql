-- Corrige `gps.admin_adotar_login_existente`, que estava QUEBRADA em produção.
--
-- Sintoma: toda chamada morria com
--   42883: operator does not exist: text ->> unknown
-- na linha do `insert into gps.acessos_log`, e a transação inteira revertia.
-- Efeito prático: o botão "adotar login existente" NUNCA funcionou desde que
-- foi escrito — o aluno que já tinha conta em `auth.users` (criada por outro
-- sistema do grupo, que compartilha o mesmo `auth.users`) ficava sem caminho
-- para entrar no GPS. `signUp` falha para usuário existente, e esta função,
-- que é a saída oficial para esse caso, abortava no último passo.
--
-- Causa: PRECEDÊNCIA DE OPERADORES, não tipo errado. `v_direito` sempre foi
-- declarado `jsonb`. Em Postgres, `||` e `->>` têm a MESMA precedência e
-- associam à esquerda, então
--     'texto ' || v_direito->>'motivo'
-- é avaliado como
--     ('texto ' || v_direito) ->> 'motivo'
-- ou seja: concatena text com jsonb (o que dá text) e só então tenta aplicar
-- `->>` sobre text — operador que não existe. A correção é parentizar a
-- extração: `'texto ' || (v_direito->>'motivo')`.
--
-- 🔑 Por que passou despercebido: o `insert` no log é o ÚLTIMO passo da
-- função. Todo caso anterior (senha, membros, ambiente) executava e era
-- revertido junto, então o erro nunca aparecia "pela metade" — parecia que
-- nada tinha acontecido. Não havia teste, e o caminho só é exercitado por
-- aluno com login preexistente.
--
-- Esta função não estava versionada neste repo (foi criada direto no banco).
-- A migration a traz para o controle de versão JÁ CORRIGIDA — o corpo abaixo
-- é idêntico ao que estava em produção, exceto pelos parênteses da linha do
-- `detalhe`.
--
-- Reversão: reaplicar o corpo anterior (sem os parênteses) — não recomendado,
-- é voltar a função ao estado quebrado.

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
                                   'documento', v_aluno.documento)),
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

  -- 🔑 A CORREÇÃO: `(v_direito->>'motivo')` entre parênteses. Sem eles, o
  -- `||` à esquerda vence e a expressão vira `(text || jsonb) ->> text`.
  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, feito_por, detalhe)
  values ('senha_definida', p_aluno_id, v_user, v_email, auth.uid(),
          'Login preexistente adotado como acesso do GPS (papel ' || v_papel || '). '
          || (v_direito->>'motivo')
          || case when coalesce(p_forcar,false) then ' [LIBERADO MANUALMENTE pelo admin]' else '' end);

  return jsonb_build_object('user_id', v_user, 'email', v_email, 'papel', v_papel,
                            'adotado', true, 'direito', v_direito);
end $function$;

-- Mesma trava das demais funções administrativas: ninguém anônimo executa.
revoke execute on function gps.admin_adotar_login_existente(uuid, text, boolean) from public, anon;
grant execute on function gps.admin_adotar_login_existente(uuid, text, boolean) to authenticated;

comment on function gps.admin_adotar_login_existente(uuid, text, boolean) is
  'Adota um login que JÁ EXISTE em auth.users como acesso do GPS (cria gps.membros + ambiente, grava senha nova, marca origem=gps). Existe porque o GPS provisiona por signUp, que falha para e-mail já cadastrado — caso comum, já que auth.users é compartilhado pelos sistemas do grupo. Guardas: gp_is_admin(), conta de equipe recusada, login já vinculado a outro ambiente recusado, e direito ao acesso conferido por gps.admin_direito_ao_acesso (p_forcar ignora só o direito, nunca as outras travas). ATENÇÃO: sobrescreve a senha e derruba as sessões da conta — se ela também serve a outro sistema do grupo, a pessoa precisa ser avisada.';
