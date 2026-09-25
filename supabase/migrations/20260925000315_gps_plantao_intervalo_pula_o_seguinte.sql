-- Plantão: o teto de 1 por semana vira INTERVALO — depois de cada plantão,
-- o plantão SEGUINTE fica de fora; do outro em diante, libera.
--
-- Decisão do João em 25/09/2026, depois do chamado do Wagner (só Acelera):
--   "se tiver plantão segunda, terça e quarta e ele foi no de segunda, ele
--    só pode ir no de quarta em diante".
--   Conta INSCRIÇÃO não cancelada, com ou sem presença (quem reserva e falta
--   não fura a fila de quem foi). O prazo de 12h da véspera continua.
--
-- "Seguinte" = o próximo slot publicado e não cancelado depois do plantão
-- que gerou o intervalo, de qualquer mentora. Calculado AO VIVO: se a equipe
-- publica ou cancela um slot no meio, o intervalo acompanha.
--
-- Log (pedido do João: "entender o comportamento deles"):
--   * toda recusa de inscrição grava `plantao_recusa_<motivo>` com o aluno,
--     o slot e `detalhe` (origem, causa, quando libera) — antes, só o teto
--     gravava, e a tela nem chegava a chamar a RPC (0 eventos desde sempre);
--   * o calendário grava `plantao_bloqueio_exibido` quando MOSTRA a um aluno
--     identificado um slot que ele não pode pegar (intervalo ou prazo),
--     no máximo 1 por aluno×slot×24h.
--
-- Também corrige uma regressão da …312 (aplicada em 24/09): o corpo que foi
-- ao banco perdeu a checagem AO VIVO de "está no Programa" em
-- `plantao_inscrever` (o arquivo do repo tinha; o banco não). Volta aqui,
-- com a exceção nominal `bloqueio_excecao`, igual às outras portas (…226).
--
-- Corrida: o índice uq_plantao_inscricoes_aluno_semana (1 por semana) sai —
-- ele recusaria segunda + quarta da mesma semana, que agora é permitido. A
-- serialização passa a ser um advisory lock por aluno nas 3 portas de
-- inscrição (pública, logada, equipe): duas abas clicando juntas entram em
-- fila e a segunda vê a primeira inscrição.

-- 1) Detalhe estruturado no log -------------------------------------------
alter table gps.plantao_eventos add column if not exists detalhe jsonb;

-- 2) Regra única do intervalo ---------------------------------------------
create or replace function gps.plantao_intervalo(p_aluno_plantao_id uuid, p_slot_id uuid)
returns table(causa_slot_id uuid, causa_data date, causa_hora time, causa_presente boolean,
              libera_slot_id uuid, libera_data date, libera_hora time)
language sql
stable
set search_path to ''
as $$
  with alvo as (
    select s.id, s.inicio_em from gps.plantao_slots s where s.id = p_slot_id
  ),
  causa as (
    -- O plantão do aluno imediatamente ANTERIOR ao alvo.
    select sl.id, sl.data, sl.hora_inicio, sl.inicio_em,
           (i.presenca_em is not null) as presente
      from gps.plantao_inscricoes i
      join gps.plantao_slots sl on sl.id = i.slot_id
      cross join alvo
     where i.aluno_plantao_id = p_aluno_plantao_id
       and i.cancelado_em is null
       and sl.cancelado_em is null
       and sl.id <> alvo.id
       and sl.inicio_em < alvo.inicio_em
     order by sl.inicio_em desc
     limit 1
  ),
  seguinte as (
    -- O primeiro plantão válido depois da causa. Se for o alvo, bloqueia.
    select s.id
      from gps.plantao_slots s cross join causa
     where s.publicado and s.cancelado_em is null
       and s.inicio_em > causa.inicio_em
     order by s.inicio_em, s.id
     limit 1
  )
  select c.id, c.data, c.hora_inicio, c.presente, lib.id, lib.data, lib.hora_inicio
    from causa c
    join seguinte sg on sg.id = p_slot_id
    cross join alvo a
    left join lateral (
      select s.id, s.data, s.hora_inicio
        from gps.plantao_slots s
       where s.publicado and s.cancelado_em is null
         and s.inicio_em > a.inicio_em
       order by s.inicio_em, s.id
       limit 1
    ) lib on true;
$$;

comment on function gps.plantao_intervalo(uuid, uuid) is
  'Se o slot alvo é o plantão logo depois de uma inscrição do aluno, devolve a causa e o slot que libera. Vazio = livre.';

revoke all on function gps.plantao_intervalo(uuid, uuid) from public, anon, authenticated;

-- Situação atual do aluno (para o cartão "em intervalo" da tela).
create or replace function gps.plantao_situacao_aluno(p_aluno_plantao_id uuid)
returns table(causa_data date, causa_hora time, causa_presente boolean,
              bloqueado_data date, bloqueado_hora time,
              libera_data date, libera_hora time)
language sql
stable
set search_path to ''
as $$
  with causa as (
    select sl.id, sl.inicio_em
      from gps.plantao_inscricoes i
      join gps.plantao_slots sl on sl.id = i.slot_id
     where i.aluno_plantao_id = p_aluno_plantao_id
       and i.cancelado_em is null
       and sl.cancelado_em is null
       and sl.inicio_em <= now()
     order by sl.inicio_em desc
     limit 1
  ),
  bloqueado as (
    select s.id
      from gps.plantao_slots s cross join causa
     where s.publicado and s.cancelado_em is null
       and s.inicio_em > causa.inicio_em
     order by s.inicio_em, s.id
     limit 1
  )
  select iv.causa_data, iv.causa_hora, iv.causa_presente,
         b.data, b.hora_inicio, iv.libera_data, iv.libera_hora
    from bloqueado bl
    join gps.plantao_slots b on b.id = bl.id
    cross join lateral gps.plantao_intervalo(p_aluno_plantao_id, bl.id) iv
   where b.inicio_em > now();
$$;

revoke all on function gps.plantao_situacao_aluno(uuid) from public, anon, authenticated;

-- Frase única da recusa por intervalo (as 3 portas e a tela dizem o mesmo).
create or replace function gps.plantao_msg_intervalo(
  p_causa_data date, p_causa_hora time, p_libera_data date, p_libera_hora time)
returns text
language sql
immutable
set search_path to ''
as $$
  select 'Depois de cada plantão, o seguinte fica de fora. Você tem inscrição no de ' ||
         to_char(p_causa_data, 'DD/MM') || ' às ' || to_char(p_causa_hora, 'HH24:MI') ||
         ', então este é o seu intervalo. ' ||
         case when p_libera_data is null
              then 'Você já pode se inscrever no próximo plantão que abrir depois deste.'
              else 'A partir do plantão de ' || to_char(p_libera_data, 'DD/MM') || ' às ' ||
                   to_char(p_libera_hora, 'HH24:MI') || ' você já pode se inscrever.'
         end;
$$;

revoke all on function gps.plantao_msg_intervalo(date, time, date, time) from public, anon, authenticated;

-- Frase do prazo, com a hora exata em que fechou.
create or replace function gps.plantao_msg_prazo(p_slot_id uuid)
returns text
language sql
stable
set search_path to ''
as $$
  select 'As inscrições para este plantão se encerraram às ' ||
         to_char(gps.plantao_prazo_inscricao(p_slot_id) at time zone 'America/Sao_Paulo', 'HH24"h" "de" DD/MM') ||
         ' (o prazo é 12h do dia anterior). Escolha outra data.';
$$;

revoke all on function gps.plantao_msg_prazo(uuid) from public, anon, authenticated;

-- 3) Porta pública ----------------------------------------------------------
create or replace function gps.plantao_inscrever(p_email text, p_nome text, p_slot_id uuid, p_ip_hash text default null::text)
returns table(ok boolean, motivo text, inscricao_id uuid, email text, nome text, data date, hora_inicio time without time zone, mentora_nome text)
language plpgsql
security definer
set search_path to 'pg_catalog', 'extensions', 'public', 'gps'
as $function$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_ip text := coalesce(nullif(btrim(coalesce(p_ip_hash, '')), ''), 'sem-ip');
  v_aluno gps.plantao_alunos%rowtype;
  v_slot gps.plantao_slots%rowtype;
  v_ativa record;
  v_nova_id uuid;
  v_mentora_nome text;
  v_tentativas int;
  v_iv record;
  v_msg text;
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

  if v_email !~ '^[^\s@<>"'']+@[^\s@<>"'']+\.[a-zA-Z]{2,}$' then
    return query select false, 'Informe um e-mail válido.'::text,
      null::uuid, null::text, null::text, null::date, null::time, null::text;
    return;
  end if;

  -- A flag `bloqueado_por_programa` depende do cron da madrugada; a
  -- condição de verdade -- ter ambiente no GPS -- é conferida aqui, ao vivo
  -- (regressão da …312 corrigida; mesma trava das outras portas, …226).
  select a.* into v_aluno
  from gps.plantao_alunos a
  where a.email = v_email
    and a.ativo
    and not a.bloqueado_por_programa
    and not exists (select 1 from gps.membros m
                     join public.thb_alunos t on t.id = m.aluno_id
                    where lower(btrim(t.email)) = a.email
                      and not a.bloqueio_excecao);

  if not found then
    insert into gps.plantao_eventos (aluno_plantao_id, acao, ip_hash, slot_id)
    values (null, 'plantao_inscricao_tentativa', v_ip, p_slot_id);
    return query select false, v_generico,
      null::uuid, null::text, null::text, null::date, null::time, null::text;
    return;
  end if;

  -- Serializa as inscrições DESTE aluno (duas abas, clique duplo).
  perform pg_advisory_xact_lock(hashtextextended('gps.plantao_aluno:' || v_aluno.id::text, 0));

  select sl.* into v_slot from gps.plantao_slots sl where sl.id = p_slot_id for update;

  if not found or not v_slot.publicado or v_slot.cancelado_em is not null then
    insert into gps.plantao_eventos (aluno_plantao_id, acao, ip_hash, slot_id, detalhe)
    values (v_aluno.id, 'plantao_recusa_indisponivel', v_ip,
            case when found then p_slot_id end, jsonb_build_object('origem', 'publico'));
    return query select false, 'Este plantão não está disponível.'::text,
      null::uuid, null::text, null::text, null::date, null::time, null::text;
    return;
  end if;

  if v_slot.inicio_em <= now() then
    insert into gps.plantao_eventos (aluno_plantao_id, acao, ip_hash, slot_id, detalhe)
    values (v_aluno.id, 'plantao_recusa_encerrado', v_ip, p_slot_id, jsonb_build_object('origem', 'publico'));
    return query select false, 'Este plantão já começou ou já passou.'::text,
      null::uuid, null::text, null::text, null::date, null::time, null::text;
    return;
  end if;

  if now() > gps.plantao_prazo_inscricao(p_slot_id) then
    insert into gps.plantao_eventos (aluno_plantao_id, acao, ip_hash, slot_id, detalhe)
    values (v_aluno.id, 'plantao_recusa_prazo', v_ip, p_slot_id, jsonb_build_object('origem', 'publico'));
    return query select false, gps.plantao_msg_prazo(p_slot_id),
      null::uuid, null::text, null::text, null::date, null::time, null::text;
    return;
  end if;

  select i.id, sl.id as slot_id, sl.data, sl.hora_inicio into v_ativa
  from gps.plantao_inscricoes i
  join gps.plantao_slots sl on sl.id = i.slot_id
  where i.aluno_plantao_id = v_aluno.id
    and i.cancelado_em is null
    and sl.inicio_em > now()
  limit 1;

  if v_ativa.id is not null then
    insert into gps.plantao_eventos (aluno_plantao_id, acao, ip_hash, slot_id, detalhe)
    values (v_aluno.id, 'plantao_recusa_ja_inscrito', v_ip, p_slot_id,
            jsonb_build_object('origem', 'publico', 'inscrito_slot_id', v_ativa.slot_id));
    return query select false,
      ('Você já tem um plantão marcado (' || to_char(v_ativa.data, 'DD/MM') || ' às ' ||
       to_char(v_ativa.hora_inicio, 'HH24:MI') || '). Cancele-o antes de escolher outro.')::text,
      null::uuid, null::text, null::text, null::date, null::time, null::text;
    return;
  end if;

  select * into v_iv from gps.plantao_intervalo(v_aluno.id, p_slot_id);
  if found then
    v_msg := gps.plantao_msg_intervalo(v_iv.causa_data, v_iv.causa_hora, v_iv.libera_data, v_iv.libera_hora);
    insert into gps.plantao_eventos (aluno_plantao_id, acao, ip_hash, slot_id, detalhe)
    values (v_aluno.id, 'plantao_recusa_intervalo', v_ip, p_slot_id,
            jsonb_build_object('origem', 'publico', 'causa_slot_id', v_iv.causa_slot_id,
                               'causa_presente', v_iv.causa_presente,
                               'libera_slot_id', v_iv.libera_slot_id));
    return query select false, v_msg,
      null::uuid, null::text, null::text, null::date, null::time, null::text;
    return;
  end if;

  insert into gps.plantao_inscricoes (slot_id, aluno_plantao_id, nome_informado)
  values (p_slot_id, v_aluno.id, nullif(btrim(coalesce(p_nome, '')), ''))
  on conflict (slot_id, aluno_plantao_id) do update
    set cancelado_em = null, inscrito_em = now(),
        nome_informado = coalesce(excluded.nome_informado, gps.plantao_inscricoes.nome_informado)
  returning id into v_nova_id;

  insert into gps.plantao_eventos (aluno_plantao_id, acao, ip_hash, slot_id)
  values (v_aluno.id, 'plantao_inscricao', v_ip, p_slot_id);

  select m.nome into v_mentora_nome from gps.plantao_mentoras m where m.id = v_slot.mentora_id;

  return query select true, null::text, v_nova_id, v_aluno.email,
    coalesce(nullif(btrim(coalesce(p_nome, '')), ''), v_aluno.nome),
    v_slot.data, v_slot.hora_inicio, v_mentora_nome;
end;
$function$;

-- 4) Porta logada (Programa) ------------------------------------------------
create or replace function gps.plantao_inscrever_logado(p_slot_id uuid)
returns table(ok boolean, motivo text, inscricao_id uuid, data date, hora_inicio time without time zone, mentora_nome text)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_pessoa uuid := gps.pessoa_atual(); v_email text; v_nome text;
  v_aluno gps.plantao_alunos%rowtype; v_slot gps.plantao_slots%rowtype;
  v_ativa record; v_nova_id uuid; v_mentora_nome text; v_iv record; v_msg text;
begin
  if v_pessoa is null then
    raise exception 'Sem sessão do Programa.' using errcode = '42501';
  end if;

  if not gps.plantao_escrita_liberada() then
    return query select false, 'As inscrições estão temporariamente indisponíveis.'::text,
      null::uuid, null::date, null::time, null::text;
    return;
  end if;

  select lower(btrim(t.email)), btrim(t.nome) into v_email, v_nome
    from public.thb_alunos t where t.id = v_pessoa;

  if v_email is null or v_email = '' then
    return query select false, 'Seu cadastro não tem e-mail válido. Fale com a equipe.'::text,
      null::uuid, null::date, null::time, null::text;
    return;
  end if;

  insert into gps.plantao_alunos (email, nome, origem, lote, ativo,
                                  bloqueado_por_programa, bloqueio_excecao)
  values (v_email, coalesce(nullif(v_nome, ''), v_email), 'programa_gps',
          to_char(now(), 'YYYY-MM'), true, false, true)
  on conflict (email) do update
     set ativo = true, bloqueado_por_programa = false, bloqueio_excecao = true
  returning * into v_aluno;

  perform pg_advisory_xact_lock(hashtextextended('gps.plantao_aluno:' || v_aluno.id::text, 0));

  select sl.* into v_slot from gps.plantao_slots sl where sl.id = p_slot_id for update;
  if not found or not v_slot.publicado or v_slot.cancelado_em is not null then
    insert into gps.plantao_eventos (aluno_plantao_id, acao, slot_id, detalhe)
    values (v_aluno.id, 'plantao_recusa_indisponivel', case when found then p_slot_id end,
            jsonb_build_object('origem', 'logado'));
    return query select false, 'Este plantão não está disponível.'::text,
      null::uuid, null::date, null::time, null::text;
    return;
  end if;

  if v_slot.inicio_em <= now() then
    insert into gps.plantao_eventos (aluno_plantao_id, acao, slot_id, detalhe)
    values (v_aluno.id, 'plantao_recusa_encerrado', p_slot_id, jsonb_build_object('origem', 'logado'));
    return query select false, 'Este plantão já começou ou já passou.'::text,
      null::uuid, null::date, null::time, null::text;
    return;
  end if;

  if now() > gps.plantao_prazo_inscricao(p_slot_id) then
    insert into gps.plantao_eventos (aluno_plantao_id, acao, slot_id, detalhe)
    values (v_aluno.id, 'plantao_recusa_prazo', p_slot_id, jsonb_build_object('origem', 'logado'));
    return query select false, gps.plantao_msg_prazo(p_slot_id),
      null::uuid, null::date, null::time, null::text;
    return;
  end if;

  select i.id, sl.id as slot_id, sl.data, sl.hora_inicio into v_ativa
    from gps.plantao_inscricoes i
    join gps.plantao_slots sl on sl.id = i.slot_id
   where i.aluno_plantao_id = v_aluno.id and i.cancelado_em is null and sl.inicio_em > now()
   limit 1;

  if v_ativa.id is not null then
    insert into gps.plantao_eventos (aluno_plantao_id, acao, slot_id, detalhe)
    values (v_aluno.id, 'plantao_recusa_ja_inscrito', p_slot_id,
            jsonb_build_object('origem', 'logado', 'inscrito_slot_id', v_ativa.slot_id));
    return query select false,
      ('Você já tem um plantão marcado (' || to_char(v_ativa.data, 'DD/MM') || ' às ' ||
       to_char(v_ativa.hora_inicio, 'HH24:MI') || '). Cancele-o antes de escolher outro.')::text,
      null::uuid, null::date, null::time, null::text;
    return;
  end if;

  select * into v_iv from gps.plantao_intervalo(v_aluno.id, p_slot_id);
  if found then
    v_msg := gps.plantao_msg_intervalo(v_iv.causa_data, v_iv.causa_hora, v_iv.libera_data, v_iv.libera_hora);
    insert into gps.plantao_eventos (aluno_plantao_id, acao, slot_id, detalhe)
    values (v_aluno.id, 'plantao_recusa_intervalo', p_slot_id,
            jsonb_build_object('origem', 'logado', 'causa_slot_id', v_iv.causa_slot_id,
                               'causa_presente', v_iv.causa_presente,
                               'libera_slot_id', v_iv.libera_slot_id));
    return query select false, v_msg, null::uuid, null::date, null::time, null::text;
    return;
  end if;

  insert into gps.plantao_inscricoes (slot_id, aluno_plantao_id, nome_informado)
  values (p_slot_id, v_aluno.id, nullif(v_aluno.nome, ''))
  on conflict (slot_id, aluno_plantao_id) do update
    set cancelado_em = null, inscrito_em = now()
  returning id into v_nova_id;

  insert into gps.plantao_eventos (aluno_plantao_id, acao, slot_id)
    values (v_aluno.id, 'plantao_inscricao_logada', p_slot_id);

  select m.nome into v_mentora_nome from gps.plantao_mentoras m where m.id = v_slot.mentora_id;

  return query select true, null::text, v_nova_id, v_slot.data, v_slot.hora_inicio, v_mentora_nome;
end;
$function$;

-- 5) Porta da equipe ---------------------------------------------------------
create or replace function gps.admin_plantao_inscrever(p_slot_id uuid, p_email text, p_nome text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_email text := lower(btrim(coalesce(p_email,'')));
  v_nome  text := nullif(btrim(coalesce(p_nome,'')),'');
  v_aluno_id uuid; v_slot gps.plantao_slots%rowtype;
  v_ativa_id uuid; v_ativa_slot_id uuid; v_inscricao_id uuid; v_reativada boolean;
  v_iv record;
begin
  if not public.gp_is_admin() then raise exception 'Sem permissão.' using errcode='42501'; end if;
  if not gps.plantao_admin_edicao_liberada() then
    raise exception 'A edição do painel está temporariamente indisponível.' using errcode='40001'; end if;
  if v_email !~ '^[^\s@<>"'']+@[^\s@<>"'']+\.[a-zA-Z]{2,}$' then
    raise exception 'Informe um e-mail válido.' using errcode='22023'; end if;

  select id into v_aluno_id from gps.plantao_alunos
   where email = v_email and ativo and not bloqueado_por_programa
     and not exists (select 1 from gps.membros m
                      join public.thb_alunos t on t.id = m.aluno_id
                     where lower(btrim(t.email)) = v_email);
  if v_aluno_id is null then
    if exists (select 1 from gps.membros m
                join public.thb_alunos t on t.id = m.aluno_id
               where lower(btrim(t.email)) = v_email) then
      raise exception 'Esta pessoa está no Programa de Implementação Assistida. O Plantão é exclusivo de quem faz parte do Acelera Holding.'
        using errcode='P0002';
    end if;
    raise exception 'Este e-mail não está na base de compradores do Acelera (ou está bloqueado). Use "Liberar aluno" antes de inscrever.'
      using errcode='P0002'; end if;

  perform pg_advisory_xact_lock(hashtextextended('gps.plantao_aluno:' || v_aluno_id::text, 0));

  select * into v_slot from gps.plantao_slots where id = p_slot_id for update;
  if not found then raise exception 'Plantão não encontrado.' using errcode='P0002'; end if;

  select i.id, i.slot_id into v_ativa_id, v_ativa_slot_id
    from gps.plantao_inscricoes i join gps.plantao_slots sl on sl.id = i.slot_id
   where i.aluno_plantao_id = v_aluno_id and i.cancelado_em is null
     and sl.inicio_em > now() and i.slot_id <> p_slot_id
   limit 1;
  if v_ativa_id is not null then
    return jsonb_build_object('ok', false,
      'motivo','Este aluno já tem uma inscrição ativa em outro plantão.',
      'slot_conflitante_id', v_ativa_slot_id); end if;

  -- O intervalo vale para a equipe também (mesma regra, frase na 3ª pessoa).
  select * into v_iv from gps.plantao_intervalo(v_aluno_id, p_slot_id);
  if found then
    insert into gps.plantao_eventos (aluno_plantao_id, acao, slot_id, detalhe)
    values (v_aluno_id, 'plantao_recusa_intervalo', p_slot_id,
            jsonb_build_object('origem', 'equipe', 'causa_slot_id', v_iv.causa_slot_id,
                               'causa_presente', v_iv.causa_presente,
                               'libera_slot_id', v_iv.libera_slot_id));
    return jsonb_build_object('ok', false,
      'motivo', 'Este aluno tem inscrição no plantão de ' || to_char(v_iv.causa_data,'DD/MM') ||
                ' às ' || to_char(v_iv.causa_hora,'HH24:MI') ||
                ', e este é o plantão logo depois — o intervalo o deixa de fora. ' ||
                coalesce('Libera a partir de ' || to_char(v_iv.libera_data,'DD/MM') || ' às ' ||
                         to_char(v_iv.libera_hora,'HH24:MI') || '.',
                         'Libera no próximo plantão publicado.'),
      'em_intervalo', true);
  end if;

  insert into gps.plantao_inscricoes (slot_id, aluno_plantao_id, nome_informado)
  values (p_slot_id, v_aluno_id, v_nome)
  on conflict (slot_id, aluno_plantao_id) do update
    set cancelado_em = null, inscrito_em = now(),
        nome_informado = coalesce(excluded.nome_informado, gps.plantao_inscricoes.nome_informado)
  returning id, (xmax <> 0) into v_inscricao_id, v_reativada;

  insert into gps.plantao_eventos (aluno_plantao_id, acao, slot_id)
  values (v_aluno_id, 'plantao_inscricao_criada_pela_equipe', p_slot_id);

  return jsonb_build_object('ok', true, 'inscricao_id', v_inscricao_id,
                            'reativada', coalesce(v_reativada,false));
end $function$;

-- 6) Calendários: colunas novas no FIM (exige drop — muda o row type) -------
-- `bloqueio_semana` continua no contrato, agora = em intervalo, para o
-- front antigo seguir coerente nos minutos entre esta migração e o deploy.
drop function if exists gps.plantao_calendario(integer, integer, text);
drop function if exists gps.plantao_calendario_logado(integer, integer);

create function gps.plantao_calendario(p_ano integer, p_mes integer, p_email text default null::text)
returns table(slot_id uuid, data date, hora_inicio time without time zone, duracao_min integer,
              mentora_nome text, inscritos_qtd integer, minha_inscricao boolean, encerrado boolean,
              inscricao_encerrada boolean, bloqueio_semana boolean,
              bloqueio_intervalo boolean, prazo_encerrado boolean, prazo_em timestamptz,
              intervalo_causa_data date, intervalo_libera_data date, intervalo_libera_hora time without time zone)
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
    select a.id into v_aluno_id from gps.plantao_alunos a
     where a.email = v_email and a.ativo and not a.bloqueado_por_programa
       and not exists (select 1 from gps.membros m
                        join public.thb_alunos t on t.id = m.aluno_id
                       where lower(btrim(t.email)) = v_email
                         and not a.bloqueio_excecao);
  end if;

  v_inicio := make_date(p_ano, p_mes, 1) at time zone 'America/Sao_Paulo';
  v_fim := (make_date(p_ano, p_mes, 1) + interval '1 month') at time zone 'America/Sao_Paulo';

  return query
  with base as (
    select sl.id, sl.data, sl.hora_inicio, sl.duracao_min, m.nome as mentora,
           coalesce(cnt.qtd, 0)::int as qtd,
           (insc.id is not null) as minha,
           (sl.inicio_em <= now()) as comecou,
           gps.plantao_prazo_inscricao(sl.id) as prazo,
           iv.causa_slot_id, iv.causa_data, iv.libera_data, iv.libera_hora
      from gps.plantao_slots sl
      join gps.plantao_mentoras m on m.id = sl.mentora_id
      left join lateral (
        select count(*) as qtd
          from gps.plantao_inscricoes i
          join gps.plantao_alunos a on a.id = i.aluno_plantao_id and not a.bloqueado_por_programa
         where i.slot_id = sl.id and i.cancelado_em is null
      ) cnt on true
      left join gps.plantao_inscricoes insc
        on insc.slot_id = sl.id and insc.aluno_plantao_id = v_aluno_id and insc.cancelado_em is null
      left join lateral (
        select * from gps.plantao_intervalo(v_aluno_id, sl.id)
         where v_aluno_id is not null and insc.id is null and sl.inicio_em > now()
      ) iv on true
     where sl.publicado
       and sl.inicio_em >= v_inicio and sl.inicio_em < v_fim
  ),
  -- Log do que a pessoa VIU travado (1 por aluno×slot a cada 24h). CTE que
  -- escreve roda mesmo sem ser referenciada no SELECT final.
  vistos as (
    insert into gps.plantao_eventos (aluno_plantao_id, acao, slot_id, detalhe)
    select v_aluno_id, 'plantao_bloqueio_exibido', b.id,
           jsonb_build_object('origem', 'publico',
                              'motivo', case when b.causa_slot_id is not null then 'intervalo' else 'prazo' end,
                              'causa_slot_id', b.causa_slot_id)
      from base b
     where v_aluno_id is not null and not b.minha and not b.comecou
       and (b.causa_slot_id is not null or now() > b.prazo)
       and not exists (select 1 from gps.plantao_eventos e
                        where e.aluno_plantao_id = v_aluno_id and e.slot_id = b.id
                          and e.acao = 'plantao_bloqueio_exibido'
                          and e.criado_em > now() - interval '24 hours')
    returning 1
  )
  select b.id, b.data, b.hora_inicio, b.duracao_min, b.mentora, b.qtd, b.minha, b.comecou,
         (b.comecou or now() > b.prazo or b.causa_slot_id is not null),
         (b.causa_slot_id is not null),
         (b.causa_slot_id is not null),
         (not b.comecou and now() > b.prazo),
         b.prazo, b.causa_data, b.libera_data, b.libera_hora
    from base b
   order by b.data, b.hora_inicio;
end;
$function$;

create function gps.plantao_calendario_logado(p_ano integer, p_mes integer)
returns table(slot_id uuid, data date, hora_inicio time without time zone, duracao_min integer,
              mentora_nome text, inscritos_qtd integer, minha_inscricao boolean, encerrado boolean,
              inscricao_encerrada boolean, bloqueio_semana boolean,
              bloqueio_intervalo boolean, prazo_encerrado boolean, prazo_em timestamptz,
              intervalo_causa_data date, intervalo_libera_data date, intervalo_libera_hora time without time zone)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_pessoa uuid := gps.pessoa_atual();
  v_email text; v_aluno_id uuid; v_inicio timestamptz; v_fim timestamptz;
begin
  if v_pessoa is null then
    raise exception 'Sem sessão do Programa.' using errcode = '42501';
  end if;

  select lower(btrim(t.email)) into v_email from public.thb_alunos t where t.id = v_pessoa;
  if v_email is not null then
    select id into v_aluno_id from gps.plantao_alunos where email = v_email and ativo;
  end if;

  v_inicio := make_date(p_ano, p_mes, 1) at time zone 'America/Sao_Paulo';
  v_fim := (make_date(p_ano, p_mes, 1) + interval '1 month') at time zone 'America/Sao_Paulo';

  return query
  with base as (
    select sl.id, sl.data, sl.hora_inicio, sl.duracao_min, m.nome as mentora,
           coalesce(cnt.qtd, 0)::int as qtd,
           (insc.id is not null) as minha,
           (sl.inicio_em <= now()) as comecou,
           gps.plantao_prazo_inscricao(sl.id) as prazo,
           iv.causa_slot_id, iv.causa_data, iv.libera_data, iv.libera_hora
      from gps.plantao_slots sl
      join gps.plantao_mentoras m on m.id = sl.mentora_id
      left join lateral (
        select count(*) as qtd from gps.plantao_inscricoes i
          join gps.plantao_alunos a on a.id = i.aluno_plantao_id
         where i.slot_id = sl.id and i.cancelado_em is null
      ) cnt on true
      left join gps.plantao_inscricoes insc
        on insc.slot_id = sl.id and insc.aluno_plantao_id = v_aluno_id and insc.cancelado_em is null
      left join lateral (
        select * from gps.plantao_intervalo(v_aluno_id, sl.id)
         where v_aluno_id is not null and insc.id is null and sl.inicio_em > now()
      ) iv on true
     where sl.publicado
       and sl.inicio_em >= v_inicio and sl.inicio_em < v_fim
  ),
  vistos as (
    insert into gps.plantao_eventos (aluno_plantao_id, acao, slot_id, detalhe)
    select v_aluno_id, 'plantao_bloqueio_exibido', b.id,
           jsonb_build_object('origem', 'logado',
                              'motivo', case when b.causa_slot_id is not null then 'intervalo' else 'prazo' end,
                              'causa_slot_id', b.causa_slot_id)
      from base b
     where v_aluno_id is not null and not b.minha and not b.comecou
       and (b.causa_slot_id is not null or now() > b.prazo)
       and not exists (select 1 from gps.plantao_eventos e
                        where e.aluno_plantao_id = v_aluno_id and e.slot_id = b.id
                          and e.acao = 'plantao_bloqueio_exibido'
                          and e.criado_em > now() - interval '24 hours')
    returning 1
  )
  select b.id, b.data, b.hora_inicio, b.duracao_min, b.mentora, b.qtd, b.minha, b.comecou,
         (b.comecou or now() > b.prazo or b.causa_slot_id is not null),
         (b.causa_slot_id is not null),
         (b.causa_slot_id is not null),
         (not b.comecou and now() > b.prazo),
         b.prazo, b.causa_data, b.libera_data, b.libera_hora
    from base b
   order by b.data, b.hora_inicio;
end;
$function$;

revoke all on function gps.plantao_calendario(integer, integer, text) from public;
grant execute on function gps.plantao_calendario(integer, integer, text) to anon, authenticated, service_role;
revoke all on function gps.plantao_calendario_logado(integer, integer) from public, anon;
grant execute on function gps.plantao_calendario_logado(integer, integer) to authenticated, service_role;

-- 7) Situação para o cartão da tela ------------------------------------------
create or replace function gps.plantao_minha_situacao(p_email text)
returns table(causa_data date, causa_hora time, causa_presente boolean,
              bloqueado_data date, bloqueado_hora time,
              libera_data date, libera_hora time)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_aluno_id uuid;
begin
  if v_email = '' then return; end if;
  select a.id into v_aluno_id from gps.plantao_alunos a
   where a.email = v_email and a.ativo and not a.bloqueado_por_programa
     and not exists (select 1 from gps.membros m
                      join public.thb_alunos t on t.id = m.aluno_id
                     where lower(btrim(t.email)) = v_email
                       and not a.bloqueio_excecao);
  if v_aluno_id is null then return; end if;
  return query select * from gps.plantao_situacao_aluno(v_aluno_id);
end;
$function$;

create or replace function gps.plantao_minha_situacao_logado()
returns table(causa_data date, causa_hora time, causa_presente boolean,
              bloqueado_data date, bloqueado_hora time,
              libera_data date, libera_hora time)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare v_pessoa uuid := gps.pessoa_atual(); v_email text; v_aluno_id uuid;
begin
  if v_pessoa is null then
    raise exception 'Sem sessão do Programa.' using errcode = '42501';
  end if;
  select lower(btrim(t.email)) into v_email from public.thb_alunos t where t.id = v_pessoa;
  if v_email is null then return; end if;
  select id into v_aluno_id from gps.plantao_alunos where email = v_email and ativo;
  if v_aluno_id is null then return; end if;
  return query select * from gps.plantao_situacao_aluno(v_aluno_id);
end;
$function$;

revoke all on function gps.plantao_minha_situacao(text) from public;
grant execute on function gps.plantao_minha_situacao(text) to anon, authenticated, service_role;
revoke all on function gps.plantao_minha_situacao_logado() from public, anon;
grant execute on function gps.plantao_minha_situacao_logado() to authenticated, service_role;

-- 8) Sai o teto semanal ------------------------------------------------------
drop index if exists gps.uq_plantao_inscricoes_aluno_semana;
drop function if exists gps.plantao_conflito_semana(uuid, uuid);
update gps.plantao_config set valor = 'false' where chave = 'teto_semanal_ativo';
comment on column gps.plantao_inscricoes.semana is
  'Legado do teto de 1 plantão/semana (17–25/09/2026). A regra vigente é o intervalo (gps.plantao_intervalo).';
