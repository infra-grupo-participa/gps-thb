-- Central de resolução — reabre a etapa de UM aluno (nunca apaga).
--
-- POR QUE NÃO É `delete from gps.progresso`
--   `gps.aluno_eventos_capturar_progresso()` começa com
--     if tg_op = 'DELETE' then return old; end if;
--   (migração ...008, linha 178). Apagar as linhas apagaria o progresso SEM UMA
--   LINHA na trilha do Diário: o admin veria o número cair e ninguém saberia
--   quem fez, quando, nem o que havia antes. Reabrir por UPDATE passa pelo ramo
--   `tg_op = 'UPDATE' and new.concluida is distinct from old.concluida` e gera
--   um `tarefa_reaberta` POR TAREFA — a trilha conta a história inteira, e o
--   caminho de volta é remarcar na tela da etapa.
--
-- SOBRE O `ator = 'equipe'` (conferido, não suposto)
--   A trigger resolve o ator com `case when public.gp_is_admin() then 'equipe'
--   else 'aluno' end`. `gp_is_admin()` lê `auth.uid()`, que vem da claim do JWT
--   (GUC da requisição) e NÃO muda dentro de uma função SECURITY DEFINER —
--   trocar o dono da execução não troca o dono da sessão. Logo, o evento nasce
--   com ator='equipe' e ator_user_id = o admin, sem precisar de parâmetro novo
--   nem de alteração na trigger. Isso é o que o bloco de conferência prova
--   depois de aplicar (contagem de `tarefa_reaberta` com ator='equipe').
--
-- O QUE NÃO FAZ
--   * NÃO apaga linha nenhuma (nem de gps.progresso, nem de gps.aluno_eventos);
--   * NÃO mexe em gps.tarefa_enfase (o destaque de tarefa é outra decisão);
--   * NÃO toca as tarefas AUTOMÁTICAS da Etapa 01 (1.1/1.2 são calculadas a
--     partir dos clientes em src/lib/etapa1.ts — não existe linha de progresso
--     para elas, e reabrir a etapa 1 não desfaz o que o aluno preencheu);
--   * NÃO libera nem trava a etapa (isso é gps.admin_definir_liberacao_etapa).
--
-- REVERSÃO
--   drop function if exists gps.admin_reabrir_etapa(uuid, smallint, text);
--   O efeito nos dados se desfaz remarcando as tarefas na tela da etapa — o
--   retorno da função traz a lista exata do que caiu, e o log a repete.

create or replace function gps.admin_reabrir_etapa(
  p_aluno_id uuid, p_etapa smallint, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_afetadas smallint[]; v_qtd int; v_nome text; v_motivo text;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_aluno_id is null or p_etapa is null then
    raise exception 'aluno ou etapa nao informado' using errcode = '22023';
  end if;
  v_motivo := btrim(coalesce(p_motivo, ''));
  if length(v_motivo) < 3 then
    raise exception 'Escreva o motivo — a trilha deste aluno vai registrar.'
      using errcode = '22023';
  end if;
  if length(v_motivo) > 300 then
    raise exception 'O motivo passa de 300 caracteres.' using errcode = '22023';
  end if;

  select e.nome into v_nome from gps.etapas e where e.id = p_etapa;
  if not found then
    raise exception 'Etapa não encontrada.' using errcode = 'P0002';
  end if;

  -- `and concluida` no WHERE: só as concluídas mudam de estado. Sem isso, as
  -- linhas já reabertas seriam "atualizadas" sem virar evento (a trigger usa
  -- IS DISTINCT FROM), o contador mentiria e o log diria um número que a trilha
  -- não confirma.
  with reabertas as (
    update gps.progresso
       set concluida = false, concluida_em = null
     where aluno_id = p_aluno_id and etapa = p_etapa and concluida
    returning tarefa
  )
  select array_agg(tarefa order by tarefa), count(*)
    into v_afetadas, v_qtd
    from reabertas;

  if coalesce(v_qtd, 0) = 0 then
    raise exception 'Não há tarefa concluída nesta etapa para reabrir.'
      using errcode = '22023';
  end if;

  insert into gps.acessos_log (acao, aluno_id, detalhe, feito_por)
  values ('progresso_reaberto', p_aluno_id,
          format('etapa %s (%s): %s tarefa(s) reaberta(s) %s. Motivo: %s',
                 p_etapa, coalesce(v_nome, '?'), v_qtd,
                 coalesce(v_afetadas::text, '{}'), v_motivo),
          auth.uid());

  return jsonb_build_object('etapa', p_etapa, 'nome', v_nome,
                            'reabertas', v_qtd, 'tarefas', v_afetadas);
end $function$;

comment on function gps.admin_reabrir_etapa(uuid, smallint, text) is
  'Reabre TODAS as tarefas manuais concluidas de UMA etapa de UM ambiente: update gps.progresso set concluida=false, concluida_em=null. NUNCA DELETE -- a trigger de captura do diario ignora DELETE (migracao ...008), entao apagar sumiria com o progresso sem deixar uma linha na trilha. Por UPDATE, a trigger grava um `tarefa_reaberta` por tarefa com ator=equipe (gp_is_admin() le a claim do JWT e continua valendo dentro do SECURITY DEFINER). Motivo obrigatorio (3..300). Recusa com 22023 quando nao ha nada concluido, para o admin nao achar que reabriu. NAO toca as tarefas automaticas da Etapa 01 (nao ha linha de progresso para elas) nem gps.tarefa_enfase.';

revoke execute on function gps.admin_reabrir_etapa(uuid, smallint, text) from public, anon;
grant  execute on function gps.admin_reabrir_etapa(uuid, smallint, text) to authenticated;
