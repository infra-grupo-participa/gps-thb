-- A trava de elegibilidade TAMBÉM no login, não só no resolvedor de sessão.
--
-- 🔴 DEFEITO que a migração ...034 deixou: `plantao_sessao` recusava o aluno
-- bloqueado, mas `plantao_login` não. Medido em produção: o bloqueado **logava
-- com sucesso** — criava conta em `plantao_acessos`, recebia token — e só as
-- requisições SEGUINTES falhavam. Um limbo: a tela diria "entrou" e em seguida
-- o jogaria para fora, em loop, sem explicação. No primeiro acesso é pior
-- ainda, porque a conta fica criada para alguém que não pode usar.
--
-- Achado ao exercitar o login como `anon` com um e-mail realmente bloqueado,
-- não pela leitura do código. É a terceira vez neste módulo que uma regra
-- ficou em UMA camada só (antes: `zoom_url` em `publicarSlot` mas não em
-- `plantao_inscrever`). Padrão a vigiar.
--
-- A recusa usa a MESMA mensagem genérica de senha errada, e passa pelo mesmo
-- `crypt()` descartável: dizer "você migrou para o Programa" num login público
-- confirmaria a um estranho que aquele e-mail comprou, e qual produto — a
-- mesma enumeração que a trava dos 4 dígitos existia para impedir.
--
-- Reversão: reaplicar o corpo da ...033 (sem `and not bloqueado_por_programa`
-- no select do aluno) — não recomendado, reabre o limbo.

create or replace function gps.plantao_login(
  p_email text,
  p_senha text,
  p_ip_hash text,
  p_documento text default null
)
returns table (ok boolean, motivo text, sessao_token text, primeiro_acesso boolean, nome text, precisa_trocar_senha boolean)
language plpgsql
security definer
set search_path to 'pg_catalog', 'extensions', 'public', 'gps'
as $function$
declare
  v_email text := lower(btrim(p_email));
  v_aluno gps.plantao_alunos%rowtype;
  v_acesso gps.plantao_acessos%rowtype;
  v_tentativas_ip int;
  v_falhas_origem int;
  v_token text;
  v_token_hash text;
  v_padrao text;
  v_generico text := 'E-mail ou senha inválidos.';
begin
  -- Rate limit por IP antes de qualquer trabalho.
  if p_ip_hash is not null then
    select count(*) into v_tentativas_ip
    from gps.plantao_eventos
    where acao in ('plantao_login_falha', 'plantao_login_ok', 'plantao_primeiro_acesso')
      and ip_hash = p_ip_hash
      and criado_em > now() - interval '15 minutes';

    if v_tentativas_ip >= 20 then
      insert into gps.plantao_eventos (acao, ip_hash)
        values ('plantao_login_rate_limit', p_ip_hash);
      return query select false, 'Muitas tentativas. Aguarde alguns minutos.'::text,
        null::text, false, null::text, false;
      return;
    end if;
  end if;

  -- 🔑 `and not bloqueado_por_programa`: o aluno que migrou para o Programa
  -- cai no MESMO caminho de "não existe", com o mesmo custo de bcrypt e a
  -- mesma mensagem. Indistinguível de fora.
  select * into v_aluno
  from gps.plantao_alunos
  where email = v_email and ativo and not bloqueado_por_programa;

  if not found then
    -- Tempo constante: paga o mesmo bcrypt do caminho "senha errada".
    perform extensions.crypt(p_senha, '$2a$10$abcdefghijklmnopqrstuu');
    insert into gps.plantao_eventos (acao, ip_hash) values ('plantao_login_falha', p_ip_hash);
    return query select false, v_generico, null::text, false, null::text, false;
    return;
  end if;

  select * into v_acesso from gps.plantao_acessos where aluno_plantao_id = v_aluno.id;

  if not found then
    -- PRIMEIRO ACESSO por senha padrão (ver migração ...033 para o desenho e
    -- o risco aceito).
    v_padrao := current_setting('app.plantao_senha_padrao', true);

    -- Falha FECHADO: sem o setting, ninguém cria conta.
    if v_padrao is null or btrim(v_padrao) = '' then
      perform extensions.crypt(p_senha, '$2a$10$abcdefghijklmnopqrstuu');
      insert into gps.plantao_eventos (aluno_plantao_id, acao, ip_hash)
        values (v_aluno.id, 'plantao_primeiro_acesso_sem_senha_padrao', p_ip_hash);
      return query select false, v_generico, null::text, false, null::text, false;
      return;
    end if;

    if p_senha is distinct from v_padrao then
      perform extensions.crypt(p_senha, '$2a$10$abcdefghijklmnopqrstuu');
      insert into gps.plantao_eventos (aluno_plantao_id, acao, ip_hash)
        values (v_aluno.id, 'plantao_login_falha', p_ip_hash);
      return query select false, v_generico, null::text, false, null::text, false;
      return;
    end if;

    insert into gps.plantao_acessos (aluno_plantao_id, senha_hash, ultimo_login_em, senha_provisoria)
    values (v_aluno.id, extensions.crypt(p_senha, extensions.gen_salt('bf', 10)), now(), true);

    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

    insert into gps.plantao_sessoes (token_hash, aluno_plantao_id, expira_em, ip_hash)
    values (v_token_hash, v_aluno.id, now() + interval '90 days', p_ip_hash);

    insert into gps.plantao_eventos (aluno_plantao_id, acao, ip_hash)
      values (v_aluno.id, 'plantao_primeiro_acesso', p_ip_hash);

    return query select true, null::text, v_token, true, v_aluno.nome, true;
    return;
  end if;

  -- ACESSOS SEGUINTES: a senha padrão nem é consultada aqui.
  select count(*) into v_falhas_origem
  from gps.plantao_eventos
  where acao = 'plantao_login_falha'
    and aluno_plantao_id = v_aluno.id
    and ip_hash is not distinct from p_ip_hash
    and criado_em > now() - interval '15 minutes';

  if v_falhas_origem >= 5 then
    return query select false, 'Muitas tentativas. Aguarde alguns minutos.'::text,
      null::text, false, null::text, false;
    return;
  end if;

  if v_acesso.senha_hash = extensions.crypt(p_senha, v_acesso.senha_hash) then
    update gps.plantao_acessos
    set falhas = 0, bloqueado_ate = null, ultimo_login_em = now()
    where aluno_plantao_id = v_aluno.id;

    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

    insert into gps.plantao_sessoes (token_hash, aluno_plantao_id, expira_em, ip_hash)
    values (v_token_hash, v_aluno.id, now() + interval '90 days', p_ip_hash);

    insert into gps.plantao_eventos (aluno_plantao_id, acao, ip_hash)
      values (v_aluno.id, 'plantao_login_ok', p_ip_hash);

    return query select true, null::text, v_token, false, v_aluno.nome,
      coalesce(v_acesso.senha_provisoria, false);
    return;
  else
    update gps.plantao_acessos set falhas = falhas + 1 where aluno_plantao_id = v_aluno.id;
    insert into gps.plantao_eventos (aluno_plantao_id, acao, ip_hash)
      values (v_aluno.id, 'plantao_login_falha', p_ip_hash);
    return query select false, v_generico, null::text, false, null::text, false;
    return;
  end if;
end;
$function$;

comment on function gps.plantao_login(text, text, text, text) is
  'Login do plantao. Recusa aluno inativo E aluno bloqueado_por_programa (quem migrou para o Programa de Implementacao), com a MESMA mensagem generica de senha errada — nao revela quem comprou o que. Primeiro acesso aceita a senha padrao de app.plantao_senha_padrao (falha FECHADO sem o setting) e marca senha_provisoria; a padrao so vale para o 1o login. p_documento e IGNORADO.';
