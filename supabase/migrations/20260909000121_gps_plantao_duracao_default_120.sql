-- Plantão: default de duração passa de 60 para 120 minutos.
--
-- A decisão de produto de 08/09 ("sessões de 120 min") entrou pela migração ...041
-- (Semana 1 inserida com 120) e pela tela — mas a coluna `duracao_min` continuou com
-- `default 60`, e o formulário de criar slot também sugeria 60 (achado PL7 da rodada
-- final). Medido em 09/09 antes de aplicar: 3 slots existentes, todos com 120, nenhum
-- com 60 — nada a corrigir em dado.
--
-- A duração entra na conta da janela de presença (revelar link) e do NPS; nascer com
-- metade seria erro silencioso de operação.
--
-- O QUE NÃO FAZ: não altera linha existente; o CHECK 15..480 continua.
-- Reversão: alter table gps.plantao_slots alter column duracao_min set default 60;

alter table gps.plantao_slots alter column duracao_min set default 120;

comment on column gps.plantao_slots.duracao_min is
  'Duracao em minutos (CHECK 15..480). Default 120 desde a migracao ...121: as sessoes do Acelera sao de 2 horas (decisao de 08/09). Entra na conta da janela de presenca e do NPS.';
