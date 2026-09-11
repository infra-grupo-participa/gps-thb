-- ═══════════════════════════════════════════════════════════════════════════
-- A aba /plantao do parceiro passa a respeitar o MESMO prazo da rota pública
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 🔴 ACHADO DA AUDITORIA DE 11/09/2026 — falha AGENDADA, ainda não ativa.
--
-- `gps.config.plantao_cutoff_vespera_desde = 2026-09-14`: a partir dessa data
-- a inscrição fecha às 12h da véspera. A regra vive em
-- `gps.plantao_prazo_inscricao()` e as DUAS funções públicas a consultam:
--
--   plantao_calendario         usa_prazo = true
--   plantao_inscrever          usa_prazo = true
--   plantao_calendario_logado  usa_prazo = FALSE   ← esta migration
--   plantao_inscrever_logado   usa_prazo = FALSE   ← esta migration
--
-- Efeito hoje: a aba logada deixa entrar quem a rota pública recusa.
-- Efeito a partir de 14/09: o calendário logado mostra "aberto" um plantão
-- que a inscrição vai recusar — e `inscricao-painel.tsx` ainda exibe ali o
-- aviso "as inscrições se encerram às 12h do dia anterior", verdadeiro para a
-- regra oficial e falso para o que esta rota faz.
--
-- Medido em 11/09: os 10 slots futuros publicados JÁ têm prazo antecipado
-- (22–28 h antes do início). 11 pessoas usaram a aba logada no primeiro dia,
-- 10 com inscrição futura; os 142 parceiros podem usá-la.
--
-- As duas linhas abaixo são cópia literal das públicas. Nada mais muda:
-- mesma assinatura, mesmo retorno, mesma mensagem de recusa.

create or replace function gps.plantao_calendario_logado(p_ano integer, p_mes integer)
returns table(slot_id uuid, data date, hora_inicio time without time zone,
              duracao_min integer, mentora_nome text, inscritos_qtd integer,
              minha_inscricao boolean, encerrado boolean, inscricao_encerrada boolean)
language plpgsql security definer set search_path to ''
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
  select sl.id, sl.data, sl.hora_inicio, sl.duracao_min, m.nome,
         coalesce(cnt.qtd, 0)::int,
         (insc.id is not null),
         -- `encerrado` continua sendo só "já começou": é o que a tela usa
         -- para dizer que o plantão passou. Não leva o prazo.
         (sl.inicio_em <= now()),
         -- `inscricao_encerrada` leva o prazo, como na rota pública (a regra
         -- vive em gps.plantao_prazo_inscricao(); cut-off desde 14/09).
         (sl.inicio_em <= now() or now() > gps.plantao_prazo_inscricao(sl.id))
  from gps.plantao_slots sl
  join gps.plantao_mentoras m on m.id = sl.mentora_id
  left join lateral (
    select count(*) as qtd from gps.plantao_inscricoes i
    join gps.plantao_alunos a on a.id = i.aluno_plantao_id
    where i.slot_id = sl.id and i.cancelado_em is null
  ) cnt on true
  left join gps.plantao_inscricoes insc
    on insc.slot_id = sl.id and insc.aluno_plantao_id = v_aluno_id and insc.cancelado_em is null
  where sl.publicado and sl.inicio_em >= v_inicio and sl.inicio_em < v_fim
  order by sl.inicio_em;
end;
$function$;

create or replace function gps.plantao_inscrever_logado(p_slot_id uuid)
returns table(ok boolean, motivo text, inscricao_id uuid, data date,
              hora_inicio time without time zone, mentora_nome text)
language plpgsql security definer set search_path to ''
as $function$
declare
  v_pessoa uuid := gps.pessoa_atual(); v_email text; v_nome text;
  v_aluno gps.plantao_alunos%rowtype; v_slot gps.plantao_slots%rowtype;
  v_ativa_id uuid; v_nova_id uuid; v_mentora_nome text;
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

  -- Trava de prazo, idêntica à de `gps.plantao_inscrever` (inclusive a
  -- mensagem): sem ela a aba logada aceitava quem a rota pública recusa.
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

  insert into gps.plantao_inscricoes (slot_id, aluno_plantao_id, nome_informado)
  values (p_slot_id, v_aluno.id, nullif(v_aluno.nome, '')) returning id into v_nova_id;

  insert into gps.plantao_eventos (aluno_plantao_id, acao, slot_id)
    values (v_aluno.id, 'plantao_inscricao_logada', p_slot_id);

  select m.nome into v_mentora_nome from gps.plantao_mentoras m where m.id = v_slot.mentora_id;

  return query select true, null::text, v_nova_id, v_slot.data, v_slot.hora_inicio, v_mentora_nome;
end;
$function$;

revoke execute on function gps.plantao_calendario_logado(integer, integer) from public, anon;
revoke execute on function gps.plantao_inscrever_logado(uuid) from public, anon;
grant execute on function gps.plantao_calendario_logado(integer, integer) to authenticated;
grant execute on function gps.plantao_inscrever_logado(uuid) to authenticated;
