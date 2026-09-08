-- Duas mudanças de regra (decisão do Marcio, 08/09/2026, à noite).
--
-- 1) INSCRIÇÃO ATÉ O INÍCIO. O cut-off de 12:00 da véspera (migração ...040,
--    vindo do calendário oficial do Acelera) SAI. Motivo imediato: o plantão
--    da Isabela é amanhã 14:00 e o prazo venceu hoje ao meio-dia — ninguém
--    conseguia agendar.
--
--    ⚠️ CUSTO REGISTRADO, aceito com a alternativa na mesa: o aviso de véspera
--    da mentora sai de manhã, então a lista que ela recebe pode CRESCER depois
--    de enviada. Era exatamente o que o cut-off protegia. A alternativa
--    oferecida (exceção só para o plantão da Isabela, mantendo a regra geral)
--    foi recusada explicitamente.
--
-- 2) PRESENÇA SÓ ANTES DO INÍCIO. Invertido: era "de 1h antes até 1h depois";
--    agora é "a qualquer momento ANTES, nunca durante nem depois".
--
--    O aluno confirma quando quiser — dias antes, se preferir — e já recebe o
--    link para guardar. Depois que o plantão começa, nem presença nem link.
--
--    ⚠️ Consequência aceita: quem só lembrar na hora não pega o link pela
--    tela — resta o do e-mail que sai 1h antes.
--
-- 3) `pode_cancelar` deixa de depender da sala. A trava de cancelamento (1h
--    antes) existia porque "o link já saiu"; como agora o link pode ser pego a
--    qualquer momento antes, a condição de `zoom_url` perdeu sentido. Manter
--    duas regras divergentes é o padrão que já falhou 4× neste módulo.
--
-- Testado como `anon` nos dois sentidos: o plantão da Isabela passou a aceitar
-- inscrição; presença ANTES devolve o link e grava; num slot que já começou,
-- recusa com "a confirmação de presença se encerrou no horário de início".
--
-- Reversão: reaplicar ...040 (cut-off) e ...043/...044 (janela de ±60min).
--
-- As 5 funções abaixo são o texto exato aplicado em produção nesta data.
-- Reproduzi-las aqui é o que impede repo e produção de divergirem — o achado
-- do `security-pentester` que já custou uma reprovação hoje.
--
-- Para conferir a fidelidade a qualquer momento:
--   select pg_get_functiondef(p.oid) from pg_proc p
--    join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'gps' and p.proname = '<nome>';

create or replace function gps.plantao_inscrever(
  p_email text, p_nome text, p_slot_id uuid, p_ip_hash text default null
)
returns table (
  ok boolean, motivo text, inscricao_id uuid, email text, nome text,
  data date, hora_inicio time without time zone, mentora_nome text
)
language plpgsql
security definer
set search_path to 'pg_catalog', 'extensions', 'public', 'gps'
as $function$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_ip text := coalesce(nullif(btrim(coalesce(p_ip_hash, '')), ''), 'sem-ip');
  v_aluno gps.plantao_alunos%rowtype;
  v_slot gps.plantao_slots%rowtype;
  v_ativa_id uuid;
  v_nova_id uuid;
  v_mentora_nome text;
  v_tentativas int;
  v_generico text := 'Não foi possível concluir a inscrição. Confira o e-mail informado.';
begin
  if not gps.plantao_escrita_liberada() then
    return query select false, 'As inscrições estão temporariamente indisponíveis.'::text,
      null::uuid, null::text, null::text, null::date, null::time, null::text;
    return;
  end if;

  select count(*) into v_tentativas
  from gps.plantao_eventos e
  where e.ip_hash = v_ip
    and e.acao in ('plantao_inscricao', 'plantao_inscricao_tentativa')
    and e.criado_em > now() - interval '15 minutes';

  if v_tentativas >= 10 then
    return query select false, 'Muitas tentativas. Aguarde alguns minutos.'::text,
      null::uuid, null::text, null::text, null::date, null::time, null::text;
    return;
  end if;

  select pa.* into v_aluno from gps.plantao_alunos pa
   where pa.email = v_email and pa.ativo and not pa.bloqueado_por_programa;

  if not found then
    insert into gps.plantao_eventos (acao, ip_hash)
      values ('plantao_inscricao_tentativa', v_ip);
    return query select false, v_generico,
      null::uuid, null::text, null::text, null::date, null::time, null::text;
    return;
  end if;

  select sl.* into v_slot from gps.plantao_slots sl where sl.id = p_slot_id for update;
  if not found or not v_slot.publicado then
    return query select false, 'Este plantão não está disponível.'::text,
      null::uuid, null::text, null::text, null::date, null::time, null::text;
    return;
  end if;

  -- Única trava de prazo: o plantão ainda não pode ter começado.
  -- (O cut-off de 12:00 da véspera saiu — ver cabeçalho.)
  if v_slot.inicio_em <= now() then
    return query select false, 'Este plantão já começou ou já passou.'::text,
      null::uuid, null::text, null::text, null::date, null::time, null::text;
    return;
  end if;

  select i.id into v_ativa_id
  from gps.plantao_inscricoes i
  join gps.plantao_slots sl on sl.id = i.slot_id
  where i.aluno_plantao_id = v_aluno.id
    and i.cancelado_em is null
    and sl.inicio_em > now()
  limit 1;

  if v_ativa_id is not null then
    return query select false, 'Você já tem um plantão marcado. Cancele-o antes de escolher outro.'::text,
      null::uuid, null::text, null::text, null::date, null::time, null::text;
    return;
  end if;

  insert into gps.plantao_inscricoes (slot_id, aluno_plantao_id, nome_informado)
  values (p_slot_id, v_aluno.id, nullif(btrim(coalesce(p_nome, '')), ''))
  returning id into v_nova_id;

  insert into gps.plantao_eventos (aluno_plantao_id, acao, ip_hash, slot_id)
    values (v_aluno.id, 'plantao_inscricao', v_ip, p_slot_id);

  select m.nome into v_mentora_nome
    from gps.plantao_mentoras m where m.id = v_slot.mentora_id;

  return query select true, null::text, v_nova_id,
    v_aluno.email, v_aluno.nome, v_slot.data, v_slot.hora_inicio, v_mentora_nome;
end;
$function$;

comment on function gps.plantao_inscrever(text, text, uuid, text) is
  'Inscreve por E-MAIL (rota publica sem login). Prazo: ate o INICIO do plantao (o cut-off de 12:00 da vespera saiu em 08/09/2026). Rate limit 10/15min por IP, IP ausente cai no balde ''sem-ip''. Guardas: interruptor de emergencia, e-mail em plantao_alunos ativo e nao bloqueado, slot publicado, 1 inscricao ativa (for update contra corrida).';

create or replace function gps.plantao_revelar_link(p_email text, p_inscricao_id uuid)
returns table (ok boolean, motivo text, zoom_url text)
language plpgsql
security definer
set search_path to 'pg_catalog', 'extensions', 'public', 'gps'
as $function$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_aluno_id uuid;
  v_dono uuid;
  v_slot gps.plantao_slots%rowtype;
begin
  if not gps.plantao_escrita_liberada() then
    return query select false, 'Operação temporariamente indisponível.'::text, null::text;
    return;
  end if;

  select id into v_aluno_id from gps.plantao_alunos
   where email = v_email and ativo and not bloqueado_por_programa;
  if v_aluno_id is null then
    return query select false, 'Inscrição não encontrada.'::text, null::text;
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

  -- 🔑 Só ANTES do início. Invertido em 08/09/2026: antes era a janela de
  -- ±60min. Confirmar presença depois que a sessão começou deixou de valer.
  if now() >= v_slot.inicio_em then
    return query select false,
      'Este plantão já começou — a confirmação de presença se encerrou no horário de início.'::text,
      null::text;
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

comment on function gps.plantao_revelar_link(text, uuid) is
  'Revela a sala por e-mail e GRAVA PRESENCA — SO ANTES do inicio (mudanca de 08/09/2026; antes era a janela de +-60min). Depois que o plantao comeca, nem presenca nem link. Respeita o interruptor de emergencia.';

create or replace function gps.plantao_cancelar(p_email text, p_inscricao_id uuid, p_ip_hash text default null)
returns table (ok boolean, motivo text)
language plpgsql
security definer
set search_path to 'pg_catalog', 'extensions', 'public', 'gps'
as $function$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_aluno_id uuid;
  v_dono uuid;
  v_slot_id uuid;
  v_inicio timestamptz;
begin
  if not gps.plantao_escrita_liberada() then
    return query select false, 'Operação temporariamente indisponível.'::text;
    return;
  end if;

  select id into v_aluno_id from gps.plantao_alunos
   where email = v_email and ativo and not bloqueado_por_programa;
  if v_aluno_id is null then
    return query select false, 'Inscrição não encontrada.'::text;
    return;
  end if;

  select i.aluno_plantao_id, i.slot_id, sl.inicio_em
    into v_dono, v_slot_id, v_inicio
  from gps.plantao_inscricoes i
  join gps.plantao_slots sl on sl.id = i.slot_id
  where i.id = p_inscricao_id and i.cancelado_em is null
  for update of i;

  if v_dono is null or v_dono <> v_aluno_id then
    return query select false, 'Inscrição não encontrada.'::text;
    return;
  end if;

  -- Trava 1h antes do início. Não depende mais de haver sala cadastrada.
  if now() >= v_inicio - interval '60 minutes' then
    return query select false,
      'O prazo para cancelar terminou — falta menos de 1 hora para o plantão.'::text;
    return;
  end if;

  update gps.plantao_inscricoes set cancelado_em = now() where id = p_inscricao_id;

  insert into gps.plantao_eventos (aluno_plantao_id, acao, ip_hash, slot_id)
    values (v_aluno_id, 'plantao_cancelamento', p_ip_hash, v_slot_id);

  return query select true, null::text;
end;
$function$;

comment on function gps.plantao_cancelar(text, uuid, text) is
  'Cancela por e-mail. IDOR por dono, mensagem generica unica. TRAVA a partir de 1h antes do inicio — deixou de depender de zoom_url em 08/09/2026, quando o link passou a poder ser pego a qualquer momento antes.';

create or replace function gps.plantao_minha_inscricao(p_email text)
returns table (
  inscricao_id uuid, slot_id uuid, data date,
  hora_inicio time without time zone, mentora_nome text,
  presenca_em timestamptz, nps_em timestamptz, inicio_em timestamptz,
  tem_sala boolean, pode_cancelar boolean
)
language plpgsql
security definer
set search_path to 'pg_catalog', 'extensions', 'public', 'gps'
as $function$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_aluno_id uuid;
begin
  if v_email = '' then return; end if;

  select id into v_aluno_id from gps.plantao_alunos
   where email = v_email and ativo and not bloqueado_por_programa;
  if v_aluno_id is null then return; end if;

  return query
  select i.id, sl.id, sl.data, sl.hora_inicio, m.nome, i.presenca_em, i.nps_em,
         sl.inicio_em,
         (sl.zoom_url is not null and btrim(sl.zoom_url) <> ''),
         -- Espelha plantao_cancelar: 1h antes do início, sem depender de sala.
         (now() < sl.inicio_em - interval '60 minutes')
  from gps.plantao_inscricoes i
  join gps.plantao_slots sl on sl.id = i.slot_id
  join gps.plantao_mentoras m on m.id = sl.mentora_id
  where i.aluno_plantao_id = v_aluno_id
    and i.cancelado_em is null
  order by i.inscrito_em desc
  limit 1;
end;
$function$;

comment on function gps.plantao_minha_inscricao(text) is
  'Inscricao ativa do aluno, resolvida por e-mail. tem_sala e BOOLEANO — a URL so sai por plantao_revelar_link. pode_cancelar espelha plantao_cancelar: trava 1h antes do inicio (deixou de depender de sala em 08/09/2026).';

create or replace function gps.plantao_calendario(p_ano int, p_mes int, p_email text default null)
returns table (
  slot_id uuid, data date, hora_inicio time, duracao_min int,
  mentora_nome text, inscritos_qtd int, minha_inscricao boolean,
  encerrado boolean, inscricao_encerrada boolean
)
language plpgsql
security definer
set search_path to 'pg_catalog', 'extensions', 'public', 'gps'
as $function$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_aluno_id uuid;
  v_inicio timestamptz;
  v_fim timestamptz;
begin
  if v_email <> '' then
    select id into v_aluno_id from gps.plantao_alunos
     where email = v_email and ativo and not bloqueado_por_programa;
  end if;

  v_inicio := make_date(p_ano, p_mes, 1) at time zone 'America/Sao_Paulo';
  v_fim := (make_date(p_ano, p_mes, 1) + interval '1 month') at time zone 'America/Sao_Paulo';

  return query
  select sl.id, sl.data, sl.hora_inicio, sl.duracao_min, m.nome,
         coalesce(cnt.qtd, 0)::int,
         (insc.id is not null),
         (sl.inicio_em <= now()),
         -- Espelha plantao_inscrever: a única trava de prazo é o início.
         (sl.inicio_em <= now())
  from gps.plantao_slots sl
  join gps.plantao_mentoras m on m.id = sl.mentora_id
  left join lateral (
    select count(*) as qtd
    from gps.plantao_inscricoes i
    join gps.plantao_alunos a
      on a.id = i.aluno_plantao_id and not a.bloqueado_por_programa
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
$function$;

revoke execute on function gps.plantao_calendario(int, int, text) from public;
grant execute on function gps.plantao_calendario(int, int, text) to anon, authenticated;

comment on function gps.plantao_calendario(int, int, text) is
  'Calendario mensal PUBLICO. p_email opcional. inscritos_qtd exclui bloqueado_por_programa. Desde 08/09/2026 o cut-off de 12:00 da vespera saiu: inscricao_encerrada espelha plantao_inscrever (= ja comecou). A coluna fica para o dia em que voltar um prazo — so a expressao muda.';
