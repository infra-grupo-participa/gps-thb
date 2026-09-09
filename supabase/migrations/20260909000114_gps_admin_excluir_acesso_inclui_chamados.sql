-- `gps.admin_excluir_acesso` também precisa apagar os CHAMADOS do ambiente.
--
-- É o MESMO achado do pentester da Fase 1 (20260908000002) e da Fase 2
-- (20260909000005) se repetindo em tabela nova: quem escreve a exclusão de
-- acesso lembra da lista de tabelas do dia em que a escreveu, não das que
-- nascem depois. Terceira vez — por isso o comentário da função agora nomeia a
-- regra: TABELA NOVA EM gps.* QUE GUARDA DADO DO ALUNO ENTRA AQUI NO MESMO
-- COMMIT em que nasce.
--
-- Duas consequências, a mesma dupla das vezes anteriores:
-- 1) LGPD — excluir o acesso deixaria a conversa de suporte do aluno (texto
--    livre, escrito por ele e pela equipe) para trás, num ambiente que não
--    existe mais em lugar nenhum do GPS.
-- 2) INTEGRIDADE — `gps.chamados.aberto_por` e `.fechado_por` referenciam
--    auth.users com `on delete set null` (migração ...110), então a tabela em si
--    NÃO bloquearia o delete de auth.users. A limpeza aqui é retenção, não
--    desbloqueio — e é por isso que as FKs nasceram `set null` e não `restrict`.
--
-- 🔴 ANEXOS VIRAM ÓRFÃOS, E ISSO É DE PROPÓSITO: apagar `gps.chamados` leva as
-- mensagens por cascade, mas uma função de banco NÃO TEM COMO falar com a
-- Storage API — apagar a linha de storage.objects por SQL deixaria os bytes no
-- object store. Os arquivos do ambiente excluído passam a aparecer em
-- `gps.chamados_anexos_para_expurgo()` com motivo `'orfao'` (migração ...113) e
-- saem no botão de expurgo de /admin/chamados, com a sessão do admin. O caminho
-- do arquivo é `<aluno_id>/<uuid>.<ext>`, então o admin consegue conferir de
-- que ambiente eram.
--
-- 🔴 CORPO VIGENTE: extraia com
--   select pg_get_functiondef('gps.admin_excluir_acesso(uuid)'::regprocedure);
-- e compare com o texto abaixo ANTES de aplicar. A base usada aqui é a
-- migração 20260909000005 (a mais recente do repo que define a função —
-- 20260909000003 e 20260909000070 só a citam em comentário). Se o banco
-- divergir, a linha a acrescentar é UMA só (o delete de gps.chamados, junto do
-- bloco do diário) — reescreva-a sobre o corpo do banco, não sobre este.
--
-- O QUE ESTA MIGRAÇÃO NÃO FAZ: não muda a ordem dos outros deletes, não mexe em
-- storage, não altera a assinatura nem o retorno (jsonb com login_apagado/email),
-- não toca no texto do acessos_log além de acrescentar "e chamados".
--
-- REVERSÃO: reaplicar a definição da migração 20260909000005 (sem a linha de
-- gps.chamados). Não recomendado: reabre a retenção indevida.

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
  -- Suporte: as mensagens saem por cascade (FK chamado_id on delete cascade).
  -- Os ANEXOS no bucket gps-chamados NÃO saem daqui — viram órfãos e são
  -- recolhidos por gps.chamados_anexos_para_expurgo() (motivo 'orfao') e
  -- apagados pelo botão de expurgo, com a sessão do admin. Ver cabeçalho.
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
      raise exception 'O login não pôde ser apagado: esta conta tem registros em outros sistemas do grupo. O ambiente do GPS foi limpo.' using errcode = '23503';
    end;
  end if;

  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, detalhe, feito_por)
  values ('acesso_excluido', p_aluno_id, v_user, v_email,
          case when v_login_apagado then 'login e dados do GPS (inclui diário, log de ações e chamados)' else 'apenas dados do GPS (inclui diário, log de ações e chamados)' end,
          auth.uid());

  return jsonb_build_object('login_apagado', v_login_apagado, 'email', v_email);
end $function$;

comment on function gps.admin_excluir_acesso(uuid) is
  'Exclui o ambiente do GPS e (quando possivel) o login do aluno. REGRA DE MANUTENCAO: toda tabela nova em gps.* que guarde dado do aluno entra na lista de deletes AQUI, no mesmo commit em que nasce -- ja foram tres correcoes retroativas (diario 20260908000002, eventos 20260909000005, chamados 20260909000114). Anexos no bucket gps-chamados NAO sao apagados aqui (banco nao fala com a Storage API): viram orfaos e saem pelo expurgo de /admin/chamados.';
