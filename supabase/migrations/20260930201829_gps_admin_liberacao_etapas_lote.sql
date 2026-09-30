-- ═══════════════════════════════════════════════════════════════════════════
-- Central de resolução — liberação de etapa EM LOTE (N alunos × N etapas).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── NUMERAÇÃO ──────────────────────────────────────────────────────────────
-- Versão 20260930201829 = a que o apply_migration registrou em produção
--
-- ── O QUE FAZ ──────────────────────────────────────────────────────────────
-- Casca sobre `gps.admin_definir_liberacao_etapa` (migração …152). A regra, o
-- log (`gps.acessos_log`, acao `etapa_liberacao_alterada`) e o evento do Diário
-- (`etapa_liberada/travada_pela_equipe`) continuam num lugar só: esta função
-- VALIDA TUDO antes de escrever e depois chama a existente uma vez por
-- (aluno, etapa) que de fato muda. Nada de regra copiada.
--
-- ── PULA O QUE NÃO MUDA ────────────────────────────────────────────────────
--   * override atual `is not distinct from` o pedido;
--   * sem override e pedido = null (já segue a regra geral — a função unitária
--     recusaria com 22023 "Esta etapa já segue a regra geral…" e abortaria o
--     lote inteiro);
--   * sem override e pedido = `gps.etapas.liberada` (gravaria um override que
--     não muda o que a pessoa vê — linha e log redundantes).
--
-- ── ATÔMICA ────────────────────────────────────────────────────────────────
-- Uma chamada = uma transação. Qualquer erro no meio (inclusive do log ou do
-- evento dentro da função unitária) desfaz o lote inteiro. Não há "metade
-- aplicada".
--
-- ── TRAVA ──────────────────────────────────────────────────────────────────
-- Alunos em ordem de uuid (array_agg distinct ordena) e etapas em ordem
-- crescente: duas chamadas concorrentes pegam as linhas da PK na mesma ordem
-- e não entram em deadlock. A leitura do override usa `for update` para a
-- decisão de pular não ficar velha até a escrita.
--
-- ── O QUE NÃO FAZ ──────────────────────────────────────────────────────────
-- Não altera `gps.admin_definir_liberacao_etapa`, `gps.etapa_liberacao_aluno`
-- nem `gps.etapas`.
--
-- ── REVERSÃO ───────────────────────────────────────────────────────────────
--   drop function if exists gps.admin_definir_liberacao_etapas_lote(uuid[], jsonb, text);
-- Nenhuma tabela é criada ou alterada.

create or replace function gps.admin_definir_liberacao_etapas_lote(
  p_alunos uuid[], p_itens jsonb, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_alunos       uuid[];
  v_n_alunos     int;
  v_sem_ambiente int;
  v_motivo       text;
  v_item         jsonb;
  v_etapa_num    numeric;
  v_etapas       smallint[] := '{}';
  v_pedidos      boolean[]  := '{}';
  v_globais      boolean[]  := '{}';
  v_global       boolean;
  v_i            int;
  v_aluno        uuid;
  v_etapa        smallint;
  v_pedido       boolean;
  v_atual        boolean;
  v_tem          boolean;
  v_alterados    int   := 0;
  v_sem_mudanca  int   := 0;
  v_saida        jsonb := '[]'::jsonb;
begin
  -- coalesce: sem JWT, gp_is_admin() pode vir NULL e `if not NULL` não dispara.
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  -- ── alunos: sem nulo, dedupe, 1..50 ────────────────────────────────────
  if p_alunos is null or array_position(p_alunos, null) is not null then
    raise exception 'aluno ou etapa nao informado' using errcode = '22023';
  end if;
  select array_agg(distinct a order by a) into v_alunos from unnest(p_alunos) a;
  v_n_alunos := coalesce(cardinality(v_alunos), 0);
  if v_n_alunos = 0 then
    raise exception 'Selecione ao menos um aluno.' using errcode = '22023';
  end if;
  if v_n_alunos > 50 then
    raise exception 'No máximo 50 alunos por vez.' using errcode = '22023';
  end if;

  -- ── motivo: mesmas frases da função unitária ───────────────────────────
  -- btrim() só tira espaço; tab/quebra de linha passariam como motivo.
  v_motivo := regexp_replace(coalesce(p_motivo, ''), '^\s+|\s+$', '', 'g');
  if length(v_motivo) < 3 then
    raise exception 'Escreva o motivo — ele fica no histórico deste aluno.'
      using errcode = '22023';
  end if;
  if length(v_motivo) > 300 then
    raise exception 'O motivo passa de 300 caracteres.' using errcode = '22023';
  end if;

  -- ── itens: array não vazio, etapa inteira existente em gps.etapas, sem repetir, liberada
  --    boolean ou null (chave obrigatória: ausência não vira "remover") ────
  if p_itens is null or jsonb_typeof(p_itens) <> 'array'
     or jsonb_array_length(p_itens) = 0 then
    raise exception 'Escolha ao menos uma etapa.' using errcode = '22023';
  end if;
  for v_item in
    select e from jsonb_array_elements(p_itens) e
     order by (e ->> 'etapa') collate "C"
  loop
    if jsonb_typeof(v_item) <> 'object'
       or jsonb_typeof(v_item -> 'etapa') is distinct from 'number'
       or not (v_item ? 'liberada')
       or jsonb_typeof(v_item -> 'liberada') not in ('boolean', 'null') then
      raise exception 'Item de etapa em formato inválido.' using errcode = '22023';
    end if;
    v_etapa_num := (v_item ->> 'etapa')::numeric;
    -- Faixa válida = o que existe em gps.etapas (checado logo abaixo); aqui só
    -- o que caberia num smallint, para o cast não estourar.
    if v_etapa_num <> trunc(v_etapa_num) or v_etapa_num not between 1 and 32767 then
      raise exception 'Etapa não encontrada.' using errcode = 'P0002';
    end if;
    v_etapa := v_etapa_num::smallint;
    if v_etapa = any (v_etapas) then
      raise exception 'Etapa repetida na lista.' using errcode = '22023';
    end if;
    select e.liberada into v_global from gps.etapas e where e.id = v_etapa;
    if not found then
      raise exception 'Etapa não encontrada.' using errcode = 'P0002';
    end if;
    v_etapas  := v_etapas  || v_etapa;
    v_pedidos := v_pedidos || (v_item -> 'liberada' #>> '{}')::boolean;
    v_globais := v_globais || v_global;
  end loop;

  -- ── ambiente: TODOS antes de escrever qualquer coisa ───────────────────
  -- Mesma checagem da função unitária (existe linha em gps.membros). Prefixo
  -- fixo "Sem ambiente no programa:" — a action casa por prefixo, porque a
  -- contagem torna a frase variável.
  select count(*) into v_sem_ambiente
    from unnest(v_alunos) a
   where not exists (select 1 from gps.membros m where m.aluno_id = a);
  if v_sem_ambiente > 0 then
    raise exception 'Sem ambiente no programa: % de % aluno(s) selecionado(s).',
      v_sem_ambiente, v_n_alunos using errcode = 'P0002';
  end if;

  -- ── escrita: só o que muda, pela função unitária ───────────────────────
  foreach v_aluno in array v_alunos loop
    for v_i in 1 .. cardinality(v_etapas) loop
      v_etapa  := v_etapas[v_i];
      v_pedido := v_pedidos[v_i];
      v_global := v_globais[v_i];

      select o.liberada into v_atual
        from gps.etapa_liberacao_aluno o
       where o.aluno_id = v_aluno and o.etapa = v_etapa
         for update;
      v_tem := found;

      if (v_tem and v_atual is not distinct from v_pedido)
         or (not v_tem and (v_pedido is null or v_pedido = v_global)) then
        v_sem_mudanca := v_sem_mudanca + 1;
        continue;
      end if;

      perform gps.admin_definir_liberacao_etapa(v_aluno, v_etapa, v_pedido, v_motivo);

      v_alterados := v_alterados + 1;
      v_saida := v_saida || jsonb_build_object(
        'aluno_id', v_aluno, 'etapa', v_etapa,
        'liberada', v_pedido, 'removido', v_pedido is null);
    end loop;
  end loop;

  return jsonb_build_object('alterados', v_alterados,
                            'sem_mudanca', v_sem_mudanca,
                            'itens', v_saida);
end $function$;

comment on function gps.admin_definir_liberacao_etapas_lote(uuid[], jsonb, text) is
  'Liberacao de etapa EM LOTE: p_alunos (1..50, dedupe) x p_itens [{"etapa":<id em gps.etapas>,"liberada":true|false|null}] (null = volta a regra geral), motivo 3..300 unico para o lote. Valida TUDO antes de escrever (inclusive que todos os alunos tem ambiente), depois chama gps.admin_definir_liberacao_etapa para cada (aluno, etapa) que MUDA -- log e evento do Diario ficam na funcao unitaria. Pula: override igual ao pedido; sem override e pedido null; sem override e pedido = gps.etapas.liberada. Atomica. Retorna {alterados, sem_mudanca, itens:[{aluno_id, etapa, liberada, removido}]} com so os alterados.';

revoke all     on function gps.admin_definir_liberacao_etapas_lote(uuid[], jsonb, text) from public, anon;
grant  execute on function gps.admin_definir_liberacao_etapas_lote(uuid[], jsonb, text) to authenticated;
