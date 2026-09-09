-- Fecha a ESCRITA nas tabelas órfãs do agendamento (pentest de 09/09/2026, MÉDIO).
--
-- O agendamento de reunião com a equipe foi removido do app em 10/08/2026 por
-- decisão operacional do Marcio, e o CLAUDE.md proíbe reconstruí-lo. Mas tirar
-- o código do Next NÃO fecha a API: o schema gps é exposto ao PostgREST, e
-- gps.agenda e gps.reuniao_agendamentos continuavam com policies
-- owner_insert/update/delete + grant de escrita para `authenticated`. Qualquer
-- aluno logado podia, pela REST do Supabase, criar/editar/apagar linhas ali --
-- sem tela, sem log de aplicação, sem ninguém da equipe ver.
--
-- O QUE FAZ: derruba as policies de escrita do dono e revoga insert/update/
-- delete de `authenticated` nas duas tabelas. LEITURA fica (admin_select,
-- owner_select): o histórico continua visível e nenhum dado é apagado.
-- gps.reuniao_bloqueios / reuniao_horarios já eram só-admin na escrita;
-- reuniao_eventos já era só select. Não mexe.
--
-- O QUE NÃO FAZ: não apaga tabela, não apaga linha, não toca no app.
--
-- Reversão (recriar as policies como estavam no baseline 00000000000000):
--   grant insert, update, delete on gps.agenda, gps.reuniao_agendamentos to authenticated;
--   e as 6 create policy ..._owner_{insert,update,delete} do baseline.

drop policy if exists agenda_owner_insert on gps.agenda;
drop policy if exists agenda_owner_update on gps.agenda;
drop policy if exists agenda_owner_delete on gps.agenda;
revoke insert, update, delete on gps.agenda from authenticated;

drop policy if exists reuniao_agendamentos_owner_insert on gps.reuniao_agendamentos;
drop policy if exists reuniao_agendamentos_owner_update on gps.reuniao_agendamentos;
drop policy if exists reuniao_agendamentos_owner_delete on gps.reuniao_agendamentos;
revoke insert, update, delete on gps.reuniao_agendamentos from authenticated;

comment on table gps.agenda is
  'ORFA desde 10/08/2026 (agendamento removido do app). Somente leitura pela API desde 09/09/2026 (migracao ...117): a escrita do dono foi fechada porque o schema gps e exposto ao PostgREST e a REST aceitava insert/update/delete sem nenhuma tela. Historico preservado. Nao reconstruir sem decisao explicita do Marcio.';
comment on table gps.reuniao_agendamentos is
  'ORFA desde 10/08/2026 (agendamento removido do app). Somente leitura pela API desde 09/09/2026 (migracao ...117). Historico preservado. Nao reconstruir sem decisao explicita do Marcio.';
