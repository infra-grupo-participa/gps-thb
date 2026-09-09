-- Central de resolução — a rede do banco para "uma pessoa, um membro".
--
-- A migração ...154 adiou este índice até medir duplicatas (gate M5 da spec).
-- Medido em 09/09/2026, depois do backfill: 0 pessoas em mais de um membro
-- (139 membros, 139 pessoas distintas). O pentest da rodada apontou a janela
-- de corrida em gps.admin_vincular_pessoa_membro: o `if exists` roda fora de
-- qualquer trava, então dois admins vinculando a MESMA pessoa a dois membros
-- ao mesmo tempo passariam os dois — o índice é o que transforma a corrida em
-- 23505 (mapeado em traduzirErroBanco) em vez de estado partido.
--
-- Parcial: membro sem pessoa (NULL) continua permitido — sócio recém-adicionado
-- por gps.admin_adicionar_socio nasce sem pessoa até a equipe vincular.
--
-- Reversão: drop index if exists gps.membros_pessoa_uk;

create unique index if not exists membros_pessoa_uk
  on gps.membros (pessoa_aluno_id)
  where pessoa_aluno_id is not null;

comment on index gps.membros_pessoa_uk is
  'Uma pessoa (thb_alunos) e no maximo UM membro do programa. Criado na ...160 depois de medir 0 duplicatas (gate M5). Rede contra a corrida de admin_vincular_pessoa_membro; a RPC continua recusando com mensagem legivel antes de chegar aqui.';
