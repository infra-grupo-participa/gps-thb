-- ═══════════════════════════════════════════════════════════════════════════
-- …355 — /admin/clientes: datas das reuniões por cliente + KPIs por ETAPA DA
--        AGENDA (reunião mais avançada) + tipo de sessão 5 "Reunião Inicial
--        de Execução". (João, 06/10/2026 — decisões vinculantes.)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── O QUE ENTRA ────────────────────────────────────────────────────────────
--   0. gps.sessao_tipos id 5 "Reunião Inicial de Execução" — espelho EXATO do
--      tipo 4 (…346): 120 min, folga 10, exige_briefing copiado do tipo 4,
--      etapa_id NULL, ativo = FALSE (kirad: liga junto com a grade). SEM faixa
--      de horário (a Cristiane publica).
--      Pré-reunião de 30 min com o aluno: o tipo 4 NÃO tem pré embutida
--      (duracao 120, sem antecedência modelada) → não inventada aqui.
--   1. gps.cliente_agenda_resumo()  — A REGRA, num lugar só. Interna:
--      revoke de public/anon/authenticated. Uma linha por cliente.
--   2. gps.admin_clientes_lista     — + 9 colunas (ep/rp/cq/ex _em/_estado,
--      etapa_agenda) + p_agenda. Muda assinatura e retorno → drop + create.
--   3. gps.admin_clientes_agenda_kpis() — 5 linhas fixas (etapa, total, estrela).
--   4. gps.admin_registrar_export_clientes — + p_agenda (o CSV usa o mesmo
--      filtro da lista: exportarClientesCsv repassa `agenda`).
--   gps.admin_clientes_reuniao_kpis FICA VIVA (reversão do front).
--
-- ── A REGRA (gps.cliente_agenda_resumo) ────────────────────────────────────
--   Fontes por coluna:
--     ep = sessao tipo 1 · rp = sessao tipo 2 OU 3 (Viabilidade = Preliminar)
--          + etapa1_clientes.data_reuniao_preliminar · cq = sessao tipo 4
--          + max(cliente_croquis.apresentado_em) · ex = sessao tipo 5.
--   Sessão: a NÃO cancelada mais recente do grupo (inicio_em desc).
--     estado: realizado→'realizada' · falta→'faltou' ·
--             agendado & inicio_em > now()→'agendada' · agendado passado→'pendente'.
--   Data digitada (ficha/croqui, `date`): >= hoje (SP)→'agendada', <→'realizada';
--     vira timestamptz à meia-noite de São Paulo.
--   Sessão × data digitada: a SESSÃO manda; a data digitada só vence se for
--     de um DIA POSTERIOR ao da sessão (é "a mais recente" entre as fontes).
--     O caso comum — sessao_agendar/remarcar gravam a MESMA data na ficha —
--     cai na sessão.
--   etapa_agenda = execucao > croqui > preliminar > entrevista > sem, pelo
--     primeiro *_estado não nulo. 'faltou' conta (só cancelada não conta).
--   Cancelada nunca entra. Estado fora de (agendado, realizado, falta) não
--   entra — e a GUARDA 1 aborta se o CHECK vivo tiver outro valor.
--
-- ── CUSTO ──────────────────────────────────────────────────────────────────
--   O resumo varre a base inteira (etapa1_clientes ~1,7 mil, sessões e
--   croquis: dezenas/centenas) — mesma ordem do que a lista já paga com
--   count(*) over(). Nenhum índice novo: com essas cardinalidades o planner
--   faz Seq Scan + Hash Join; ver bloco de PROVAS (explain a rodar).
--
-- ── REVERTER ───────────────────────────────────────────────────────────────
--   lista  → drop da de 7 parâmetros + reaplicar o create de …318 (6 params),
--            com revoke/grant e o comment de …285.
--   export → drop da de 6 + reaplicar o create de …282 (5 params) + revoke/grant.
--   KPIs   → drop function gps.admin_clientes_agenda_kpis(); (a antiga segue viva)
--   resumo → drop function gps.cliente_agenda_resumo(); (DEPOIS das duas acima)
--   tipo 5 → nada a reverter (já nasce inativo; nunca apagar)
--   TS     → reverter o commit. 🔴 Ordem de publicação: esta migração ANTES do TS.
--   Corpo de partida: o do ARQUIVO …318 (lista) e …282 (export) — sem acesso
--   ao pg_get_functiondef vivo nesta escrita; a GUARDA 2/3 confere âncoras do
--   corpo vivo e ABORTA se divergir.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ── GUARDAS ────────────────────────────────────────────────────────────────
do $guarda$
declare
  v_check  text;
  v_lista  text;
  v_n      int;
  v_tipo4  record;
  v_conf   text;
begin
  -- GUARDA 1: o CHECK vivo de sessao_agendamentos.estado é o que a regra mapeia.
  select pg_get_constraintdef(k.oid) into v_check
    from pg_constraint k
   where k.conrelid = 'gps.sessao_agendamentos'::regclass
     and k.conname = 'chk_sessao_agend_estado';
  if v_check is distinct from
     'CHECK ((estado = ANY (ARRAY[''agendado''::text, ''realizado''::text, ''cancelado''::text, ''falta''::text])))' then
    raise exception 'CHECK de estado divergente do mapeado: % -- ABORTADA', v_check;
  end if;

  -- GUARDA 2: a lista viva é a da …318 (1 sobrecarga, com estrela e com_reuniao).
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'gps' and p.proname = 'admin_clientes_lista';
  if v_n <> 1 then
    raise exception 'admin_clientes_lista tem % sobrecarga(s), esperado 1 -- ABORTADA', v_n;
  end if;
  select pg_get_functiondef(p.oid) into v_lista
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'gps' and p.proname = 'admin_clientes_lista';
  if position('order by b.acompanhado_equipe desc, b.criado_em desc, b.id' in v_lista) = 0
     or position('''com_reuniao'', ''marcada'', ''para_vencer'', ''vencida'', ''sem''' in v_lista) = 0
     or position('left join public.thb_alunos t on t.id = c.aluno_id' in v_lista) = 0
     or position('public.gp_is_admin()' in v_lista) = 0 then
    raise exception 'corpo vivo de admin_clientes_lista diverge da …318 -- ABORTADA (reler pg_get_functiondef)';
  end if;

  -- GUARDA 3: export vivo = 5 parâmetros da …282, sozinho.
  select string_agg(pg_get_function_identity_arguments(p.oid), ' | ') into v_conf
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'gps' and p.proname = 'admin_registrar_export_clientes';
  if v_conf is distinct from 'p_linhas integer, p_fase text, p_grau text, p_busca text, p_reuniao text' then
    raise exception 'admin_registrar_export_clientes vivo: % -- ABORTADA', v_conf;
  end if;

  -- GUARDA 4 (tipo 5, molde …346): faixa ativa sem tipo serviria o tipo novo.
  select count(*) into v_n
    from gps.sessao_disponibilidade d
   where d.ativo
     and d.tipo_id is null
     and (d.vigencia_fim is null or d.vigencia_fim >= (now() at time zone 'America/Sao_Paulo')::date);
  if v_n > 0 then
    raise exception 'ha % faixa(s) ativa(s) com tipo_id null: dariam horario ao tipo 5 sem grade -- ABORTADA', v_n;
  end if;

  -- GUARDA 5: id 5 ocupado por outra coisa.
  select string_agg(t.id || '=' || t.nome, ', ') into v_conf
    from gps.sessao_tipos t where t.id = 5 and t.nome <> 'Reunião Inicial de Execução';
  if v_conf is not null then
    raise exception 'id 5 ja existe com outro nome (%) -- ABORTADA', v_conf;
  end if;

  -- 0. Tipo 5 — copia do tipo 4 o que é "modelo" (duração, folga, briefing).
  select t.duracao_min, t.intervalo_min, t.exige_briefing, t.etapa_id
    into v_tipo4
    from gps.sessao_tipos t where t.id = 4;
  if not found then
    raise exception 'tipo 4 ausente do catalogo -- ABORTADA';
  end if;
  if v_tipo4.duracao_min <> 120 or v_tipo4.etapa_id is not null then
    raise exception 'tipo 4 mudou desde a …346 (duracao %, etapa %) -- ABORTADA', v_tipo4.duracao_min, v_tipo4.etapa_id;
  end if;

  insert into gps.sessao_tipos
    (id, nome, duracao_min, intervalo_min, exige_briefing, etapa_id, ativo)
  values
    (5, 'Reunião Inicial de Execução', 120, v_tipo4.intervalo_min, v_tipo4.exige_briefing, null, false)
  on conflict (id) do nothing;

  if (select count(*) from gps.sessao_tipos where id = 5 and etapa_id is null and not ativo and duracao_min = 120) <> 1 then
    raise exception 'tipo 5 nao ficou como esperado -- ABORTADA';
  end if;
end
$guarda$;

-- ── 1. A REGRA ─────────────────────────────────────────────────────────────
create function gps.cliente_agenda_resumo()
returns table(
  cliente_id uuid,
  ep_em timestamptz, ep_estado text,
  rp_em timestamptz, rp_estado text,
  cq_em timestamptz, cq_estado text,
  ex_em timestamptz, ex_estado text,
  etapa_agenda text
)
language sql
stable
set search_path to ''
as $function$
  with sess as (
    -- a NÃO cancelada mais recente de cada (cliente, grupo)
    select distinct on (a.cliente_id, g.grupo)
           a.cliente_id, g.grupo, a.inicio_em,
           case a.estado
             when 'realizado' then 'realizada'
             when 'falta'     then 'faltou'
             else case when a.inicio_em > now() then 'agendada' else 'pendente' end
           end as estado
      from gps.sessao_agendamentos a
      cross join lateral (
        select case a.tipo_id
                 when 1 then 'ep'
                 when 2 then 'rp'
                 when 3 then 'rp'   -- Viabilidade = Preliminar (João, 06/10)
                 when 4 then 'cq'
                 when 5 then 'ex'
               end as grupo
      ) g
     where a.estado in ('agendado', 'realizado', 'falta')
       and g.grupo is not null
     order by a.cliente_id, g.grupo, a.inicio_em desc, a.id desc
  ),
  piv as (
    select s.cliente_id,
           max(s.inicio_em) filter (where s.grupo = 'ep') as ep_em,
           max(s.estado)    filter (where s.grupo = 'ep') as ep_estado,
           max(s.inicio_em) filter (where s.grupo = 'rp') as rp_em,
           max(s.estado)    filter (where s.grupo = 'rp') as rp_estado,
           max(s.inicio_em) filter (where s.grupo = 'cq') as cq_em,
           max(s.estado)    filter (where s.grupo = 'cq') as cq_estado,
           max(s.inicio_em) filter (where s.grupo = 'ex') as ex_em,
           max(s.estado)    filter (where s.grupo = 'ex') as ex_estado
      from sess s
     group by s.cliente_id
  ),
  croqui as (
    select k.cliente_id, max(k.apresentado_em) as dia
      from gps.cliente_croquis k
     where k.apresentado_em is not null
     group by k.cliente_id
  ),
  junto as (
    select c.id as cliente_id,
           p.ep_em, p.ep_estado,
           rp.em as rp_em, rp.estado as rp_estado,
           cq.em as cq_em, cq.estado as cq_estado,
           p.ex_em, p.ex_estado
      from gps.etapa1_clientes c
      cross join (select (now() at time zone 'America/Sao_Paulo')::date as hoje) h
      left join piv p    on p.cliente_id = c.id
      left join croqui f on f.cliente_id = c.id
      -- Preliminar: sessão manda; ficha só se for de dia POSTERIOR ao da sessão.
      cross join lateral (
        select case when u.ficha then (c.data_reuniao_preliminar::timestamp at time zone 'America/Sao_Paulo')
                    else p.rp_em end as em,
               case when u.ficha then (case when c.data_reuniao_preliminar >= h.hoje then 'agendada' else 'realizada' end)
                    else p.rp_estado end as estado
          from (select c.data_reuniao_preliminar is not null
                       and (p.rp_em is null
                            or c.data_reuniao_preliminar > (p.rp_em at time zone 'America/Sao_Paulo')::date) as ficha) u
      ) rp
      -- Croqui: mesma regra, com o dia de apresentação mais recente.
      cross join lateral (
        select case when u.ficha then (f.dia::timestamp at time zone 'America/Sao_Paulo')
                    else p.cq_em end as em,
               case when u.ficha then (case when f.dia >= h.hoje then 'agendada' else 'realizada' end)
                    else p.cq_estado end as estado
          from (select f.dia is not null
                       and (p.cq_em is null
                            or f.dia > (p.cq_em at time zone 'America/Sao_Paulo')::date) as ficha) u
      ) cq
  )
  select j.cliente_id,
         j.ep_em, j.ep_estado, j.rp_em, j.rp_estado,
         j.cq_em, j.cq_estado, j.ex_em, j.ex_estado,
         case when j.ex_estado is not null then 'execucao'
              when j.cq_estado is not null then 'croqui'
              when j.rp_estado is not null then 'preliminar'
              when j.ep_estado is not null then 'entrevista'
              else 'sem'
         end as etapa_agenda
    from junto j;
$function$;

comment on function gps.cliente_agenda_resumo() is
  'A REGRA da etapa da agenda por cliente (…355, João 06/10/2026), num lugar so -- lida por admin_clientes_lista e admin_clientes_agenda_kpis. Uma linha por cliente de gps.etapa1_clientes. ep=sessao tipo 1; rp=sessao tipo 2 OU 3 (Viabilidade = Preliminar) + data_reuniao_preliminar; cq=sessao tipo 4 + max(cliente_croquis.apresentado_em); ex=sessao tipo 5. Sessao: a nao cancelada mais recente (inicio_em desc); realizado->realizada, falta->faltou, agendado futuro->agendada, agendado passado->pendente. Data digitada: >= hoje(SP)->agendada, senao realizada; a sessao manda, a data digitada so vence se for de dia POSTERIOR. etapa_agenda = execucao>croqui>preliminar>entrevista>sem pelo primeiro *_estado nao nulo (faltou conta; cancelada nao). INTERNA: sem EXECUTE para public/anon/authenticated; SECURITY INVOKER -- so roda dentro das RPCs security definer de admin.';

revoke execute on function gps.cliente_agenda_resumo() from public, anon, authenticated;
grant  execute on function gps.cliente_agenda_resumo() to service_role;

-- ── 2. LISTA (+9 colunas, +p_agenda) ───────────────────────────────────────
-- Aridade e retorno mudam: drop ANTES do create (sem sobrecarga viva).
drop function gps.admin_clientes_lista(integer, integer, text, text, text, text);

create function gps.admin_clientes_lista(
  p_limite integer default 100,
  p_offset integer default 0,
  p_fase text default null,
  p_grau text default null,
  p_busca text default null,
  p_reuniao text default null,
  p_agenda text default null
)
returns table(
  id uuid, aluno_id uuid, parceiro_nome text, cliente_nome text, telefone text,
  fase text, grau_relacao text, perfil_disc text, data_reuniao_preliminar date,
  aderiu_reuniao boolean, acompanhado_equipe boolean, criado_em timestamptz,
  ep_em timestamptz, ep_estado text, rp_em timestamptz, rp_estado text,
  cq_em timestamptz, cq_estado text, ex_em timestamptz, ex_estado text,
  etapa_agenda text,
  total_linhas bigint
)
language plpgsql
stable security definer
set search_path to ''
as $function$
declare v_limite integer; v_offset integer; v_busca text;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  -- Catalogo FECHADO do filtro de reuniao (…274, 17/09/2026). Valor fora
  -- da lista e erro, nunca "ignora e devolve tudo" -- filtro que se ignora
  -- em silencio faz a tela mentir sobre o universo.
  if p_reuniao is not null and p_reuniao not in ('com_reuniao', 'marcada', 'para_vencer', 'vencida', 'sem') then
    raise exception 'Filtro de reunião inválido.' using errcode = '22023';
  end if;

  -- (…355) Catalogo FECHADO da etapa da agenda -- mesma regra.
  if p_agenda is not null and p_agenda not in ('sem', 'entrevista', 'preliminar', 'croqui', 'execucao') then
    raise exception 'Filtro de etapa da agenda inválido.' using errcode = '22023';
  end if;

  v_limite := least(greatest(coalesce(p_limite, 100), 1), 5000);
  v_offset := greatest(coalesce(p_offset, 0), 0);
  v_busca  := nullif(btrim(coalesce(p_busca, '')), '');

  return query
  with r as (
    select x.cliente_id, x.ep_em, x.ep_estado, x.rp_em, x.rp_estado,
           x.cq_em, x.cq_estado, x.ex_em, x.ex_estado, x.etapa_agenda
      from gps.cliente_agenda_resumo() x
  ),
  base as (
    select c.id, c.aluno_id, t.nome as parceiro_nome, c.nome as cliente_nome,
           c.telefone, c.fase, c.grau_relacao, c.perfil_disc,
           c.data_reuniao_preliminar, c.aderiu_reuniao, c.acompanhado_equipe,
           c.criado_em,
           r.ep_em, r.ep_estado, r.rp_em, r.rp_estado,
           r.cq_em, r.cq_estado, r.ex_em, r.ex_estado,
           coalesce(r.etapa_agenda, 'sem') as etapa_agenda
    from gps.etapa1_clientes c
    -- LEFT, nao INNER (conferido 14/09: 0 orfaos em 1.222 clientes). Com
    -- INNER, cliente cujo cadastro do parceiro sumisse de thb_alunos (base
    -- compartilhada com o sip) DESAPARECERIA da lista e da contagem, sem
    -- erro. Com LEFT ele aparece com o dono vazio -- pendencia visivel em
    -- vez de sumico silencioso.
    left join public.thb_alunos t on t.id = c.aluno_id
    left join r on r.cliente_id = c.id
    where (p_fase is null or c.fase = p_fase)
      -- `data_reuniao_preliminar` e `date`: comparar com `current_date` e
      -- data contra data. NUNCA `now()` -- o bug do `hojeISO` em UTC ja morde
      -- o Financeiro das 21h a meia-noite.
      and (
        p_reuniao is null
        or (p_reuniao = 'com_reuniao' and c.data_reuniao_preliminar is not null)
        or (p_reuniao = 'marcada' and c.data_reuniao_preliminar > current_date + 7)
        or (p_reuniao = 'para_vencer' and c.data_reuniao_preliminar between current_date and current_date + 7)
        or (p_reuniao = 'vencida' and c.data_reuniao_preliminar <  current_date)
        or (p_reuniao = 'sem'     and c.data_reuniao_preliminar is null)
      )
      and (p_agenda is null or coalesce(r.etapa_agenda, 'sem') = p_agenda)
      and (p_grau is null
           or (p_grau = '_nulo' and c.grau_relacao is null)
           or c.grau_relacao = p_grau)
      and (v_busca is null
           or c.nome ilike '%' || v_busca || '%'
           or t.nome ilike '%' || v_busca || '%')
  )
  select b.id, b.aluno_id, b.parceiro_nome, b.cliente_nome, b.telefone, b.fase,
         b.grau_relacao, b.perfil_disc, b.data_reuniao_preliminar,
         b.aderiu_reuniao, b.acompanhado_equipe, b.criado_em,
         b.ep_em, b.ep_estado, b.rp_em, b.rp_estado,
         b.cq_em, b.cq_estado, b.ex_em, b.ex_estado, b.etapa_agenda,
         (count(*) over ())::bigint as total_linhas
  from base b
  -- 🔑 (28/09) Estrela primeiro, SEMPRE — em qualquer filtro e em qualquer
  -- página. `desc` em boolean = true antes de false. A coluna é NOT NULL
  -- default false (conferido 28/09) — sem `coalesce`, que só esconderia a
  -- chave de ordenação do planner.
  order by b.acompanhado_equipe desc, b.criado_em desc, b.id
  limit v_limite offset v_offset;
end;
$function$;

comment on function gps.admin_clientes_lista(integer, integer, text, text, text, text, text) is
  'Lista consolidada de clientes do programa (todos os ambientes), para /admin/clientes e o export CSV. gp_is_admin() ou 42501. p_limite tem teto 5000. total_linhas e count(*) over() DENTRO do filtro. LEFT JOIN com public.thb_alunos (nao INNER: cliente cujo parceiro sumisse da base compartilhada desapareceria da lista E da contagem, sem erro). p_reuniao (…285): com_reuniao|marcada|para_vencer|vencida|sem|null sobre data_reuniao_preliminar contra current_date. (…355, 06/10/2026) + ep/rp/cq/ex _em/_estado e etapa_agenda de gps.cliente_agenda_resumo() (a regra mora la), e p_agenda: sem|entrevista|preliminar|croqui|execucao|null. Valor fora de qualquer catalogo -> 22023. Estrela (acompanhado_equipe) primeiro na ordem. 🔴 DECISAO DE LGPD DO MARCIO: registro_contato, valor_honorarios, contrato_* e problemas NAO entram no retorno -- os terceiros da lista nao deram consentimento para consolidacao.';

-- 🔴 create devolve EXECUTE a PUBLIC — revoke de public (não só anon).
revoke execute on function gps.admin_clientes_lista(integer, integer, text, text, text, text, text) from public, anon;
grant  execute on function gps.admin_clientes_lista(integer, integer, text, text, text, text, text) to authenticated, service_role;

-- ── 3. KPIs por etapa da agenda ────────────────────────────────────────────
create function gps.admin_clientes_agenda_kpis()
returns table(etapa_agenda text, total integer, estrela integer)
language plpgsql
stable security definer
set search_path to ''
as $function$
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  -- 5 linhas SEMPRE (inclusive zeradas): o catálogo dirige, os clientes
  -- entram por LEFT JOIN. Cada cliente cai em 1 etapa só → soma = base.
  return query
  select e.etapa,
         count(x.cliente_id)::integer,
         (count(x.cliente_id) filter (where x.acompanhado_equipe))::integer
    from unnest(array['sem', 'entrevista', 'preliminar', 'croqui', 'execucao']::text[])
         with ordinality as e(etapa, ordem)
    left join (
      select r.cliente_id, coalesce(r.etapa_agenda, 'sem') as etapa, c.acompanhado_equipe
        from gps.cliente_agenda_resumo() r
        join gps.etapa1_clientes c on c.id = r.cliente_id
    ) x on x.etapa = e.etapa
   group by e.etapa, e.ordem
   order by e.ordem;
end;
$function$;

comment on function gps.admin_clientes_agenda_kpis() is
  'KPIs de /admin/clientes por ETAPA DA AGENDA (…355, João 06/10/2026): 5 linhas fixas (sem, entrevista, preliminar, croqui, execucao), total = clientes naquela etapa, estrela = os com acompanhado_equipe (numero grande do tile). Regra em gps.cliente_agenda_resumo() -- a MESMA de admin_clientes_lista(p_agenda): o tile e a lista filtrada tem que bater. Soma de total = count(*) de etapa1_clientes. gp_is_admin() ou 42501. A antiga admin_clientes_reuniao_kpis segue viva (reversao).';

revoke execute on function gps.admin_clientes_agenda_kpis() from public, anon;
grant  execute on function gps.admin_clientes_agenda_kpis() to authenticated, service_role;

-- ── 4. Trilha do export (+p_agenda) ────────────────────────────────────────
drop function gps.admin_registrar_export_clientes(integer, text, text, text, text);

create function gps.admin_registrar_export_clientes(
  p_linhas   integer,
  p_fase     text default null,
  p_grau     text default null,
  p_busca    text default null,
  p_reuniao  text default null,
  p_agenda   text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  insert into gps.acessos_log (acao, aluno_id, detalhe, feito_por)
  values (
    'clientes_exportados',
    null,
    format(
      '%s linha(s) exportada(s). Filtro: fase=%s, grau=%s, busca=%s, reuniao=%s, agenda=%s',
      greatest(coalesce(p_linhas, 0), 0),
      coalesce(p_fase, '(todas)'),
      coalesce(p_grau, '(todos)'),
      -- so registra SE houve busca -- nao o termo em si, que pode ser o
      -- nome de um cliente ou parceiro (dado de terceiro).
      case when nullif(btrim(coalesce(p_busca, '')), '') is null
           then '(nenhuma)' else '(com termo)' end,
      coalesce(p_reuniao, '(todas)'),
      coalesce(p_agenda, '(todas)')
    ),
    auth.uid()
  );
end $function$;

comment on function gps.admin_registrar_export_clientes(integer, text, text, text, text, text) is
  'Grava UMA linha de auditoria por clique em "Exportar CSV" na lista consolidada de clientes (acao=clientes_exportados): quantas linhas, e o FILTRO aplicado (fase/grau/se houve busca/reuniao/agenda -- nunca o termo digitado, que pode ser nome de terceiro). p_reuniao em …282; p_agenda em …355 (06/10/2026): sem ele a trilha registraria um recorte diferente do exportado com ?agenda= ativo. aluno_id fica NULL de proposito: o export nao e de um ambiente, e do universo do filtro. SECURITY DEFINER porque gps.acessos_log nao tem policy de insert (RLS nega em silencio). 🔴 Esta e a UNICA acao do catalogo em que, se o insert falhar, quem chama (exportarClientesCsv) FAZ O EXPORT FALHAR -- decisao do Marcio: aqui a trilha e a guarda de LGPD, nao um detalhe.';

revoke execute on function gps.admin_registrar_export_clientes(integer, text, text, text, text, text) from public, anon;
grant  execute on function gps.admin_registrar_export_clientes(integer, text, text, text, text, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- PROVAS — ROTEIRO A RODAR DEPOIS DE APLICAR (não são resultados ainda)
-- ═══════════════════════════════════════════════════════════════════════════
-- Claims de admin real, em transação revertida:
--   begin;
--   select set_config('request.jwt.claims', '{"sub":"<uuid admin>","role":"authenticated"}', true);
--   set local role authenticated;
--
-- P1 soma dos tiles = base:
--   select sum(total), sum(estrela) from gps.admin_clientes_agenda_kpis();
--   -- = select count(*), count(*) filter (where acompanhado_equipe) from gps.etapa1_clientes;
--   select count(*) from gps.admin_clientes_agenda_kpis();            -- 5
-- P2 tile × lista (para cada etapa):
--   select etapa_agenda, total from gps.admin_clientes_agenda_kpis();
--   select (gps.admin_clientes_lista(1,0,null,null,null,null,'croqui')).total_linhas;  -- = total do tile
-- P3 catálogo: gps.admin_clientes_lista(1,0,null,null,null,null,'x') → 22023;
--   '' → 22023; 'CROQUI' → 22023.
-- P4 guarda: sem JWT e JWT de titular → 42501 em lista, kpis e export.
--   gps.cliente_agenda_resumo() como authenticated → 42501 (permission denied).
-- P5 universo intacto: lista sem filtro total_linhas = count(*) etapa1_clientes.
--   rollback;
-- P6 ACL (fora da transação, como postgres):
--   select p.proname, pg_get_function_identity_arguments(p.oid), p.proacl::text, p.prosecdef
--     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='gps' and p.proname in ('admin_clientes_lista','admin_clientes_agenda_kpis',
--          'admin_registrar_export_clientes','cliente_agenda_resumo','admin_clientes_reuniao_kpis');
--   -- nenhuma entrada '=X/' (PUBLIC) nem anon; resumo sem authenticated; 1 linha por nome.
-- P7 tipo 5: select * from gps.sessao_tipos where id in (4,5);  -- mesmos duracao/folga/briefing/etapa
--   select count(*) from gps.sessao_disponibilidade where tipo_id = 5;  -- 0
-- ═══════════════════════════════════════════════════════════════════════════

commit;
