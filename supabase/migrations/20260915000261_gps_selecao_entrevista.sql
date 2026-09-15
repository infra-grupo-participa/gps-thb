-- Fatia 2 da esteira: os 5 CLIENTES da entrevista prévia.
--
-- Pedido do Marcio (14/09, confirmado): o parceiro escolhe 5 clientes para a
-- equipe entrevistar. UM DOS CINCO é o favorito (`acompanhado_equipe`) — o
-- que a equipe acompanha e com quem faz a reunião preliminar. São 5 no
-- total, não 6.
--
-- POR QUE COLUNA NOVA E NÃO REAPROVEITAR `acompanhado_equipe`
--   `acompanhado_equipe` já é um índice único parcial (1 por ambiente), 2
--   triggers (...203/...215) e `exigeFavorito` em 5 tarefas da Etapa 01. É
--   OUTRO conceito: "o favorito". A seleção dos 5 é um conjunto, o favorito é
--   1 elemento dele. Reaproveitar quebraria as 5 tarefas e o índice não serve
--   para cardinalidade 5. `selecionado_entrevista` (boolean) nasce do lado do
--   favorito, sem tocar índice, trigger ou tabela nenhuma que já existe.
--
-- AS TRÊS INVARIANTES
--   1. 1 favorito por ambiente — já garantida por `etapa1_clientes_unico_equipe`.
--      Nada a fazer aqui.
--   2. O favorito é UM DOS CINCO — `chk_etapa1_clientes_favorito_e_selecionado`
--      abaixo: `not acompanhado_equipe or selecionado_entrevista`.
--   3. Teto de 5 — NÃO é constraint (Postgres não tem cardinalidade por grupo
--      sem trigger de agregação, que custaria em TODA escrita da tabela mais
--      quente do sistema, 1.371 linhas). A trava é a RPC
--      `gps.selecao_entrevista_definir`, que recebe o CONJUNTO INTEIRO de uma
--      vez e é atômica: recusa se vier mais de 5. Toggle por cliente deixaria
--      o 6º entrar entre dois requests (corrida). Piso é 0 — o parceiro
--      seleciona ao longo do tempo, menos de 5 é normal.
--
-- BACKFILL OBRIGATÓRIO ANTES DO CHECK (medido 15/09: 35 favoritos, não 41 —
--   o plano do arquiteto tinha o número velho). Os 35 favoritos de hoje não
--   têm `selecionado_entrevista`; sem o backfill abaixo, o CHECK da invariante
--   2 falha na hora de criar (`ADD CONSTRAINT` varre a tabela inteira). É
--   semanticamente correto: quem já é favorito JÁ é um dos 5 selecionados —
--   ninguém perde a condição de favorito no dia 1.
--
-- DESMARCAR O FAVORITO DA SELEÇÃO
--   Tirar da lista de 5 um cliente que é o favorito quebraria a invariante 2
--   (o CHECK recusaria com 23514, mensagem genérica) OU, pior, sairia do
--   favorito calado se a RPC desmarcasse os dois juntos. A RPC recusa ANTES
--   de escrever, com frase própria — o aluno decide se troca o favorito
--   primeiro (pela ...215, via Suporte) ou mantém o favorito na seleção.
--
-- AUTORIZAÇÃO (decisão do Marcio, 15/09): titular E sócio selecionam — os
--   dois trabalham no mesmo ambiente. A guarda é `gps.aluno_atual()` (o
--   AMBIENTE), não o papel — a mesma função que a RLS de `etapa1_clientes` já
--   usa, e que já resolve titular/sócio para o mesmo `aluno_id` (ordena por
--   `papel = 'titular'` mas devolve o ambiente único). Nada novo a fazer para
--   o sócio funcionar; é a função certa.
--
-- ÍNDICE: NENHUM NOVO. A consulta que lista os selecionados de um ambiente
--   filtra por `aluno_id = $1`, que já tem `etapa1_clientes_aluno_idx`. Ver o
--   `explain (analyze, buffers)` no fim deste arquivo (comentário) — Index
--   Scan já é usado, e este projeto já mediu índice deixando query MAIS LENTA
--   em tabela deste tamanho (`etapa1_clientes(fase)`: Seq Scan 0,686 ms ×
--   Index Scan 0,809 ms em 1.222 linhas). Não se cria índice sem provar.
--
-- EVENTO NO DIÁRIO: `cliente_selecionado_entrevista` / `cliente_removido_entrevista`.
--   🔴 `aluno_eventos.tipo` tinha 29 valores medidos em 15/09 (lidos das
--   migrations, última a tocar o CHECK foi a ...259 — bate com a contagem).
--   Sem MCP disponível para ler o CHECK ao vivo no banco nesta sessão: o texto
--   abaixo foi RECONSTRUÍDO da ...259 (`add constraint ... check (tipo in (`),
--   não lido ao vivo. Confirme contra o banco antes de aplicar — se algo
--   escreveu na tabela depois da ...259 sem passar por uma migration deste
--   diretório, este `drop/create` vai apagar um valor em silêncio.
--   Um insert POR CLIENTE que mudou de lado (entrou/saiu), não um resumo por
--   ambiente — mesma granularidade de `cliente_favoritado`/`_desfavoritado`,
--   e só grava quem de fato mudou (idempotente: repetir o mesmo conjunto não
--   duplica evento).
--
-- REVERSÃO (nesta ordem):
--   drop function if exists gps.selecao_entrevista_definir(uuid, uuid[]);
--   alter table gps.aluno_eventos drop constraint aluno_eventos_tipo_check;
--   alter table gps.aluno_eventos add constraint aluno_eventos_tipo_check
--     check (tipo in (<lista da ...259, sem os 2 valores novos>));
--   alter table gps.etapa1_clientes drop constraint chk_etapa1_clientes_favorito_e_selecionado;
--   alter table gps.etapa1_clientes drop column selecionado_entrevista;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) COLUNA NOVA
-- ═══════════════════════════════════════════════════════════════════════════
alter table gps.etapa1_clientes
  add column if not exists selecionado_entrevista boolean not null default false;

comment on column gps.etapa1_clientes.selecionado_entrevista is
  'Um dos 5 clientes que o parceiro escolheu para a entrevista previa da equipe (decisao Marcio 14/09/2026). Teto de 5 NAO e constraint -- e a RPC gps.selecao_entrevista_definir, atomica, que recebe o conjunto inteiro. O favorito (acompanhado_equipe) tem que ser um dos 5: ver chk_etapa1_clientes_favorito_e_selecionado. Escrita so pela RPC -- PatchCliente (src/app/clientes/actions.ts) nao tem este campo.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) BACKFILL — antes do CHECK, ou o ADD CONSTRAINT falha nos 35 favoritos
--    atuais. Quem já é favorito já é um dos selecionados.
-- ═══════════════════════════════════════════════════════════════════════════
update gps.etapa1_clientes
   set selecionado_entrevista = true
 where acompanhado_equipe
   and not selecionado_entrevista;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) INVARIANTE 2: o favorito é um dos cinco selecionados
-- ═══════════════════════════════════════════════════════════════════════════
alter table gps.etapa1_clientes
  add constraint chk_etapa1_clientes_favorito_e_selecionado
  check (not acompanhado_equipe or selecionado_entrevista);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) DIÁRIO — 2 tipos novos. Corpo VIGENTE da ...259 (29 valores) + 2 novos.
--    RECONSTRUÍDO das migrations (sem leitura ao vivo do banco nesta sessão
--    — ver aviso acima). Acha a constraint por NOME (é sempre
--    `aluno_eventos_tipo_check` neste projeto, confirmado em ...060/...092/
--    .../...259) e recria com o corpo inteiro, não só o trecho novo.
-- ═══════════════════════════════════════════════════════════════════════════
alter table gps.aluno_eventos
  drop constraint if exists aluno_eventos_tipo_check;

alter table gps.aluno_eventos
  add constraint aluno_eventos_tipo_check check (tipo in (
    'cliente_cadastrado',
    'cliente_favoritado',
    'cliente_desfavoritado',
    'cliente_status_mudou',
    'cliente_fase_mudou',
    'cliente_mensagem_padrao',
    'cliente_estudo_caso',
    'cliente_ligacao',
    'cliente_aderiu_reuniao',
    'cliente_reuniao_agendada',
    'cliente_excluido',
    'cliente_honorarios_definidos',
    'tarefa_concluida',
    'tarefa_reaberta',
    'conta_criada',
    'email_confirmado',
    'primeiro_acesso',
    'entrou_no_programa',
    'etapa_liberada_pela_equipe',
    'etapa_travada_pela_equipe',
    'onboarding_iniciado',
    'onboarding_concluido',
    'favorito_confirmado_pela_equipe',
    'favorito_liberado_pela_equipe',
    'cliente_contrato_anexado',
    'cliente_contrato_removido',
    'nota_apagada',
    'cliente_minuta_anexada',
    'cliente_minuta_removida',
    -- ── Seleção dos 5 da entrevista (15/09/2026, migração ...261) ──
    'cliente_selecionado_entrevista',
    'cliente_removido_entrevista'
  ));

comment on constraint aluno_eventos_tipo_check on gps.aluno_eventos is
  'Catalogo fechado de tipos de evento do diario. Espelha TIPOS_EVENTO em src/lib/types.ts. 29 valores vigentes na ...259 + 2 desta migracao: cliente_selecionado_entrevista/cliente_removido_entrevista, gravados so por gps.selecao_entrevista_definir. Ao acrescentar valor, LEIA O CHECK VIGENTE NO BANCO antes -- reescrever a lista de memoria apaga valores em silencio.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) RPC — recebe o CONJUNTO INTEIRO, atômica. Teto 5, piso 0.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function gps.selecao_entrevista_definir(
  p_aluno_id    uuid,
  p_cliente_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin      boolean := coalesce(public.gp_is_admin(), false);
  v_ambiente   uuid    := gps.aluno_atual();
  v_ids        uuid[]  := coalesce(p_cliente_ids, '{}');
  v_qtd        integer;
  v_achados    integer;
  v_favorito   record;
  v_c          record;
begin
  if p_aluno_id is null then
    raise exception 'aluno nao informado' using errcode = '22023';
  end if;

  -- AUTORIZAÇÃO: dono do ambiente (titular OU sócio — `gps.aluno_atual()` já
  -- resolve os dois para o mesmo `aluno_id`) OU admin.
  if not v_admin and (v_ambiente is null or v_ambiente <> p_aluno_id) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  v_qtd := array_length(v_ids, 1);
  if v_qtd is not null and v_qtd > 5 then
    raise exception 'Selecione no máximo 5 clientes para a entrevista.' using errcode = '22023';
  end if;

  -- Todo id do array pertence a ESTE ambiente. `<> v_qtd` pega tanto id
  -- repetido (duplicata não soma linha) quanto id de outro ambiente/inexistente.
  if v_qtd is not null and v_qtd > 0 then
    select count(*) into v_achados
      from gps.etapa1_clientes c
     where c.id = any(v_ids)
       and c.aluno_id = p_aluno_id;
    if v_achados <> v_qtd then
      raise exception 'Um dos clientes selecionados não pertence a este ambiente.' using errcode = '42501';
    end if;
  end if;

  -- INVARIANTE 2, checada ANTES de escrever: se há favorito e ele NÃO está no
  -- conjunto novo, recusa com frase própria — nem o CHECK quebra, nem o
  -- favorito sai da seleção calado.
  select c.id, c.nome into v_favorito
    from gps.etapa1_clientes c
   where c.aluno_id = p_aluno_id
     and c.acompanhado_equipe
   limit 1;

  if v_favorito.id is not null and not (v_favorito.id = any(v_ids)) then
    raise exception 'O cliente favorito da equipe precisa continuar entre os 5 selecionados. Para trocar o favorito, abra um chamado no Suporte.' using errcode = '22023';
  end if;

  -- Grava quem ENTROU (auditoria por cliente, idempotente: só quem mudou).
  for v_c in
    select c.id, c.nome
      from gps.etapa1_clientes c
     where c.aluno_id = p_aluno_id
       and c.id = any(v_ids)
       and not c.selecionado_entrevista
  loop
    update gps.etapa1_clientes set selecionado_entrevista = true where id = v_c.id;
    insert into gps.aluno_eventos
      (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
    values
      (p_aluno_id, now(), 'cliente_selecionado_entrevista', 'cliente', v_c.id,
       left(coalesce(nullif(btrim(v_c.nome), ''), 'Cliente sem nome'), 300),
       null, case when v_admin then 'equipe' else 'aluno' end, auth.uid(), 'app');
  end loop;

  -- Grava quem SAIU.
  for v_c in
    select c.id, c.nome
      from gps.etapa1_clientes c
     where c.aluno_id = p_aluno_id
       and c.selecionado_entrevista
       and not (c.id = any(v_ids))
  loop
    update gps.etapa1_clientes set selecionado_entrevista = false where id = v_c.id;
    insert into gps.aluno_eventos
      (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
    values
      (p_aluno_id, now(), 'cliente_removido_entrevista', 'cliente', v_c.id,
       left(coalesce(nullif(btrim(v_c.nome), ''), 'Cliente sem nome'), 300),
       null, case when v_admin then 'equipe' else 'aluno' end, auth.uid(), 'app');
  end loop;

  return jsonb_build_object('aluno_id', p_aluno_id, 'selecionados', v_ids, 'total', coalesce(v_qtd, 0));
end $function$;

comment on function gps.selecao_entrevista_definir(uuid, uuid[]) is
  'Define o CONJUNTO INTEIRO dos ate 5 clientes selecionados para a entrevista previa (decisao Marcio 14/09/2026). Atomica de proposito: recebe todos os ids de uma vez, nao toggle por cliente (toggle deixaria o 6o entrar entre dois requests). Teto 5, piso 0. Recusa se o favorito (acompanhado_equipe) ficar de fora do conjunto -- ele tem que ser um dos 5 (chk_etapa1_clientes_favorito_e_selecionado). Autorizacao: dono do ambiente (titular OU socio, via gps.aluno_atual()) OU admin. Grava cliente_selecionado_entrevista/cliente_removido_entrevista so para quem mudou de lado.';

-- 🔴 GRANT explícito: `service_role` não dispensa RLS nem GRANT neste projeto
--    (schema exposto no PostgREST, `authenticator` lista `gps` nos schemas).
--    `revoke` primeiro, sempre — não se assume ausência de GRANT anterior.
revoke all on function gps.selecao_entrevista_definir(uuid, uuid[]) from public, anon;
grant execute on function gps.selecao_entrevista_definir(uuid, uuid[]) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- PROVA PENDENTE — 🔴 NÃO MEDIDO NESTA SESSÃO. Nem MCP do Supabase nem
-- `supabase` CLI estavam disponíveis neste ambiente de execução para rodar
-- `explain (analyze, buffers)` de verdade. A query que a tela vai fazer é:
--
--   explain (analyze, buffers)
--   select id, nome, selecionado_entrevista, acompanhado_equipe
--     from gps.etapa1_clientes
--    where aluno_id = '<um aluno_id real com clientes>';
--
--   O predicado é `aluno_id = $1`, que já tem `etapa1_clientes_aluno_idx`
--   (baseline, linha 345) — não há WHERE novo nem coluna nova no predicado, e
--   por isso não se cria índice para esta migração. Mas isto é raciocínio, não
--   medição: RODAR o `explain (analyze, buffers)` acima contra o banco real e
--   colar a saída crua antes de aplicar, como exige o protocolo.
-- ═══════════════════════════════════════════════════════════════════════════
