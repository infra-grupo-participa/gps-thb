-- ═══════════════════════════════════════════════════════════════════════════
-- Item 1.6 da megafeature — bloco "Hoje no programa" na home do parceiro
-- (02/10/2026). Reclamações reais: ~45 parceiros perdidos entre plataformas
-- ("Sistema onde está? Estou confuso!"), a Acacia achou o Plantão "por puro
-- acaso" depois de ~1h, "no site não há menção sobre as mentorias de hoje".
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Duas leituras novas, ambas SÓ LEITURA, ambas SECURITY DEFINER e ambas
-- expostas só a `authenticated`:
--
-- 1. `gps.home_atalhos()` — devolve o TEXTO cru da chave nova
--    `gps.config.home_atalhos` (JSON `[{rotulo, url, descricao}]`). O
--    parceiro não lê `gps.config` (policy só-admin: a tabela guarda
--    `resend_api_key`), então a chave sai por uma função que expõe SÓ ela —
--    o molde de `gps.clientes_lote_ativo()` (…335). A chave nasce '[]':
--    lista vazia = a parte "Onde fica cada coisa" não aparece. A lista
--    oficial depende do Marcio (UPDATE, sem deploy).
--    A validação (só https://, rótulo ≤ 60, ≤ 8 itens) mora no servidor Next
--    (`src/components/home/hoje-tipos.ts:validarAtalhos`), não aqui: o banco
--    devolve o que a equipe gravou, a tela descarta o que não passa e loga.
--    O CHECK da tabela (≤ 2000 caracteres, sem CR/LF — …110) já limita o
--    tamanho: 8 itens × (60 + url + 140) cabem; o JSON tem de ser numa linha.
--
-- 2. `gps.plantao_proximo_logado()` — o próximo plantão publicado para a
--    pessoa logada (identidade = `gps.pessoa_atual()`, como toda RPC
--    `_logado`). ⚠️ POR QUE NÃO `gps.plantao_calendario_logado`: ela ESCREVE
--    — grava `plantao_bloqueio_exibido` em `gps.plantao_eventos` para cada
--    slot do mês que a pessoa não pode pegar (…315). Chamá-la a cada abertura
--    da home encheria o log que o João usa para "entender o comportamento
--    deles" com bloqueios que a home nunca exibiu, e o mês inteiro, não o
--    slot mostrado. Esta função não escreve nada (STABLE).
--    Devolve até 2 linhas:
--      * `qual = 'proximo'` — o primeiro slot publicado, não cancelado, que
--        ainda não TERMINOU (o de hoje em andamento conta: "hoje ou o
--        próximo");
--      * `qual = 'aberto'`  — o primeiro que a pessoa ainda PODE pegar
--        (não começou, prazo de inscrição não passou, fora do intervalo
--        pós-plantão). Só vem quando é outro slot; se for o mesmo, a linha
--        'proximo' já diz `inscricao_aberta = true`.
--    As regras de prazo e intervalo NÃO são copiadas: chama as peças únicas
--    `gps.plantao_prazo_inscricao` (…223) e `gps.plantao_intervalo` (…315),
--    as mesmas de `plantao_inscrever_logado` e do calendário.
--    Nunca devolve `zoom_url` (revelar o link grava presença — a porta é
--    `plantao_revelar_link_logado`, na tela do Plantão).
--
-- Janela da busca: 60 dias à frente (limite do scan, não regra de produto).
-- Usa `idx_plantao_slots_agenda (inicio_em) where publicado`.
--
-- ── EXPLAIN da próxima sessão (src/lib/data/hoje.ts, lerProximaSessao) ─────
-- Query de PostgREST (sem migration), medida em 02/10/2026 como parceiro
-- titular real, em begin…rollback, sessao_agendamentos com 7 linhas:
--   Limit → Sort → Index Scan using sessao_aluno_tipo_viva (parcial,
--   estado='agendado') · Index Cond: aluno_id · Filter: fim_em > now() + RLS
--   Buffers: shared hit=3 · Execution Time: 0.188 ms (dono: 0.035 ms)
--   embeds sessao_tipos / etapa1_clientes por PK (subplan só com linha).
-- Cresce com as sessões VIVAS de 1 parceiro (índice parcial), não com a base.
--
-- ── REVERSÃO ──────────────────────────────────────────────────────────────
--   Sem deploy:  update gps.config set valor = '[]' where chave = 'home_atalhos';
--   Com SQL:     drop function gps.home_atalhos();
--                drop function gps.plantao_proximo_logado();
--                delete from gps.config where chave = 'home_atalhos';
--   (o front trata erro de RPC como "esta parte some" — derrubar as funções
--    não quebra a home)
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '3s';
set local statement_timeout = '20s';

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Chave nova (não sobrescreve valor que a equipe já tenha gravado)
-- ═══════════════════════════════════════════════════════════════════════════
insert into gps.config (chave, valor) values ('home_atalhos', '[]')
on conflict (chave) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. gps.home_atalhos() — expõe SÓ esta chave
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function gps.home_atalhos()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
           (select c.valor from gps.config c where c.chave = 'home_atalhos'),
           '[]'
         );
$$;

comment on function gps.home_atalhos() is
  'Atalhos "Onde fica cada coisa" da home do parceiro (…340). Texto JSON cru de gps.config.home_atalhos ([{rotulo,url,descricao}]); ausente = ''[]''. SECURITY DEFINER porque o parceiro nao le gps.config (policy so-admin; guarda segredo). Expoe SO esta chave. A validacao (https, rotulo <= 60, <= 8 itens) e do servidor Next.';

revoke all     on function gps.home_atalhos() from public, anon;
grant  execute on function gps.home_atalhos() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. gps.plantao_proximo_logado() — só leitura, identidade pela sessão
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function gps.plantao_proximo_logado()
returns table(
  qual text,
  slot_id uuid,
  data date,
  hora_inicio time without time zone,
  duracao_min integer,
  mentora_nome text,
  inicio_em timestamptz,
  fim_em timestamptz,
  prazo_em timestamptz,
  inscricao_aberta boolean,
  em_intervalo boolean
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_pessoa   uuid := gps.pessoa_atual();
  v_email    text;
  v_aluno_id uuid;
  v_prox     record;
  v_aberto   record;
begin
  if v_pessoa is null then
    raise exception 'Sem sessão do Programa.' using errcode = '42501';
  end if;

  -- Mesma resolução de identidade de plantao_minha_inscricao_logado (…236):
  -- pessoa -> e-mail do cadastro -> linha ativa em plantao_alunos. Sem linha
  -- (nunca se inscreveu pelo Programa), não há intervalo a calcular.
  select lower(btrim(t.email)) into v_email from public.thb_alunos t where t.id = v_pessoa;
  if v_email is not null and v_email <> '' then
    select a.id into v_aluno_id from gps.plantao_alunos a where a.email = v_email and a.ativo;
  end if;

  -- (a) o próximo que ainda não terminou. `duracao_min` ≤ 480 (CHECK da
  --     …001), então quem começou há mais de 8h já terminou: o corte de
  --     8h deixa o índice parcial fazer o range.
  select sl.id, sl.data, sl.hora_inicio, sl.duracao_min, m.nome as mentora,
         sl.inicio_em,
         sl.inicio_em + make_interval(mins => sl.duracao_min) as fim_em,
         gps.plantao_prazo_inscricao(sl.id) as prazo
    into v_prox
    from gps.plantao_slots sl
    join gps.plantao_mentoras m on m.id = sl.mentora_id
   where sl.publicado
     and sl.cancelado_em is null
     and sl.inicio_em > now() - interval '8 hours'
     and sl.inicio_em < now() + interval '60 days'
     and sl.inicio_em + make_interval(mins => sl.duracao_min) > now()
   order by sl.inicio_em, sl.id
   limit 1;

  if v_prox.id is null then
    return;  -- nada publicado: a tela diz isso
  end if;

  -- (b) o primeiro que a pessoa ainda pode pegar.
  select sl.id, sl.data, sl.hora_inicio, sl.duracao_min, m.nome as mentora,
         sl.inicio_em,
         sl.inicio_em + make_interval(mins => sl.duracao_min) as fim_em,
         gps.plantao_prazo_inscricao(sl.id) as prazo
    into v_aberto
    from gps.plantao_slots sl
    join gps.plantao_mentoras m on m.id = sl.mentora_id
   where sl.publicado
     and sl.cancelado_em is null
     and sl.inicio_em > now()
     and sl.inicio_em < now() + interval '60 days'
     and now() <= gps.plantao_prazo_inscricao(sl.id)
     and (v_aluno_id is null
          or not exists (select 1 from gps.plantao_intervalo(v_aluno_id, sl.id)))
   order by sl.inicio_em, sl.id
   limit 1;

  return query
  select 'proximo'::text, v_prox.id, v_prox.data, v_prox.hora_inicio, v_prox.duracao_min,
         v_prox.mentora, v_prox.inicio_em, v_prox.fim_em, v_prox.prazo,
         (v_aberto.id is not null and v_aberto.id = v_prox.id),
         (v_aluno_id is not null and v_prox.inicio_em > now()
          and exists (select 1 from gps.plantao_intervalo(v_aluno_id, v_prox.id)));

  if v_aberto.id is not null and v_aberto.id <> v_prox.id then
    return query
    select 'aberto'::text, v_aberto.id, v_aberto.data, v_aberto.hora_inicio, v_aberto.duracao_min,
           v_aberto.mentora, v_aberto.inicio_em, v_aberto.fim_em, v_aberto.prazo,
           true, false;
  end if;
end;
$function$;

comment on function gps.plantao_proximo_logado() is
  'Home do parceiro (…340): proximo plantao publicado que ainda nao terminou (qual=proximo) e, se for outro, o primeiro que a pessoa logada ainda pode pegar (qual=aberto). SO LEITURA -- ao contrario de plantao_calendario_logado, nao grava plantao_bloqueio_exibido. Identidade por gps.pessoa_atual(); prazo e intervalo pelas pecas unicas plantao_prazo_inscricao/plantao_intervalo. Nunca devolve zoom_url.';

revoke all     on function gps.plantao_proximo_logado() from public, anon;
grant  execute on function gps.plantao_proximo_logado() to authenticated;

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- PROVAS (rodadas pelo orquestrador em 02/10/2026, em transação desfeita — resultados abaixo, em "MEDIDO"; o executor não tinha
-- acesso ao banco). Tudo em transação desfeita.
-- ═══════════════════════════════════════════════════════════════════════════
-- P0 — ACL (esperado: sem anon, sem entrada PUBLIC "=X/"; prosecdef = t):
--   select p.proname, p.proacl, p.prosecdef, p.provolatile from pg_proc p
--    where p.pronamespace = 'gps'::regnamespace
--      and p.proname in ('home_atalhos','plantao_proximo_logado');
--   select has_function_privilege('anon','gps.home_atalhos()','execute'),            -- f
--          has_function_privilege('anon','gps.plantao_proximo_logado()','execute');  -- f
--   select proname, count(*) from pg_proc where pronamespace = 'gps'::regnamespace
--      and proname in ('home_atalhos','plantao_proximo_logado') group by 1;     -- 1 cada
--
-- P1 — parceiro real (trocar <USER_ID> por um auth.users.id com gps.membros):
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<USER_ID>","role":"authenticated"}';
--   select gps.pessoa_atual();                        -- não nulo
--   select gps.home_atalhos();                        -- '[]'
--   select * from gps.plantao_proximo_logado();       -- 0..2 linhas, sem zoom_url
--   select count(*) from gps.plantao_eventos
--    where criado_em > now() - interval '1 minute';   -- igual ao de antes: nada gravado
--   rollback;
--
-- P2 — sem JWT / anon (esperado 42501 e permission denied):
--   begin; set local role authenticated;
--   set local request.jwt.claims = '{"role":"authenticated"}';
--   select * from gps.plantao_proximo_logado();       -- 42501 Sem sessão do Programa.
--   rollback;
--   begin; set local role anon; select gps.home_atalhos(); rollback;  -- 42501 permission denied
--
-- P3 — o parceiro continua SEM ler gps.config direto (a chave só sai pela função):
--   begin; set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<USER_ID>","role":"authenticated"}';
--   select count(*) from gps.config;                  -- 0 (policy só-admin)
--   rollback;
--
-- P4 — a chave aceita a lista de 8 dentro do CHECK (≤ 2000, sem CR/LF):
--   begin;
--   update gps.config set valor = '[{"rotulo":"Área de membros (Hotmart)","url":"https://hotmart.com/pt-br/club","descricao":"Aulas gravadas"}]'
--    where chave = 'home_atalhos';
--   select gps.home_atalhos();
--   rollback;
--
-- P5 — plano (2 passadas; esperado Index Scan em idx_plantao_slots_agenda e
--      tempo de 1 dígito de ms). Medir a RPC, não o corpo:
--   begin; set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<USER_ID>","role":"authenticated"}';
--   explain (analyze, buffers) select * from gps.plantao_proximo_logado();
--   explain (analyze, buffers) select * from gps.plantao_proximo_logado();
--   rollback;
--   -- o corpo, como owner, para ver o índice:
--   explain (analyze, buffers)
--   select sl.id from gps.plantao_slots sl
--    where sl.publicado and sl.cancelado_em is null
--      and sl.inicio_em > now() - interval '8 hours' and sl.inicio_em < now() + interval '60 days'
--      and sl.inicio_em + make_interval(mins => sl.duracao_min) > now()
--    order by sl.inicio_em, sl.id limit 1;

-- ═══ MEDIDO em produção, 02/10/2026 (begin … rollback, como parceiro titular real) ═══
-- home_atalhos() → '[]' · plantao_proximo_logado() → 0 linhas (não há slot publicado
-- depois de 01/10 — conferido: futuros_publicados = 0) · sem JWT → 42501 ·
-- has_function_privilege('anon', …) → f nas duas · plantao_bloqueio_exibido gravados no
-- último minuto → 0 (só leitura, como prometido).
-- explain (analyze, buffers) select * from gps.plantao_proximo_logado();  -- corpo completo
--   Function Scan on plantao_proximo_logado (actual rows=0 loops=1)
--   Buffers: shared hit=8 · Execution Time: 0.239 ms (1ª medida) / 0.360 ms (2ª passada)
-- Sem índice novo: plantao_slots é pequena (último slot 01/10) e a janela é de 60 dias.
