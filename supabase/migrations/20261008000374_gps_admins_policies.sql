-- ═══════════════════════════════════════════════════════════════════════════
-- 374 — ADMIN DO GPS SEPARADO (4/5): policies
-- ═══════════════════════════════════════════════════════════════════════════
-- GERADO POR SCRIPT a partir de pg_policies VIVO (08/10/2026): as 62 policies
-- do schema gps + storage (buckets gps-chamados, gps-croquis, gps-minutas,
-- gps-onboarding) que citam gp_is_admin()/gps.eh_equipe(). Nenhuma policy de
-- public/central/outros schemas, nem de bucket não-gps, é tocada (conferido
-- pelo gerador: as 4 de storage casam ((bucket_id = 'gps-…')).
--
-- Substituições, e só elas:
--   gp_is_admin() OR ( SELECT gp_acesso_pode_editar('educacional', NULL) …)
--     → ( SELECT gps.eh_admin() AS eh_admin)   [InitPlan: 1× por comando]
--   embrulhos redundantes "( SELECT ( SELECT (…) AS gp_is_admin) AS gp_is_admin)"
--     em volta dessa expressão colapsam no mesmo ( SELECT gps.eh_admin() …)
--   gps.eh_equipe() → ( SELECT gps.eh_equipe() AS eh_equipe)
-- ALTER POLICY (não drop+create): nome, comando, papéis e permissive ficam
-- exatamente os mesmos e não há janela sem policy. Conferido por script que o
-- texto final, sem parênteses/embrulho, é igual ao original trocando só a guarda.
--
-- AS 5 PERGUNTAS: 1/2) a guarda vira InitPlan sobre PK de ~11 linhas. MEDIDO
-- (08/10, admin marco@, select * from gps.etapa1_clientes, 1.991 linhas, 2ª
-- passada): ANTES Execution 3,05 ms, Buffers 102 (InitPlan da guarda: 24);
-- DEPOIS (366–375 em begin…rollback) 1,48 ms, Buffers 80 (InitPlan: 2). 3/4) mesma frequência; nenhuma query nova.
-- 5) REVERTER: reversão rápida = corpo de gps.eh_admin() (ver 366); a policy
-- continua chamando gps.eh_admin(). Texto anterior de cada policy: pg_policies
-- de 08/10 guardado em supabase/retrato-20261008-policies-gps-antes.json.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '3s';
set local statement_timeout = '60s';
-- o texto vem de pg_policies (deparse com public no search_path)
set local search_path = public, extensions;

alter policy "acessos_log_admin_select" on gps.acessos_log
  using (( SELECT gps.eh_admin() AS eh_admin));

alter policy "agenda_admin_select" on gps.agenda
  using (( SELECT gps.eh_admin() AS eh_admin));

alter policy "gps_ajuda_artigos_select_admin" on gps.ajuda_artigos
  using (( SELECT COALESCE(( SELECT gps.eh_admin() AS eh_admin), false) AS "coalesce"));

alter policy "gps_ajuda_feedback_select_admin" on gps.ajuda_feedback
  using (( SELECT COALESCE(( SELECT gps.eh_admin() AS eh_admin), false) AS "coalesce"));

alter policy "gps_aluno_eventos_admin_select" on gps.aluno_eventos
  using (( SELECT gps.eh_admin() AS eh_admin));

alter policy "gps_aluno_notas_admin_insert" on gps.aluno_notas
  with check ((( SELECT gps.eh_admin() AS eh_admin) AND (autor_id = auth.uid())));

alter policy "gps_aluno_notas_admin_select" on gps.aluno_notas
  using (( SELECT gps.eh_admin() AS eh_admin));

alter policy "gps_aluno_notas_admin_update" on gps.aluno_notas
  using (( SELECT gps.eh_admin() AS eh_admin))
  with check (( SELECT gps.eh_admin() AS eh_admin));

alter policy "ambientes_admin_all" on gps.ambientes
  using (( SELECT gps.eh_admin() AS eh_admin))
  with check (( SELECT gps.eh_admin() AS eh_admin));

alter policy "gps_chamados_select" on gps.chamados
  using ((( SELECT gps.eh_admin() AS eh_admin) OR (aluno_id = ( SELECT ( SELECT gps.aluno_atual() AS aluno_atual) AS aluno_atual))));

alter policy "cliente_croquis_select" on gps.cliente_croquis
  using ((( SELECT gps.eh_admin() AS eh_admin) OR (EXISTS ( SELECT 1
   FROM gps.etapa1_clientes c
  WHERE ((c.id = cliente_croquis.cliente_id) AND (c.aluno_id = gps.aluno_atual()))))));

alter policy "gps_cliente_decisores_select" on gps.cliente_decisores
  using ((( SELECT gps.eh_admin() AS eh_admin) OR (EXISTS ( SELECT 1
   FROM gps.etapa1_clientes c
  WHERE ((c.id = cliente_decisores.cliente_id) AND (c.aluno_id = gps.aluno_atual()))))));

alter policy "cliente_links_drive_select" on gps.cliente_links_drive
  using ((( SELECT gps.eh_admin() AS eh_admin) OR (EXISTS ( SELECT 1
   FROM gps.etapa1_clientes c
  WHERE ((c.id = cliente_links_drive.cliente_id) AND (c.aluno_id = gps.aluno_atual()))))));

alter policy "cliente_minutas_select" on gps.cliente_minutas
  using ((( SELECT gps.eh_admin() AS eh_admin) OR (EXISTS ( SELECT 1
   FROM gps.etapa1_clientes c
  WHERE ((c.id = cliente_minutas.cliente_id) AND (c.aluno_id = gps.aluno_atual()))))));

alter policy "cliente_trajetoria_select" on gps.cliente_trajetoria
  using ((( SELECT gps.eh_admin() AS eh_admin) OR (EXISTS ( SELECT 1
   FROM gps.etapa1_clientes c
  WHERE ((c.id = cliente_trajetoria.cliente_id) AND (c.aluno_id = gps.aluno_atual()))))));

alter policy "gps_config_admin" on gps.config
  using (( SELECT gps.eh_admin() AS eh_admin))
  with check (( SELECT gps.eh_admin() AS eh_admin));

alter policy "drive_arquivos_select" on gps.drive_arquivos
  using ((( SELECT gps.eh_admin() AS eh_admin) OR (EXISTS ( SELECT 1
   FROM gps.etapa1_clientes c
  WHERE ((c.id = drive_arquivos.cliente_id) AND (c.aluno_id = gps.aluno_atual()))))));

alter policy "drive_cursor_admin_select" on gps.drive_cursor
  using (COALESCE(( SELECT gps.eh_admin() AS eh_admin), false));

alter policy "drive_pastas_admin_select" on gps.drive_pastas
  using (COALESCE(( SELECT gps.eh_admin() AS eh_admin), false));

alter policy "drive_permissoes_admin_select" on gps.drive_permissoes
  using (COALESCE(( SELECT gps.eh_admin() AS eh_admin), false));

alter policy "drive_tarefas_admin_select" on gps.drive_tarefas
  using (COALESCE(( SELECT gps.eh_admin() AS eh_admin), false));

alter policy "gps_entrevista_previa_select" on gps.entrevista_previa
  using ((( SELECT gps.eh_admin() AS eh_admin) OR (EXISTS ( SELECT 1
   FROM gps.etapa1_clientes c
  WHERE ((c.id = entrevista_previa.cliente_id) AND (c.aluno_id = gps.aluno_atual()))))));

alter policy "gps_entrevista_tentativas_select" on gps.entrevista_tentativas
  using (( SELECT gps.eh_equipe() AS eh_equipe));

alter policy "clientes_admin_all" on gps.etapa1_clientes
  using (( SELECT gps.eh_admin() AS eh_admin))
  with check (( SELECT gps.eh_admin() AS eh_admin));

alter policy "etapa3_ag_admin_all" on gps.etapa3_agendamentos
  using (( SELECT gps.eh_admin() AS eh_admin))
  with check (( SELECT gps.eh_admin() AS eh_admin));

alter policy "etapa3_rev_admin_all" on gps.etapa3_revisao
  using (( SELECT gps.eh_admin() AS eh_admin))
  with check (( SELECT gps.eh_admin() AS eh_admin));

alter policy "etapa_liberacao_admin_all" on gps.etapa_liberacao_aluno
  using (( SELECT gps.eh_admin() AS eh_admin))
  with check (( SELECT gps.eh_admin() AS eh_admin));

alter policy "etapas_admin_write" on gps.etapas
  using (( SELECT gps.eh_admin() AS eh_admin))
  with check (( SELECT gps.eh_admin() AS eh_admin));

alter policy "lixeira_admin" on gps.lixeira_ambientes
  using (( SELECT gps.eh_admin() AS eh_admin));

alter policy "membros_admin_all" on gps.membros
  using (( SELECT gps.eh_admin() AS eh_admin))
  with check (( SELECT gps.eh_admin() AS eh_admin));

alter policy "gps_nota_mencoes_admin_select" on gps.nota_mencoes
  using (( SELECT gps.eh_admin() AS eh_admin));

alter policy "gps_onboarding_anexos_admin_all" on gps.onboarding_anexos
  using (( SELECT gps.eh_admin() AS eh_admin))
  with check (( SELECT gps.eh_admin() AS eh_admin));

alter policy "gps_onboarding_respostas_admin_all" on gps.onboarding_respostas
  using (( SELECT gps.eh_admin() AS eh_admin))
  with check (( SELECT gps.eh_admin() AS eh_admin));

alter policy "gps_operadores_select" on gps.operadores
  using ((( SELECT gps.eh_admin() AS eh_admin) OR (user_id = auth.uid())));

alter policy "gps_plantao_alunos_admin" on gps.plantao_alunos
  using (( SELECT gps.eh_admin() AS eh_admin))
  with check (( SELECT gps.eh_admin() AS eh_admin));

alter policy "gps_plantao_config_admin" on gps.plantao_config
  using (( SELECT gps.eh_admin() AS eh_admin))
  with check (( SELECT gps.eh_admin() AS eh_admin));

alter policy "plantao_email_cliques_admin_le" on gps.plantao_email_cliques
  using (( SELECT gps.eh_admin() AS eh_admin));

alter policy "gps_plantao_eventos_admin" on gps.plantao_eventos
  using (( SELECT gps.eh_admin() AS eh_admin))
  with check (( SELECT gps.eh_admin() AS eh_admin));

alter policy "gps_plantao_inscricoes_admin" on gps.plantao_inscricoes
  using (( SELECT gps.eh_admin() AS eh_admin))
  with check (( SELECT gps.eh_admin() AS eh_admin));

alter policy "gps_plantao_mentoras_admin" on gps.plantao_mentoras
  using (( SELECT gps.eh_admin() AS eh_admin))
  with check (( SELECT gps.eh_admin() AS eh_admin));

alter policy "gps_plantao_slots_admin" on gps.plantao_slots
  using (( SELECT gps.eh_admin() AS eh_admin))
  with check (( SELECT gps.eh_admin() AS eh_admin));

alter policy "progresso_admin_all" on gps.progresso
  using (( SELECT gps.eh_admin() AS eh_admin))
  with check (( SELECT gps.eh_admin() AS eh_admin));

alter policy "resgate_tentativas_admin_le" on gps.resgate_tentativas
  using (( SELECT gps.eh_admin() AS eh_admin));

alter policy "reuniao_agendamentos_admin_all" on gps.reuniao_agendamentos
  using (( SELECT gps.eh_admin() AS eh_admin))
  with check (( SELECT gps.eh_admin() AS eh_admin));

alter policy "reuniao_bloqueios_admin_all" on gps.reuniao_bloqueios
  using (( SELECT gps.eh_admin() AS eh_admin))
  with check (( SELECT gps.eh_admin() AS eh_admin));

alter policy "reuniao_eventos_admin_select" on gps.reuniao_eventos
  using (( SELECT gps.eh_admin() AS eh_admin));

alter policy "reuniao_horarios_admin_all" on gps.reuniao_horarios
  using (( SELECT gps.eh_admin() AS eh_admin))
  with check (( SELECT gps.eh_admin() AS eh_admin));

alter policy "gps_reuniao_preliminar_propostas_select" on gps.reuniao_preliminar_propostas
  using ((( SELECT gps.eh_admin() AS eh_admin) OR (aluno_id = gps.aluno_atual())));

alter policy "gps_sessao_agend_admin" on gps.sessao_agendamentos
  using (( SELECT gps.eh_admin() AS eh_admin))
  with check (( SELECT gps.eh_admin() AS eh_admin));

alter policy "gps_sessao_bloqueios_admin" on gps.sessao_bloqueios
  using (( SELECT gps.eh_admin() AS eh_admin))
  with check (( SELECT gps.eh_admin() AS eh_admin));

alter policy "gps_sessao_disp_admin" on gps.sessao_disponibilidade
  using (( SELECT gps.eh_admin() AS eh_admin))
  with check (( SELECT gps.eh_admin() AS eh_admin));

alter policy "gps_sessao_eventos_select" on gps.sessao_eventos
  using ((( SELECT gps.eh_admin() AS eh_admin) OR (EXISTS ( SELECT 1
   FROM gps.sessao_agendamentos a
  WHERE ((a.id = sessao_eventos.agendamento_id) AND (a.responsavel_id = auth.uid()))))));

alter policy "gps_sessao_tipos_admin" on gps.sessao_tipos
  using (( SELECT gps.eh_admin() AS eh_admin))
  with check (( SELECT gps.eh_admin() AS eh_admin));

alter policy "socio_convite_tentativas_admin_le" on gps.socio_convite_tentativas
  using (( SELECT gps.eh_admin() AS eh_admin));

alter policy "solicitacoes_admin_all" on gps.solicitacoes_acesso
  using (( SELECT gps.eh_admin() AS eh_admin))
  with check (( SELECT gps.eh_admin() AS eh_admin));

alter policy "tarefa_enfase_admin_all" on gps.tarefa_enfase
  using (( SELECT gps.eh_admin() AS eh_admin))
  with check (( SELECT gps.eh_admin() AS eh_admin));

alter policy "gps_tutoriais_admin_all" on gps.tutoriais
  using (( SELECT gps.eh_admin() AS eh_admin))
  with check (( SELECT gps.eh_admin() AS eh_admin));

alter policy "gps_videos_admin_all" on gps.videos
  using (( SELECT gps.eh_admin() AS eh_admin))
  with check (( SELECT gps.eh_admin() AS eh_admin));

alter policy "gps_chamados_anexo_delete_admin" on storage.objects
  using (((bucket_id = 'gps-chamados'::text) AND ( SELECT gps.eh_admin() AS eh_admin)));

alter policy "gps_croquis_delete_admin" on storage.objects
  using (((bucket_id = 'gps-croquis'::text) AND COALESCE(( SELECT gps.eh_admin() AS eh_admin), false)));

alter policy "gps_minutas_delete_admin" on storage.objects
  using (((bucket_id = 'gps-minutas'::text) AND COALESCE(( SELECT gps.eh_admin() AS eh_admin), false)));

alter policy "gps_onboarding_anexo_delete_admin" on storage.objects
  using (((bucket_id = 'gps-onboarding'::text) AND COALESCE(( SELECT gps.eh_admin() AS eh_admin), false)));

do $$
begin
  if exists (select 1 from pg_policies
              where schemaname in ('gps', 'storage')
                and coalesce(qual, '') || coalesce(with_check, '') ~ 'gp_is_admin|gp_acesso_pode_editar') then
    raise exception '374: sobrou policy gps/storage citando gp_is_admin/gp_acesso_pode_editar';
  end if;
end $$;

commit;
