-- gps.admin_direito_ao_acesso ganha a guarda de admin que faltava.
--
-- Achado na montagem da Central de resolução (09/09/2026): a função era SECURITY
-- DEFINER sobre cs.vw_gps_acessos, SEM `gp_is_admin()`, e com execute para
-- `authenticated` — qualquer aluno logado podia chamar
-- `rpc('admin_direito_ao_acesso', { p_aluno_id })` pelo PostgREST e ler nome,
-- e-mail, turma, plano e situação financeira de qualquer outro aluno. Pré-existente
-- (versionada como retrato na ...131, sem alteração); corrigida aqui.
--
-- Corpo idêntico ao vigente + `if not public.gp_is_admin() then raise 42501`.
-- Únicos chamadores no repo: src/app/admin/actions.ts (atrás de ehAdmin()).
--
-- Reversão: reaplicar o corpo da ...131 (não recomendado).

create or replace function gps.admin_direito_ao_acesso(p_aluno_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare v record; v_ok boolean; v_motivo text;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  select * into v from cs.vw_gps_acessos where aluno_id = p_aluno_id;
  if not found then
    return jsonb_build_object('tem_direito', false,
      'motivo', 'Aluno não encontrado na base de acessos (sem compra vinculada).');
  end if;
  if v.cancelado_em is not null then
    v_ok := false; v_motivo := 'Matrícula cancelada em ' || to_char(v.cancelado_em,'DD/MM/YYYY') || '.';
  elsif coalesce(v.situacao_financeira,'') = 'reembolsado' then
    v_ok := false; v_motivo := 'Compra reembolsada.';
  elsif coalesce(v.status_acesso,'') = '' and coalesce(v.situacao_financeira,'') = 'so_sinal' then
    v_ok := false; v_motivo := 'Pagou só o sinal — acesso ainda não liberado.';
  else
    v_ok := true;
    v_motivo := 'Acesso ' || coalesce(v.status_acesso,'sem status')
             || ' / financeiro ' || coalesce(v.situacao_financeira,'não informado')
             || case when v.acesso_vencido then ' (prazo vencido)' else '' end || '.';
  end if;
  return jsonb_build_object(
    'tem_direito', v_ok, 'motivo', v_motivo,
    'nome', v.nome, 'email', v.email, 'turma', v.turma, 'plano', v.plano,
    'status_acesso', v.status_acesso, 'situacao_financeira', v.situacao_financeira,
    'acesso_vencido', v.acesso_vencido, 'data_expiracao', v.data_expiracao);
end $function$;

comment on function gps.admin_direito_ao_acesso(uuid) is
  'Diagnostico de direito ao acesso (cs.vw_gps_acessos). SECURITY DEFINER com guarda gp_is_admin() desde 09/09/2026 (migracao ...159): antes qualquer aluno logado lia dados de terceiros por aqui.';

revoke execute on function gps.admin_direito_ao_acesso(uuid) from public, anon;
grant  execute on function gps.admin_direito_ao_acesso(uuid) to authenticated;
