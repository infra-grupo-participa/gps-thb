-- ════════════════════════════════════════════════════════════════════════════
-- GPS — a estrela deixa de exigir os 5 da Entrevista Prévia (29/09/2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Pedido da operação: "a ficha precisa ser completamente opcional, estamos
-- tendo problemas demais com isso". Caso que disparou: parceira com cliente
-- CONTRATADO e reunião marcada não conseguia dar a estrela porque não tinha
-- escolhido ninguém entre os 5 (0 de 31). Em 23/09 isso atingia 49 de 86
-- parceiros.
--
-- Revoga a decisão de 23/09 ("a regra fica"). A estrela e a seleção dos 5
-- passam a ser INDEPENDENTES:
--   1. cai o CHECK `chk_etapa1_clientes_favorito_e_selecionado`;
--   2. `selecao_entrevista_definir` deixa de obrigar o favorito a continuar
--      entre os 5.
--
-- O que NÃO muda: 1 estrela por ambiente (índice único parcial
-- `etapa1_clientes_unico_equipe`), a trava de troca depois que o caso anda
-- (trigger `etapa1_clientes_acompanhamento_travado`) e o teto de 5 da seleção.
--
-- Reversão: re-criar o CHECK (falha se houver estrela fora dos 5 — conferir
-- antes com `select count(*) from gps.etapa1_clientes where acompanhado_equipe
-- and not selecionado_entrevista`) e restaurar o bloco do favorito na RPC
-- (versão anterior em 20260915000261).
-- ════════════════════════════════════════════════════════════════════════════

alter table gps.etapa1_clientes
  drop constraint if exists chk_etapa1_clientes_favorito_e_selecionado;

create or replace function gps.selecao_entrevista_definir(p_aluno_id uuid, p_cliente_ids uuid[])
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_admin boolean := coalesce(public.gp_is_admin(), false);
  v_ambiente uuid := gps.aluno_atual();
  v_ids uuid[] := coalesce(p_cliente_ids, '{}');
  v_qtd integer; v_achados integer; v_c record;
begin
  if p_aluno_id is null then raise exception 'aluno nao informado' using errcode='22023'; end if;
  if not v_admin and (v_ambiente is null or v_ambiente <> p_aluno_id) then
    raise exception 'Sem permissão.' using errcode='42501'; end if;
  v_qtd := array_length(v_ids, 1);
  if v_qtd is not null and v_qtd > 5 then
    raise exception 'Selecione no máximo 5 clientes para a entrevista.' using errcode='22023'; end if;
  if v_qtd is not null and v_qtd > 0 then
    select count(*) into v_achados from gps.etapa1_clientes c
     where c.id = any(v_ids) and c.aluno_id = p_aluno_id;
    if v_achados <> v_qtd then
      raise exception 'Um dos clientes selecionados não pertence a este ambiente.' using errcode='42501';
    end if;
  end if;
  for v_c in select c.id, c.nome from gps.etapa1_clientes c
     where c.aluno_id = p_aluno_id and c.id = any(v_ids) and not c.selecionado_entrevista
  loop
    update gps.etapa1_clientes set selecionado_entrevista = true where id = v_c.id;
    insert into gps.aluno_eventos (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
    values (p_aluno_id, now(), 'cliente_selecionado_entrevista', 'cliente', v_c.id,
      left(coalesce(nullif(btrim(v_c.nome),''),'Cliente sem nome'),300), null,
      case when v_admin then 'equipe' else 'aluno' end, auth.uid(), 'app');
  end loop;
  for v_c in select c.id, c.nome from gps.etapa1_clientes c
     where c.aluno_id = p_aluno_id and c.selecionado_entrevista and not (c.id = any(v_ids))
  loop
    update gps.etapa1_clientes set selecionado_entrevista = false where id = v_c.id;
    insert into gps.aluno_eventos (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
    values (p_aluno_id, now(), 'cliente_removido_entrevista', 'cliente', v_c.id,
      left(coalesce(nullif(btrim(v_c.nome),''),'Cliente sem nome'),300), null,
      case when v_admin then 'equipe' else 'aluno' end, auth.uid(), 'app');
  end loop;
  return jsonb_build_object('aluno_id', p_aluno_id, 'selecionados', v_ids, 'total', coalesce(v_qtd,0));
end $function$;
