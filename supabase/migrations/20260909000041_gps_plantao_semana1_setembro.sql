-- Plantões da Semana 1 de setembro/2026 — calendário oficial do Acelera.
--
-- Fonte: `Calendário PARTICIPA 2026, 2025 e 2024 - ACELERA HOLDING.csv`
-- (fornecido pelo Marcio em 08/09/2026). **Só a Semana 1 tem mentora
-- nomeada** — da Semana 2 em diante o arquivo diz "Mentor A/B/C",
-- placeholder. Por isso só estes 3 entram agora.
--
-- | Data       | Horário       | Mentora   |
-- |------------|---------------|-----------|
-- | Qua 09/09  | 14:00–16:00   | Isabela   |
-- | Qui 10/09  | 14:00–16:00   | Elaine    |
-- | Sex 11/09  | 10:00–12:00   | Cristiane |
--
-- ⚠️ CORREÇÃO DE TYPO NA FONTE: o CSV traz `09/19 Quarta-feira` para a
-- Isabela. Não existe 19/09 quarta-feira em 2026 (é sábado), e o período da
-- linha é "07/09 a 11/09" — é `09/09`, que de fato cai numa quarta. Os outros
-- dois batem sem ajuste (10/09 quinta, 11/09 sexta), o que confirma a leitura.
--
-- ⚠️ DURAÇÃO 120 MIN, não os 60 que o sistema vinha usando: a diretriz do
-- calendário diz "duração fixa de 2 horas (120 min)".
--
-- Publicados SEM `zoom_url` — decisão de 08/09: valida-se o agendamento
-- primeiro, a sala vem depois (ver migração ...032).
--
-- Idempotente: `unique (mentora_id, data, hora_inicio)` já existe na tabela,
-- então o `on conflict do nothing` faz reaplicar não duplicar.
--
-- Reversão:
--   delete from gps.plantao_slots
--    where observacao = 'Semana 1 de setembro — calendário oficial';
--   (apaga as inscrições junto, por `on delete cascade`)

insert into gps.plantao_slots (mentora_id, data, hora_inicio, duracao_min, publicado, observacao)
select m.id, v.data::date, v.hora::time, 120, true,
       'Semana 1 de setembro — calendário oficial'
from (values
  ('2026-09-09', '14:00', 'Isabela'),
  ('2026-09-10', '14:00', 'Elaine'),
  ('2026-09-11', '10:00', 'Cristiane')
) as v(data, hora, mentora)
join gps.plantao_mentoras m on m.nome = v.mentora and m.ativa
on conflict (mentora_id, data, hora_inicio) do nothing;
