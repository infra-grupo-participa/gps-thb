-- ═══════════════════════════════════════════════════════════════════════════
-- 328 — A Entrevista Prévia (tipo de etapa_id = 1) passa a ser do Marco:
--       40 min e grade própria de 25 horários por semana a partir de 06/10.
-- ═══════════════════════════════════════════════════════════════════════════
-- NÃO APLICADA. Ensaio em transação desfeita: ensaio-326-328.sql (scratchpad
-- da sessão; a saída é colada no fim deste arquivo).
--
-- ── PRÉ-REQUISITO: a 326 ───────────────────────────────────────────────────
-- A 326 tira a grade da Cristiane do tipo 1 (tipo_id null → RP) e converte as
-- EP futuras dela em RP. Sem ela, mudar a duração para 40 faria a grade da
-- Cristiane oferecer EP de 40 min nas faixas de 2h30, e as 3 EP futuras
-- seguiriam marcadas com ela. As guardas abaixo ABORTAM nesse caso.
--
-- ── ESTADO MEDIDO (orquestrador, 01/10) ────────────────────────────────────
--   grade ativa = só as 4 faixas da Cristiane, tipo_id null · 3 EP futuras
--   agendadas (a 326 converte) · tipo etapa 1 = 150 min / intervalo 10 ·
--   perfis.email do Marco preenchido (o nome aparece na tela, …292 D5).
--
-- ── O QUE MUDA ─────────────────────────────────────────────────────────────
--   §1  gps.sessao_tipos (etapa_id = 1): duracao_min 150 → 40. intervalo_min
--       fica 10. Sessões já marcadas NÃO mudam: duracao_min do agendamento é
--       cópia congelada (…291), e fim_em/constraint de exclusão leem a cópia.
--   §2  25 linhas em gps.sessao_disponibilidade para o Marco
--       (85016fb8-5f7b-4474-a418-bc1ab87f870b, conferido por e-mail
--       marco@advmais.com em auth.users — FK da grade é auth.users(id), …291;
--       ele NÃO precisa estar em gps.membros): seg..sex (dia_semana 1..5,
--       convenção extract(dow) da …291: 0 = domingo), 09, 11, 14, 15 e
--       16 h, cada linha hh:00–hh:40, tipo_id = EP, vigência a partir de
--       2026-10-06, ativo. Sem as 13 h: pedido do Marco no Slack em
--       01/10/2026 ("exclui só o de 13h… Ficando cinco horários por dia").
--
-- ── POR QUE UMA LINHA POR HORÁRIO (e não uma faixa 09:00–17:00) ────────────
--   gps.sessao_horarios_livres (…292 §3) fatia cada faixa a partir de
--   hora_inicio com passo duracao + intervalo (40 + 10 = 50 min). Uma faixa
--   única 09:00–16:40 ofereceria 09:00, 09:50, 10:40, 11:30… — não os
--   horários pedidos, e sem o buraco das 10h e 12h. Com a faixa de 40 min,
--   cabe exatamente 1 bloco (i = 0; o i = 1 nem é gerado).
--   ⚠️ Acoplamento assumido: a faixa tem a largura da duração. Se o tipo for
--   para > 40 min, o bloco deixa de caber e a grade do Marco ESVAZIA sem erro
--   (o oráculo filtra bloco que estoura a faixa). Mudar a duração exige
--   esticar hora_fim junto. Faixa hh:00–hh:50 toleraria até 50 min com o
--   mesmo resultado hoje; ficou hh:40 porque foi o pedido.
--
-- ── GUARDAS (abortam sem escrever) ─────────────────────────────────────────
--   G1  catálogo: exatamente 1 tipo de etapa_id = 1, ativo, e duração atual
--       150 (premissa medida) ou 40 (reaplicação).
--   G2  Marco: o uuid existe em auth.users com e-mail marco@advmais.com.
--   G3  outra faixa ATIVA e vigente servindo o tipo 1 (tipo_id null ou = EP)
--       de OUTRA pessoa → "aplique a 326 antes".
--   G4  EP futura 'agendado' de OUTRA pessoa → idem. (As do próprio Marco
--       ficam fora da guarda: depois que ele começar a atender, reaplicar
--       tem de dar 0, não abortar.)
--
-- ── IDEMPOTENTE ────────────────────────────────────────────────────────────
--   §1 filtra `duracao_min <> 40`; §2 insere com `not exists` por
--   (responsavel, dia, hora_inicio, tipo) SEM olhar `ativo` — linha
--   desligada pela reversão não é recriada por reaplicação.
--
-- ── REVERSÃO (à mão) ───────────────────────────────────────────────────────
--   -- tirar a grade do Marco do ar (preserva histórico; nunca delete):
--   update gps.sessao_disponibilidade
--      set ativo = false            -- ou: vigencia_fim = current_date - 1
--    where responsavel_id = '85016fb8-5f7b-4474-a418-bc1ab87f870b'
--      and tipo_id = (select id from gps.sessao_tipos where etapa_id = 1);
--   -- duração de volta:
--   update gps.sessao_tipos set duracao_min = 150 where etapa_id = 1;
--   -- EP já marcadas com o Marco ficam com 40 min (cópia congelada) e seguem
--   -- válidas; cancelar ou não é decisão de negócio, não desta reversão.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '2s';
set local statement_timeout = '20s';

do $mig$
declare
  c_marco     constant uuid := '85016fb8-5f7b-4474-a418-bc1ab87f870b';
  v_ep        smallint;
  v_dur       smallint;
  v_ativo     boolean;
  v_n_tipo    int;
  v_email     text;
  v_faixas    uuid[];
  v_ep_fut    uuid[];
  v_dur_upd   int;
  v_ins       int;
  v_total     int;
begin
  -- ── G1 catálogo, pela ETAPA (nunca id literal; …292 §0) ──
  select count(*) into v_n_tipo from gps.sessao_tipos where etapa_id = 1;
  if v_n_tipo <> 1 then
    raise exception 'esperado 1 tipo de etapa_id = 1, achados % -- ABORTADA', v_n_tipo;
  end if;
  select t.id, t.duracao_min, t.ativo into v_ep, v_dur, v_ativo
    from gps.sessao_tipos t where t.etapa_id = 1;
  if not v_ativo then
    raise exception 'tipo % (EP) esta INATIVO -- grade nova nao ofereceria nada; ABORTADA', v_ep;
  end if;
  if v_dur not in (150, 40) then
    raise exception 'duracao atual do tipo % = % (esperado 150 ou 40) -- premissa mudou; ABORTADA', v_ep, v_dur;
  end if;

  -- ── G2 o Marco, por uuid conferido pelo e-mail exato ──
  select u.email into v_email from auth.users u where u.id = c_marco;
  if v_email is null or lower(btrim(v_email)) <> 'marco@advmais.com' then
    raise exception 'auth.users % nao e marco@advmais.com (achado: %) -- ABORTADA',
      c_marco, coalesce(v_email, '<inexistente>');
  end if;

  -- ── G3 grade de OUTRA pessoa ainda servindo a EP ──
  select array_agg(d.id order by d.id) into v_faixas
    from gps.sessao_disponibilidade d
   where d.ativo
     and d.responsavel_id <> c_marco
     and (d.tipo_id is null or d.tipo_id = v_ep)
     and (d.vigencia_fim is null or d.vigencia_fim >= current_date);
  if v_faixas is not null then
    raise exception 'faixas ativas de outra pessoa ainda servem a EP (ids %) -- aplique a 326 antes; ABORTADA',
      v_faixas::text;
  end if;

  -- ── G4 EP futura agendada com OUTRA pessoa ──
  select array_agg(a.id order by a.id) into v_ep_fut
    from gps.sessao_agendamentos a
   where a.tipo_id = v_ep
     and a.estado = 'agendado'
     and a.inicio_em > now()
     and a.responsavel_id <> c_marco;
  if v_ep_fut is not null then
    raise exception 'EP futuras agendadas com outra pessoa (ids %) -- aplique a 326 antes; ABORTADA',
      v_ep_fut::text;
  end if;

  -- ── §1 duração ──
  update gps.sessao_tipos
     set duracao_min = 40
   where id = v_ep
     and duracao_min <> 40;
  get diagnostics v_dur_upd = row_count;

  -- ── §2 grade do Marco: 5 dias × 5 horários ──
  insert into gps.sessao_disponibilidade
    (responsavel_id, dia_semana, hora_inicio, hora_fim, tipo_id,
     vigencia_inicio, ativo)
  select c_marco, d.dia::smallint, h.ini, h.ini + interval '40 minutes', v_ep,
         date '2026-10-06', true
    from generate_series(1, 5) as d(dia)              -- 1 = segunda .. 5 = sexta
   cross join (values (time '09:00'), (time '11:00'),
                      (time '14:00'), (time '15:00'), (time '16:00')) as h(ini)
   where not exists (
     select 1 from gps.sessao_disponibilidade s
      where s.responsavel_id = c_marco
        and s.dia_semana     = d.dia
        and s.hora_inicio    = h.ini
        and s.tipo_id        = v_ep);
  get diagnostics v_ins = row_count;

  select count(*) into v_total
    from gps.sessao_disponibilidade s
   where s.responsavel_id = c_marco
     and s.tipo_id = v_ep
     and s.ativo;
  if v_total <> 25 and v_ins > 0 then
    raise exception 'grade do Marco ficou com % linhas ativas (esperado 25) -- ABORTADA', v_total;
  end if;

  raise notice 'EP=% | duracao 150->40: % linha | grade Marco inserida: % | ativas do Marco no tipo: %',
    v_ep, v_dur_upd, v_ins, v_total;
end
$mig$;

commit;

-- ── SAÍDA DO ENSAIO (colar aqui) ──────────────────────────────────────────
--   01/10/2026 20:29 UTC, mbvybujpkwuorhtdzcde, ensaio-326-328.sql (326 → 328,
--   cada corpo 2×), transação desfeita (lock 2s / stmt 20s):
--   Passo 1: duração 150→40 = 1 linha · grade do Marco inserida = 25 · ativas = 25
--   Passo 2 (idempotência): duração 0 · inseridas 0 · ativas 25
--   Tipos depois: EP 40/10 ativo · RP 150/10 ativo
--   Grade do Marco: 25 linhas · 5 por dia (seg–sex) · largura 40 min · vigência 06/10
--   EP futuras agendadas depois = 0 · net.http_request_queue 0 → 0 (nenhum e-mail)
--   Oráculo EP 06/10–01/12: 205 horários = 41 dias úteis × 5 (9, 11, 14, 15, 16h,
--     41 cada) · fora de horário 0 · fora de dia útil 0 · de outra pessoa 0 ·
--     duração [40] · 1º 06/10 09:00 BRT · último 01/12 16:00 BRT
--   Oráculo RP mesma janela: 30 horários · todos da Cristiane · Marco 0 · duração [150]
--   EXPLAIN (analyze, buffers) gps.sessao_horarios_livres(1, null, 06/10, 01/12):
--     Function Scan  actual rows 205 · shared hit 828 · read 0
--     Planning 0,016 ms · Execution 3,453 ms
--     (plpgsql: o plano interno não aparece sem auto_explain; 3,4 ms por consulta
--      de 8 semanas — sem índice novo)
-- ═══════════════════════════════════════════════════════════════════════════
