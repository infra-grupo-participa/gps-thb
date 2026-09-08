-- Primeiro acesso por SENHA PADRÃO, no lugar dos 4 dígitos do documento.
--
-- Decisão do Marcio (08/09/2026): a prioridade é o aluno entrar sem atrito.
-- Os 4 dígitos do CPF foram apresentados com o custo na mesa e a alternativa
-- (senha individual por aluno) foi recusada — a distribuição de 422 senhas
-- diferentes pela Hotmart não compensava.
--
-- ⚠️ RISCO ACEITO, registrado aqui porque some da memória mas não do sistema:
-- enquanto o aluno não trocar a senha, quem souber a senha padrão E o e-mail
-- dele entra na conta, vê o plantão marcado e pode cancelá-lo. E-mail de
-- aluno circula em grupo de WhatsApp. Este é o preço da facilidade escolhida.
--
-- MITIGAÇÕES — todas de custo ZERO para o aluno, por isso entraram:
--
--   1. `senha_provisoria` marca a conta até a troca. O portal OBRIGA a
--      definir senha nova antes de liberar qualquer ação. A janela de risco
--      dura da entrega da senha até o primeiro login, não para sempre.
--
--   2. 🔑 A senha padrão só vale para o PRIMEIRO login daquela conta. Depois
--      que `plantao_acessos` existe, o caminho da senha padrão nem é
--      consultado — só o hash do aluno abre. Não existe "senha mestra" viva.
--      (Testado: após a troca, a padrão devolve "E-mail ou senha inválidos".)
--
--   3. `plantao_definir_senha` RECUSA a própria senha padrão como nova. Sem
--      isso o aluno sairia do estado provisório sem trocar nada — o pior dos
--      dois mundos, porque a conta pareceria segura e não estaria.
--
--   4. O valor vive em `app.plantao_senha_padrao` (setting do banco), NUNCA
--      no repo, que é público. Falha FECHADO: sem o setting configurado,
--      nenhum primeiro acesso é criado. O contrário — aceitar qualquer senha
--      por omissão — abriria as 422 contas de uma vez.
--
-- O que NÃO mudou: a mensagem de falha continua genérica e única em todos os
-- caminhos ('E-mail ou senha inválidos.'), incluindo o caso "setting ausente",
-- porque distinguir motivos permite enumerar quem comprou. O rate limit por
-- IP (20/15min) e por conta+origem (5/15min) segue igual.
--
-- `p_documento` fica na assinatura por compatibilidade com o app e é
-- IGNORADO — remover o parâmetro exigiria drop/create em cascata.
--
-- ⚠️ PASSO MANUAL (superusuário, fora desta migração):
--     alter role authenticator set app.plantao_senha_padrao = '<a senha>';
--
-- Reversão: restaurar `gps.plantao_login` das migrações 20260901000004/005
-- (versão que exige os 4 dígitos) e
-- `alter table gps.plantao_acessos drop column senha_provisoria;`
--

--
-- ⚠️ PASSO MANUAL (superusuário, fora desta migração):
--     alter role authenticator set app.plantao_senha_padrao = '<a senha>';
--
-- `gps.plantao_login` NÃO está aqui: ela é recriada por inteiro na migração
-- ...035, que adiciona a trava de elegibilidade. Versionar as duas versões
-- seria manter dois corpos divergentes do mesmo objeto.

alter table gps.plantao_acessos
  add column if not exists senha_provisoria boolean not null default false;

comment on column gps.plantao_acessos.senha_provisoria is
  'true enquanto a conta ainda usa a senha padrao de primeiro acesso. As RPCs de acao recusam sessao nesse estado (ver plantao_sessao_valida, migracao ...036). Vira false quando o aluno define a senha dele.';

-- Troca de senha do próprio aluno logado.
--
-- Recusa a PRÓPRIA senha padrão como nova: sem isso o aluno sairia do estado
-- provisório sem trocar nada — o pior dos dois mundos, porque a conta
-- pareceria segura e não estaria.
--
-- Usa `plantao_sessao` (não `plantao_sessao_valida`) de propósito: quem tem
-- senha provisória PRECISA conseguir chamar justamente esta função, senão a
-- trava trancaria a própria saída.
create or replace function gps.plantao_definir_senha(p_token text, p_senha_nova text)
returns table (ok boolean, motivo text)
language plpgsql
security definer
set search_path to 'pg_catalog', 'extensions', 'public', 'gps'
as $function$
declare
  v_aluno_id uuid;
  v_padrao text;
begin
  select s.aluno_plantao_id into v_aluno_id from gps.plantao_sessao(p_token) s;
  if v_aluno_id is null then
    return query select false, 'Sessão expirada. Entre novamente.'::text;
    return;
  end if;

  if p_senha_nova is null or length(p_senha_nova) < 8 then
    return query select false, 'A senha precisa ter ao menos 8 caracteres.'::text;
    return;
  end if;

  v_padrao := current_setting('app.plantao_senha_padrao', true);
  if v_padrao is not null and p_senha_nova = v_padrao then
    return query select false, 'Escolha uma senha diferente da que você recebeu.'::text;
    return;
  end if;

  update gps.plantao_acessos
     set senha_hash = extensions.crypt(p_senha_nova, extensions.gen_salt('bf', 10)),
         senha_provisoria = false,
         atualizado_em = now()
   where aluno_plantao_id = v_aluno_id;

  insert into gps.plantao_eventos (aluno_plantao_id, acao)
    values (v_aluno_id, 'plantao_senha_definida');

  return query select true, null::text;
end;
$function$;

revoke execute on function gps.plantao_definir_senha(text, text) from public;
grant execute on function gps.plantao_definir_senha(text, text) to anon, authenticated;

comment on function gps.plantao_definir_senha(text, text) is
  'Troca a senha do aluno logado (resolvido pelo token) e limpa senha_provisoria. Recusa a propria senha padrao como nova. Usa plantao_sessao (nao _valida): quem tem senha provisoria precisa poder chamar justamente esta funcao.';
