-- Plantão — corrige DoS por bloqueio de conta (achado do security-pentester,
-- 01/09/2026).
--
-- ANTES: 5 senhas erradas gravavam `bloqueado_ate` na CONTA. Quem soubesse o
-- e-mail de um aluno podia mantê-lo bloqueado para sempre, repetindo 5 erros
-- a cada 15 min, sem nunca acertar a senha. O aluno legítimo ficava de fora
-- do plantão e nem sabia por quê.
--
-- AGORA: o backoff conta falhas por (conta + origem), lendo gps.plantao_eventos
-- em vez de um contador global na linha da conta. Um atacante em outra origem
-- trava a si mesmo, não o aluno. A coluna `falhas` continua sendo escrita
-- (visibilidade para o admin), mas NÃO é mais o que barra o login — senão o
-- DoS voltaria pela porta dos fundos.
--
-- VERIFICADO em 01/09/2026: atacante levou 6 negativas seguidas de uma origem
-- e o aluno legítimo continuou entrando normalmente da origem dele.
--
-- Mantém: tempo constante no caminho "e-mail não existe", rate limit por IP,
-- mensagem genérica única.
--
-- O corpo desta função é o mesmo aplicado no banco pela migration
-- `gps_plantao_login_backoff_por_origem`. Ver o histórico de migrations do
-- Supabase para o SQL exato.

CREATE OR REPLACE FUNCTION gps.plantao_login(p_email text, p_senha text, p_ip_hash text)
 RETURNS TABLE(ok boolean, motivo text, sessao_token text, primeiro_acesso boolean, nome text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'extensions', 'public', 'gps'
AS $function$
declare
  v_email text := lower(btrim(p_email));
  v_aluno gps.plantao_alunos%rowtype;
  v_acesso gps.plantao_acessos%rowtype;
  v_tentativas_ip int;
  v_falhas_origem int;
  v_token text;
  v_token_hash text;
  v_generico text := 'E-mail ou senha inválidos.';
begin
  -- Rate limit por IP antes de qualquer trabalho.
  if p_ip_hash is not null then
    select count(*) into v_tentativas_ip
    from gps.plantao_eventos
    where acao in ('plantao_login_falha', 'plantao_login_ok')
      and ip_hash = p_ip_hash
      and criado_em > now() - interval '15 minutes';

    if v_tentativas_ip >= 20 then
      insert into gps.plantao_eventos (acao, ip_hash)
        values ('plantao_login_rate_limit', p_ip_hash);
      return query select false, 'Muitas tentativas. Aguarde alguns minutos.'::text,
        null::text, false, null::text;
      return;
    end if;
  end if;

  select * into v_aluno
  from gps.plantao_alunos
  where email = v_email and ativo;

  if not found then
    -- Tempo constante: paga o mesmo custo de bcrypt do caminho "senha errada",
    -- para não revelar por timing se o e-mail está cadastrado.
    perform extensions.crypt(p_senha, '$2a$10$abcdefghijklmnopqrstuu');
    insert into gps.plantao_eventos (acao, ip_hash) values ('plantao_login_falha', p_ip_hash);
    return query select false, v_generico, null::text, false, null::text;
    return;
  end if;

  select * into v_acesso
  from gps.plantao_acessos
  where aluno_plantao_id = v_aluno.id;

  if not found then
    if length(p_senha) < 8 then
      return query select false, 'A senha precisa ter ao menos 8 caracteres.'::text,
        null::text, false, null::text;
      return;
    end if;

    insert into gps.plantao_acessos (aluno_plantao_id, senha_hash, ultimo_login_em)
    values (v_aluno.id, extensions.crypt(p_senha, extensions.gen_salt('bf', 10)), now());

    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

    insert into gps.plantao_sessoes (token_hash, aluno_plantao_id, expira_em, ip_hash)
    values (v_token_hash, v_aluno.id, now() + interval '90 days', p_ip_hash);

    insert into gps.plantao_eventos (aluno_plantao_id, acao, ip_hash)
      values (v_aluno.id, 'plantao_primeiro_acesso', p_ip_hash);

    return query select true, null::text, v_token, true, v_aluno.nome;
    return;
  end if;

  -- Backoff por (conta + origem): só barra quem ERROU desta origem. Assim um
  -- terceiro não consegue trancar a conta do aluno legítimo.
  select count(*) into v_falhas_origem
  from gps.plantao_eventos
  where acao = 'plantao_login_falha'
    and aluno_plantao_id = v_aluno.id
    and ip_hash is not distinct from p_ip_hash
    and criado_em > now() - interval '15 minutes';

  if v_falhas_origem >= 5 then
    return query select false, 'Muitas tentativas. Aguarde alguns minutos.'::text,
      null::text, false, null::text;
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

    return query select true, null::text, v_token, false, v_aluno.nome;
    return;
  else
    -- `falhas` segue sendo contabilizado para o admin enxergar conta sob
    -- ataque, mas NÃO é mais o que bloqueia (senão o DoS voltaria).
    update gps.plantao_acessos
    set falhas = falhas + 1
    where aluno_plantao_id = v_aluno.id;

    insert into gps.plantao_eventos (aluno_plantao_id, acao, ip_hash)
      values (v_aluno.id, 'plantao_login_falha', p_ip_hash);

    return query select false, v_generico, null::text, false, null::text;
    return;
  end if;
end;
$function$;

revoke execute on function gps.plantao_login(text, text, text) from public;
grant execute on function gps.plantao_login(text, text, text) to anon, authenticated;

create index if not exists idx_plantao_eventos_rate
  on gps.plantao_eventos (ip_hash, acao, criado_em desc);

comment on index gps.idx_plantao_eventos_rate is
  'Serve o rate limit do login: contagem por ip_hash+acao na janela de 15 min, e a contagem por conta+origem (que filtra aluno_plantao_id sobre um conjunto já reduzido pela janela).';
