-- Plantão — fecha o sequestro de conta em massa no 1º acesso.
--
-- ACHADO (security-pentester, 01/09/2026): o 1º acesso criava a senha só com
-- e-mail, e a resposta devolvia `primeiro_acesso = true`. Isso não só permitia
-- tomar a conta de quem ainda não tinha entrado — DENUNCIAVA quais dos 421
-- e-mails estavam nessa janela. Um atacante com a lista varreria todos e
-- tomaria as contas em lote, com o rate limit de IP como único freio.
--
-- DECISÃO DO MARCIO (01/09/2026): exigir os 4 últimos dígitos do documento da
-- compra no 1º acesso. Continua tudo na mesma tela embedada, sem sair para o
-- e-mail — mas "saber o e-mail" deixa de bastar.
--
-- Cobertura medida: 375 dos 421 têm documento; os 46 sem documento são
-- liberados caso a caso pelo admin (gps.plantao_liberar_primeiro_acesso).
--
-- ⚠️ A resposta NUNCA revela se o e-mail existe, se já tem senha, ou se o
-- documento é o problema — motivo genérico único em todos os caminhos de
-- falha. É isso que impede a varredura.
--
-- VERIFICADO em 01/09/2026: sem documento -> negado; documento errado ->
-- negado e `primeiro_acesso` volta false (não vaza o sinal); documento certo
-- -> entra. E `select count(*) from pg_proc ... proname='plantao_login'`
-- devolveu 1: a assinatura antiga de 3 argumentos foi dropada, não ficou
-- viva e chamável por `anon`.

alter table gps.plantao_alunos
  add column if not exists liberado_sem_documento boolean not null default false;

comment on column gps.plantao_alunos.liberado_sem_documento is
  'true quando o admin liberou o 1º acesso sem conferência de documento (aluno sem documento no CSV, ou divergência de cadastro). Volta a false depois que a senha é criada.';

CREATE OR REPLACE FUNCTION gps.plantao_login(p_email text, p_senha text, p_ip_hash text, p_documento text DEFAULT NULL::text)
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
  v_doc_informado text := regexp_replace(coalesce(p_documento, ''), '\D', '', 'g');
  v_doc_esperado text;
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
        null::text, false, null::text;
      return;
    end if;
  end if;

  select * into v_aluno
  from gps.plantao_alunos
  where email = v_email and ativo;

  if not found then
    -- Tempo constante: paga o mesmo bcrypt do caminho "senha errada".
    perform extensions.crypt(p_senha, '$2a$10$abcdefghijklmnopqrstuu');
    insert into gps.plantao_eventos (acao, ip_hash) values ('plantao_login_falha', p_ip_hash);
    return query select false, v_generico, null::text, false, null::text;
    return;
  end if;

  select * into v_acesso
  from gps.plantao_acessos
  where aluno_plantao_id = v_aluno.id;

  if not found then
    -- ── PRIMEIRO ACESSO ──────────────────────────────────────────────────
    -- Exige os 4 últimos dígitos do documento da compra. Sem isso, saber o
    -- e-mail bastaria para tomar a conta — e a resposta denunciaria quem
    -- ainda não entrou, permitindo varrer a base inteira.
    v_doc_esperado := right(regexp_replace(coalesce(v_aluno.documento, ''), '\D', '', 'g'), 4);

    if not v_aluno.liberado_sem_documento then
      -- Sem documento no cadastro e sem liberação do admin: não dá para
      -- provar posse. Recusa com a MESMA mensagem genérica — não revela que
      -- o e-mail existe nem que o problema é o documento.
      if length(v_doc_esperado) < 4 then
        perform extensions.crypt(p_senha, '$2a$10$abcdefghijklmnopqrstuu');
        insert into gps.plantao_eventos (aluno_plantao_id, acao, ip_hash)
          values (v_aluno.id, 'plantao_primeiro_acesso_sem_documento', p_ip_hash);
        return query select false, v_generico, null::text, false, null::text;
        return;
      end if;

      if v_doc_informado = '' or right(v_doc_informado, 4) <> v_doc_esperado then
        perform extensions.crypt(p_senha, '$2a$10$abcdefghijklmnopqrstuu');
        insert into gps.plantao_eventos (aluno_plantao_id, acao, ip_hash)
          values (v_aluno.id, 'plantao_login_falha', p_ip_hash);
        return query select false, v_generico, null::text, false, null::text;
        return;
      end if;
    end if;

    if length(p_senha) < 8 then
      return query select false, 'A senha precisa ter ao menos 8 caracteres.'::text,
        null::text, false, null::text;
      return;
    end if;

    insert into gps.plantao_acessos (aluno_plantao_id, senha_hash, ultimo_login_em)
    values (v_aluno.id, extensions.crypt(p_senha, extensions.gen_salt('bf', 10)), now());

    -- Consome a liberação: ela vale para UM primeiro acesso, não para sempre.
    if v_aluno.liberado_sem_documento then
      update gps.plantao_alunos set liberado_sem_documento = false where id = v_aluno.id;
    end if;

    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

    insert into gps.plantao_sessoes (token_hash, aluno_plantao_id, expira_em, ip_hash)
    values (v_token_hash, v_aluno.id, now() + interval '90 days', p_ip_hash);

    insert into gps.plantao_eventos (aluno_plantao_id, acao, ip_hash)
      values (v_aluno.id, 'plantao_primeiro_acesso', p_ip_hash);

    return query select true, null::text, v_token, true, v_aluno.nome;
    return;
  end if;

  -- ── ACESSOS SEGUINTES ──────────────────────────────────────────────────
  -- Backoff por (conta + origem): um terceiro não tranca a conta do aluno.
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
    update gps.plantao_acessos set falhas = falhas + 1 where aluno_plantao_id = v_aluno.id;

    insert into gps.plantao_eventos (aluno_plantao_id, acao, ip_hash)
      values (v_aluno.id, 'plantao_login_falha', p_ip_hash);

    return query select false, v_generico, null::text, false, null::text;
    return;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION gps.plantao_liberar_primeiro_acesso(p_aluno_plantao_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'extensions', 'public', 'gps'
AS $function$
begin
  if not public.gp_is_admin() then
    raise exception 'Não autorizado' using errcode = '42501';
  end if;

  update gps.plantao_alunos
  set liberado_sem_documento = true
  where id = p_aluno_plantao_id;
end;
$function$;

-- Derruba a assinatura antiga de 3 argumentos: `create or replace` com
-- assinatura diferente cria função NOVA em vez de substituir, e a antiga
-- (sem exigência de documento) continuaria viva e chamável por `anon`.
drop function if exists gps.plantao_login(text, text, text);

revoke execute on function gps.plantao_login(text, text, text, text) from public;
grant execute on function gps.plantao_login(text, text, text, text) to anon, authenticated;

revoke execute on function gps.plantao_liberar_primeiro_acesso(uuid) from public;
grant execute on function gps.plantao_liberar_primeiro_acesso(uuid) to authenticated;
