-- Plantão de Dúvidas — liberar o agendamento antes de existir sala, e avisar
-- a mentora na véspera. (Decisões do Marcio, 08/09/2026.)
--
-- Contexto: o plantão está construído e com os 421 compradores da Acelera
-- carregados, mas nunca foi ativado. Duas mudanças destravam o uso real:
--
-- 1. PUBLICAR SEM ZOOM. A regra antiga exigia `zoom_url` para publicar (ver
--    `publicarSlot`, src/app/admin/plantao/actions.ts) — com o Zoom adiado,
--    NENHUM slot podia ser publicado e nenhum aluno conseguiria se inscrever.
--    A intenção original (não mostrar plantão inacessível) continua honrada
--    onde importa: o botão de entrar na sala só aparece quando há link.
--    Por isso `plantao_minha_inscricao` passa a devolver `tem_sala` — um
--    BOOLEANO, não a URL: revelar a URL continua exclusivo de
--    `plantao_revelar_link`, dentro da janela, porque revelar grava presença.
--    Sem esse sinal o aluno clicaria "Entrar na sala", gravaria presença e só
--    então veria "Link indisponível" — presença numa sala inexistente.
--
-- 2. AVISO À MENTORA NA VÉSPERA. Hoje só o ALUNO recebe e-mail (confirmação e
--    NPS); a mentora não recebe nada e `plantao_mentoras.email` está nulo nas
--    três. `plantao_aviso_mentora_pendente` alimenta o job diário
--    (`/api/plantao/manutencao`) com os plantões de amanhã que ainda não foram
--    avisados, junto da lista de inscritos.
--
--    ⚠️ Este é o ÚNICO ponto do módulo em que nome de participante sai por
--    e-mail. É deliberado: a mentora precisa saber quem vai atender. O
--    destinatário é sempre `plantao_mentoras.email` (cadastrado pelo admin),
--    nunca endereço vindo de input.
--
-- Reversão:
--   alter table gps.plantao_slots drop column aviso_mentora_em;
--   drop function gps.plantao_aviso_mentora_pendente(text);
--   drop function gps.plantao_marcar_aviso_mentora(text, uuid);
--   (e restaurar `plantao_minha_inscricao` sem `tem_sala`, definição na
--    migração 20260901000002)

-- ── 1. Sinal de sala para o aluno ───────────────────────────────────────────

drop function if exists gps.plantao_minha_inscricao(text);

create function gps.plantao_minha_inscricao(p_token text)
returns table (
  inscricao_id uuid,
  slot_id uuid,
  data date,
  hora_inicio time without time zone,
  mentora_nome text,
  presenca_em timestamp with time zone,
  nps_em timestamp with time zone,
  inicio_em timestamp with time zone,
  tem_sala boolean
)
language plpgsql
security definer
set search_path to 'pg_catalog', 'extensions', 'public', 'gps'
as $function$
declare
  v_aluno_id uuid;
begin
  select s.aluno_plantao_id into v_aluno_id from gps.plantao_sessao(p_token) s;
  if v_aluno_id is null then
    return;
  end if;

  return query
  select i.id, sl.id, sl.data, sl.hora_inicio, m.nome, i.presenca_em, i.nps_em,
         sl.inicio_em,
         -- BOOLEANO de propósito: a URL só sai por plantao_revelar_link.
         (sl.zoom_url is not null and btrim(sl.zoom_url) <> '')
  from gps.plantao_inscricoes i
  join gps.plantao_slots sl on sl.id = i.slot_id
  join gps.plantao_mentoras m on m.id = sl.mentora_id
  where i.aluno_plantao_id = v_aluno_id
    and i.cancelado_em is null
  order by i.inscrito_em desc
  limit 1;
end;
$function$;

revoke execute on function gps.plantao_minha_inscricao(text) from public;
grant execute on function gps.plantao_minha_inscricao(text) to anon, authenticated;

comment on function gps.plantao_minha_inscricao(text) is
  'Inscricao ativa (ou mais recente) do aluno do plantao, resolvida pelo token de sessao. Devolve tem_sala como BOOLEANO — a zoom_url so sai por plantao_revelar_link, dentro da janela, porque revelar grava presenca.';

-- ── 2. Aviso à mentora na véspera ───────────────────────────────────────────

alter table gps.plantao_slots
  add column if not exists aviso_mentora_em timestamptz;

comment on column gps.plantao_slots.aviso_mentora_em is
  'Quando o e-mail de vespera foi enviado a mentora. Carimbo de idempotencia: o job diario so pega slot com este campo nulo, entao rodar duas vezes no mesmo dia nao reenvia.';

-- Lê os plantões de amanhã ainda não avisados, com os inscritos de cada um.
-- Mesma guarda de segredo das demais funções de manutenção (o antídoto ao
-- incidente do CNHF): sem `app.plantao_manutencao_segredo` setado no banco,
-- recusa tudo com 42501 em vez de liberar por omissão.
create or replace function gps.plantao_aviso_mentora_pendente(p_segredo text)
returns table (
  slot_id uuid,
  mentora_nome text,
  mentora_email text,
  data date,
  hora_inicio time without time zone,
  participantes jsonb
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_esperado text;
begin
  -- current_setting(..., true) devolve NULL quando não configurado; comparar
  -- com NULL faria o `if` não disparar e liberar geral. Por isso o teste é
  -- explícito contra nulo/vazio ANTES da comparação.
  v_esperado := current_setting('app.plantao_manutencao_segredo', true);
  if v_esperado is null or btrim(v_esperado) = ''
     or p_segredo is null or p_segredo <> v_esperado then
    raise exception 'Manutencao nao autorizada.' using errcode = '42501';
  end if;

  return query
  select sl.id, m.nome, m.email, sl.data, sl.hora_inicio,
         coalesce(
           jsonb_agg(
             jsonb_build_object('nome', a.nome, 'email', a.email)
             order by a.nome
           ) filter (where a.id is not null),
           '[]'::jsonb
         )
  from gps.plantao_slots sl
  join gps.plantao_mentoras m on m.id = sl.mentora_id
  left join gps.plantao_inscricoes i
         on i.slot_id = sl.id and i.cancelado_em is null
  left join gps.plantao_alunos a on a.id = i.aluno_plantao_id
  where sl.publicado
    and sl.aviso_mentora_em is null
    and m.email is not null and btrim(m.email) <> ''
    -- "amanhã" no fuso de São Paulo, nunca no fuso do servidor: `inicio_em` é
    -- coluna gerada com o timezone certo (lição do prazo que mentia das 21h à
    -- meia-noite).
    and (sl.inicio_em at time zone 'America/Sao_Paulo')::date
        = ((now() at time zone 'America/Sao_Paulo')::date + 1)
  group by sl.id, m.nome, m.email, sl.data, sl.hora_inicio
  -- Plantão sem ninguém inscrito não gera e-mail: aviso vazio é ruído, e
  -- ruído treina a pessoa a ignorar o aviso que importa.
  having count(i.id) > 0;
end;
$function$;

revoke execute on function gps.plantao_aviso_mentora_pendente(text) from public, anon;
grant execute on function gps.plantao_aviso_mentora_pendente(text) to authenticated;

comment on function gps.plantao_aviso_mentora_pendente(text) is
  'Plantoes de AMANHA (fuso America/Sao_Paulo) publicados, ainda nao avisados e com pelo menos 1 inscrito, com a lista de participantes para o e-mail da mentora. Exige app.plantao_manutencao_segredo — falha fechado.';

create or replace function gps.plantao_marcar_aviso_mentora(
  p_segredo text,
  p_slot_id uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_esperado text;
begin
  v_esperado := current_setting('app.plantao_manutencao_segredo', true);
  if v_esperado is null or btrim(v_esperado) = ''
     or p_segredo is null or p_segredo <> v_esperado then
    raise exception 'Manutencao nao autorizada.' using errcode = '42501';
  end if;

  update gps.plantao_slots
     set aviso_mentora_em = now()
   where id = p_slot_id and aviso_mentora_em is null;
end;
$function$;

revoke execute on function gps.plantao_marcar_aviso_mentora(text, uuid) from public, anon;
grant execute on function gps.plantao_marcar_aviso_mentora(text, uuid) to authenticated;

comment on function gps.plantao_marcar_aviso_mentora(text, uuid) is
  'Carimba plantao_slots.aviso_mentora_em depois do envio do e-mail de vespera. Idempotente: o where exige aviso_mentora_em nulo.';

-- Serve `plantao_aviso_mentora_pendente`: o job varre por "publicado, sem
-- aviso, de amanhã". Parcial em `aviso_mentora_em is null` porque a fila de
-- interesse é sempre a NÃO avisada — o índice não cresce com o histórico de
-- plantões já processados, que é a maior parte da tabela com o tempo.
create index if not exists idx_plantao_slots_aviso_pendente
  on gps.plantao_slots (inicio_em)
  where publicado and aviso_mentora_em is null;
