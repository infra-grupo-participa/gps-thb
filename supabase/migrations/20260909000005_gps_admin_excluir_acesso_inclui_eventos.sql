-- Diário do aluno — Fase 2: `gps.admin_excluir_acesso` também precisa apagar
-- `gps.aluno_eventos`. É o MESMO achado do pentester da Fase 1
-- (20260908000002) se repetindo em tabela nova: quem cria a exclusão de
-- acesso lembra da lista de tabelas do dia em que escreveu a função, não das
-- que nascem depois.
--
-- Duas consequências, mesma dupla da vez passada:
-- 1) LGPD — excluir o acesso deixaria o log de ações do aluno para trás
--    (rótulos podem referenciar cliente/tarefa; e o próprio `ator_user_id`
--    aponta para a conta sendo apagada).
-- 2) INTEGRIDADE — não há FK de aluno_eventos.ator_user_id para auth.users
--    (é solto, de propósito, para o log sobreviver mesmo se o autor sumir em
--    outro fluxo), então esta tabela em si NÃO bloquearia o delete de
--    auth.users por restrict. Mas apagar o ambiente sem apagar o log dele
--    deixaria eventos órfãos referenciando um aluno_id que não existe mais
--    em lugar nenhum do GPS — mesma classe de retenção indevida por omissão.
--
-- Ordem: antes de gps.aluno_notas (cuja FK evento_id->aluno_eventos é ON
-- DELETE SET NULL, então a ordem entre as duas não importa para integridade,
-- mas mantém as tabelas do diário juntas no bloco, como já estava).
--
-- Reversão: reaplicar a definição anterior (sem a linha do aluno_eventos) da
-- migração 20260908000002. Não recomendado: reabre a retenção indevida.
create or replace function gps.admin_excluir_acesso(p_aluno_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_user uuid; v_email text; v_login_apagado boolean := false; v_outros uuid[];
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
  -- Diário: apagar ANTES de auth.users (FK restrict em autor_id/resolvido_por
  -- de aluno_notas). aluno_eventos não tem FK para auth.users, mas apaga
  -- junto para não deixar log órfão de um ambiente que não existe mais.
  delete from gps.aluno_notas where aluno_id = p_aluno_id;
  delete from gps.aluno_eventos where aluno_id = p_aluno_id;
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
      raise exception 'O login não pôde ser apagado: esta conta tem registros em outros sistemas do grupo. O ambiente do GPS foi limpo.' using errcode = '23503';
    end;
  end if;

  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, detalhe, feito_por)
  values ('acesso_excluido', p_aluno_id, v_user, v_email,
          case when v_login_apagado then 'login e dados do GPS (inclui diário e log de ações)' else 'apenas dados do GPS (inclui diário e log de ações)' end,
          auth.uid());

  return jsonb_build_object('login_apagado', v_login_apagado, 'email', v_email);
end $function$;
