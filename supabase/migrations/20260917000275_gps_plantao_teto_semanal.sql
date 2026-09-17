-- Teto de 1 plantao por semana ISO (seg->dom).
-- Motivo: a unica trava existente era "1 plantao FUTURO por vez". Assim que
-- o plantao acontecia, a vaga liberava na hora -- e a pessoa remarcava o
-- proximo no mesmo dia, minutos depois de sair da sala. 4 plantoes em 9 dias
-- para o caso que motivou isto; 29 de 74 pessoas ja tinham repetido.
--
-- A semana sai de plantao_slots.data (tipo `date`, ja e o dia no fuso do
-- negocio). NAO usar now() convertido: o banco roda em UTC e das 21h a
-- meia-noite a data UTC adianta um dia -- o mesmo defeito que o `hojeISO`
-- do Financeiro tem hoje.
--
-- Interruptor: gps.plantao_config chave 'teto_semanal_ativo'. Desligar com
--   update gps.plantao_config set valor='false' where chave='teto_semanal_ativo';
-- volta ao comportamento anterior sem deploy.

insert into gps.plantao_config (chave, valor)
values ('teto_semanal_ativo', 'true')
on conflict (chave) do nothing;

-- Semana ISO de uma data. IMMUTABLE para poder ser usada em indice/CHECK
-- no futuro; date_trunc sobre `date` puro nao depende de TimeZone.
create or replace function gps.plantao_semana(p_data date)
returns date
language sql
immutable
set search_path to ''
as $$
  select (date_trunc('week', p_data::timestamp))::date;
$$;

comment on function gps.plantao_semana(date) is
  'Segunda-feira da semana ISO da data. Base do teto de 1 plantao/semana.';

-- Verdade unica do teto. Recebe o slot ALVO e devolve a inscricao que ja
-- ocupa aquela semana, ou null. Conta plantao REALIZADO ou agendado -- nao
-- o instante do clique -- entao sair da sala nao libera nada.
create or replace function gps.plantao_conflito_semana(
  p_aluno_plantao_id uuid,
  p_slot_id uuid
)
returns table(data date, hora_inicio time without time zone)
language sql
stable
set search_path to ''
as $$
  select sl.data, sl.hora_inicio
  from gps.plantao_inscricoes i
  join gps.plantao_slots sl on sl.id = i.slot_id
  where i.aluno_plantao_id = p_aluno_plantao_id
    and i.cancelado_em is null
    and sl.cancelado_em is null
    and i.slot_id <> p_slot_id
    and gps.plantao_semana(sl.data) = (
      select gps.plantao_semana(alvo.data)
      from gps.plantao_slots alvo where alvo.id = p_slot_id
    )
  order by sl.data, sl.hora_inicio
  limit 1;
$$;

comment on function gps.plantao_conflito_semana(uuid, uuid) is
  'Inscricao ativa do aluno na mesma semana ISO do slot alvo, ou vazio.';
