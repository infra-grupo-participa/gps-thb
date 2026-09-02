-- Plantão de Dúvidas — Acelera Holding — funções.
--
-- ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
-- (commit b457005) e PROIBIDO de reconstruir.
--
-- Todas SECURITY DEFINER, `search_path` fechado (inclui `extensions` para
-- `crypt`/`gen_salt`). `revoke execute ... from public` ANTES de
-- `grant execute ... to anon` — função em schema exposto NASCE PÚBLICA.
--
-- REGRA TRANSVERSAL: toda função pós-login recebe TOKEN DE SESSÃO, nunca
-- e-mail. Toda uma valida que a inscrição pertence ao aluno da sessão
-- (defesa contra IDOR). NENHUMA devolve e-mail, documento, telefone ou lista
-- de participantes com nome.

-- ─────────────────────────────────────────────────────────────────────────
-- Parâmetros de rate limit / bloqueio (constantes de função, não de tabela).
-- ─────────────────────────────────────────────────────────────────────────
-- Login: no máx. 20 tentativas por IP a cada 15 min; 5 falhas seguidas na
-- MESMA conta bloqueiam a conta por 15 min (gps.plantao_acessos.bloqueado_ate).

-- ─────────────────────────────────────────────────────────────────────────
-- gps.plantao_login
-- ─────────────────────────────────────────────────────────────────────────
create or replace function gps.plantao_login(
  p_email text,
  p_senha text,
  p_ip_hash text
)
returns table (
  ok boolean,
  motivo text,
  sessao_token text,
  primeiro_acesso boolean,
  nome text
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public, gps
as $$
declare
  v_email text := lower(btrim(p_email));
  v_aluno gps.plantao_alunos%rowtype;
  v_acesso gps.plantao_acessos%rowtype;
  v_tentativas_ip int;
  v_token text;
  v_token_hash text;
  v_generico text := 'E-mail ou senha inválidos.';
begin
  -- Rate limit por IP ANTES de qualquer trabalho: 20 tentativas de login
  -- (falha OU sucesso, todas contam) a cada 15 min.
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
    -- Gasta um crypt() descartável contra hash fixo para manter tempo
    -- constante entre "não existe" e "senha errada" — não revela por timing
    -- se o e-mail está cadastrado.
    perform extensions.crypt(p_senha, '$2a$10$abcdefghijklmnopqrstuu');
    insert into gps.plantao_eventos (acao, ip_hash) values ('plantao_login_falha', p_ip_hash);
    return query select false, v_generico, null::text, false, null::text;
    return;
  end if;

  select * into v_acesso
  from gps.plantao_acessos
  where aluno_plantao_id = v_aluno.id;

  if not found then
    -- 1º acesso: a senha enviada AGORA vira a credencial. Sem prova de posse
    -- do e-mail — risco aceito explicitamente pelo Marcio. Mitigado por rate
    -- limit de IP (acima) e backoff de conta (abaixo, nos próximos logins).
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
      values (v_aluno.id, 'plantao_login_ok', p_ip_hash);

    return query select true, null::text, v_token, true, v_aluno.nome;
    return;
  end if;

  -- Conta com credencial: checa bloqueio por excesso de falhas.
  if v_acesso.bloqueado_ate is not null and v_acesso.bloqueado_ate > now() then
    return query select false, 'Conta temporariamente bloqueada. Tente novamente em alguns minutos.'::text,
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
    update gps.plantao_acessos
    set falhas = falhas + 1,
        bloqueado_ate = case when falhas + 1 >= 5 then now() + interval '15 minutes' else bloqueado_ate end
    where aluno_plantao_id = v_aluno.id;

    insert into gps.plantao_eventos (aluno_plantao_id, acao, ip_hash)
      values (v_aluno.id, 'plantao_login_falha', p_ip_hash);

    return query select false, v_generico, null::text, false, null::text;
    return;
  end if;
end;
$$;

revoke execute on function gps.plantao_login(text, text, text) from public;
grant execute on function gps.plantao_login(text, text, text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- gps.plantao_sessao — função MAIS chamada do desenho, enxuta.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function gps.plantao_sessao(p_token text)
returns table (aluno_plantao_id uuid, nome text)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public, gps
as $$
declare
  v_hash text := encode(extensions.digest(p_token, 'sha256'), 'hex');
  v_sessao_id uuid;
  v_aluno_id uuid;
  v_nome text;
begin
  select s.id, s.aluno_plantao_id, a.nome
    into v_sessao_id, v_aluno_id, v_nome
  from gps.plantao_sessoes s
  join gps.plantao_alunos a on a.id = s.aluno_plantao_id
  where s.token_hash = v_hash
    and s.expira_em > now()
    and a.ativo;

  if not found then
    return;
  end if;

  update gps.plantao_sessoes set ultimo_uso_em = now() where id = v_sessao_id;

  return query select v_aluno_id, v_nome;
end;
$$;

revoke execute on function gps.plantao_sessao(text) from public;
grant execute on function gps.plantao_sessao(text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- gps.plantao_logout
-- ─────────────────────────────────────────────────────────────────────────
create or replace function gps.plantao_logout(p_token text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, extensions, public, gps
as $$
declare
  v_hash text := encode(extensions.digest(p_token, 'sha256'), 'hex');
begin
  delete from gps.plantao_sessoes where token_hash = v_hash;
end;
$$;

revoke execute on function gps.plantao_logout(text) from public;
grant execute on function gps.plantao_logout(text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- gps.plantao_minha_inscricao — 9ª função, fora da lista original do plano
-- (que previa 8). Necessária porque `plantao_inscricoes` NÃO tem policy
-- para `anon`/`authenticated` (só admin) — sem esta RPC, a Server Action
-- que resolve "qual é a minha vaga atual" leria direto a tabela e o RLS
-- devolveria sempre vazio. Mesma regra das demais: token de sessão, nunca
-- nomes/e-mail de terceiros.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function gps.plantao_minha_inscricao(p_token text)
returns table (
  inscricao_id uuid,
  slot_id uuid,
  data date,
  hora_inicio time,
  mentora_nome text,
  presenca_em timestamptz,
  nps_em timestamptz,
  inicio_em timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public, gps
as $$
declare
  v_aluno_id uuid;
begin
  select s.aluno_plantao_id into v_aluno_id from gps.plantao_sessao(p_token) s;
  if v_aluno_id is null then
    return;
  end if;

  return query
  select i.id, sl.id, sl.data, sl.hora_inicio, m.nome, i.presenca_em, i.nps_em, sl.inicio_em
  from gps.plantao_inscricoes i
  join gps.plantao_slots sl on sl.id = i.slot_id
  join gps.plantao_mentoras m on m.id = sl.mentora_id
  where i.aluno_plantao_id = v_aluno_id
    and i.cancelado_em is null
  order by i.inscrito_em desc
  limit 1;
end;
$$;

revoke execute on function gps.plantao_minha_inscricao(text) from public;
grant execute on function gps.plantao_minha_inscricao(text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- gps.plantao_calendario — o mês inteiro em UMA chamada.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function gps.plantao_calendario(p_token text, p_ano int, p_mes int)
returns table (
  slot_id uuid,
  data date,
  hora_inicio time,
  duracao_min int,
  mentora_nome text,
  inscritos_qtd int,
  minha_inscricao boolean,
  encerrado boolean
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public, gps
as $$
declare
  v_aluno_id uuid;
  v_inicio timestamptz;
  v_fim timestamptz;
begin
  select s.aluno_plantao_id into v_aluno_id from gps.plantao_sessao(p_token) s;
  if v_aluno_id is null then
    return;
  end if;

  v_inicio := make_date(p_ano, p_mes, 1) at time zone 'America/Sao_Paulo';
  v_fim := (make_date(p_ano, p_mes, 1) + interval '1 month') at time zone 'America/Sao_Paulo';

  return query
  select
    sl.id,
    sl.data,
    sl.hora_inicio,
    sl.duracao_min,
    m.nome,
    coalesce(cnt.qtd, 0)::int,
    (insc.id is not null),
    (sl.inicio_em <= now())
  from gps.plantao_slots sl
  join gps.plantao_mentoras m on m.id = sl.mentora_id
  left join lateral (
    select count(*) as qtd
    from gps.plantao_inscricoes i
    where i.slot_id = sl.id and i.cancelado_em is null
  ) cnt on true
  left join gps.plantao_inscricoes insc
    on insc.slot_id = sl.id
    and insc.aluno_plantao_id = v_aluno_id
    and insc.cancelado_em is null
  where sl.publicado
    and sl.inicio_em >= v_inicio
    and sl.inicio_em < v_fim
  order by sl.inicio_em;
end;
$$;

revoke execute on function gps.plantao_calendario(text, int, int) from public;
grant execute on function gps.plantao_calendario(text, int, int) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- gps.plantao_inscrever
-- ─────────────────────────────────────────────────────────────────────────
create or replace function gps.plantao_inscrever(p_token text, p_slot_id uuid)
returns table (
  ok boolean,
  motivo text,
  inscricao_id uuid,
  -- Dados do PRÓPRIO aluno inscrito, só para a Server Action compor o
  -- e-mail de confirmação sem precisar de uma segunda leitura direta na
  -- tabela (que o RLS bloquearia para anon/authenticated).
  email text,
  nome text,
  data date,
  hora_inicio time,
  mentora_nome text
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public, gps
as $$
declare
  v_aluno_id uuid;
  v_slot gps.plantao_slots%rowtype;
  v_ativa_id uuid;
  v_nova_id uuid;
  v_aluno gps.plantao_alunos%rowtype;
  v_mentora_nome text;
begin
  select s.aluno_plantao_id into v_aluno_id from gps.plantao_sessao(p_token) s;
  if v_aluno_id is null then
    return query select false, 'Sessão expirada. Entre novamente.'::text,
      null::uuid, null::text, null::text, null::date, null::time, null::text;
    return;
  end if;

  select * into v_slot from gps.plantao_slots where id = p_slot_id for update;
  if not found or not v_slot.publicado then
    return query select false, 'Este plantão não está disponível.'::text,
      null::uuid, null::text, null::text, null::date, null::time, null::text;
    return;
  end if;

  if v_slot.inicio_em <= now() then
    return query select false, 'Este plantão já começou ou já passou.'::text,
      null::uuid, null::text, null::text, null::date, null::time, null::text;
    return;
  end if;

  if v_slot.zoom_url is null or btrim(v_slot.zoom_url) = '' then
    return query select false, 'Este plantão ainda não está pronto para inscrição.'::text,
      null::uuid, null::text, null::text, null::date, null::time, null::text;
    return;
  end if;

  -- Trava "1 inscrição ativa por vez": depende de now(), não vira índice
  -- único (ver comentário na migration de estrutura). Checagem em transação,
  -- com lock do slot acima evitando corrida de duas inscrições simultâneas
  -- no MESMO slot; a trava "só 1 no total" é lida aqui dentro da mesma tx.
  select i.id into v_ativa_id
  from gps.plantao_inscricoes i
  join gps.plantao_slots sl on sl.id = i.slot_id
  where i.aluno_plantao_id = v_aluno_id
    and i.cancelado_em is null
    and sl.inicio_em > now()
  limit 1;

  if v_ativa_id is not null then
    return query select false, 'Você já tem um plantão marcado. Cancele-o antes de escolher outro.'::text,
      null::uuid, null::text, null::text, null::date, null::time, null::text;
    return;
  end if;

  insert into gps.plantao_inscricoes (slot_id, aluno_plantao_id)
  values (p_slot_id, v_aluno_id)
  on conflict (slot_id, aluno_plantao_id) do update
    set cancelado_em = null, inscrito_em = now()
  returning id into v_nova_id;

  insert into gps.plantao_eventos (aluno_plantao_id, acao, slot_id)
    values (v_aluno_id, 'plantao_inscricao', p_slot_id);

  select * into v_aluno from gps.plantao_alunos where id = v_aluno_id;
  select m.nome into v_mentora_nome from gps.plantao_mentoras m where m.id = v_slot.mentora_id;

  return query select true, null::text, v_nova_id,
    v_aluno.email, v_aluno.nome, v_slot.data, v_slot.hora_inicio, v_mentora_nome;
end;
$$;

revoke execute on function gps.plantao_inscrever(text, uuid) from public;
grant execute on function gps.plantao_inscrever(text, uuid) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- gps.plantao_cancelar
-- ─────────────────────────────────────────────────────────────────────────
create or replace function gps.plantao_cancelar(p_token text, p_inscricao_id uuid)
returns table (ok boolean, motivo text)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public, gps
as $$
declare
  v_aluno_id uuid;
  v_dono uuid;
  v_slot_id uuid;
begin
  select s.aluno_plantao_id into v_aluno_id from gps.plantao_sessao(p_token) s;
  if v_aluno_id is null then
    return query select false, 'Sessão expirada. Entre novamente.'::text;
    return;
  end if;

  select aluno_plantao_id, slot_id into v_dono, v_slot_id
  from gps.plantao_inscricoes
  where id = p_inscricao_id and cancelado_em is null
  for update;

  if v_dono is null then
    return query select false, 'Inscrição não encontrada.'::text;
    return;
  end if;

  -- IDOR: a inscrição precisa pertencer ao aluno da sessão.
  if v_dono <> v_aluno_id then
    return query select false, 'Inscrição não encontrada.'::text;
    return;
  end if;

  update gps.plantao_inscricoes set cancelado_em = now() where id = p_inscricao_id;

  insert into gps.plantao_eventos (aluno_plantao_id, acao, slot_id)
    values (v_aluno_id, 'plantao_cancelamento', v_slot_id);

  return query select true, null::text;
end;
$$;

revoke execute on function gps.plantao_cancelar(text, uuid) from public;
grant execute on function gps.plantao_cancelar(text, uuid) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- gps.plantao_revelar_link — só dentro da janela; presença idempotente.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function gps.plantao_revelar_link(p_token text, p_inscricao_id uuid)
returns table (ok boolean, motivo text, zoom_url text)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public, gps
as $$
declare
  v_aluno_id uuid;
  v_dono uuid;
  v_slot gps.plantao_slots%rowtype;
begin
  select s.aluno_plantao_id into v_aluno_id from gps.plantao_sessao(p_token) s;
  if v_aluno_id is null then
    return query select false, 'Sessão expirada. Entre novamente.'::text, null::text;
    return;
  end if;

  select i.aluno_plantao_id into v_dono
  from gps.plantao_inscricoes i
  where i.id = p_inscricao_id and i.cancelado_em is null;

  select sl.* into v_slot
  from gps.plantao_inscricoes i
  join gps.plantao_slots sl on sl.id = i.slot_id
  where i.id = p_inscricao_id and i.cancelado_em is null;

  if v_dono is null or v_dono <> v_aluno_id then
    return query select false, 'Inscrição não encontrada.'::text, null::text;
    return;
  end if;

  if now() < v_slot.inicio_em - interval '60 minutes'
     or now() > v_slot.inicio_em + interval '60 minutes' then
    return query select false, 'O link só fica disponível de 1 hora antes até 1 hora depois do início.'::text, null::text;
    return;
  end if;

  if v_slot.zoom_url is null or btrim(v_slot.zoom_url) = '' then
    return query select false, 'O link deste plantão ainda não foi cadastrado.'::text, null::text;
    return;
  end if;

  -- Idempotente: só grava presenca_em se ainda não tiver.
  update gps.plantao_inscricoes
  set presenca_em = now()
  where id = p_inscricao_id and presenca_em is null;

  insert into gps.plantao_eventos (aluno_plantao_id, acao, slot_id)
    values (v_aluno_id, 'plantao_presenca', v_slot.id);

  return query select true, null::text, v_slot.zoom_url;
end;
$$;

revoke execute on function gps.plantao_revelar_link(text, uuid) from public;
grant execute on function gps.plantao_revelar_link(text, uuid) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- gps.plantao_registrar_nps
-- ─────────────────────────────────────────────────────────────────────────
create or replace function gps.plantao_registrar_nps(
  p_token text,
  p_inscricao_id uuid,
  p_nota smallint,
  p_comentario text
)
returns table (ok boolean, motivo text)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public, gps
as $$
declare
  v_aluno_id uuid;
  v_dono uuid;
  v_presenca timestamptz;
  v_fim_em timestamptz;
begin
  select s.aluno_plantao_id into v_aluno_id from gps.plantao_sessao(p_token) s;
  if v_aluno_id is null then
    return query select false, 'Sessão expirada. Entre novamente.'::text;
    return;
  end if;

  if p_nota is null or p_nota < 0 or p_nota > 10 then
    return query select false, 'Nota inválida.'::text;
    return;
  end if;

  select i.aluno_plantao_id, i.presenca_em, sl.inicio_em + make_interval(mins => sl.duracao_min)
    into v_dono, v_presenca, v_fim_em
  from gps.plantao_inscricoes i
  join gps.plantao_slots sl on sl.id = i.slot_id
  where i.id = p_inscricao_id;

  if v_dono is null or v_dono <> v_aluno_id then
    return query select false, 'Inscrição não encontrada.'::text;
    return;
  end if;

  if v_presenca is null then
    return query select false, 'Só é possível avaliar quem participou do plantão.'::text;
    return;
  end if;

  if v_fim_em > now() then
    return query select false, 'O plantão ainda não terminou.'::text;
    return;
  end if;

  update gps.plantao_inscricoes
  set nps_nota = p_nota,
      nps_comentario = p_comentario,
      nps_em = now()
  where id = p_inscricao_id;

  return query select true, null::text;
end;
$$;

revoke execute on function gps.plantao_registrar_nps(text, uuid, smallint, text) from public;
grant execute on function gps.plantao_registrar_nps(text, uuid, smallint, text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- gps.plantao_nps_pendente / gps.plantao_marcar_nps_enviado /
-- gps.plantao_expurgar — de uso EXCLUSIVO do job diário
-- (`/api/plantao/manutencao`), que roda sem sessão de aluno ou de admin
-- (chamado por pg_cron via HTTP). `plantao_inscricoes`/`plantao_sessoes`/
-- `plantao_eventos` só têm policy de admin — por isso o job também precisa
-- de RPC, não de leitura direta. Não fazem parte das "8 funções" do plano
-- original; documentado aqui como extensão necessária de B12.
--
-- ⚠️ SEGURANÇA: estas 3 funções fazem DELETE em massa e disparam envio de
-- e-mail — se apenas `grant to anon` sem mais nada, QUALQUER requisição
-- anônima ao PostgREST (a `anon key` é pública no bundle do cliente)
-- poderia chamar `plantao_expurgar()` e derrubar sessões de todo mundo, ou
-- martelar `plantao_nps_pendente`. Por isso recebem `p_segredo` e conferem
-- contra `app.plantao_manutencao_segredo` (mesmo valor de
-- `PLANTAO_MANUTENCAO_SEGREDO`, setado via `alter role authenticator set
-- app.plantao_manutencao_segredo = '...'` — REVISAR e aplicar manualmente,
-- não incluído neste arquivo por ser segredo).
-- ─────────────────────────────────────────────────────────────────────────
create or replace function gps.plantao_nps_pendente(p_segredo text, p_limite int default 200)
returns table (
  inscricao_id uuid,
  email text,
  nome text,
  mentora_nome text
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public, gps
as $$
begin
  if p_segredo is null or p_segredo <> current_setting('app.plantao_manutencao_segredo', true) then
    raise exception 'Não autorizado' using errcode = '42501';
  end if;

  return query
  select i.id, a.email, a.nome, m.nome
  from gps.plantao_inscricoes i
  join gps.plantao_slots sl on sl.id = i.slot_id
  join gps.plantao_mentoras m on m.id = sl.mentora_id
  join gps.plantao_alunos a on a.id = i.aluno_plantao_id
  where i.presenca_em is not null
    and i.nps_em is null
    and i.nps_email_em is null
    and sl.inicio_em + make_interval(mins => sl.duracao_min) <= now()
    and sl.inicio_em + make_interval(mins => sl.duracao_min) >= now() - interval '48 hours'
  limit greatest(p_limite, 0);
end;
$$;

revoke execute on function gps.plantao_nps_pendente(text, int) from public;
grant execute on function gps.plantao_nps_pendente(text, int) to anon, authenticated;

create or replace function gps.plantao_marcar_nps_enviado(p_segredo text, p_inscricao_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, extensions, public, gps
as $$
begin
  if p_segredo is null or p_segredo <> current_setting('app.plantao_manutencao_segredo', true) then
    raise exception 'Não autorizado' using errcode = '42501';
  end if;

  update gps.plantao_inscricoes
  set nps_email_em = now()
  where id = p_inscricao_id;
end;
$$;

revoke execute on function gps.plantao_marcar_nps_enviado(text, uuid) from public;
grant execute on function gps.plantao_marcar_nps_enviado(text, uuid) to anon, authenticated;

create or replace function gps.plantao_expurgar(p_segredo text)
returns table (sessoes_expurgadas int, eventos_expurgados int)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public, gps
as $$
declare
  v_sessoes int;
  v_eventos int;
begin
  if p_segredo is null or p_segredo <> current_setting('app.plantao_manutencao_segredo', true) then
    raise exception 'Não autorizado' using errcode = '42501';
  end if;

  delete from gps.plantao_sessoes where expira_em < now();
  get diagnostics v_sessoes = row_count;

  delete from gps.plantao_eventos where criado_em < now() - interval '90 days';
  get diagnostics v_eventos = row_count;

  return query select v_sessoes, v_eventos;
end;
$$;

revoke execute on function gps.plantao_expurgar(text) from public;
grant execute on function gps.plantao_expurgar(text) to anon, authenticated;
