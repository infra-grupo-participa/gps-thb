-- ═══════════════════════════════════════════════════════════════════════════
-- Trajetória do cliente (várias marcações) + funil de origem.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── O QUE ENTRA ────────────────────────────────────────────────────────────
--   1. gps.cliente_etapa_tipos       catálogo (11 linhas, 3 níveis). RLS só SELECT.
--   2. gps.cliente_trajetoria        marcações; desmarcar é SOFT. RLS só SELECT.
--   3. aluno_eventos_tipo_check     + cliente_etapa_marcada / cliente_etapa_desmarcada
--                                    / cliente_funil_origem_definido, recriado a
--                                    partir do CHECK VIVO (nunca de memória).
--   4. gps.cliente_trajetoria_marcar(uuid, text)    → jsonb  (SECURITY DEFINER)
--      gps.cliente_trajetoria_desmarcar(uuid, text) → jsonb  (SECURITY DEFINER)
--   5. gps.etapa1_clientes.funil_origem + CHECK + trigger PRÓPRIA de diário.
--
-- ── REGRAS (plano do arquiteto, item 1 e 4) ────────────────────────────────
--   * Marcar subetapa NÃO marca a mãe. Nada é marcado automaticamente.
--   * "Pendente" NÃO é gravado: é calculado no TS (src/lib/trajetoria-tipos.ts).
--   * etapa1_clientes.fase fica intocada e independente.
--   * funil_origem sem backfill.
--
-- ── DIÁRIO DE funil_origem: trigger própria, não a compartilhada ──────────
--   gps.aluno_eventos_capturar_etapa1_clientes() lista colunas, mas o corpo
--   no repo (…092) pode ter divergido do vivo. Reescrevê-la para acrescentar
--   um IF apagaria em silêncio qualquer mudança feita fora do repo. Uma
--   trigger nova `after update of funil_origem` tem o mesmo efeito e não toca
--   na função compartilhada. Mesmo molde: SECURITY DEFINER, nunca lança.
--
-- ── REVERTER ───────────────────────────────────────────────────────────────
--   drop trigger trg_aluno_eventos_funil_origem on gps.etapa1_clientes;
--   drop function gps.aluno_eventos_capturar_funil_origem();
--   alter table gps.etapa1_clientes drop column funil_origem;
--   drop function gps.cliente_trajetoria_marcar(uuid, text);
--   drop function gps.cliente_trajetoria_desmarcar(uuid, text);
--   drop table gps.cliente_trajetoria; drop table gps.cliente_etapa_tipos;
--   (o CHECK de aluno_eventos pode ficar com os 3 valores a mais: aceitar
--    valor que ninguém grava não quebra nada.)
-- ═══════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '20s';

-- ── 1. Catálogo ────────────────────────────────────────────────────────────
create table gps.cliente_etapa_tipos (
  codigo     text    primary key
    constraint cliente_etapa_tipos_codigo_check check (codigo ~ '^[a-z][a-z_]{1,62}$'),
  nome       text    not null
    constraint cliente_etapa_tipos_nome_check check (char_length(nome) between 1 and 80),
  pai_codigo text    references gps.cliente_etapa_tipos(codigo),
  ordem      integer not null,
  ativo      boolean not null default true,
  constraint cliente_etapa_tipos_pai_diferente check (pai_codigo is distinct from codigo),
  constraint cliente_etapa_tipos_ordem_uq unique (pai_codigo, ordem)
);

comment on table gps.cliente_etapa_tipos is
  'Catalogo da trajetoria do cliente (…345). Hierarquico: pai_codigo null = etapa de topo; ordem e a posicao ENTRE IRMAOS. Pendente e calculado no TS pela ordem do TOPO. Escrita so por migracao; authenticated tem SELECT. Espelho tipado em src/lib/trajetoria-tipos.ts (CATALOGO_TRAJETORIA).';

insert into gps.cliente_etapa_tipos (codigo, nome, pai_codigo, ordem) values
  ('prospeccao',               'Prospecção',                    null,                 1),
  ('reuniao_preliminar',       'Reunião Preliminar',            null,                 2),
  ('sessao_viabilidade',       'Sessão de Viabilidade',         null,                 3),
  ('croqui_estrutural',        'Croqui Estrutural',             null,                 4),
  ('execucao',                 'Execução',                      null,                 5),
  ('reuniao_inicial_execucao', 'Reunião Inicial de Execução',   'execucao',           1),
  ('elaboracao_minutas',       'Elaboração das Minutas',        'execucao',           2),
  ('junta_comercial',          'Junta Comercial',               'execucao',           3),
  ('entrega_pasta',            'Entrega da pasta',              'execucao',           4),
  ('processamento_itcmd',      'Processamento do ITCMD',        'elaboracao_minutas', 1),
  ('processamento_itbi',       'Processamento do ITBI',         'elaboracao_minutas', 2);

alter table gps.cliente_etapa_tipos enable row level security;

-- Catálogo não é dado de cliente: qualquer sessão autenticada lê.
create policy cliente_etapa_tipos_select on gps.cliente_etapa_tipos
  for select to authenticated
  using (true);

revoke all    on table gps.cliente_etapa_tipos from public, anon, authenticated;
grant  select on table gps.cliente_etapa_tipos to authenticated;

-- ── 2. Marcações ───────────────────────────────────────────────────────────
create table gps.cliente_trajetoria (
  id             uuid        primary key default gen_random_uuid(),
  cliente_id     uuid        not null references gps.etapa1_clientes(id) on delete cascade,
  etapa_codigo   text        not null references gps.cliente_etapa_tipos(codigo),
  marcado_em     timestamptz not null default now(),
  marcado_por    uuid,
  desmarcado_em  timestamptz,
  desmarcado_por uuid,
  constraint cliente_trajetoria_desmarcado_depois
    check (desmarcado_em is null or desmarcado_em >= marcado_em)
);

comment on table gps.cliente_trajetoria is
  'Marcacoes da trajetoria do cliente (…345). VARIAS por cliente, uma ATIVA por (cliente, etapa) -- indice unico parcial. Desmarcar e SOFT (desmarcado_em/_por); toda leitura filtra desmarcado_em is null. Escrita SO por gps.cliente_trajetoria_marcar/_desmarcar (SECURITY DEFINER). Independente de etapa1_clientes.fase.';

create unique index cliente_trajetoria_ativa_uq
  on gps.cliente_trajetoria (cliente_id, etapa_codigo)
  where desmarcado_em is null;

alter table gps.cliente_trajetoria enable row level security;

-- Cópia da policy de gps.cliente_links_drive (…332).
create policy cliente_trajetoria_select on gps.cliente_trajetoria
  for select to authenticated
  using (
    public.gp_is_admin()
    or exists (
      select 1 from gps.etapa1_clientes c
       where c.id = cliente_trajetoria.cliente_id
         and c.aluno_id = gps.aluno_atual()
    )
  );

revoke all    on table gps.cliente_trajetoria from public, anon, authenticated;
grant  select on table gps.cliente_trajetoria to authenticated;

-- ── 3. CHECK de aluno_eventos.tipo, a partir do VIVO ──────────────────────
do $$
declare
  v_def   text;
  v_vivos text[];
  v_novos text[];
begin
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
   where c.conrelid = 'gps.aluno_eventos'::regclass
     and c.conname  = 'aluno_eventos_tipo_check';

  if v_def is null then
    raise exception 'aluno_eventos_tipo_check nao encontrado -- migracao abortada';
  end if;
  if v_def !~ 'ARRAY\[' or v_def ~ '''\{' then
    raise exception 'aluno_eventos_tipo_check em formato inesperado -- migracao abortada. Def: %', v_def;
  end if;

  select array_agg(m[1] order by ord) into v_vivos
    from regexp_matches(v_def, '''([^'']+)''', 'g') with ordinality as r(m, ord);

  if v_vivos is null or not ('cliente_link_drive_adicionado' = any (v_vivos)) then
    raise exception 'aluno_eventos_tipo_check sem cliente_link_drive_adicionado (ancora da …332) -- migracao abortada. Def: %', v_def;
  end if;
  if exists (select 1 from unnest(v_vivos) x where x ~ '[,{}]') then
    raise exception 'valor extraido do CHECK com virgula/chave -- migracao abortada. Def: %', v_def;
  end if;

  select array_agg(distinct x order by x) into v_novos
    from unnest(v_vivos || array['cliente_etapa_marcada',
                                 'cliente_etapa_desmarcada',
                                 'cliente_funil_origem_definido']) x;

  if exists (select 1 from unnest(v_vivos) x where x <> all (v_novos)) then
    raise exception 'lista nova perdeu valor vivo -- migracao abortada';
  end if;

  alter table gps.aluno_eventos drop constraint aluno_eventos_tipo_check;
  execute format(
    'alter table gps.aluno_eventos add constraint aluno_eventos_tipo_check check (tipo = any (array[%s])) not valid',
    (select string_agg(quote_literal(x) || '::text', ', ' order by x) from unnest(v_novos) x));
  alter table gps.aluno_eventos validate constraint aluno_eventos_tipo_check;

  execute format(
    'comment on constraint aluno_eventos_tipo_check on gps.aluno_eventos is %L',
    'Catalogo fechado de tipos de evento do diario. ' || cardinality(v_novos)
    || ' valores desde a …345 (05/10/2026): a lista VIVA lida por pg_get_constraintdef ('
    || cardinality(v_vivos) || ') + cliente_etapa_marcada/cliente_etapa_desmarcada '
    || '(gps.cliente_trajetoria_marcar/_desmarcar) + cliente_funil_origem_definido '
    || '(trg_aluno_eventos_funil_origem). Espelha TIPOS_EVENTO em src/lib/types.ts. '
    || 'Ao acrescentar valor, LEIA O CHECK VIGENTE (pg_get_constraintdef filtrando por conname).');
end $$;

-- ── 4. RPCs ────────────────────────────────────────────────────────────────
create or replace function gps.cliente_trajetoria_marcar(
  p_cliente_id uuid,
  p_etapa      text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid      uuid    := auth.uid();
  v_admin    boolean := coalesce(public.gp_is_admin(), false);
  v_ambiente uuid    := gps.aluno_atual();
  v_c        record;
  v_ativo    boolean;
  v_em       timestamptz;
begin
  if v_uid is null then
    raise exception 'Sessão expirada. Entre de novo.' using errcode = '42501';
  end if;
  if p_cliente_id is null then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;

  -- Lock na linha do cliente: serializa marcar/desmarcar do MESMO cliente
  -- (mesmo molde de cliente_link_drive_adicionar, …333).
  select c.id, c.aluno_id, c.nome
    into v_c
    from gps.etapa1_clientes c
   where c.id = p_cliente_id
   for no key update;

  if not found then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;
  if not v_admin and (v_ambiente is null or v_ambiente <> v_c.aluno_id) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  select t.ativo into v_ativo
    from gps.cliente_etapa_tipos t
   where t.codigo = p_etapa;
  if not found or not v_ativo then
    raise exception 'Etapa inválida.' using errcode = '22023';
  end if;

  -- Já marcada: no-op (sem evento).
  select tr.marcado_em into v_em
    from gps.cliente_trajetoria tr
   where tr.cliente_id = p_cliente_id
     and tr.etapa_codigo = p_etapa
     and tr.desmarcado_em is null;
  if found then
    return jsonb_build_object('etapa_codigo', p_etapa, 'marcado', true,
                              'marcado_em', v_em, 'mudou', false);
  end if;

  insert into gps.cliente_trajetoria (cliente_id, etapa_codigo, marcado_por)
  values (p_cliente_id, p_etapa, v_uid)
  returning marcado_em into v_em;

  insert into gps.aluno_eventos
    (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
  values
    (v_c.aluno_id, now(), 'cliente_etapa_marcada', 'cliente', p_cliente_id,
     left(coalesce(nullif(btrim(v_c.nome), ''), 'Cliente sem nome'), 300),
     jsonb_build_object('etapa_codigo', p_etapa, 'cliente_id', p_cliente_id),
     case when v_admin then 'equipe' else 'aluno' end, v_uid, 'app');

  return jsonb_build_object('etapa_codigo', p_etapa, 'marcado', true,
                            'marcado_em', v_em, 'mudou', true);
end;
$function$;

comment on function gps.cliente_trajetoria_marcar(uuid, text) is
  'Marca uma etapa da trajetoria do cliente (…345). Guarda: admin (coalesce(gp_is_admin(),false)) OU gps.aluno_atual() = etapa1_clientes.aluno_id; senao 42501. Lock for no key update na linha do cliente. Etapa inexistente/inativa 22023. Ja marcada = no-op (mudou=false, sem evento). NAO marca a mae nem nada automaticamente. Evento cliente_etapa_marcada {etapa_codigo, cliente_id}. Retorna {etapa_codigo, marcado, marcado_em, mudou}.';

revoke all     on function gps.cliente_trajetoria_marcar(uuid, text) from public, anon;
grant  execute on function gps.cliente_trajetoria_marcar(uuid, text) to authenticated;

create or replace function gps.cliente_trajetoria_desmarcar(
  p_cliente_id uuid,
  p_etapa      text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid      uuid    := auth.uid();
  v_admin    boolean := coalesce(public.gp_is_admin(), false);
  v_ambiente uuid    := gps.aluno_atual();
  v_c        record;
  v_id       uuid;
begin
  if v_uid is null then
    raise exception 'Sessão expirada. Entre de novo.' using errcode = '42501';
  end if;
  if p_cliente_id is null then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;

  select c.id, c.aluno_id, c.nome
    into v_c
    from gps.etapa1_clientes c
   where c.id = p_cliente_id
   for no key update;

  if not found then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;
  if not v_admin and (v_ambiente is null or v_ambiente <> v_c.aluno_id) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  -- Etapa inativa ainda pode ser DESmarcada (a marcação antiga continua
  -- visível); só a inexistente é recusada.
  if not exists (select 1 from gps.cliente_etapa_tipos t where t.codigo = p_etapa) then
    raise exception 'Etapa inválida.' using errcode = '22023';
  end if;

  update gps.cliente_trajetoria tr
     set desmarcado_em = now(), desmarcado_por = v_uid
   where tr.cliente_id = p_cliente_id
     and tr.etapa_codigo = p_etapa
     and tr.desmarcado_em is null
  returning tr.id into v_id;

  -- Não estava marcada: no-op (sem evento).
  if v_id is null then
    return jsonb_build_object('etapa_codigo', p_etapa, 'marcado', false,
                              'marcado_em', null, 'mudou', false);
  end if;

  insert into gps.aluno_eventos
    (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
  values
    (v_c.aluno_id, now(), 'cliente_etapa_desmarcada', 'cliente', p_cliente_id,
     left(coalesce(nullif(btrim(v_c.nome), ''), 'Cliente sem nome'), 300),
     jsonb_build_object('etapa_codigo', p_etapa, 'cliente_id', p_cliente_id),
     case when v_admin then 'equipe' else 'aluno' end, v_uid, 'app');

  return jsonb_build_object('etapa_codigo', p_etapa, 'marcado', false,
                            'marcado_em', null, 'mudou', true);
end;
$function$;

comment on function gps.cliente_trajetoria_desmarcar(uuid, text) is
  'Desmarca (SOFT: desmarcado_em/_por) uma etapa da trajetoria do cliente (…345). Mesma guarda de _marcar. Nao marcada = no-op (mudou=false, sem evento). Nao desmarca filhas nem mae. Evento cliente_etapa_desmarcada {etapa_codigo, cliente_id}.';

revoke all     on function gps.cliente_trajetoria_desmarcar(uuid, text) from public, anon;
grant  execute on function gps.cliente_trajetoria_desmarcar(uuid, text) to authenticated;

-- ── 5. Funil de origem ─────────────────────────────────────────────────────
alter table gps.etapa1_clientes
  add column if not exists funil_origem text;

alter table gps.etapa1_clientes
  add constraint chk_etapa1_clientes_funil_origem
  check (funil_origem is null or funil_origem in ('reuniao_preliminar', 'sessao_viabilidade'));

comment on column gps.etapa1_clientes.funil_origem is
  'Por qual funil o cliente entrou (…345): reuniao_preliminar | sessao_viabilidade | null (nao informado). Sem backfill. Escrita pela ficha (PatchCliente). Independente de fase e da trajetoria.';

create or replace function gps.aluno_eventos_capturar_funil_origem()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  begin
    insert into gps.aluno_eventos
      (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
    values
      (new.aluno_id, now(), 'cliente_funil_origem_definido', 'cliente', new.id,
       left(coalesce(nullif(btrim(new.nome), ''), 'Cliente sem nome'), 300),
       jsonb_build_object('de', old.funil_origem, 'para', new.funil_origem),
       case when coalesce(public.gp_is_admin(), false) then 'equipe' else 'aluno' end,
       auth.uid(), 'app');
  exception when others then
    -- Nunca derruba o salvamento da ficha (molde de aluno_eventos_capturar_etapa1_clientes, …008).
    null;
  end;
  return new;
end;
$function$;

comment on function gps.aluno_eventos_capturar_funil_origem() is
  'Trigger de diario de etapa1_clientes.funil_origem (…345). Separada de aluno_eventos_capturar_etapa1_clientes de proposito: nao reescreve a funcao compartilhada. SECURITY DEFINER (o aluno nao tem grant em aluno_eventos). Nunca lanca.';

revoke all on function gps.aluno_eventos_capturar_funil_origem() from public, anon, authenticated;

create trigger trg_aluno_eventos_funil_origem
  after update of funil_origem on gps.etapa1_clientes
  for each row
  when (old.funil_origem is distinct from new.funil_origem)
  execute function gps.aluno_eventos_capturar_funil_origem();
