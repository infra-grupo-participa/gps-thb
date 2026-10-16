-- ═══════════════════════════════════════════════════════════════════════════
-- 390 — As reuniões da Cristiane seguem a ORDEM
--       Preliminar (2) → Viabilidade (3) → Croqui (4) → Minuta (6)
--       (Aldri, Slack 16/10/2026: "Sim, precisa seguir a ordem, salvo casos da
--       própria holding onde começa pela elaboração do Croqui")
-- ═══════════════════════════════════════════════════════════════════════════
-- Regra, por cliente, na hora de AGENDAR (gps.sessao_agendar):
--   3 Viabilidade → precisa de Preliminar marcada ou feita ANTES do início
--                   desta (sessão tipo 2 agendada/realizada com inicio_em
--                   anterior) ou ficha `data_reuniao_preliminar` de dia anterior.
--   4 Croqui      → precisa de Viabilidade antes (sessão tipo 3), EXCETO
--                   cliente da própria holding (grau_relacao = 'eu_mesmo').
--   6 Minuta      → precisa de Croqui antes (sessão tipo 4 ou ficha
--                   `cliente_croquis.apresentado_em` de dia anterior).
-- "Antes" é por data/hora, não por estado: a etapa anterior pode ainda estar
-- só marcada, desde que aconteça antes. Falta e cancelada NÃO contam.
-- Entrevista Prévia (1) e Preliminar (2) não têm pré-requisito novo.
--
-- Medido 16/10 (R02): 0 sessões futuras vivas fora da ordem; só 1 antiga
-- (Croqui passado) — esta trava não mexe em nada já marcado.
-- Fora do escopo: `sessao_remarcar` (remarcar para antes da etapa anterior)
-- e o painel do admin, que não agenda por esta função.
--
-- REVERSÃO: reaplicar o corpo de gps.sessao_agendar sem o bloco "…390" e
--           `drop function gps.sessao_ordem_pendente(uuid, smallint, timestamptz)`.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function gps.sessao_ordem_pendente(
  p_cliente_id uuid,
  p_tipo_id    smallint,
  p_inicio     timestamptz
)
returns text
language sql
stable
security definer
set search_path to ''
as $function$
  with c as (
    select e.id, e.grau_relacao, e.data_reuniao_preliminar,
           (p_inicio at time zone 'America/Sao_Paulo')::date as dia
      from gps.etapa1_clientes e
     where e.id = p_cliente_id
  ),
  antes as (
    select a.tipo_id
      from gps.sessao_agendamentos a
     where a.cliente_id = p_cliente_id
       and a.estado in ('agendado', 'realizado')
       and a.inicio_em < p_inicio
  )
  select case
    when p_tipo_id = 3
     and not exists (select 1 from antes where tipo_id = 2)
     and not exists (select 1 from c where c.data_reuniao_preliminar < c.dia)
      then 'Para marcar a Sessão de Viabilidade, a Reunião Preliminar deste cliente precisa estar marcada ou feita antes.'
    when p_tipo_id = 4
     and not exists (select 1 from c where c.grau_relacao = 'eu_mesmo')
     and not exists (select 1 from antes where tipo_id = 3)
      then 'Para marcar o Croqui Estrutural, a Sessão de Viabilidade deste cliente precisa estar marcada ou feita antes.'
    when p_tipo_id = 6
     and not exists (select 1 from antes where tipo_id = 4)
     and not exists (select 1 from gps.cliente_croquis k, c
                      where k.cliente_id = p_cliente_id
                        and k.apresentado_em is not null
                        and k.apresentado_em < c.dia)
      then 'Para marcar a Apresentação da Minuta, o Croqui Estrutural deste cliente precisa estar marcado ou feito antes.'
  end;
$function$;

revoke all on function gps.sessao_ordem_pendente(uuid, smallint, timestamptz)
  from public, anon, authenticated;

create or replace function gps.sessao_agendar(p_tipo_id smallint, p_responsavel_id uuid, p_data date, p_hora_inicio time without time zone)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_ambiente   uuid := gps.aluno_atual();
  v_cliente_id uuid;
  v_tipo       record;
  v_inicio     timestamptz;
  v_fim        timestamptz;
  v_snapshot   jsonb;
  v_id         uuid;
  v_ok         boolean;
  v_constraint text;
  v_ordem      text;
begin
  if p_tipo_id is null or p_responsavel_id is null
     or p_data is null or p_hora_inicio is null then
    raise exception 'Escolha um horário para continuar.' using errcode = '22023';
  end if;

  if v_ambiente is null then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  v_cliente_id := gps.sessao_pode_agendar(v_ambiente, p_tipo_id);
  if v_cliente_id is null then
    raise exception 'Você ainda não pode agendar esta sessão. É preciso ter um cliente marcado como o que a equipe acompanha, e a etapa correspondente liberada.'
      using errcode = '42501';
  end if;

  select t.id, t.duracao_min, t.intervalo_min, t.etapa_id, t.nome
    into v_tipo from gps.sessao_tipos t where t.id = p_tipo_id and t.ativo;

  if not found then
    raise exception 'Tipo de sessão não encontrado.' using errcode = 'P0002';
  end if;

  perform 1 from gps.etapa1_clientes where id = v_cliente_id for update;

  v_inicio := ((p_data + p_hora_inicio) at time zone 'America/Sao_Paulo');
  v_fim    := (((p_data + p_hora_inicio) + make_interval(mins => v_tipo.duracao_min))
                 at time zone 'America/Sao_Paulo');

  if v_inicio <= now() then
    raise exception 'Esse horário já passou. Escolha outro.' using errcode = '22023';
  end if;

  -- …390: ordem Preliminar → Viabilidade → Croqui → Minuta (sob o lock do cliente).
  v_ordem := gps.sessao_ordem_pendente(v_cliente_id, p_tipo_id, v_inicio);
  if v_ordem is not null then
    raise exception '%', v_ordem using errcode = '22023';
  end if;

  select exists (
    select 1 from gps.sessao_horarios_livres(p_tipo_id, p_responsavel_id, p_data, p_data) h
     where h.inicio_em = v_inicio and h.responsavel_id = p_responsavel_id
  ) into v_ok;

  if not v_ok then
    raise exception 'Esse horário não está mais disponível. Escolha outro na lista.'
      using errcode = '22023';
  end if;

  v_snapshot := gps.sessao_briefing_montar(v_cliente_id);

  begin
    insert into gps.sessao_agendamentos
      (tipo_id, responsavel_id, aluno_id, cliente_id, data, hora_inicio,
       duracao_min, estado, briefing_snapshot, criado_por)
    values
      (p_tipo_id, p_responsavel_id, v_ambiente, v_cliente_id, p_data, p_hora_inicio,
       v_tipo.duracao_min, 'agendado', v_snapshot, auth.uid())
    returning id into v_id;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'sessao_aluno_tipo_viva' then
        raise exception 'Você já tem uma % marcada. Cancele a atual antes de marcar outra.', v_tipo.nome
          using errcode = '23505';
      else
        raise exception 'Alguém acabou de pegar esse horário. Escolha outro na lista.'
          using errcode = '23505';
      end if;
    when exclusion_violation then
      raise exception 'Esse horário conflita com outra sessão da mesma profissional. Escolha outro na lista.'
        using errcode = '23P01';
  end;

  if v_tipo.etapa_id = 2 then
    update gps.etapa1_clientes
       set data_reuniao_preliminar = p_data
     where id = v_cliente_id;
  end if;

  insert into gps.sessao_eventos (agendamento_id, acao, ator_id, detalhe)
  values (v_id, 'sessao_agendada', auth.uid(),
          jsonb_build_object(
            'tipo_id', p_tipo_id, 'responsavel_id', p_responsavel_id,
            'cliente_id', v_cliente_id, 'inicio_em', v_inicio,
            'duracao_min', v_tipo.duracao_min,
            'escreveu_data_reuniao_preliminar', (v_tipo.etapa_id = 2)));

  return jsonb_build_object(
    'agendamento_id', v_id, 'estado', 'agendado',
    'inicio_em', v_inicio, 'fim_em', v_fim,
    'duracao_min', v_tipo.duracao_min, 'tipo_nome', v_tipo.nome);
end;
$function$;
