-- F.3 / PL8 — senha do SÓCIO pelo painel (decisão do orquestrador em 09/09/2026).
--
-- POR QUE EXISTE
--   "Gerenciar acesso" já diagnostica cada membro do ambiente ("tem senha /
--   nunca entrou", gerenciar-acesso.tsx:346-360), mas o único remédio era
--   "Nova senha DO TITULAR": gps.admin_definir_senha(p_aluno_id) resolve o
--   usuário por gps.admin_user_do_aluno(), que devolve o TITULAR do ambiente.
--   Para os 13 sócios reais, o admin via o problema e não tinha botão — a
--   única saída era remover e re-adicionar o sócio, o que APAGA o login e o
--   histórico dele (gps.admin_excluir_membro deleta de auth.users). Trocar a
--   senha de alguém não pode custar o cadastro dessa pessoa.
--
-- O QUE FAZ
--   gps.admin_definir_senha_membro(p_membro_id, p_senha): mesma mecânica de
--   gps.admin_definir_senha (migração ...118), mas endereçada pelo MEMBRO em
--   vez do ambiente. Serve titular e sócio — o alvo é a linha de gps.membros
--   que o admin clicou, sem adivinhação.
--
-- GUARDAS (todas antes de qualquer escrita)
--   1. public.gp_is_admin()                       → 42501
--   2. senha com ao menos 8 caracteres            → 22023
--   3. o membro existe                            → P0002
--   4. o membro tem login (user_id não nulo)      → P0002  ("ainda não tem login")
--   5. o alvo NÃO é conta de equipe               → 42501  (gps.admin_alvo_e_equipe)
--   6. o alvo não é quem está executando          → 42501
--   A guarda 5 é a que impede escalada: sem ela, um admin do GPS trocaria a
--   senha de um dev/admin do grupo por dentro do painel do aluno. É a mesma
--   guarda de gps.admin_definir_senha e de gps.admin_excluir_membro.
--   A guarda 6 NÃO existe em gps.admin_definir_senha — entra aqui porque este
--   caminho endereça QUALQUER linha de gps.membros por id, e trocar a própria
--   senha por aqui derrubaria a própria sessão no meio da operação (o mesmo
--   raciocínio do `m.user_id = auth.uid()` de gps.admin_excluir_membro).
--   Quem quer trocar a própria senha usa /perfil.
--
-- O QUE NÃO FAZ
--   * NÃO cria membro, NÃO cria login e NÃO adota login existente. Membro sem
--     user_id sai com P0002 e a tela manda para "Criar acesso"/"Adicionar
--     sócio" — funções que já existem e que decidem vínculo. Esta aqui só
--     troca senha de quem já tem login;
--   * NÃO faz upsert em gps.membros (gps.admin_definir_senha faz, porque lá o
--     vínculo pode não existir ainda; aqui o membro É o parâmetro);
--   * NÃO envia e-mail: envio dentro de transação de banco trava escrita
--     quando a Resend cai. Quem manda é a aplicação, depois do commit;
--   * NÃO altera gps.admin_definir_senha nem nenhuma outra função.
--
-- LOG
--   gps.acessos_log com acao = 'senha_definida' (valor já aceito pelo
--   acessos_log_acao_check do baseline — nenhuma constraint muda) e
--   detalhe = 'membro <papel>', que é o que distingue esta linha da do
--   titular quando alguém for auditar depois. aluno_id é o do AMBIENTE
--   (gps.membros.aluno_id), como em todas as outras linhas do log.
--
-- REVERSÃO
--   drop function if exists gps.admin_definir_senha_membro(uuid, text);
--   (e remover a action definirSenhaMembro de src/app/admin/senha-actions.ts)

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
  'Define a senha de UM membro do ambiente (titular ou socio) endereçando gps.membros.id -- o remedio que faltava para os socios (PL8 da rodada final de 09/09/2026): antes, a unica saida era excluir e re-adicionar o socio, o que apaga o login e o historico dele. Espelha gps.admin_definir_senha (...118) e acrescenta duas guardas proprias: o membro precisa ter user_id, e o alvo nao pode ser quem executa. Recusa conta de equipe (gps.admin_alvo_e_equipe) -- e a guarda que impede escalada por dentro do painel do aluno. Derruba sessoes e refresh tokens do alvo. Registra em gps.acessos_log com acao=senha_definida e detalhe=''membro <papel>''. NAO envia e-mail: quem manda e a aplicacao, depois do commit.';

-- ACL: `revoke` antes do `grant`, sempre. Mesma ACL da familia da ...118.
revoke execute on function gps.admin_definir_senha_membro(uuid, text) from public, anon;
grant  execute on function gps.admin_definir_senha_membro(uuid, text) to authenticated;
