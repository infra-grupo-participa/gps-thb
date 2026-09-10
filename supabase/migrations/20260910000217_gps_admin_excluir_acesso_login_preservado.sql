-- 20260910000217_gps_admin_excluir_acesso_login_preservado.sql
--
-- A MENSAGEM MENTIA: "O ambiente do GPS foi limpo" num RAISE que desfaz a limpeza
--
-- `gps.admin_excluir_acesso` apaga tudo do ambiente em gps.* e, por fim, tenta
-- apagar o login em auth.users. Quando esse login tem FK em OUTRO sistema do
-- grupo (auth.users e de 7 portais), o delete falha com 23503 e a funcao
-- levantava uma excecao dizendo "O ambiente do GPS foi limpo" -- mas RAISE em
-- plpgsql aborta a transacao inteira: NADA tinha sido limpo. O admin lia que o
-- ambiente sumiu e ele continuava la (achado E2 do war-room de 10/09).
--
-- O QUE MUDA
--   * o mesmo caminho que ja existia para os OUTROS membros (`v_outros`:
--     `exception when foreign_key_violation then null`) passa a valer para o
--     titular: o login fica, o ambiente do GPS e limpo de verdade,
--     `login_apagado` volta false e o retorno ganha `login_preservado_motivo`
--     para a tela dizer POR QUE o login ficou.
--   * o log em gps.acessos_log ja distinguia os dois casos ('apenas dados do
--     GPS'); ganha a frase do motivo.
--
-- FORMA: corpo VIGENTE (pg_get_functiondef de 10/09 = migracao ...114) com so
-- essa mudanca. Assinatura, security definer, search_path, grants intactos.
-- SEM DDL de tabela, SEM backfill. REVERSAO: reaplicar o corpo da ...114.

create or replace function gps.admin_excluir_acesso(p_aluno_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_user uuid; v_email text; v_login_apagado boolean := false; v_outros uuid[];
        v_motivo text := null;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  v_user := gps.admin_user_do_aluno(p_aluno_id);
  if v_user is not null then
    if gps.admin_alvo_e_equipe(v_user) then
      raise exception 'Esta conta é da equipe — não pode ser excluída por aqui.' using errcode = '42501';
    end if;
    if v_user = auth.uid() then
      raise exception 'Você não pode excluir o próprio acesso.' using errcode = '42501';
    end if;
    select email into v_email from auth.users where id = v_user;
  end if;
  select array_agg(m.user_id) into v_outros
    from gps.membros m
   where m.aluno_id = p_aluno_id and m.user_id is not null and m.user_id <> coalesce(v_user, '00000000-0000-0000-0000-000000000000'::uuid)
     and not gps.admin_alvo_e_equipe(m.user_id) and m.user_id <> auth.uid();
  delete from gps.progresso where aluno_id = p_aluno_id;
  delete from gps.tarefa_enfase where aluno_id = p_aluno_id;
  delete from gps.reuniao_agendamentos where aluno_id = p_aluno_id;
  delete from gps.etapa3_agendamentos where aluno_id = p_aluno_id;
  delete from gps.etapa3_revisao where aluno_id = p_aluno_id;
  delete from gps.etapa1_clientes where aluno_id = p_aluno_id;
  delete from gps.agenda where aluno_id = p_aluno_id;
  delete from gps.aluno_notas where aluno_id = p_aluno_id;
  delete from gps.aluno_eventos where aluno_id = p_aluno_id;
  delete from gps.chamados where aluno_id = p_aluno_id;
  delete from gps.membros where aluno_id = p_aluno_id;
  delete from gps.ambientes where aluno_id = p_aluno_id;
  delete from gps.solicitacoes_acesso where aluno_id = p_aluno_id;
  if v_outros is not null then
    delete from gps.solicitacoes_acesso where user_id = any(v_outros);
    begin
      delete from auth.users where id = any(v_outros);
    exception when foreign_key_violation then null;
    end;
  end if;
  if v_user is not null then
    delete from gps.solicitacoes_acesso where user_id = v_user;
    begin
      delete from auth.users where id = v_user;
      v_login_apagado := true;
    exception when foreign_key_violation then
      -- ...217: NÃO levantar. O login tem registros em outro portal do grupo e
      -- fica; o ambiente do GPS foi limpo de verdade (acima). A tela diz isso.
      v_login_apagado := false;
      v_motivo := 'A conta tem registros em outros sistemas do grupo; o login foi preservado e só os dados do programa foram apagados.';
    end;
  end if;
  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, detalhe, feito_por)
  values ('acesso_excluido', p_aluno_id, v_user, v_email,
          case when v_login_apagado then 'login e dados do GPS (inclui diário, log de ações e chamados)'
               else 'apenas dados do GPS (inclui diário, log de ações e chamados)'
                    || coalesce(' — ' || v_motivo, '') end,
          auth.uid());
  return jsonb_build_object('login_apagado', v_login_apagado, 'email', v_email,
                            'login_preservado_motivo', v_motivo);
end $function$;

comment on function gps.admin_excluir_acesso(uuid) is
  'Exclui o ambiente do GPS e (quando possivel) o login do aluno. Desde a ...217, login com FK em outro sistema do grupo NAO aborta: fica preservado, o ambiente e limpo e o retorno traz login_preservado_motivo. REGRA DE MANUTENCAO: toda tabela nova em gps.* que guarde dado do aluno entra na lista de deletes AQUI, no mesmo commit em que nasce -- ja foram tres correcoes retroativas (diario 20260908000002, eventos 20260909000005, chamados 20260909000114). Anexos no bucket gps-chamados NAO sao apagados aqui (banco nao fala com a Storage API): viram orfaos e saem pelo expurgo de /admin/chamados.';
