-- O e-mail ao aluno sai 1 HORA ANTES do início, com o link da sala — e a
-- partir daí o cancelamento trava. (Decisão do Marcio, 08/09/2026.)
--
-- ANTES: a inscrição disparava um e-mail de confirmação na hora, e esse
-- e-mail **não podia carregar o link** — a sala só é revelada dentro da
-- janela de ±1h porque revelar GRAVA PRESENÇA. Resultado: um aviso sem ação,
-- e o aluno tinha de voltar ao portal na hora certa.
--
-- AGORA: nada no ato da inscrição. Um único e-mail, 1h antes, já com a sala.
-- Resolve as duas pontas com um envio a menos por inscrição — e some o vetor
-- de bombardeio de caixa por inscrever/cancelar em loop, que era risco novo
-- do modelo sem login.
--
-- ── A trava do cancelamento ────────────────────────────────────────────────
-- A partir de 1h antes do início, `plantao_cancelar` recusa: o link já saiu,
-- a vaga está consumida.
--
-- 🔑 MAS SÓ QUANDO HÁ SALA CADASTRADA. Se a equipe ainda não pôs o
-- `zoom_url`, nada foi liberado — e o aluno não pode perder o direito de
-- cancelar por causa de uma pendência da equipe. As duas regras (mandar
-- e-mail / travar cancelamento) dependem da MESMA condição, de propósito:
-- `zoom_url` presente. Nunca podem divergir, senão existe o estado "travado
-- sem ter recebido o link".
--
-- Hoje nenhum dos 3 plantões reais tem `zoom_url` — o Zoom foi adiado. Então
-- esta migração não muda o comportamento de nada que já existe; ela arma a
-- regra para quando a sala existir.
--
-- ── Idempotência ──────────────────────────────────────────────────────────
-- `plantao_inscricoes.email_sala_em` carimba o envio; a fila só pega quem
-- tem o campo nulo. Rodar o job duas vezes não reenvia.
--
-- O carimbo só é gravado quando o envio DÁ CERTO: um e-mail de sala perdido
-- não tem segunda chance (o plantão já terá começado), então vale
-- reprocessar. Mesma escolha do aviso de véspera à mentora (migração ...030),
-- oposta à do NPS (que marca mesmo em falha, para não martelar e-mail
-- quebrado indefinidamente).
--
-- ⚠️ FREQUÊNCIA: o job roda 1×/dia, mas a janela de envio é de 1 HORA.
-- Enquanto o agendamento for diário, só pega os plantões que começam na hora
-- seguinte à execução. Para cobrir todos os horários, o cron precisa rodar de
-- hora em hora — registrado no ATIVAR-PLANTAO-AGORA.md, é decisão de
-- operação, não de banco.
--
-- Reversão:
--   alter table gps.plantao_inscricoes drop column email_sala_em;
--   drop function gps.plantao_email_sala_pendente(text);
--   drop function gps.plantao_marcar_email_sala(text, uuid);
--   (e restaurar `plantao_cancelar` da migração ...036, sem a trava de 1h)

alter table gps.plantao_inscricoes
  add column if not exists email_sala_em timestamptz;

comment on column gps.plantao_inscricoes.email_sala_em is
  'Quando o e-mail com o link da sala foi enviado (1h antes do inicio). Carimbo de idempotencia: o job so pega inscricao com este campo nulo. Tambem e o sinal de que a vaga foi consumida — ver plantao_cancelar.';

-- A fila de interesse é sempre a NÃO enviada: índice parcial, para não
-- crescer com o histórico já processado.
create index if not exists idx_plantao_inscricoes_email_sala_pendente
  on gps.plantao_inscricoes (slot_id)
  where cancelado_em is null and email_sala_em is null;

comment on index gps.idx_plantao_inscricoes_email_sala_pendente is
  'Serve plantao_email_sala_pendente: a fila e sempre a NAO enviada, entao o indice parcial nao cresce com o historico ja processado.';

create or replace function gps.plantao_email_sala_pendente(p_segredo text)
returns table (
  inscricao_id uuid,
  email text,
  nome text,
  data date,
  hora_inicio time without time zone,
  mentora_nome text,
  zoom_url text
)
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

  return query
  select i.id, a.email, a.nome, sl.data, sl.hora_inicio, m.nome, sl.zoom_url
  from gps.plantao_inscricoes i
  join gps.plantao_slots sl on sl.id = i.slot_id
  join gps.plantao_mentoras m on m.id = sl.mentora_id
  join gps.plantao_alunos a on a.id = i.aluno_plantao_id
  where i.cancelado_em is null
    and i.email_sala_em is null
    and sl.publicado
    and not a.bloqueado_por_programa
    and sl.zoom_url is not null and btrim(sl.zoom_url) <> ''
    and sl.inicio_em <= now() + interval '60 minutes'
    and sl.inicio_em > now();
end;
$function$;

revoke execute on function gps.plantao_email_sala_pendente(text) from public;
grant execute on function gps.plantao_email_sala_pendente(text) to anon, authenticated;

comment on function gps.plantao_email_sala_pendente(text) is
  'Inscricoes ativas de plantoes que comecam na proxima hora, ainda sem e-mail da sala, cujo slot JA TEM zoom_url. Alimenta o job de manutencao. GRANT para anon porque o job roda sem sessao (pg_cron -> HTTP -> anon key); so o p_segredo protege. Falha FECHADO sem app.plantao_manutencao_segredo.';

create or replace function gps.plantao_marcar_email_sala(p_segredo text, p_inscricao_id uuid)
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

  update gps.plantao_inscricoes
     set email_sala_em = now()
   where id = p_inscricao_id and email_sala_em is null;
end;
$function$;

revoke execute on function gps.plantao_marcar_email_sala(text, uuid) from public;
grant execute on function gps.plantao_marcar_email_sala(text, uuid) to anon, authenticated;

comment on function gps.plantao_marcar_email_sala(text, uuid) is
  'Carimba plantao_inscricoes.email_sala_em depois do envio. Idempotente: o where exige email_sala_em nulo.';

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
  v_inicio timestamptz;
  v_tem_sala boolean;
begin
  select s.aluno_plantao_id into v_aluno_id from gps.plantao_sessao_valida(p_token) s;
  if v_aluno_id is null then
    return query select false, 'Sessão expirada. Entre novamente.'::text;
    return;
  end if;

  select i.aluno_plantao_id, i.slot_id, sl.inicio_em,
         (sl.zoom_url is not null and btrim(sl.zoom_url) <> '')
    into v_dono, v_slot_id, v_inicio, v_tem_sala
  from gps.plantao_inscricoes i
  join gps.plantao_slots sl on sl.id = i.slot_id
  where i.id = p_inscricao_id and i.cancelado_em is null
  for update of i;

  if v_dono is null then
    return query select false, 'Inscrição não encontrada.'::text;
    return;
  end if;

  -- IDOR: a inscrição precisa pertencer ao aluno da sessão.
  if v_dono <> v_aluno_id then
    return query select false, 'Inscrição não encontrada.'::text;
    return;
  end if;

  -- Trava de 1h: a sala já foi liberada, a vaga está consumida. Só trava se
  -- HOUVER sala — ver o cabeçalho desta migração.
  if v_tem_sala and now() >= v_inicio - interval '60 minutes' then
    return query select false,
      'O link da sala já foi liberado — não é mais possível cancelar.'::text;
    return;
  end if;

  update gps.plantao_inscricoes set cancelado_em = now() where id = p_inscricao_id;

  insert into gps.plantao_eventos (aluno_plantao_id, acao, slot_id)
    values (v_aluno_id, 'plantao_cancelamento', v_slot_id);

  return query select true, null::text;
end;
$function$;

comment on function gps.plantao_cancelar(text, uuid) is
  'Cancela a inscricao do proprio aluno (IDOR checado por dono). TRAVA a partir de 1h antes do inicio, quando o link da sala e liberado e o e-mail enviado — mas so quando o slot TEM zoom_url: sem sala nao houve liberacao, e o aluno nao perde o direito de cancelar por falha da equipe (decisao 08/09/2026).';
