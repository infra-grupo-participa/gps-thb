-- A corrida (dois cliques simultaneos em slots diferentes da mesma semana)
-- agora bate no indice unico e levanta 23505. Sem tratamento o aluno veria
-- "duplicate key value violates unique constraint" na tela. Traduz aqui,
-- na mesma frase que a checagem normal usa.

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
  v_ativa_id uuid;
  v_nova_id uuid;
  v_mentora_nome text;
  v_tentativas int;
  v_conflito record;
  v_generico text := 'Não foi possível concluir a inscrição. Confira o e-mail informado.';
  v_msg_semana text := 'Você já tem plantão nesta semana. É um plantão por semana — escolha uma data da semana seguinte.';
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

  -- A flag `bloqueado_por_programa` depende do cron da madrugada. Quem
  -- migrou para o Programa HOJE ainda estaria elegivel ate la, entao a
  -- condicao de verdade -- ter ambiente no GPS -- e conferida aqui, ao vivo.
  -- Foi o que deixou 2 pessoas do Programa no plantao de 09/09.
  select pa.* into v_aluno from gps.plantao_alunos pa
   where pa.email = v_email and pa.ativo and not pa.bloqueado_por_programa
     and not exists (select 1 from gps.membros m
                      join public.thb_alunos t on t.id = m.aluno_id
                     where lower(btrim(t.email)) = pa.email
                       -- A equipe pode abrir excecao nominal:
                       -- `bloqueio_excecao` blinda a liberacao manual.
                       and not exists (select 1 from gps.plantao_alunos pe
                                        where pe.email = pa.email and pe.bloqueio_excecao));

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

  -- Trava de prazo. A regra vive em gps.plantao_prazo_inscricao(): ate
  -- 13/09 e 1h antes do inicio (flexibilizacao da semana de 10/09); de
  -- 14/09 em diante volta o cut-off de 12:00 da vespera do calendario
  -- oficial do Acelera. A data de virada esta em gps.config.
  if v_slot.inicio_em <= now() then
    return query select false, 'Este plantão já começou ou já passou.'::text,
      null::uuid, null::text, null::text, null::date, null::time, null::text;
    return;
  end if;

  if now() > gps.plantao_prazo_inscricao(p_slot_id) then
    return query select false,
      'As inscrições para este plantão já se encerraram. Escolha outra data.'::text,
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

  -- Teto de 1 plantao por semana ISO. Conta plantao JA REALIZADO tambem --
  -- e o que fecha o buraco: antes, sair da sala liberava a vaga na hora e
  -- a pessoa remarcava minutos depois.
  if (select valor from gps.plantao_config where chave = 'teto_semanal_ativo') = 'true' then
    select * into v_conflito
      from gps.plantao_conflito_semana(v_aluno.id, p_slot_id);

    if found then
      insert into gps.plantao_eventos (aluno_plantao_id, acao, ip_hash, slot_id)
        values (v_aluno.id, 'plantao_recusa_teto_semanal', v_ip, p_slot_id);

      return query select false,
        ('Você já tem plantão nesta semana (' ||
         to_char(v_conflito.data, 'DD/MM') || ' às ' ||
         to_char(v_conflito.hora_inicio, 'HH24:MI') ||
         '). É um plantão por semana — escolha uma data da semana seguinte.')::text,
        null::uuid, null::text, null::text, null::date, null::time, null::text;
      return;
    end if;
  end if;

  -- A checagem acima nao serializa: dois cliques simultaneos em slots
  -- diferentes da mesma semana passam os dois por ela. Quem recusa de fato
  -- e uq_plantao_inscricoes_aluno_semana; aqui a 23505 vira frase legivel.
  begin
    insert into gps.plantao_inscricoes (slot_id, aluno_plantao_id, nome_informado)
    values (p_slot_id, v_aluno.id, nullif(btrim(coalesce(p_nome, '')), ''))
    returning id into v_nova_id;
  exception
    when unique_violation then
      return query select false, v_msg_semana,
        null::uuid, null::text, null::text, null::date, null::time, null::text;
      return;
  end;

  insert into gps.plantao_eventos (aluno_plantao_id, acao, ip_hash, slot_id)
    values (v_aluno.id, 'plantao_inscricao', v_ip, p_slot_id);

  select m.nome into v_mentora_nome
    from gps.plantao_mentoras m where m.id = v_slot.mentora_id;

  return query select true, null::text, v_nova_id,
    v_aluno.email, v_aluno.nome, v_slot.data, v_slot.hora_inicio, v_mentora_nome;
end;
$function$;

create or replace function gps.plantao_inscrever_logado(p_slot_id uuid)
returns table(ok boolean, motivo text, inscricao_id uuid, data date, hora_inicio time without time zone, mentora_nome text)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_pessoa uuid := gps.pessoa_atual(); v_email text; v_nome text;
  v_aluno gps.plantao_alunos%rowtype; v_slot gps.plantao_slots%rowtype;
  v_ativa_id uuid; v_nova_id uuid; v_mentora_nome text; v_conflito record;
  v_msg_semana text := 'Você já tem plantão nesta semana. É um plantão por semana — escolha uma data da semana seguinte.';
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

  select sl.* into v_slot from gps.plantao_slots sl where sl.id = p_slot_id for update;
  if not found or not v_slot.publicado then
    return query select false, 'Este plantão não está disponível.'::text,
      null::uuid, null::date, null::time, null::text;
    return;
  end if;

  if v_slot.inicio_em <= now() then
    return query select false, 'Este plantão já começou ou já passou.'::text,
      null::uuid, null::date, null::time, null::text;
    return;
  end if;

  -- Trava de prazo, identica a de `gps.plantao_inscrever` (inclusive a
  -- mensagem): sem ela a aba logada aceitava quem a rota publica recusa.
  if now() > gps.plantao_prazo_inscricao(p_slot_id) then
    return query select false,
      'As inscrições para este plantão já se encerraram. Escolha outra data.'::text,
      null::uuid, null::date, null::time, null::text;
    return;
  end if;

  select i.id into v_ativa_id from gps.plantao_inscricoes i
  join gps.plantao_slots sl on sl.id = i.slot_id
  where i.aluno_plantao_id = v_aluno.id and i.cancelado_em is null and sl.inicio_em > now()
  limit 1;

  if v_ativa_id is not null then
    return query select false, 'Você já tem um plantão marcado. Cancele-o antes de escolher outro.'::text,
      null::uuid, null::date, null::time, null::text;
    return;
  end if;

  -- Teto semanal, identico a rota publica (mesma regra, mesma mensagem).
  if (select valor from gps.plantao_config where chave = 'teto_semanal_ativo') = 'true' then
    select * into v_conflito
      from gps.plantao_conflito_semana(v_aluno.id, p_slot_id);

    if found then
      insert into gps.plantao_eventos (aluno_plantao_id, acao, slot_id)
        values (v_aluno.id, 'plantao_recusa_teto_semanal', p_slot_id);

      return query select false,
        ('Você já tem plantão nesta semana (' ||
         to_char(v_conflito.data, 'DD/MM') || ' às ' ||
         to_char(v_conflito.hora_inicio, 'HH24:MI') ||
         '). É um plantão por semana — escolha uma data da semana seguinte.')::text,
        null::uuid, null::date, null::time, null::text;
      return;
    end if;
  end if;

  begin
    insert into gps.plantao_inscricoes (slot_id, aluno_plantao_id, nome_informado)
    values (p_slot_id, v_aluno.id, nullif(v_aluno.nome, '')) returning id into v_nova_id;
  exception
    when unique_violation then
      return query select false, v_msg_semana,
        null::uuid, null::date, null::time, null::text;
      return;
  end;

  insert into gps.plantao_eventos (aluno_plantao_id, acao, slot_id)
    values (v_aluno.id, 'plantao_inscricao_logada', p_slot_id);

  select m.nome into v_mentora_nome from gps.plantao_mentoras m where m.id = v_slot.mentora_id;

  return query select true, null::text, v_nova_id, v_slot.data, v_slot.hora_inicio, v_mentora_nome;
end;
$function$;
