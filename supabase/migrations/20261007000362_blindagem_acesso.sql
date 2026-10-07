-- ═══════════════════════════════════════════════════════════════════════════
-- 362 — BLINDAGEM DE ACESSO (parte 1/2): trava de alteração em massa nas
--       tabelas de acesso + auditoria append-only + restauração por txid
-- ═══════════════════════════════════════════════════════════════════════════
-- INCIDENTE (07/10/2026, 18:29): um único `update public.perfis` (migração
-- 20261007182928_acesso_fase2_rebaixar) rebaixou 24 perfis da equipe para
-- `visualizador`; `public.gp_is_admin()` passou a negar e a equipe caiu no GPS.
-- Nada no banco percebeu que UM comando mexia em metade da tabela de acesso.
--
-- O QUE ESTA MIGRAÇÃO FAZ
--   • schema `blindagem`, fechado a public/anon/authenticated/service_role;
--   • `blindagem.vigiar()`: gatilho AFTER ... FOR EACH STATEMENT com tabelas de
--     transição. Audita só as linhas cuja coluna sensível MUDOU e, acima do
--     limite em modo 'travar', recusa o comando (42501) a menos que a MESMA
--     transação tenha chamado `select blindagem.autorizar('<motivo 10+>')`;
--   • AUTORIZAÇÃO AMARRADA AO TXID: `autorizar` grava
--     '<txid_current>:<motivo>' em app.mudanca_em_massa (set local). O vigia só
--     aceita valor cujo prefixo é o txid da transação corrente — `alter role/
--     database set`, `set` sem local vazando em pool ou valor digitado à mão
--     não liberam nada (txid diferente). Mesmo esquema em app.mudanca_guarda
--     (`blindagem.autorizar_guarda`) e na flag de expurgo;
--   • superfícies (limites medidos em 07/10):
--       public.perfis      UPDATE(cargo,status,email,nivel_hierarquia,areas,
--                          eh_dev,pode_ver_cpf_completo,funcoes)+DEL limite 3 travar
--       gps.membros        UPDATE(user_id,aluno_id,papel)+DEL    limite 4 travar
--       gps.ambientes      DELETE                                limite 2 travar
--       public.thb_alunos  UPDATE(email,documento)+DELETE        limite 50 OBSERVAR
--     + TRUNCATE nas quatro sempre exige autorização;
--   • LGPD: DELETE em thb_alunos audita só id+nome+email+documento e é marcado
--     NÃO restaurável; retenção de 180 dias com cron diário ATIVO
--     (`blindagem-expurgo`, 06:30 UTC); eliminação a pedido do titular por
--     `blindagem.expurgar_titular`;
--   • `blindagem.restaurar_txid(txid, motivo, reinserir_apagados=false)` desfaz
--     os UPDATEs de um txid; DELETE só é reinserido se pedido explicitamente;
--   • `gps.entrada_pelo_codigo` e `gps.admin_excluir_acesso` recriadas a partir
--     do corpo VIVO (pg_get_functiondef, 07/10/2026) declarando autorização só em
--     volta dos próprios deletes, guardando e devolvendo o valor anterior.
--
-- AS 5 PERGUNTAS
--   1. Escala: o custo é POR COMANDO e proporcional às linhas que o comando
--      tocou (join das duas tabelas de transição pela PK), nunca à base. A
--      auditoria cresce só com mudança SENSÍVEL: perfis acumula 486 linhas
--      atualizadas em pg_stat_user_tables (a maioria em colunas não sensíveis).
--      MEDIDO (ensaio de 07/10, transação desfeita): gatilho custa ~0,6–1,2 ms
--      por comando (perfis/membros 1 linha; thb_alunos 300 linhas em
--      canal_aquisicao ~1 ms, 0 linhas auditadas).
--   2. Índice: auditoria tem (txid) para a restauração e (tabela, pk->>'id')
--      para consulta/eliminação por titular; a restauração casa a linha alvo
--      pela PK da própria tabela (Index Scan). explain (analyze, buffers) e
--      ensaio integral com saídas literais: supabase/verificacao-20261007000362.sql
--   3. Frequência: dispara a cada UPDATE/DELETE nas 4 tabelas. thb_alunos é a
--      quente (~11 comandos/dia de topo em pg_stat_statements, maior lote 300
--      linhas em canal_aquisicao) — esses lotes NÃO auditam nem contam.
--      Cron de expurgo: 1×/dia, delete por `em` numa tabela pequena.
--   4. Repetição: um gatilho por evento e tabela; uma leitura de
--      blindagem.config (PK, 4 linhas) e um insert…select por comando.
--   5. Reversão (sem deploy, nesta ordem de preferência):
--      a) afrouxar sem desligar:
--           begin; select blindagem.autorizar_guarda('<motivo>');
--           update blindagem.config set modo = 'observar' where tabela = '<t>';
--           commit;
--      b) desligar a trava (a auditoria fica guardada, nada é apagado):
--           begin; select blindagem.autorizar_guarda('<motivo>');
--           -- antes, a 363: drop event trigger blindagem_guarda_ddl;
--           --               drop event trigger blindagem_guarda_drop;
--           drop trigger blindagem_upd   on public.perfis;
--           drop trigger blindagem_del   on public.perfis;
--           drop trigger blindagem_trunc on public.perfis;
--           drop trigger blindagem_upd   on gps.membros;
--           drop trigger blindagem_del   on gps.membros;
--           drop trigger blindagem_trunc on gps.membros;
--           drop trigger blindagem_del   on gps.ambientes;
--           drop trigger blindagem_trunc on gps.ambientes;
--           drop trigger blindagem_upd   on public.thb_alunos;
--           drop trigger blindagem_del   on public.thb_alunos;
--           drop trigger blindagem_trunc on public.thb_alunos;
--           commit;
--         As duas funções gps.* recriadas seguem funcionando sem os gatilhos
--         (autorizar só grava um setting). Para voltá-las ao corpo anterior:
--         reaplicar o `depois` da LINHA DE BASE em blindagem.auditoria_funcoes
--         (gravada pela 363) ou o corpo vivo anterior desta migração.
--      c) cron: select cron.unschedule('blindagem-expurgo');
--      NÃO usar `drop schema blindagem cascade` (apaga a trilha).
--
-- COMO USAR (mudança em massa legítima, numa transação):
--   begin;
--   select blindagem.autorizar('reativa equipe após incidente 07/10');
--   update public.perfis set ... ;
--   commit;
-- Desfazer: select blindagem.restaurar_txid(<txid>, '<motivo>');
--   (txid: select txid, tabela, op, count(*) from blindagem.auditoria_acesso
--    where em > now() - interval '1 day' group by 1,2,3)
--
-- LIMITES CONHECIDOS: INSERT não é vigiado; DELETE em cascata (auth.users →
-- perfis, thb_alunos → membros/ambientes) chega como um comando POR LINHA-PAI.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '3s';
set local statement_timeout = '30s';

create schema blindagem;
comment on schema blindagem is
  'Blindagem de acesso (migrações 362/363, 07/10/2026): trava de alteração em massa, auditoria append-only, restauração por txid e guarda de DDL das funções de acesso. Fechado: só postgres.';
revoke all on schema blindagem from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema blindagem revoke execute on functions from public;
alter default privileges for role postgres in schema blindagem revoke all on tables from public;

-- ─── tabelas ────────────────────────────────────────────────────────────────

create table blindagem.config (
  tabela text primary key,
  limite integer not null check (limite >= 0),
  modo   text not null check (modo in ('observar', 'travar'))
);
comment on table blindagem.config is
  'Limite de linhas SENSÍVEIS por comando. travar = recusa acima do limite sem blindagem.autorizar; observar = só audita e avisa. Alterar exige blindagem.autorizar_guarda (auditado em auditoria_funcoes).';

insert into blindagem.config (tabela, limite, modo) values
  ('public.perfis',     3,  'travar'),
  ('gps.membros',       4,  'travar'),
  ('gps.ambientes',     2,  'travar'),
  ('public.thb_alunos', 50, 'observar');

create table blindagem.restauradores (
  user_id uuid primary key
);
comment on table blindagem.restauradores is
  'Quem pode chamar restaurar_txid/expurgar/expurgar_titular com JWT (por wrapper; o schema não tem USAGE). Alterar exige blindagem.autorizar_guarda.';

insert into blindagem.restauradores (user_id)
select u.id from auth.users u
 where lower(btrim(u.email)) in ('joao@advmais.com', 'arthur@advmais.com');

do $$
begin
  if (select count(*) from blindagem.restauradores) <> 2 then
    raise exception 'blindagem: esperava 2 restauradores (joao, arthur), achei %',
      (select count(*) from blindagem.restauradores);
  end if;
end $$;

create sequence blindagem.comando_seq;

create table blindagem.auditoria_acesso (
  id               bigserial primary key,
  comando_id       bigint,
  txid             bigint      not null default txid_current(),
  em               timestamptz not null default clock_timestamp(),
  tabela           text        not null,
  op               text        not null check (op in ('UPDATE', 'DELETE', 'TRUNCATE', 'EXPURGO')),
  pk               jsonb,
  antes            jsonb,
  depois           jsonb,
  restauravel      boolean     not null default true,
  usuario_corrente text,
  usuario_sessao   text        not null default session_user,
  jwt_sub          text,
  application_name text,
  motivo           text,
  autorizado       boolean     not null default false
);
comment on table blindagem.auditoria_acesso is
  'Append-only. Uma linha por linha SENSÍVEL alterada. UPDATE: antes/depois só com as colunas sensíveis; DELETE: antes = linha inteira (restaurável), exceto thb_alunos (só id/nome/email/documento, restauravel=false). usuario_corrente = papel do chamador (GUC role). Retenção 180 dias (cron blindagem-expurgo).';
create index auditoria_acesso_txid_idx on blindagem.auditoria_acesso (txid);
create index auditoria_acesso_tabela_pk_idx on blindagem.auditoria_acesso (tabela, (pk ->> 'id'));

create table blindagem.auditoria_funcoes (
  id               bigserial primary key,
  txid             bigint      not null default txid_current(),
  em               timestamptz not null default clock_timestamp(),
  objeto           text        not null,
  objeto_oid       oid,
  comando          text        not null,
  antes            text,
  depois           text,
  usuario_corrente text,
  usuario_sessao   text        not null default session_user,
  jwt_sub          text,
  application_name text,
  motivo           text
);
comment on table blindagem.auditoria_funcoes is
  'Append-only. Mudanças autorizadas (blindagem.autorizar_guarda) em funções de acesso, gatilhos blindagem_* e config/restauradores. antes = último depois registrado do objeto (linha de base gravada na 363).';
create index auditoria_funcoes_objeto_idx on blindagem.auditoria_funcoes (objeto, id);

alter table blindagem.config            enable row level security;
alter table blindagem.restauradores     enable row level security;
alter table blindagem.auditoria_acesso  enable row level security;
alter table blindagem.auditoria_funcoes enable row level security;

-- ─── funções auxiliares ─────────────────────────────────────────────────────

-- Papel de quem chamou: dentro de SECURITY DEFINER o current_user é o dono;
-- o GUC `role` (PostgREST faz set local role) não muda.
create function blindagem._papel()
returns text language sql stable set search_path = '' as $$
  select coalesce(nullif(current_setting('role', true), 'none'), session_user::text)
$$;

create function blindagem._jwt_sub()
returns text language sql stable set search_path = '' as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
$$;

-- Motivo válido = valor '<txid desta transação>:<motivo com 10+>'. Qualquer
-- outra coisa (vazio, txid de outra transação, digitado à mão) → null.
create function blindagem._motivo(p_valor text)
returns text language plpgsql volatile set search_path = '' as $f$
declare
  v_prefixo text := txid_current()::text || ':';
  v_motivo  text;
begin
  if p_valor is null or left(p_valor, length(v_prefixo)) <> v_prefixo then
    return null;
  end if;
  v_motivo := btrim(substr(p_valor, length(v_prefixo) + 1));
  if length(v_motivo) < 10 then
    return null;
  end if;
  return v_motivo;
end
$f$;

-- Única forma de autorizar mudança em massa. SECURITY INVOKER; executável só
-- pelo dono (postgres) e por funções SECURITY DEFINER dele.
create function blindagem.autorizar(p_motivo text)
returns text language plpgsql volatile set search_path = '' as $f$
begin
  if coalesce(length(btrim(p_motivo)), 0) < 10 then
    raise exception 'blindagem: motivo com 10+ caracteres' using errcode = '22023';
  end if;
  return set_config('app.mudanca_em_massa', txid_current()::text || ':' || btrim(p_motivo), true);
end
$f$;

create function blindagem.autorizar_guarda(p_motivo text)
returns text language plpgsql volatile set search_path = '' as $f$
begin
  if coalesce(length(btrim(p_motivo)), 0) < 10 then
    raise exception 'blindagem: motivo com 10+ caracteres' using errcode = '22023';
  end if;
  return set_config('app.mudanca_guarda', txid_current()::text || ':' || btrim(p_motivo), true);
end
$f$;

-- Restaurador = JWT de alguém em blindagem.restauradores, OU sessão postgres
-- sem JWT e sem `set role` (SQL editor, migração, pg_cron).
create function blindagem._pode_restaurar()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
       exists (select 1 from blindagem.restauradores r
                where r.user_id::text = blindagem._jwt_sub())
    or (    session_user = 'postgres'
        and blindagem._jwt_sub() is null
        and coalesce(nullif(current_setting('request.jwt.claims', true), ''), '') = ''
        and coalesce(nullif(current_setting('role', true), ''), 'none') in ('none', 'postgres')),
    false)
$$;

-- ─── o vigia ────────────────────────────────────────────────────────────────
-- TG_ARGV: [0] coluna PK · [1] UPDATE: colunas sensíveis; DELETE: colunas a
-- guardar (vazio = linha inteira, restaurável; lista = só elas, NÃO
-- restaurável) · [2] chave em blindagem.config.
create function blindagem.vigiar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $f$
declare
  v_tabela text   := format('%I.%I', tg_table_schema, tg_table_name);
  v_pk     text   := tg_argv[0];
  v_cols   text[] := string_to_array(nullif(btrim(coalesce(tg_argv[1], '')), ''), ',');
  v_chave  text   := coalesce(nullif(tg_argv[2], ''), format('%I.%I', tg_table_schema, tg_table_name));
  v_motivo text   := blindagem._motivo(current_setting('app.mudanca_em_massa', true));
  v_limite integer;
  v_modo   text;
  v_ok     boolean;
  v_n      bigint := 0;
  v_cmd    bigint;
  v_antes  text;
  v_depois text;
  v_cond   text;
begin
  select c.limite, c.modo into v_limite, v_modo
    from blindagem.config c where c.tabela = v_chave;
  if not found then
    -- sem configuração: nunca trava (não derruba sistema por erro de config), só audita
    v_modo := 'observar'; v_limite := null;
  end if;
  v_ok  := v_motivo is not null;
  v_cmd := nextval('blindagem.comando_seq');

  if tg_op = 'TRUNCATE' then
    if not v_ok then
      raise exception 'blindagem: TRUNCATE em % apaga a tabela inteira. Se é intencional, autorize na mesma transação: select blindagem.autorizar(''<motivo com 10+ caracteres>'')', v_tabela
        using errcode = '42501';
    end if;
    insert into blindagem.auditoria_acesso
      (comando_id, tabela, op, restauravel, usuario_corrente, jwt_sub, application_name, motivo, autorizado)
    values (v_cmd, v_tabela, 'TRUNCATE', false, blindagem._papel(), blindagem._jwt_sub(),
            current_setting('application_name', true), v_motivo, true);
    return null;
  end if;

  if tg_op = 'UPDATE' then
    if v_cols is null then
      raise exception 'blindagem.vigiar: gatilho de UPDATE em % sem colunas sensíveis em TG_ARGV[1]', v_tabela;
    end if;
    select string_agg(format('%L, o.%I', c, c), ', '),
           string_agg(format('%L, n.%I', c, c), ', '),
           string_agg(format('o.%1$I is distinct from n.%1$I', c), ' or ')
      into v_antes, v_depois, v_cond
      from unnest(v_cols) c;
    execute format(
      'insert into blindagem.auditoria_acesso
         (comando_id, tabela, op, pk, antes, depois, usuario_corrente, jwt_sub, application_name, motivo, autorizado)
       select $1, $2, ''UPDATE'', jsonb_build_object(''id'', o.%1$I, ''col'', %1$L),
              jsonb_build_object(%2$s), jsonb_build_object(%3$s), $3, $4, $5, $6, $7
         from blindagem_old o
         join blindagem_new n on n.%1$I = o.%1$I
        where %4$s', v_pk, v_antes, v_depois, v_cond)
    using v_cmd, v_tabela, blindagem._papel(), blindagem._jwt_sub(),
          current_setting('application_name', true), v_motivo, v_ok;
  else
    if v_cols is null then
      v_antes := 'to_jsonb(o)';
    else
      select 'jsonb_build_object(' || string_agg(format('%L, o.%I', c, c), ', ') || ')'
        into v_antes from unnest(v_cols) c;
    end if;
    execute format(
      'insert into blindagem.auditoria_acesso
         (comando_id, tabela, op, pk, antes, depois, restauravel, usuario_corrente, jwt_sub, application_name, motivo, autorizado)
       select $1, $2, ''DELETE'', jsonb_build_object(''id'', o.%1$I, ''col'', %1$L),
              %2$s, null, $8, $3, $4, $5, $6, $7
         from blindagem_old o', v_pk, v_antes)
    using v_cmd, v_tabela, blindagem._papel(), blindagem._jwt_sub(),
          current_setting('application_name', true), v_motivo, v_ok, (v_cols is null);
  end if;
  get diagnostics v_n = row_count;

  if v_limite is not null and v_n > v_limite and not v_ok then
    if v_modo = 'travar' then
      raise exception 'blindagem: o comando altera % linhas sensíveis de % (limite %). Se é intencional, autorize na mesma transação: select blindagem.autorizar(''<motivo com 10+ caracteres>'')', v_n, v_tabela, v_limite
        using errcode = '42501',
              hint = 'Mudança em massa de acesso derrubou a equipe em 07/10/2026. Confira o WHERE antes de autorizar.';
    end if;
    raise warning 'blindagem (observar): o comando altera % linhas sensíveis de % (limite %), sem autorização', v_n, v_tabela, v_limite;
  end if;
  return null;
end
$f$;

-- ─── append-only ────────────────────────────────────────────────────────────
-- DELETE só passa em auditoria_acesso com a flag blindagem.expurgo AMARRADA ao
-- txid: '<txid>:180' (só linhas com mais de 180 dias, blindagem.expurgar) ou
-- '<txid>:titular' (blindagem.expurgar_titular, que escolhe as linhas).
create function blindagem.somente_inclusao()
returns trigger
language plpgsql
set search_path = ''
as $f$
declare
  v_flag text := current_setting('blindagem.expurgo', true);
begin
  if tg_op = 'DELETE' and tg_table_name = 'auditoria_acesso' then
    if v_flag = txid_current()::text || ':180' and old.em < now() - interval '180 days' then
      return old;
    end if;
    if v_flag = txid_current()::text || ':titular' then
      return old;
    end if;
  end if;
  raise exception 'blindagem: % é append-only (% recusado)', tg_table_schema || '.' || tg_table_name, tg_op
    using errcode = '42501';
end
$f$;

-- ─── config e restauradores exigem blindagem.autorizar_guarda ───────────────
create function blindagem.guarda_tabela()
returns trigger
language plpgsql
security definer
set search_path = ''
as $f$
declare
  v_motivo text := blindagem._motivo(current_setting('app.mudanca_guarda', true));
begin
  if v_motivo is null then
    raise exception 'blindagem: % em %.% mexe na guarda. Autorize na mesma transação: select blindagem.autorizar_guarda(''<motivo com 10+ caracteres>'')', tg_op, tg_table_schema, tg_table_name
      using errcode = '42501';
  end if;
  insert into blindagem.auditoria_funcoes
    (objeto, comando, antes, depois, usuario_corrente, jwt_sub, application_name, motivo)
  values (tg_table_schema || '.' || tg_table_name, tg_op,
          case when tg_level = 'ROW' and tg_op in ('UPDATE', 'DELETE') then to_jsonb(old)::text end,
          case when tg_level = 'ROW' and tg_op in ('UPDATE', 'INSERT') then to_jsonb(new)::text end,
          blindagem._papel(), blindagem._jwt_sub(), current_setting('application_name', true), v_motivo);
  if tg_level = 'STATEMENT' then return null; end if;
  return coalesce(new, old);
end
$f$;

-- ─── restauração ────────────────────────────────────────────────────────────
-- Padrão: desfaz só os UPDATEs (volta para `antes` onde o atual ainda é
-- `depois`). DELETEs são REPORTADOS; reinserir exige p_reinserir_apagados.
-- DELETE de thb_alunos nunca é reinserido (auditoria guarda só 4 colunas).
create function blindagem.restaurar_txid(p_txid bigint, p_motivo text, p_reinserir_apagados boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $f$
declare
  r          record;
  v_rel      regclass;
  v_pkcol    text;
  v_cols     text[];
  v_set      text;
  v_t        text;
  v_d        text;
  v_n        bigint;
  v_ok       integer := 0;
  v_pulados  integer := 0;
  v_naorest  integer := 0;
  v_conf     jsonb := '[]'::jsonb;
  v_anterior text := current_setting('app.mudanca_em_massa', true);
begin
  if not blindagem._pode_restaurar() then
    raise exception 'blindagem: sem permissão para restaurar.' using errcode = '42501';
  end if;
  if coalesce(length(btrim(p_motivo)), 0) < 10 then
    raise exception 'blindagem: informe o motivo (10+ caracteres).' using errcode = '22023';
  end if;
  if p_txid is null then
    raise exception 'blindagem: informe o txid.' using errcode = '22023';
  end if;

  -- a própria restauração é mudança em massa autorizada (e auditada)
  perform blindagem.autorizar(format('restaurar_txid %s: %s', p_txid, btrim(p_motivo)));

  for r in
    select a.id, a.tabela, a.op, a.pk, a.antes, a.depois, a.restauravel
      from blindagem.auditoria_acesso a
     where a.txid = p_txid and a.op in ('UPDATE', 'DELETE')
     order by a.id desc
  loop
    if r.op = 'DELETE' and not r.restauravel then
      v_naorest := v_naorest + 1;
      continue;
    end if;
    if r.op = 'DELETE' and not coalesce(p_reinserir_apagados, false) then
      v_pulados := v_pulados + 1;
      continue;
    end if;
    begin
      v_rel   := r.tabela::regclass;
      v_pkcol := coalesce(r.pk ->> 'col', 'id');
      if r.op = 'UPDATE' then
        select array_agg(k order by k) into v_cols from jsonb_object_keys(r.antes) k;
        select string_agg(format('%1$I = a.%1$I', c), ', '),
               string_agg(format('t.%I', c), ', '),
               string_agg(format('d.%I', c), ', ')
          into v_set, v_t, v_d
          from unnest(v_cols) c;
        execute format(
          'update %1$s t set %2$s
             from jsonb_populate_record(null::%1$s, $1) a,
                  jsonb_populate_record(null::%1$s, $2) d
            where t.%3$I = a.%3$I and row(%4$s) is not distinct from row(%5$s)',
          v_rel, v_set, v_pkcol, v_t, v_d)
        using r.antes || jsonb_build_object(v_pkcol, r.pk -> 'id'), r.depois;
        get diagnostics v_n = row_count;
        if v_n = 0 then
          v_conf := v_conf || jsonb_build_object('auditoria_id', r.id, 'tabela', r.tabela,
                      'pk', r.pk ->> 'id', 'motivo', 'valor atual difere do registrado (ou a linha sumiu)');
        else
          v_ok := v_ok + 1;
        end if;
      else
        execute format(
          'insert into %1$s select * from jsonb_populate_record(null::%1$s, $1) on conflict do nothing', v_rel)
        using r.antes;
        get diagnostics v_n = row_count;
        if v_n = 0 then
          v_conf := v_conf || jsonb_build_object('auditoria_id', r.id, 'tabela', r.tabela,
                      'pk', r.pk ->> 'id', 'motivo', 'a linha já existe');
        else
          v_ok := v_ok + 1;
        end if;
      end if;
    exception when others then
      v_conf := v_conf || jsonb_build_object('auditoria_id', r.id, 'tabela', r.tabela,
                  'pk', r.pk ->> 'id', 'motivo', sqlstate || ': ' || sqlerrm);
    end;
  end loop;

  perform set_config('app.mudanca_em_massa', coalesce(v_anterior, ''), true);
  return jsonb_build_object('txid', p_txid, 'restauradas', v_ok,
                            'apagados_nao_reinseridos', v_pulados,
                            'apagados_nao_restauraveis', v_naorest,
                            'conflitos', jsonb_array_length(v_conf), 'detalhe', v_conf);
end
$f$;

-- ─── retenção LGPD (180 dias) ───────────────────────────────────────────────
create function blindagem.expurgar(p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $f$
declare
  v_n bigint;
begin
  if not blindagem._pode_restaurar() then
    raise exception 'blindagem: sem permissão para expurgar.' using errcode = '42501';
  end if;
  if coalesce(length(btrim(p_motivo)), 0) < 10 then
    raise exception 'blindagem: informe o motivo (10+ caracteres).' using errcode = '22023';
  end if;
  perform set_config('blindagem.expurgo', txid_current()::text || ':180', true);
  delete from blindagem.auditoria_acesso where em < now() - interval '180 days';
  get diagnostics v_n = row_count;
  perform set_config('blindagem.expurgo', '', true);
  if v_n > 0 then
    insert into blindagem.auditoria_acesso
      (tabela, op, pk, restauravel, usuario_corrente, jwt_sub, application_name, motivo, autorizado)
    values ('blindagem.auditoria_acesso', 'EXPURGO',
            jsonb_build_object('apagadas', v_n, 'regra', '180 dias'), false,
            blindagem._papel(), blindagem._jwt_sub(), current_setting('application_name', true),
            btrim(p_motivo), true);
  end if;
  return jsonb_build_object('apagadas', v_n);
end
$f$;

-- Eliminação a pedido do titular (antes dos 180 dias). O registro da própria
-- eliminação NÃO guarda o identificador apagado: só a tabela e a contagem.
create function blindagem.expurgar_titular(p_tabela text, p_pk text, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $f$
declare
  v_n bigint;
begin
  if not blindagem._pode_restaurar() then
    raise exception 'blindagem: sem permissão para expurgar.' using errcode = '42501';
  end if;
  if coalesce(length(btrim(p_motivo)), 0) < 10 then
    raise exception 'blindagem: informe o motivo (10+ caracteres).' using errcode = '22023';
  end if;
  if p_tabela not in (select c.tabela from blindagem.config c) or coalesce(btrim(p_pk), '') = '' then
    raise exception 'blindagem: tabela fora das superfícies vigiadas ou pk vazia.' using errcode = '22023';
  end if;
  perform set_config('blindagem.expurgo', txid_current()::text || ':titular', true);
  delete from blindagem.auditoria_acesso a
   where a.tabela = p_tabela and (a.pk ->> 'id') = btrim(p_pk);
  get diagnostics v_n = row_count;
  perform set_config('blindagem.expurgo', '', true);
  insert into blindagem.auditoria_acesso
    (tabela, op, pk, restauravel, usuario_corrente, jwt_sub, application_name, motivo, autorizado)
  values ('blindagem.auditoria_acesso', 'EXPURGO',
          jsonb_build_object('apagadas', v_n, 'regra', 'pedido do titular', 'tabela', p_tabela), false,
          blindagem._papel(), blindagem._jwt_sub(), current_setting('application_name', true),
          btrim(p_motivo), true);
  return jsonb_build_object('apagadas', v_n);
end
$f$;

-- ─── as duas funções que apagam em lote declaram a própria autorização ─────
-- Corpos = pg_get_functiondef VIVO de 07/10/2026. Diferença: só as linhas de
-- `declare v_blindagem_anterior … / begin / perform blindagem.autorizar(…)` e
-- `perform set_config(… v_blindagem_anterior …) / end;` em volta dos deletes;
-- as linhas originais ficam intactas. create or replace preserva dono e ACL.

CREATE OR REPLACE FUNCTION gps.entrada_pelo_codigo(p_email text, p_codigo text, p_ip_hash text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ativo text; v_codigo text; v_email text; v_user uuid; v_aluno uuid;
  v_senha text; v_tentativas integer; v_nome text; v_cadastro_email text;
begin
  select valor into v_ativo from gps.config where chave = 'entrada_codigo_ativa';
  if coalesce(v_ativo, 'false') <> 'true' then
    raise exception 'Este caminho está indisponível no momento.' using errcode = '22023';
  end if;

  v_email := lower(btrim(regexp_replace(coalesce(p_email,''), '[ ​-‍⁠﻿]', '', 'g')));

  select count(*) into v_tentativas from gps.resgate_tentativas
   where ip_hash = coalesce(p_ip_hash,'sem-ip') and criado_em > now() - interval '15 minutes';
  if v_tentativas >= 20 then
    raise exception 'Muitas tentativas deste dispositivo. Aguarde 15 minutos.' using errcode = '22023';
  end if;

  insert into gps.resgate_tentativas (ip_hash, email_tentado)
  values (coalesce(p_ip_hash,'sem-ip'), v_email);

  select valor into v_codigo from gps.config where chave = 'resgate_codigo';
  if coalesce(v_codigo,'') = '' or p_codigo is distinct from v_codigo then
    raise exception 'Código incorreto.' using errcode = '22023';
  end if;

  select m.user_id, m.aluno_id, a.nome, a.email
    into v_user, v_aluno, v_nome, v_cadastro_email
    from gps.membros m
    join public.thb_alunos a on a.id = m.aluno_id
    left join public.thb_alunos p on p.id = m.pessoa_aluno_id
    left join auth.users u on u.id = m.user_id
   where v_email in (lower(btrim(coalesce(u.email,''))),
                     lower(btrim(coalesce(a.email,''))),
                     lower(btrim(coalesce(p.email,''))))
   limit 1;

  if v_aluno is null then
    raise exception 'Não encontramos este e-mail no Programa. Confira se é o mesmo da sua compra.'
      using errcode = '22023';
  end if;

  if v_user is not null and gps.admin_alvo_e_equipe(v_user) then
    raise exception 'Esta conta é da equipe — entre com a sua senha.' using errcode = '42501';
  end if;

  v_senha := 'Thb-' || encode(extensions.gen_random_bytes(9), 'base64');
  v_senha := replace(replace(replace(v_senha, '/', 'x'), '+', 'y'), '=', 'z');

  if v_user is null then
    -- 🔴 O e-mail pode JÁ TER LOGIN fora do GPS (outro portal do grupo, ou
    -- auto-cadastro): criar outro estoura `users_email_partial_key`. Achado
    -- pela prova, não em produção. Se existe, ADOTA.
    select id into v_user from auth.users
     where lower(btrim(email)) = lower(btrim(v_cadastro_email)) limit 1;

    if v_user is not null and gps.admin_alvo_e_equipe(v_user) then
      raise exception 'Esta conta é da equipe — entre com a sua senha.' using errcode = '42501';
    end if;

    if v_user is null then
      v_user := gen_random_uuid();
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
        confirmation_token, recovery_token, email_change_token_new, email_change)
      values ('00000000-0000-0000-0000-000000000000', v_user, 'authenticated','authenticated',
        lower(btrim(v_cadastro_email)), extensions.crypt(v_senha, extensions.gen_salt('bf',10)),
        now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('origem','gps_entrada_codigo','gps_senha_temp_em', now()), '','','','');
      insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (v_user::text, v_user, jsonb_build_object('sub',v_user::text,'email',lower(btrim(v_cadastro_email)),
              'email_verified',true,'phone_verified',false),'email',now(),now(),now());
    else
      -- Conta que já existia: grava a senha nova nela.
      update auth.users
         set encrypted_password = extensions.crypt(v_senha, extensions.gen_salt('bf',10)),
             email_confirmed_at = coalesce(email_confirmed_at, now()),
             raw_user_meta_data = coalesce(raw_user_meta_data,'{}'::jsonb)
                                  || jsonb_build_object('gps_senha_temp_em', now()),
             recovery_token = '', recovery_sent_at = null, updated_at = now()
       where id = v_user;
      if not exists (select 1 from auth.identities where user_id = v_user) then
        insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        values (v_user::text, v_user, jsonb_build_object('sub',v_user::text,'email',lower(btrim(v_cadastro_email)),
                'email_verified',true,'phone_verified',false),'email',now(),now(),now());
      end if;
    end if;

    -- ORDEM: `membros_user_id_key` é UNIQUE — o membro que o gatilho possa ter
    -- criado sai antes do update.
    delete from gps.membros x where x.user_id = v_user and x.aluno_id <> v_aluno;
    update gps.membros set user_id = v_user where aluno_id = v_aluno and papel='titular' and user_id is null;
    declare v_blindagem_anterior text := current_setting('app.mudanca_em_massa', true);
    begin
    perform blindagem.autorizar('limpeza de ambientes órfãos (entrada_pelo_codigo)');
    delete from gps.ambientes g where not exists (select 1 from gps.membros m where m.aluno_id = g.aluno_id);
    perform set_config('app.mudanca_em_massa', coalesce(v_blindagem_anterior, ''), true);
    end;
  else
    update auth.users
       set encrypted_password = extensions.crypt(v_senha, extensions.gen_salt('bf',10)),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           raw_user_meta_data = coalesce(raw_user_meta_data,'{}'::jsonb)
                                || jsonb_build_object('gps_senha_temp_em', now()),
           recovery_token = '', recovery_sent_at = null, updated_at = now()
     where id = v_user;
  end if;

  insert into gps.resgate_tentativas (ip_hash, email_tentado, sucesso, user_id, aluno_id, token_usado_em)
  values (coalesce(p_ip_hash,'sem-ip'), v_email, true, v_user, v_aluno, now());

  return jsonb_build_object(
    'email', (select email from auth.users where id = v_user),
    'senha', v_senha, 'nome', v_nome);
end;
$function$;

CREATE OR REPLACE FUNCTION gps.admin_excluir_acesso(p_aluno_id uuid, p_confirmar_perda boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid; v_email text; v_login_apagado boolean := false; v_outros uuid[];
  v_motivo text := null; v_nome text;
  v_conteudo jsonb; v_resumo jsonb; v_lixeira_id uuid;
  v_clientes int; v_progresso int; v_notas int; v_chamados int; v_eventos int;
begin
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  v_user := gps.admin_user_do_aluno(p_aluno_id);
  if v_user is not null then
    if gps.admin_alvo_e_equipe(v_user) then
      raise exception 'Esta conta é da equipe — não pode ser excluída por aqui.' using errcode = '42501';
    end if;
    if v_user = auth.uid() then
      raise exception 'Você não pode excluir o próprio acesso.' using errcode = '42501';
    end if;
    select email into v_email from auth.users where id = v_user;
  end if;

  select t.nome into v_nome from public.thb_alunos t where t.id = p_aluno_id;

  select count(*) into v_clientes  from gps.etapa1_clientes c where c.aluno_id = p_aluno_id;
  select count(*) into v_progresso from gps.progresso p       where p.aluno_id = p_aluno_id;
  select count(*) into v_notas     from gps.aluno_notas n     where n.aluno_id = p_aluno_id;
  select count(*) into v_chamados  from gps.chamados ch       where ch.aluno_id = p_aluno_id;
  select count(*) into v_eventos   from gps.aluno_eventos e   where e.aluno_id = p_aluno_id;

  if not p_confirmar_perda
     and (v_clientes > 0 or v_progresso > 0 or v_notas > 0 or v_chamados > 0) then
    raise exception 'Este ambiente tem conteúdo: % cliente(s), % tarefa(s), % nota(s), % chamado(s). Confirme a exclusão para prosseguir — o conteúdo vai para a lixeira, mas some do portal.',
      v_clientes, v_progresso, v_notas, v_chamados
      using errcode = 'P0004';
  end if;

  v_conteudo := jsonb_build_object(
    'clientes',  coalesce((select jsonb_agg(to_jsonb(c)) from gps.etapa1_clientes c
                            where c.aluno_id = p_aluno_id), '[]'::jsonb),
    'progresso', coalesce((select jsonb_agg(to_jsonb(p)) from gps.progresso p
                            where p.aluno_id = p_aluno_id), '[]'::jsonb),
    'notas',     coalesce((select jsonb_agg(to_jsonb(n)) from gps.aluno_notas n
                            where n.aluno_id = p_aluno_id), '[]'::jsonb),
    'chamados',  coalesce((select jsonb_agg(to_jsonb(ch)) from gps.chamados ch
                            where ch.aluno_id = p_aluno_id), '[]'::jsonb),
    'membros',   coalesce((select jsonb_agg(to_jsonb(mm)) from gps.membros mm
                            where mm.aluno_id = p_aluno_id), '[]'::jsonb),
    'onboarding',coalesce((select jsonb_agg(to_jsonb(r)) from gps.onboarding_respostas r
                            join gps.membros m2 on m2.pessoa_aluno_id = r.pessoa_aluno_id
                           where m2.aluno_id = p_aluno_id), '[]'::jsonb));

  v_resumo := jsonb_build_object(
    'clientes', v_clientes, 'progresso', v_progresso, 'notas', v_notas,
    'chamados', v_chamados, 'eventos', v_eventos);

  insert into gps.lixeira_ambientes
    (aluno_id, email_alvo, nome_alvo, conteudo, resumo, excluido_por)
  values (p_aluno_id, v_email, v_nome, v_conteudo, v_resumo, auth.uid())
  returning id into v_lixeira_id;

  select array_agg(m.user_id) into v_outros
    from gps.membros m
   where m.aluno_id = p_aluno_id and m.user_id is not null
     and m.user_id <> coalesce(v_user, '00000000-0000-0000-0000-000000000000'::uuid)
     and not gps.admin_alvo_e_equipe(m.user_id) and m.user_id <> auth.uid();

  delete from gps.progresso              where aluno_id = p_aluno_id;
  delete from gps.tarefa_enfase          where aluno_id = p_aluno_id;
  delete from gps.reuniao_agendamentos   where aluno_id = p_aluno_id;
  delete from gps.etapa3_agendamentos    where aluno_id = p_aluno_id;
  delete from gps.etapa3_revisao         where aluno_id = p_aluno_id;

  delete from gps.reuniao_preliminar_propostas where aluno_id = p_aluno_id;
  delete from gps.reuniao_eventos              where aluno_id = p_aluno_id;
  delete from gps.etapa_liberacao_aluno        where aluno_id = p_aluno_id;
  delete from gps.chamado_solicitacoes         where ambiente_aluno_id = p_aluno_id;
  delete from gps.socio_convites               where ambiente_aluno_id = p_aluno_id;
  delete from gps.resgate_tentativas           where aluno_id = p_aluno_id;
  delete from gps.onboarding_respostas         where ambiente_aluno_id = p_aluno_id;

  delete from gps.etapa1_clientes        where aluno_id = p_aluno_id;
  delete from gps.agenda                 where aluno_id = p_aluno_id;
  delete from gps.aluno_notas            where aluno_id = p_aluno_id;
  delete from gps.aluno_eventos          where aluno_id = p_aluno_id;
  delete from gps.chamados               where aluno_id = p_aluno_id;
  declare v_blindagem_anterior text := current_setting('app.mudanca_em_massa', true);
  begin
  perform blindagem.autorizar('exclusão de acesso de 1 ambiente (admin_excluir_acesso)');
  delete from gps.membros                where aluno_id = p_aluno_id;
  delete from gps.ambientes              where aluno_id = p_aluno_id;
  perform set_config('app.mudanca_em_massa', coalesce(v_blindagem_anterior, ''), true);
  end;
  delete from gps.solicitacoes_acesso    where aluno_id = p_aluno_id;

  if v_outros is not null then
    delete from gps.solicitacoes_acesso where user_id = any(v_outros);
    begin
      delete from auth.users where id = any(v_outros);
    exception when foreign_key_violation then null;
    end;
  end if;

  if v_user is not null then
    delete from gps.solicitacoes_acesso where user_id = v_user;
    begin
      delete from auth.users where id = v_user;
      v_login_apagado := true;
    exception when foreign_key_violation then
      v_login_apagado := false;
      v_motivo := 'A conta tem registros em outros sistemas do grupo; o login foi preservado e só os dados do programa foram apagados.';
    end;
  end if;

  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, detalhe, feito_por)
  values ('acesso_excluido', p_aluno_id, v_user, v_email,
          case when v_login_apagado then 'login e dados do GPS (inclui diário, log de ações e chamados)'
               else 'apenas dados do GPS (inclui diário, log de ações e chamados)'
                    || coalesce(' — ' || v_motivo, '') end,
          auth.uid());

  return jsonb_build_object('login_apagado', v_login_apagado, 'email', v_email,
                            'login_preservado_motivo', v_motivo,
                            'na_lixeira', v_lixeira_id);
end $function$;

-- ─── gatilhos ───────────────────────────────────────────────────────────────
create trigger blindagem_upd after update on public.perfis
  referencing old table as blindagem_old new table as blindagem_new
  for each statement execute function blindagem.vigiar('id', 'cargo,status,email,nivel_hierarquia,areas,eh_dev,pode_ver_cpf_completo,funcoes', 'public.perfis');
create trigger blindagem_del after delete on public.perfis
  referencing old table as blindagem_old
  for each statement execute function blindagem.vigiar('id', '', 'public.perfis');
create trigger blindagem_trunc before truncate on public.perfis
  for each statement execute function blindagem.vigiar('id', '', 'public.perfis');

create trigger blindagem_upd after update on gps.membros
  referencing old table as blindagem_old new table as blindagem_new
  for each statement execute function blindagem.vigiar('id', 'user_id,aluno_id,papel', 'gps.membros');
create trigger blindagem_del after delete on gps.membros
  referencing old table as blindagem_old
  for each statement execute function blindagem.vigiar('id', '', 'gps.membros');
create trigger blindagem_trunc before truncate on gps.membros
  for each statement execute function blindagem.vigiar('id', '', 'gps.membros');

create trigger blindagem_del after delete on gps.ambientes
  referencing old table as blindagem_old
  for each statement execute function blindagem.vigiar('aluno_id', '', 'gps.ambientes');
create trigger blindagem_trunc before truncate on gps.ambientes
  for each statement execute function blindagem.vigiar('aluno_id', '', 'gps.ambientes');

create trigger blindagem_upd after update on public.thb_alunos
  referencing old table as blindagem_old new table as blindagem_new
  for each statement execute function blindagem.vigiar('id', 'email,documento', 'public.thb_alunos');
create trigger blindagem_del after delete on public.thb_alunos
  referencing old table as blindagem_old
  for each statement execute function blindagem.vigiar('id', 'nome,email,documento', 'public.thb_alunos');
create trigger blindagem_trunc before truncate on public.thb_alunos
  for each statement execute function blindagem.vigiar('id', '', 'public.thb_alunos');

create trigger blindagem_somente_inclusao before update or delete on blindagem.auditoria_acesso
  for each row execute function blindagem.somente_inclusao();
create trigger blindagem_somente_inclusao_trunc before truncate on blindagem.auditoria_acesso
  for each statement execute function blindagem.somente_inclusao();
create trigger blindagem_somente_inclusao before update or delete on blindagem.auditoria_funcoes
  for each row execute function blindagem.somente_inclusao();
create trigger blindagem_somente_inclusao_trunc before truncate on blindagem.auditoria_funcoes
  for each statement execute function blindagem.somente_inclusao();

create trigger blindagem_guarda before insert or update or delete on blindagem.config
  for each row execute function blindagem.guarda_tabela();
create trigger blindagem_guarda_trunc before truncate on blindagem.config
  for each statement execute function blindagem.guarda_tabela();
create trigger blindagem_guarda before insert or update or delete on blindagem.restauradores
  for each row execute function blindagem.guarda_tabela();
create trigger blindagem_guarda_trunc before truncate on blindagem.restauradores
  for each statement execute function blindagem.guarda_tabela();

-- ENABLE ALWAYS: o postgres deste projeto pode `set session_replication_role =
-- replica` (supautils.privileged_role_allowed_configs), o que desliga gatilho
-- comum. ALWAYS dispara mesmo assim.
alter table public.perfis            enable always trigger blindagem_upd;
alter table public.perfis            enable always trigger blindagem_del;
alter table public.perfis            enable always trigger blindagem_trunc;
alter table gps.membros              enable always trigger blindagem_upd;
alter table gps.membros              enable always trigger blindagem_del;
alter table gps.membros              enable always trigger blindagem_trunc;
alter table gps.ambientes            enable always trigger blindagem_del;
alter table gps.ambientes            enable always trigger blindagem_trunc;
alter table public.thb_alunos        enable always trigger blindagem_upd;
alter table public.thb_alunos        enable always trigger blindagem_del;
alter table public.thb_alunos        enable always trigger blindagem_trunc;
alter table blindagem.auditoria_acesso  enable always trigger blindagem_somente_inclusao;
alter table blindagem.auditoria_acesso  enable always trigger blindagem_somente_inclusao_trunc;
alter table blindagem.auditoria_funcoes enable always trigger blindagem_somente_inclusao;
alter table blindagem.auditoria_funcoes enable always trigger blindagem_somente_inclusao_trunc;
alter table blindagem.config            enable always trigger blindagem_guarda;
alter table blindagem.config            enable always trigger blindagem_guarda_trunc;
alter table blindagem.restauradores     enable always trigger blindagem_guarda;
alter table blindagem.restauradores     enable always trigger blindagem_guarda_trunc;

-- ─── privilégios (revoke de PUBLIC primeiro: anon/authenticated herdam dele) ─
-- Nenhum grant: tudo do schema é só do dono (postgres) e das funções SECURITY
-- DEFINER dele. Restaurador por JWT só via wrapper futuro (nenhum existe).
revoke all on all tables    in schema blindagem from public, anon, authenticated, service_role;
revoke all on all sequences in schema blindagem from public, anon, authenticated, service_role;
revoke all on all functions in schema blindagem from public, anon, authenticated, service_role;

-- ─── retenção LGPD: cron diário (decisão do João: 180 dias) ────────────────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'blindagem-expurgo') then
    perform cron.unschedule('blindagem-expurgo');
  end if;
  perform cron.schedule('blindagem-expurgo', '30 6 * * *',
    $c$select blindagem.expurgar('retenção LGPD 180 dias (cron diário blindagem-expurgo)')$c$);
end $$;

commit;
