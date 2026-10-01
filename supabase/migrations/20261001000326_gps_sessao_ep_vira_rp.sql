-- ═══════════════════════════════════════════════════════════════════════════
-- 326 — A "Entrevista Prévia" marcada com a Dra. Cristiane vira Reunião
--       Preliminar (decisão do dono, 01/10/2026). SEM e-mail ao aluno.
-- ═══════════════════════════════════════════════════════════════════════════
-- NÃO APLICADA. Escrita sem acesso ao banco; o ensaio e o explain estão no fim
-- do arquivo, para a sessão principal rodar e colar a saída aqui.
--
-- ── O QUE FOI MEDIDO (orquestrador, produção, 01/10) ───────────────────────
--   tipo 1 (EP): 4 agendadas + 1 cancelada · tipo 2 (RP): 2 agendadas
--   os alunos das 3 sessões tipo 1 FUTURAS não têm tipo 2 vivo → sem colisão
--   em `sessao_aluno_tipo_viva`; a grade publicada é só a da Cristiane, com
--   `tipo_id` null (= serve aos dois tipos).
--
-- ── O QUE MUDA ─────────────────────────────────────────────────────────────
--   §1  (REMOVIDO em 01/10, decisão do dono) A EP NÃO é desligada: o tipo
--       continua `ativo = true` e passa a ser atendido pelo Marco, com grade
--       própria e 40 min — migration …328, que exige esta antes (guardas).
--       Entre a 326 e a 328 o tipo fica ativo SEM faixa que o sirva: a tela
--       /sessoes lista a EP com o estado vazio honesto ("sem horário"), e
--       sessao_horarios_livres(1) devolve 0 linhas (não P0002).
--   §2  Grade da Cristiane: faixas ativas com `tipo_id` null → tipo da RP
--       (o §4 da 324, sem a função `sessao_ep_responsavel_permitido`, que não
--       entra: a 324 foi descartada).
--   §3  Sessões da EP não canceladas → tipo da RP, um evento
--       `sessao_tipo_reclassificado` por linha (de/para).
--
-- ── O QUE DELIBERADAMENTE NÃO MUDA ─────────────────────────────────────────
--   • `fim_em` NÃO muda: é coluna GERADA de `data + hora_inicio + duracao_min`
--     da PRÓPRIA linha (cópia congelada, …291). `tipo_id` não entra na
--     expressão. Os dois tipos têm 150 min no catálogo; mesmo que não
--     tivessem, o compromisso gravado não seria reescrito.
--   • NENHUM e-mail sai por causa desta migration. Não há trigger de e-mail
--     em `gps.sessao_agendamentos`: o e-mail é o cron `sessao-emails` lendo
--     janelas de `criado_em` (24 h), `cancelado_em` (24 h) e `inicio_em`
--     (lembretes de 24 h / 1 h). Este UPDATE não toca nenhuma delas nem
--     nenhum carimbo `email_*`. Os lembretes de 24 h / 1 h continuam saindo
--     no horário de sempre — agora com o nome "Reunião Preliminar".
--   • Triggers que ACORDAM com este UPDATE (conferir no ensaio, passo E0):
--       trg_sessao_agend_atualizado_em  → só toca `atualizado_em`;
--       trg_gcal_espelho_sessao_upd (325) → WHEN inclui `tipo_id`; com
--         `gcal_espelho_ativo = 'false'` só grava a pendência, nada sai.
--   • `gps.etapa1_clientes.data_reuniao_preliminar` NÃO é gravada aqui.
--     `sessao_agendar` grava essa coluna quando o tipo é a RP, mas gravá-la
--     por migration liga a trava do favorito (trigger
--     trg_etapa1_clientes_acompanhamento_travado, …305) e mexe nos KPIs de
--     reunião (…282) — efeito de negócio que a decisão não pediu. A conta de
--     quantos ficariam com a coluna nula está no ensaio (E3).
--   • `gps.entrevista_previa`, `gps.reuniao_*` e `gps.agenda`: intocados.
--
-- ── IDEMPOTENTE ────────────────────────────────────────────────────────────
-- Cada UPDATE filtra pelo estado de ORIGEM (`tipo_id is null`,
-- `tipo_id = <EP>`): reaplicar dá 0 linhas em cada passo e nenhum evento.
--
-- ── GUARDA ─────────────────────────────────────────────────────────────────
-- Se algum aluno com EP AGENDADA já tiver RP AGENDADA, o UPDATE violaria
-- `sessao_aluno_tipo_viva` (aluno_id, tipo_id) where estado = 'agendado'.
-- A migration ABORTA antes de escrever qualquer sessão e lista os ids.
--
-- ── DOWN (à mão; ids do raise notice) ──────────────────────────────────────
--   update gps.sessao_disponibilidade set tipo_id = null where id = any('<ids_grade>');
--   update gps.sessao_agendamentos set tipo_id = <EP> where id = any('<ids_sessao>');
--   -- os eventos ficam (trilha append-only): o DOWN grava outro evento se quiser.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '2s';
set local statement_timeout = '20s';

do $mig$
declare
  v_ep        smallint;
  v_rp        smallint;
  v_dur_ep    smallint;
  v_dur_rp    smallint;
  v_cris      uuid;
  v_n_cris    int;
  v_colisao   uuid[];
  v_ids_grade uuid[];
  v_outras    int;
  v_ids_sess  uuid[];
  v_eventos   int;
begin
  -- Os tipos pela ETAPA, nunca por id literal (mesmo princípio da …292 §0).
  select t.id, t.duracao_min into v_ep, v_dur_ep from gps.sessao_tipos t where t.etapa_id = 1;
  select t.id, t.duracao_min into v_rp, v_dur_rp from gps.sessao_tipos t where t.etapa_id = 2;
  if v_ep is null or v_rp is null then
    raise exception 'catalogo gps.sessao_tipos sem tipo de etapa 1 ou 2 -- ABORTADA' using errcode = 'P0002';
  end if;
  if (select count(*) from gps.sessao_tipos where etapa_id in (1, 2)) <> 2 then
    raise exception 'mais de um tipo por etapa 1/2 no catalogo -- ABORTADA (ambiguo)';
  end if;
  -- 40 = a …328 já rodou: a EP agora é do Marco. Reaplicar a 326 depois dela
  -- reclassificaria as EP FUTURAS dele como RP -- então PULA (ensaio 01/10).
  if v_dur_ep = 40 then
    raise notice '326 pulada: a 328 ja aplicada (EP = 40 min, do Marco)';
    return;
  end if;
  if v_dur_ep is distinct from v_dur_rp then
    -- Não quebra nada (duracao_min é cópia congelada por linha), mas a
    -- premissa medida era 150 = 150; divergência pede olhar humano.
    raise exception 'duracao EP (%) <> RP (%) -- premissa medida mudou; ABORTADA', v_dur_ep, v_dur_rp;
  end if;

  -- A Cristiane por UUID, resolvido por e-mail EXATO. 🔴 Nunca por nome:
  -- há dezenas de alunas Cristiane em auth.users (…292 §3).
  select count(*), min(u.id::text)::uuid into v_n_cris, v_cris
    from auth.users u
   where lower(btrim(u.email)) = 'cristiane@advmais.com';
  if v_n_cris <> 1 then
    raise exception 'esperado 1 usuario cristiane@advmais.com, achados % -- ABORTADA', v_n_cris;
  end if;

  -- ── GUARDA DE COLISÃO, antes de qualquer escrita ──
  select array_agg(e.id order by e.id) into v_colisao
    from gps.sessao_agendamentos e
   where e.tipo_id = v_ep
     and e.estado = 'agendado'
     and e.inicio_em > now()
     and e.responsavel_id = v_cris   -- só as da Cristiane (kirad 01/10)
     and exists (select 1 from gps.sessao_agendamentos r
                  where r.aluno_id = e.aluno_id
                    and r.tipo_id  = v_rp
                    and r.estado   = 'agendado');
  if v_colisao is not null then
    raise exception 'colisao em sessao_aluno_tipo_viva: EP agendada de aluno que ja tem RP agendada (ids %) -- ABORTADA sem escrever',
      v_colisao::text;
  end if;

  -- ── §1 REMOVIDO (01/10): a EP continua ativa; quem a atende é o Marco (…328) ──

  -- ── §2 grade da Cristiane: null → RP ──
  with x as (
    update gps.sessao_disponibilidade d
       set tipo_id = v_rp
     where d.responsavel_id = v_cris
       and d.ativo
       and d.tipo_id is null
    returning d.id)
  select array_agg(id order by id) into v_ids_grade from x;

  -- Outras faixas ativas que ainda servem à EP (null ou explícitas) de
  -- OUTRA pessoa: não são alteradas (a medição disse que não existem); só
  -- contadas no notice. Com a EP ativa, elas CONTINUAM oferecendo EP — e a
  -- …328 aborta se houver alguma (exige grade do tipo 1 só do Marco).
  select count(*) into v_outras
    from gps.sessao_disponibilidade d
   where d.ativo
     and d.responsavel_id <> v_cris
     and (d.tipo_id is null or d.tipo_id = v_ep);

  -- ── §3 sessões da EP não canceladas → RP, com trilha ──
  -- 🔴 Um CTE só: o UPDATE e o INSERT dos eventos no mesmo comando, mesmo
  -- snapshot. `estado` e `inicio_em` vão no detalhe para a trilha dizer o
  -- que foi reclassificado sem precisar de join. LGPD: só identificadores.
  with alvo as (
    update gps.sessao_agendamentos a
       set tipo_id = v_rp
     where a.tipo_id = v_ep
       and a.estado = 'agendado'
       -- Só as FUTURAS. A passada fica como foi marcada: a Marineide tem EP
       -- 23/09 + RP 25/09 (ambas vencidas e ainda 'agendado') — reclassificar
       -- colidiria em sessao_aluno_tipo_viva e reescreveria história (ensaio 01/10).
       and a.inicio_em > now()
       -- 🔴 Só as da Cristiane, qualquer que seja a duração (kirad 01/10): se a
       -- 328 for desfeita pelo DOWN (EP volta a 150) e a 326 reaplicada, a
       -- guarda de 40 min não pula e as EP do Marco virariam RP.
       and a.responsavel_id = v_cris
    returning a.id, a.estado, a.inicio_em
  ), ev as (
    insert into gps.sessao_eventos (agendamento_id, acao, ator_id, detalhe)
    select al.id, 'sessao_tipo_reclassificado', null,
           jsonb_build_object(
             'de_tipo_id',  v_ep,
             'para_tipo_id', v_rp,
             'estado',      al.estado,
             'inicio_em',   al.inicio_em,
             'origem',      'migration 20261001000326',
             'motivo',      'EP marcada com a Dra. Cristiane era Reuniao Preliminar na pratica (decisao 01/10/2026); sem e-mail ao aluno',
             'escreveu_data_reuniao_preliminar', false)
      from alvo al
    returning 1
  )
  select (select array_agg(id order by id) from alvo),
         (select count(*) from ev)
    into v_ids_sess, v_eventos;

  if coalesce(cardinality(v_ids_sess), 0) <> v_eventos then
    raise exception 'sessoes reclassificadas (%) <> eventos (%) -- ABORTADA',
      coalesce(cardinality(v_ids_sess), 0), v_eventos;
  end if;

  raise notice 'EP=% RP=% (EP segue ativa) | grade Cristiane null->RP: % % | outras faixas ativas que ainda servem EP: % | sessoes EP->RP: % % | eventos: %',
    v_ep, v_rp,
    coalesce(cardinality(v_ids_grade), 0), coalesce(v_ids_grade::text, '{}'),
    v_outras,
    coalesce(cardinality(v_ids_sess), 0), coalesce(v_ids_sess::text, '{}'),
    v_eventos;
end
$mig$;

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- 🔬 ENSAIO — rodar INTEIRO, como está. Termina em ROLLBACK: nada persiste.
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ Rodar SEM o `begin;`/`commit;` do arquivo: colar o bloco `do $mig$ … $mig$;`
-- no ponto marcado. (Os `set local` valem dentro deste begin.)
--
-- begin;
-- set local lock_timeout = '2s';
-- set local statement_timeout = '20s';
--
-- -- E0. triggers que acordam num UPDATE de tipo_id (esperado: atualizado_em
-- --     e gcal_espelho_sessao_upd; NENHUM de e-mail)
-- select tgname, pg_get_triggerdef(oid) from pg_trigger
--  where tgrelid = 'gps.sessao_agendamentos'::regclass and not tgisinternal order by 1;
-- select valor from gps.config where chave = 'gcal_espelho_ativo';   -- esperado 'false'
--
-- -- E1. ANTES
-- select tipo_id, estado, count(*), count(*) filter (where inicio_em > now()) futuras
--   from gps.sessao_agendamentos group by 1,2 order by 1,2;
--   -- esperado: (1,agendado,4,3) (1,cancelado,1,?) (2,agendado,2,?)
-- select id, ativo from gps.sessao_tipos order by id;                 -- (1,t) (2,t)
-- select d.id, d.dia_semana, d.hora_inicio, d.hora_fim, d.tipo_id from gps.sessao_disponibilidade d
--  where d.ativo order by d.dia_semana, d.hora_inicio;                 -- 4 faixas, tipo_id null
-- select count(*) from net.http_request_queue;                         -- fila pg_net antes
--
-- -- >>> colar aqui o bloco do $mig$ … $mig$; <<<
--
-- -- E2. DEPOIS
-- select tipo_id, estado, count(*) from gps.sessao_agendamentos group by 1,2 order by 1,2;
--   -- esperado: (1,cancelado,1) (2,agendado,6)
-- select id, ativo from gps.sessao_tipos order by id;                 -- (1,t) (2,t)  (EP segue ativa)
-- select tipo_id, count(*) from gps.sessao_disponibilidade where ativo group by 1;  -- (2,4)
-- select acao, count(*) from gps.sessao_eventos
--  where acao = 'sessao_tipo_reclassificado' group by 1;              -- 4
-- select count(*) from net.http_request_queue;                         -- IGUAL ao de antes
-- -- carimbos de e-mail das linhas reclassificadas: nenhum mudou
-- select a.id, a.email_agendou_aluno_em, a.email_24h_aluno_em, a.email_1h_aluno_em
--   from gps.sessao_agendamentos a
--   join gps.sessao_eventos e on e.agendamento_id = a.id and e.acao = 'sessao_tipo_reclassificado';
-- -- a oferta (como admin): tipo 2 oferece a grade da Cristiane; tipo 1 fica
-- -- VAZIO (ativo, sem faixa que o sirva) até a …328 dar a grade do Marco
-- select count(*) from gps.sessao_horarios_livres(2::smallint);      -- > 0
-- select count(*) from gps.sessao_horarios_livres(1::smallint);      -- 0 (não P0002)
--
-- -- E3. data_reuniao_preliminar que ficaria nula para RP agendada futura
-- select count(*) from gps.sessao_agendamentos a
--   join gps.etapa1_clientes c on c.id = a.cliente_id
--  where a.tipo_id = 2 and a.estado = 'agendado' and a.inicio_em > now()
--    and c.data_reuniao_preliminar is null;
--
-- -- E4. reaplicar o bloco do $mig$ de novo → notice com 0 em tudo (idempotência)
--
-- rollback;
--
-- ── EXPLAIN (dentro do mesmo begin … rollback, ANTES do bloco do $mig$) ──
-- 🔴 O EXPLAIN EXECUTA o UPDATE: só dentro do begin … rollback. Predicado
-- IDÊNTICO ao do §3 (tipo_id = EP, estado = 'agendado', inicio_em > now()).
-- A versão anterior deste bloco media `estado <> 'cancelado'` sem o corte de
-- inicio_em — outro predicado, outro plano; o número de lá não vale para cá.
-- explain (analyze, buffers)
-- update gps.sessao_agendamentos a
--    set tipo_id = 2
--  where a.tipo_id = 1
--    and a.estado = 'agendado'
--    and a.inicio_em > now();
-- -- Esperado: Seq Scan OU Index Scan em sessao_slot_unico
-- -- ((responsavel_id, inicio_em) where estado in ('agendado','realizado')):
-- -- `estado = 'agendado'` implica o predicado parcial e `inicio_em > now()`
-- -- é filtro sobre a 2ª coluna. Tabela de dezenas de linhas, one-shot: os
-- -- dois servem, sem índice novo. Medição real: ensaio-326-328.sql (json
-- -- `explain_update_326`).
--
-- ── SAÍDA DO ENSAIO (colar aqui) ──────────────────────────────────────────
--   01/10/2026, mbvybujpkwuorhtdzcde, transação desfeita (lock 2s / stmt 20s):
--   antes: tipo 1 agendadas = 4 (3 futuras; a 4ª é da Marineide, 23/09, vencida
--   e ainda "agendado" — fica fora: guarda e UPDATE filtram inicio_em > now()).
--   depois: tipo 2 agendadas = 5 (4 futuras) · eventos sessao_tipo_reclassificado = 3
--   grade da Cristiane: 4 linhas com tipo_id 2 · rp_sem_data = 0
--   net.http_request_queue: 0 antes, 0 depois (nenhum e-mail).
--   ── REMEDIDO 01/10/2026 20:29 UTC (ensaio-326-328.sql, md5 072f2821…, tudo desfeito) ──
--   EXPLAIN (analyze, buffers) do UPDATE do §3 — predicado IDÊNTICO:
--     ModifyTable Update on sessao_agendamentos  actual 4,381 ms  rows 0
--       -> Index Scan using sessao_slot_unico  Index Cond: (inicio_em > now())
--          Filter: (tipo_id = 1 AND estado = 'agendado')  actual rows 3 · removed 1
--          shared hit 5 · read 0
--     Triggers: FK tipo_id 0,337 ms ×3 · trg_sessao_agend_atualizado_em 0,264 ms ×3
--     Planning 0,197 ms · Execution 4,868 ms. Sem índice novo (one-shot, 4 linhas).
--   Passo 1: grade da Cristiane null→RP = 4 · EP futuras → RP = 3 · eventos = 3
--            outras faixas servindo EP = 0
--   Passo 2 (idempotência): tudo 0.
--   Entre 326 e 328: oráculo EP de 06/10 a 01/12 = 0 horários  ← aplicar JUNTAS.
-- ═══════════════════════════════════════════════════════════════════════════
