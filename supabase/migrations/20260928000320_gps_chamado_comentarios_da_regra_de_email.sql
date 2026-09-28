-- ═══════════════════════════════════════════════════════════════════════
-- Catálogo do banco alinhado à `…319` (28/09/2026)
-- ═══════════════════════════════════════════════════════════════════════
-- `create or replace` PRESERVA o `comment on function` — a função viva
-- continuava dizendo "Devolve `avisar` SO quando o status mudou", o contrário
-- do corpo novo. O comentário da coluna `status` (…110) dizia o mesmo.
-- Só comentários: zero efeito em dado, plano ou permissão.
-- Reverter: reaplicar os `comment on` de `…110` e `…111`.
-- ═══════════════════════════════════════════════════════════════════════

comment on function gps.chamado_responder(uuid, text, text, text, text, integer) is
  'Responde na thread. Papel DERIVADO no servidor (gp_is_admin -> equipe; membro do ambiente -> aluno; ninguem mais -> 42501): o cliente nunca informa quem e. O aluno so responde com o interruptor aberto e, se o chamado estiver fechado, dentro de 7 dias (responder REABRE). `avisar`: para a EQUIPE so na transicao de status (trava anti-flood: o aluno pode mandar varias seguidas); para o PARCEIRO a CADA resposta da equipe (…319, 28/09/2026 -- a resposta depois de um "aguarde" ficava sem e-mail).';

comment on column gps.chamados.status is
  'aberto = esperando a equipe | respondido = esperando o aluno | fechado. E-mail: a equipe e avisada so quando o aluno escreve num chamado que nao estava aberto (transicao); o parceiro e avisado a cada resposta da equipe (…319, 28/09/2026).';
