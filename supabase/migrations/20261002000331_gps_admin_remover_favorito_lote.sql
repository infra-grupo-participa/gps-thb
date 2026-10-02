-- ═══════════════════════════════════════════════════════════════════════════
-- Central de resolução — tirar a ESTRELA (cliente favorito) de N alunos.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── O QUE FAZ ──────────────────────────────────────────────────────────────
-- `gps.admin_remover_favorito_lote(p_alunos, p_motivo, p_simular, p_forcar)`
-- desmarca `gps.etapa1_clientes.acompanhado_equipe` do favorito de cada
-- ambiente pedido (1..50, dedupe). Molde: `admin_definir_liberacao_etapas_lote`
-- (…20260930201829): valida TUDO antes de escrever, atômica, ordem de uuid.
--
-- ── "ANDOU" (decisão do João, 02/10/2026) ──────────────────────────────────
-- O favorito andou se tiver QUALQUER um destes (texto do motivo entre aspas):
--   acompanhamento_confirmado_em not null ............ 'confirmado pela equipe'
--   contrato_path not null ........................... 'contrato anexado'
--   gps.sessao_agendamentos com estado <> 'cancelado'  'sessão marcada'
--   linha em gps.entrevista_previa ................... 'Entrevista Prévia registrada'
--   linha em gps.reuniao_preliminar_propostas ........ 'proposta de Reunião Preliminar'
-- Padrão: PULA quem andou (resultado 'pulado', motivos listados).
-- p_forcar = true: remove também esses (resultado 'removido', motivos listados
-- para a tela avisar o que ficou pendurado). NADA é apagado: sessão, EP,
-- contrato, proposta e `acompanhamento_confirmado_em/_por` continuam presos
-- ao cliente antigo.
--
-- ── SIMULAÇÃO ──────────────────────────────────────────────────────────────
-- p_simular = true devolve o MESMO resultado e não escreve nada: nem UPDATE,
-- nem log, nem `for update` (que grava xmax na tupla e seguraria a linha).
--
-- ── TRIGGERS QUE ACORDAM NO UPDATE ─────────────────────────────────────────
--   * trg_etapa1_clientes_acompanhamento_travado (…305): primeira linha é
--     `if coalesce(public.gp_is_admin(), false) then return new` — o admin
--     passa. SECURITY DEFINER não troca o JWT: `request.jwt.claims` é GUC da
--     sessão, então `gp_is_admin()` continua lendo quem chamou.
--   * trg_etapa1_clientes_contrato_travado / _entrevista_travada: só olham as
--     colunas delas (não mudam aqui).
--   * trg_aluno_eventos_etapa1_clientes (AFTER, …0092): grava
--     `cliente_desfavoritado` com ator 'equipe' no Diário. Por isso esta
--     função NÃO insere em aluno_eventos (evitaria duplicar).
--
-- ── LOG ────────────────────────────────────────────────────────────────────
-- Uma linha em gps.acessos_log por favorito REMOVIDO, ação nova
-- `favorito_removido_lote`. `detalhe` = cliente_id + motivo (+ 'forçado' e o
-- que estava andado). NUNCA o nome do cliente (terceiro).
--
-- ── CHECK acessos_log_acao_check ───────────────────────────────────────────
-- Recriado com a lista VIVA lida em produção (32 valores, a da …292) + 1. O
-- bloco DO abaixo lê `pg_get_constraintdef` e ABORTA se o vivo tiver valor que
-- não está na lista nova (CHECK reescrito de memória apaga valor em silêncio).
--
-- ── REVERSÃO ───────────────────────────────────────────────────────────────
--   drop function if exists gps.admin_remover_favorito_lote(uuid[], text, boolean, boolean);
--   -- o valor 'favorito_removido_lote' no CHECK pode FICAR (permitir valor a
--   -- mais não quebra nada; tirar exige apagar trilha). Estrelas removidas
--   -- voltam pelo Modo Assistência, uma a uma, lendo o cliente_id do detalhe.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. CHECK de gps.acessos_log.acao + favorito_removido_lote
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare
  v_def    text;
  v_vivos  text[];
  v_novos  text[] := array[
    'senha_definida','acesso_excluido','socio_adicionado','membro_excluido',
    'ambiente_ambiguo','etapa_liberacao_alterada','progresso_reaberto',
    'membro_pessoa_vinculada','titular_trocado','membro_movido',
    'financeiro_vinculado','financeiro_desvinculado','favorito_confirmado',
    'favorito_liberado','acessos_criados_em_lote','socio_convidado',
    'socio_convite_aceito','socio_convite_revogado',
    'chamado_solicitacao_aprovada','chamado_solicitacao_declinada',
    'email_login_alterado','clientes_exportados','socio_cadastro_preenchido',
    'interruptor_alterado','reuniao_preliminar_cancelada','dossie_acessado',
    'operador_definido','clientes_restaurados','lixeira_expurgada',
    'titular_convertido_em_socio','onboarding_concluido_pela_equipe',
    'sessao_briefing_acessado',
    'favorito_removido_lote'];
  v_faltam text[];
begin
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
   where c.conrelid = 'gps.acessos_log'::regclass
     and c.conname  = 'acessos_log_acao_check';
  if v_def is null then
    raise exception 'acessos_log_acao_check nao encontrado -- migracao abortada';
  end if;

  select array_agg(m[1]) into v_vivos
    from regexp_matches(v_def, '''([^'']+)''', 'g') m;

  select array_agg(x) into v_faltam
    from unnest(v_vivos) x where x <> all (v_novos);
  if v_faltam is not null then
    raise exception 'CHECK vivo tem valor(es) fora da lista nova: % -- migracao abortada para nao apagar valor', v_faltam;
  end if;

  alter table gps.acessos_log drop constraint acessos_log_acao_check;
  execute format(
    'alter table gps.acessos_log add constraint acessos_log_acao_check check (acao = any (%L::text[]))',
    v_novos);
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. A função
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function gps.admin_remover_favorito_lote(
  p_alunos  uuid[],
  p_motivo  text,
  p_simular boolean default false,
  p_forcar  boolean default false)
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
  v_simular      boolean := coalesce(p_simular, false);
  v_forcar       boolean := coalesce(p_forcar, false);
  v_aluno        uuid;
  v_c            record;
  v_motivos      text[];
  v_resultado    text;
  v_removidos    int   := 0;
  v_sem_favorito int   := 0;
  v_pulados      int   := 0;
  v_itens        jsonb := '[]'::jsonb;
begin
  -- coalesce: sem JWT, gp_is_admin() pode vir NULL e `if not NULL` não dispara.
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  -- ── alunos: sem nulo, dedupe, 1..50 ────────────────────────────────────
  if p_alunos is null or array_position(p_alunos, null) is not null then
    raise exception 'aluno nao informado' using errcode = '22023';
  end if;
  select array_agg(distinct a order by a) into v_alunos from unnest(p_alunos) a;
  v_n_alunos := coalesce(cardinality(v_alunos), 0);
  if v_n_alunos = 0 then
    raise exception 'Selecione ao menos um aluno.' using errcode = '22023';
  end if;
  if v_n_alunos > 50 then
    raise exception 'No máximo 50 alunos por vez.' using errcode = '22023';
  end if;

  -- ── motivo 3..300 (mesmas frases do lote de etapas) ────────────────────
  -- btrim() só tira espaço; tab/quebra de linha passariam como motivo.
  v_motivo := regexp_replace(coalesce(p_motivo, ''), '^\s+|\s+$', '', 'g');
  if length(v_motivo) < 3 then
    raise exception 'Escreva o motivo — ele fica no histórico deste aluno.'
      using errcode = '22023';
  end if;
  if length(v_motivo) > 300 then
    raise exception 'O motivo passa de 300 caracteres.' using errcode = '22023';
  end if;

  -- ── ambiente: TODOS antes de escrever (prefixo casado na action) ───────
  select count(*) into v_sem_ambiente
    from unnest(v_alunos) a
   where not exists (select 1 from gps.membros m where m.aluno_id = a);
  if v_sem_ambiente > 0 then
    raise exception 'Sem ambiente no programa: % de % aluno(s) selecionado(s).',
      v_sem_ambiente, v_n_alunos using errcode = 'P0002';
  end if;

  -- ── por aluno, em ordem de uuid (sem deadlock entre chamadas) ──────────
  foreach v_aluno in array v_alunos loop
    -- `where aluno_id = … and acompanhado_equipe` casa o índice único
    -- parcial da baseline (1 estrela por ambiente).
    if v_simular then
      select c.id, c.acompanhamento_confirmado_em, c.contrato_path
        into v_c
        from gps.etapa1_clientes c
       where c.aluno_id = v_aluno and c.acompanhado_equipe;
    else
      select c.id, c.acompanhamento_confirmado_em, c.contrato_path
        into v_c
        from gps.etapa1_clientes c
       where c.aluno_id = v_aluno and c.acompanhado_equipe
         for update;
    end if;

    if not found then
      v_sem_favorito := v_sem_favorito + 1;
      v_itens := v_itens || jsonb_build_object(
        'aluno_id', v_aluno, 'cliente_id', null,
        'resultado', 'sem_favorito', 'motivos', '[]'::jsonb);
      continue;
    end if;

    -- `aluno_id = …` junto do cliente_id. sessao_agendamentos: os dois índices
    -- (…291) são PARCIAIS `where estado='agendado'` e o predicado
    -- `estado <> 'cancelado'` não os cobre → Seq Scan estrutural (7 linhas em
    -- 02/10; com milhares, vira até 50 varreduras por clique — aceitável para
    -- ação manual rara). propostas usa (aluno_id, …); EP usa idx por cliente.
    v_motivos := array_remove(array[
      case when v_c.acompanhamento_confirmado_em is not null
           then 'confirmado pela equipe' end,
      case when v_c.contrato_path is not null
           then 'contrato anexado' end,
      case when exists (select 1 from gps.sessao_agendamentos s
                         where s.aluno_id = v_aluno and s.cliente_id = v_c.id
                           and s.estado <> 'cancelado')
           then 'sessão marcada' end,
      case when exists (select 1 from gps.entrevista_previa e
                         where e.aluno_id = v_aluno and e.cliente_id = v_c.id)
           then 'Entrevista Prévia registrada' end,
      case when exists (select 1 from gps.reuniao_preliminar_propostas r
                         where r.aluno_id = v_aluno and r.cliente_id = v_c.id)
           then 'proposta de Reunião Preliminar' end
    ], null);

    if cardinality(v_motivos) > 0 and not v_forcar then
      v_resultado := 'pulado';
      v_pulados := v_pulados + 1;
    else
      v_resultado := 'removido';
      v_removidos := v_removidos + 1;

      if not v_simular then
        update gps.etapa1_clientes
           set acompanhado_equipe = false
         where id = v_c.id;

        insert into gps.acessos_log (acao, aluno_id, detalhe, feito_por)
        values ('favorito_removido_lote', v_aluno,
                format('cliente %s deixou de ser o favorito (lote%s). Motivo: %s',
                       v_c.id,
                       case when cardinality(v_motivos) > 0
                            then ', forçado: ' || array_to_string(v_motivos, ', ')
                            else '' end,
                       v_motivo),
                auth.uid());
      end if;
    end if;

    v_itens := v_itens || jsonb_build_object(
      'aluno_id', v_aluno, 'cliente_id', v_c.id,
      'resultado', v_resultado, 'motivos', to_jsonb(v_motivos));
  end loop;

  return jsonb_build_object('removidos', v_removidos,
                            'sem_favorito', v_sem_favorito,
                            'pulados', v_pulados,
                            'itens', v_itens);
end $function$;

comment on function gps.admin_remover_favorito_lote(uuid[], text, boolean, boolean) is
  'Tira a estrela (etapa1_clientes.acompanhado_equipe) do favorito de 1..50 ambientes (dedupe), motivo 3..300 unico. Valida TUDO antes de escrever (inclusive ambiente de todos). Favorito que ANDOU (confirmado pela equipe, contrato anexado, sessao nao cancelada, Entrevista Previa, proposta de Reuniao Preliminar) e PULADO, salvo p_forcar=true -- ai sai como removido com os motivos listados. Nada e apagado alem da estrela. p_simular=true devolve o mesmo resultado sem escrever. Log favorito_removido_lote por removido (cliente_id + motivo, nunca o nome); evento cliente_desfavoritado vem da trigger. Retorna {removidos, sem_favorito, pulados, itens:[{aluno_id, cliente_id, resultado, motivos}]}. gp_is_admin() ou 42501.';

-- Neste projeto toda função nova nasce executável por PUBLIC (ALTER DEFAULT
-- PRIVILEGES); `revoke from anon` sozinho não pega o que vem de PUBLIC.
revoke all     on function gps.admin_remover_favorito_lote(uuid[], text, boolean, boolean) from public, anon;
grant  execute on function gps.admin_remover_favorito_lote(uuid[], text, boolean, boolean) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- RESULTADO MEDIDO EM PRODUÇÃO — 02/10/2026 (migration aplicada; provas num
-- único bloco DO que termina em RAISE, ou seja, tudo desfeito)
-- ═══════════════════════════════════════════════════════════════════════════
-- Base: 46 favoritos em 179 ambientes; 17 "andados" (seriam pulados), 29 livres.
-- P1 sem JWT ............................ 42501
-- P2 simular [A livre, B andado, C sem] . removidos=1 pulados=1 sem_favorito=1 · log +0 · estrelas -0
-- P3 padrão [A, B] ...................... removidos=1 pulados=1 · estrela A=0, B=1 · log +1 · evento cliente_desfavoritado +1
-- P5 [A, A] depois de P3 ................ removidos=0 sem_favorito=1 (dedupe + idempotente)
-- P4 forçar [B] ......................... removidos=1 · motivos=["sessão marcada"] · estrela B=0 · sessões +0 · EPs +0 · detalhe contém 'forçado'
-- P6 ...................................... []→22023 · motivo '  a '→22023 · [A, uuid sem ambiente]→P0002 "Sem ambiente no programa: 1 de 2 aluno(s) selecionado(s)."
-- P0 proacl .............................. {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} (sem PUBLIC, sem anon)
-- P7 explain (analyze, buffers), as 3 leituras por aluno + o favorito:
--   Index Scan using etapa1_clientes_unico_equipe (shared hit=2)
--   Seq Scan on sessao_agendamentos (7 linhas; índices parciais não cobrem `estado <> 'cancelado'`)
--   Bitmap Index Scan on idx_entrevista_previa_cliente (hit=1)
--   Bitmap Index Scan on reuniao_preliminar_propostas_aluno_idx (hit=2)
--   Execution Time: 0.916 ms · shared hit=10
--
-- ═══════════════════════════════════════════════════════════════════════════
-- PROVA — rodar no SQL editor, CADA bloco em transação DESFEITA (rollback).
-- Trocar <ADMIN_UID> por um user_id com gp_is_admin() = true.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- -- P0. CHECK: 33 valores, nenhum a menos; grants fechados.
-- select pg_get_constraintdef(oid) from pg_constraint
--  where conrelid = 'gps.acessos_log'::regclass and conname = 'acessos_log_acao_check';
-- -- ESPERADO: os 32 de antes + favorito_removido_lote.
-- select proacl from pg_proc where proname = 'admin_remover_favorito_lote';
-- -- ESPERADO: postgres, authenticated, service_role; SEM '=X/' (PUBLIC) e SEM anon.
--
-- -- P1. Sem JWT -> 42501.
-- begin;
--   set local role authenticated;
--   select gps.admin_remover_favorito_lote(array[gen_random_uuid()], 'teste prova');
--   -- ESPERADO: ERROR 42501 Sem permissão.
-- rollback;
--
-- -- Preparação comum de P2..P5 (dentro de cada transação):
-- --   set local role authenticated;
-- --   select set_config('request.jwt.claims',
-- --     json_build_object('sub','<ADMIN_UID>','role','authenticated')::text, true);
-- -- Amostra: um ambiente com favorito LIVRE (A), um com favorito ANDADO (B),
-- -- um sem favorito (C):
-- --   with f as (
-- --     select c.aluno_id, c.id,
-- --            (c.acompanhamento_confirmado_em is not null or c.contrato_path is not null
-- --             or exists (select 1 from gps.sessao_agendamentos s where s.cliente_id=c.id and s.estado<>'cancelado')
-- --             or exists (select 1 from gps.entrevista_previa e where e.cliente_id=c.id)
-- --             or exists (select 1 from gps.reuniao_preliminar_propostas r where r.cliente_id=c.id)) as andou
-- --       from gps.etapa1_clientes c where c.acompanhado_equipe)
-- --   select (select aluno_id from f where not andou limit 1) as a,
-- --          (select aluno_id from f where andou limit 1)     as b,
-- --          (select m.aluno_id from gps.membros m
-- --            where not exists (select 1 from f where f.aluno_id = m.aluno_id) limit 1) as c;
--
-- -- P2. Simular não escreve.
-- begin;
--   -- (preparação)
--   select count(*) from gps.acessos_log;                                   -- N
--   select count(*) from gps.etapa1_clientes where acompanhado_equipe;      -- F
--   select gps.admin_remover_favorito_lote(array['<A>','<B>','<C>']::uuid[], 'prova simular', true, false);
--   -- ESPERADO: removidos 1 (A), pulados 1 (B, motivos preenchidos), sem_favorito 1 (C)
--   select count(*) from gps.acessos_log;                                   -- ESPERADO: N
--   select count(*) from gps.etapa1_clientes where acompanhado_equipe;      -- ESPERADO: F
--   select count(*) from gps.aluno_eventos where tipo='cliente_desfavoritado'
--      and ocorrido_em >= now();                                            -- ESPERADO: 0
-- rollback;
--
-- -- P3. Padrão pula o andado.
-- begin;
--   -- (preparação)
--   select gps.admin_remover_favorito_lote(array['<A>','<B>']::uuid[], 'prova pula andado');
--   -- ESPERADO: removidos 1, pulados 1
--   select acompanhado_equipe from gps.etapa1_clientes where aluno_id='<B>' and acompanhado_equipe; -- ESPERADO: 1 linha (true)
--   select count(*) from gps.etapa1_clientes where aluno_id='<A>' and acompanhado_equipe;           -- ESPERADO: 0
--   select acao, aluno_id, detalhe from gps.acessos_log
--    where acao='favorito_removido_lote' and criado_em >= now();
--   -- ESPERADO: 1 linha, aluno A, detalhe com cliente_id e motivo, SEM nome, SEM 'forçado'
--   select tipo, ator from gps.aluno_eventos
--    where aluno_id='<A>' and tipo='cliente_desfavoritado' and ocorrido_em >= now();
--   -- ESPERADO: 1 linha, ator 'equipe'
-- rollback;
--
-- -- P4. Forçar remove o andado e nada mais some.
-- begin;
--   -- (preparação)
--   select count(*) from gps.sessao_agendamentos;            -- S
--   select count(*) from gps.entrevista_previa;              -- E
--   select count(*) from gps.reuniao_preliminar_propostas;   -- R
--   select gps.admin_remover_favorito_lote(array['<B>']::uuid[], 'prova forçar', false, true);
--   -- ESPERADO: removidos 1, itens[0].resultado 'removido', motivos não vazio
--   select count(*) from gps.etapa1_clientes where aluno_id='<B>' and acompanhado_equipe; -- ESPERADO: 0
--   select detalhe from gps.acessos_log where acao='favorito_removido_lote' and criado_em >= now();
--   -- ESPERADO: contém 'forçado:' e os motivos
--   -- S, E, R: ESPERADO iguais; contrato_path e acompanhamento_confirmado_em do cliente intactos.
-- rollback;
--
-- -- P5. E2E de idempotência: 2ª chamada não faz nada.
-- begin;
--   -- (preparação)
--   select gps.admin_remover_favorito_lote(array['<A>','<A>']::uuid[], 'prova idempotência');
--   -- ESPERADO: removidos 1 (dedupe: 1 item só)
--   select gps.admin_remover_favorito_lote(array['<A>']::uuid[], 'prova idempotência');
--   -- ESPERADO: removidos 0, sem_favorito 1
--   select count(*) from gps.acessos_log where acao='favorito_removido_lote' and criado_em >= now();
--   -- ESPERADO: 1
-- rollback;
--
-- -- P6. Validações (cada uma aborta o lote, 0 escrita):
-- --   array[]::uuid[]                        -> 22023 Selecione ao menos um aluno.
-- --   51 uuids distintos                     -> 22023 No máximo 50 alunos por vez.
-- --   motivo '  a '                          -> 22023 Escreva o motivo — …
-- --   [<A>, gen_random_uuid()]               -> P0002 Sem ambiente no programa: 1 de 2 …
--
-- -- P7. explain (analyze) — custo das leituras por aluno (só SELECT, seguro):
-- explain (analyze, buffers)
--   select c.id from gps.etapa1_clientes c where c.aluno_id = '<B>' and c.acompanhado_equipe;
-- explain (analyze, buffers)
--   select 1 from gps.sessao_agendamentos s
--    where s.aluno_id = '<B>' and s.cliente_id = '<cliente de B>' and s.estado <> 'cancelado';
-- explain (analyze, buffers)
--   select 1 from gps.reuniao_preliminar_propostas r
--    where r.aluno_id = '<B>' and r.cliente_id = '<cliente de B>';
-- explain (analyze, buffers)
--   select 1 from gps.entrevista_previa e
--    where e.aluno_id = '<B>' and e.cliente_id = '<cliente de B>';
-- -- E a chamada inteira em simulação (não escreve):
-- explain (analyze, buffers)
--   select gps.admin_remover_favorito_lote(array['<A>','<B>','<C>']::uuid[], 'prova explain', true, false);
