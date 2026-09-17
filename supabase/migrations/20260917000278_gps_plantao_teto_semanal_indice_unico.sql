-- Trava atomica do teto semanal.
--
-- Por que parcial e com data literal: o historico tem 26 grupos que violam
-- a regra nova (4 plantoes do caso que motivou isto, entre outros) e a
-- decisao foi NAO mexer no passado nem no que ja esta marcado. Predicado de
-- indice tem de ser IMMUTABLE, entao a data e literal -- current_date seria
-- recusado e envelheceria sozinho.
--
-- 2026-09-21 e a segunda-feira da PRIMEIRA semana inteiramente futura no
-- momento do deploy (17/09). Da semana dela em diante, o banco recusa a
-- segunda inscricao ativa do mesmo aluno; antes dela, nada muda.
--
-- Cancelar libera a vaga: o predicado exige cancelado_em is null.

create unique index if not exists uq_plantao_inscricoes_aluno_semana
  on gps.plantao_inscricoes (aluno_plantao_id, semana)
  where cancelado_em is null and semana >= date '2026-09-21';

comment on index gps.uq_plantao_inscricoes_aluno_semana is
  'Teto de 1 plantao por semana ISO, valendo das semanas a partir de 21/09/2026. Trava atomica; a mensagem legivel vem de gps.plantao_inscrever.';
