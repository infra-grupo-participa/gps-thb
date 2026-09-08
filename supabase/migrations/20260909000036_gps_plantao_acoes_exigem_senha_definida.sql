-- Senha provisória bloqueia AS AÇÕES, não só a tela.
--
-- 🔴 Hipótese levantada pelo `security-pentester` e CONFIRMADA por teste como
-- `anon` no banco: um aluno que entrou com a senha padrão e não trocou
-- conseguia chamar `gps.plantao_inscrever` direto e se inscrever. A obrigação
-- de trocar a senha era só uma tela que o portal decidia mostrar — e Server
-- Action é endpoint HTTP, então bastava chamar a RPC de outro cliente.
--
-- Por que isso importa mais aqui do que pareceria: a senha padrão é a MESMA
-- para os 422. Enquanto ela vale para uma conta, qualquer um que a saiba e
-- conheça o e-mail pode agir em nome da pessoa. Obrigar a troca ANTES de
-- qualquer ação encurta essa janela ao mínimo possível — é a mitigação que
-- sustenta a decisão de usar senha padrão (ver migração ...033).
--
-- DESENHO: duas portas, de propósito.
--   `plantao_sessao`        → LEITURA. Aceita senha provisória.
--   `plantao_sessao_valida` → AÇÃO.   Recusa senha provisória.
--
-- A leitura precisa continuar passando, senão o aluno não conseguiria nem ver
-- a tela onde troca a senha — a trava trancaria a própria saída.
--
-- Nas 4 RPCs de ação (`inscrever`, `cancelar`, `revelar_link`,
-- `registrar_nps`) a ÚNICA mudança é a linha que resolve o aluno:
-- `gps.plantao_sessao` → `gps.plantao_sessao_valida`. Todo o resto do corpo
-- fica idêntico — IDOR por dono, janela de 1h do link, idempotência da
-- presença, validação da nota.
--
-- `revelar_link` é a mais crítica das quatro: revelar GRAVA PRESENÇA. Sem esta
-- trava, quem soubesse a senha padrão poderia marcar presença em nome de quem
-- ainda não trocou a senha.
--
-- Reversão: trocar `plantao_sessao_valida` de volta por `plantao_sessao` nas 4
-- e `drop function gps.plantao_sessao_valida(text);`

create or replace function gps.plantao_sessao_valida(p_token text)
returns table (aluno_plantao_id uuid, nome text)
language plpgsql
security definer
set search_path to 'pg_catalog', 'extensions', 'public', 'gps'
as $function$
declare
  v_id uuid;
  v_nome text;
  v_provisoria boolean;
begin
  select s.aluno_plantao_id, s.nome, s.senha_provisoria
    into v_id, v_nome, v_provisoria
  from gps.plantao_sessao(p_token) s;

  -- Sessão inexistente, expirada, de aluno inativo ou bloqueado já cai aqui
  -- (`plantao_sessao` não devolve linha nesses casos). Falta só a provisória.
  if v_id is null or coalesce(v_provisoria, false) then
    return;
  end if;

  return query select v_id, v_nome;
end;
$function$;

revoke execute on function gps.plantao_sessao_valida(text) from public;
grant execute on function gps.plantao_sessao_valida(text) to anon, authenticated;

comment on function gps.plantao_sessao_valida(text) is
  'Sessao APTA A AGIR: como plantao_sessao, mas recusa tambem quem ainda esta com a senha padrao (senha_provisoria). Usada pelas RPCs de acao (inscrever/cancelar/revelar/nps). As de leitura usam plantao_sessao, senao o aluno nao veria a tela onde troca a senha.';

-- As 4 RPCs de ação passam a resolver o aluno por `plantao_sessao_valida`.
-- Corpo integral versionado abaixo (não é `alter`; é o corpo real aplicado).

create or replace function gps.plantao_inscrever(p_token text, p_slot_id uuid)
returns table (
  ok boolean, motivo text, inscricao_id uuid, email text, nome text,
  data date, hora_inicio time without time zone, mentora_nome text
)
language plpgsql
security definer
set search_path to 'pg_catalog', 'extensions', 'public', 'gps'
as $function$
declare
  v_aluno_id uuid;
  v_slot gps.plantao_slots%rowtype;
  v_ativa_id uuid;
  v_nova_id uuid;
  v_aluno gps.plantao_alunos%rowtype;
  v_mentora_nome text;
begin
  select s.aluno_plantao_id into v_aluno_id from gps.plantao_sessao_valida(p_token) s;
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
  returning id into v_nova_id;

  insert into gps.plantao_eventos (aluno_plantao_id, acao)
    values (v_aluno_id, 'plantao_inscricao');

  select * into v_aluno from gps.plantao_alunos where id = v_aluno_id;
  select m.nome into v_mentora_nome
    from gps.plantao_mentoras m where m.id = v_slot.mentora_id;

  return query select true, null::text, v_nova_id,
    v_aluno.email, v_aluno.nome, v_slot.data, v_slot.hora_inicio, v_mentora_nome;
end;
$function$;

create or replace function gps.plantao_cancelar(p_token text, p_inscricao_id uuid)
returns table (ok boolean, motivo text)
language plpgsql
security definer
set search_path to 'pg_catalog', 'extensions', 'public', 'gps'
as $function$
declare
  v_aluno_id uuid;
  v_dono uuid;
  v_slot_id uuid;
begin
  select s.aluno_plantao_id into v_aluno_id from gps.plantao_sessao_valida(p_token) s;
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
$function$;

create or replace function gps.plantao_revelar_link(p_token text, p_inscricao_id uuid)
returns table (ok boolean, motivo text, zoom_url text)
language plpgsql
security definer
set search_path to 'pg_catalog', 'extensions', 'public', 'gps'
as $function$
declare
  v_aluno_id uuid;
  v_dono uuid;
  v_slot gps.plantao_slots%rowtype;
begin
  select s.aluno_plantao_id into v_aluno_id from gps.plantao_sessao_valida(p_token) s;
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
$function$;

create or replace function gps.plantao_registrar_nps(p_token text, p_inscricao_id uuid, p_nota smallint, p_comentario text)
returns table (ok boolean, motivo text)
language plpgsql
security definer
set search_path to 'pg_catalog', 'extensions', 'public', 'gps'
as $function$
declare
  v_aluno_id uuid;
  v_dono uuid;
  v_presenca timestamptz;
  v_fim_em timestamptz;
begin
  select s.aluno_plantao_id into v_aluno_id from gps.plantao_sessao_valida(p_token) s;
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
$function$;
