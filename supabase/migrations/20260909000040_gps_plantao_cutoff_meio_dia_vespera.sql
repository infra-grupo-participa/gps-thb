-- Cut-off de inscricao: ate as 12:00 do dia ANTERIOR a sessao.
--
-- Regra do calendario oficial do Acelera (CSV "Calendario PARTICIPA — ACELERA
-- HOLDING", diretriz "Regra de Inscricao / Cut-off"). Ate agora dava para se
-- inscrever ate o minuto do inicio, o que nao dava a mentora tempo de saber
-- quantos vem — e o aviso de vespera dela sai de manha, ANTES do que o cut-off
-- antigo ainda permitia. Com o corte ao meio-dia da vespera, a lista que ela
-- recebe e final.
--
-- 🔑 O corte e calculado no fuso America/Sao_Paulo, nunca no do servidor:
--   (inicio_em at time zone 'America/Sao_Paulo')::date - 1 + time '12:00'
-- devolve o meio-dia local da vespera; converter de volta com
-- `at time zone 'America/Sao_Paulo'` da o instante absoluto para comparar com
-- now(). Usar a data crua mentiria o prazo das 21h a meia-noite — a mesma
-- licao que fez `plantao_slots.inicio_em` nascer como coluna gerada.
--
-- A mensagem diz o PRAZO em vez de so recusar: "encerraram ao meio-dia do dia
-- anterior" e acionavel; "nao disponivel" nao e.
--
-- Cancelar continua permitido depois do cut-off — nao faz sentido prender
-- alguem numa sessao a que ja sabe que nao vai. O cut-off protege a ENTRADA
-- de ultima hora, nao a saida.
--
-- Testado em producao contra os 3 slots reais da Semana 1 de setembro:
-- 09/09 (cut-off ja vencido) recusa; 10/09 (dentro do prazo) aceita.
--
-- Reversao: reaplicar o corpo da migracao ...036 (sem o bloco do cut-off).

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
  v_cutoff timestamptz;
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

  -- Cut-off: 12:00 do dia anterior, no fuso de Sao Paulo.
  v_cutoff := ((v_slot.inicio_em at time zone 'America/Sao_Paulo')::date
               - 1 + time '12:00') at time zone 'America/Sao_Paulo';

  if now() >= v_cutoff then
    return query select false,
      'As inscrições para este plantão se encerraram ao meio-dia do dia anterior.'::text,
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

comment on function gps.plantao_inscrever(text, uuid) is
  'Inscreve o aluno num slot publicado e futuro, ate as 12:00 do dia ANTERIOR (cut-off do calendario oficial, fuso America/Sao_Paulo). Usa plantao_sessao_valida: recusa quem ainda nao trocou a senha padrao. NAO exige zoom_url. Trava 1 inscricao ativa, com for update contra corrida. Cancelar continua permitido apos o cut-off.';
