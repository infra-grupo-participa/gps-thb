-- ═══════════════════════════════════════════════════════════════════════════
-- Provas da 20261007000362_blindagem_acesso + 20261007000363_blindagem_funcoes
-- ENSAIO: nada persiste. Tudo roda num único begin e o último bloco termina em
-- RAISE com a saída inteira na mensagem (a transação é desfeita, inclusive o
-- cron.schedule e os event triggers). NÃO trocar o RAISE final por commit:
-- os blocos chamam admin_excluir_acesso, entrada_pelo_codigo e restaurar_txid
-- de verdade sobre dados de teste e sobre perfis reais.
--
-- SEÇÃO 1 é cópia literal das duas migrações (sem begin/commit/set local),
-- para ensaiar ANTES de aplicar. DEPOIS de aplicadas, apague a SEÇÃO 1 e rode
-- só a SEÇÃO 2 (o begin do topo continua).
-- Saídas literais da execução de 07/10/2026 no rodapé (inclui os
-- explain (analyze, buffers) X1–X5).
-- ═══════════════════════════════════════════════════════════════════════════

begin;
set local lock_timeout = '3s';
set local statement_timeout = '25s';

-- ══ SEÇÃO 1 — cópia de 20261007000362 e 20261007000363 ═════════════════════
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 363 — BLINDAGEM DE ACESSO (parte 2/2): guarda de DDL das funções de acesso
-- ═══════════════════════════════════════════════════════════════════════════
-- INCIDENTE (07/10/2026, 17:45): a migração `auth_perfil_sem_autodeclaracao`
-- reescreveu `public.gp_is_admin()` e `public.handle_new_user()` sem aviso.
-- Nada registrou a definição anterior nem quem trocou.
--
-- O QUE ESTA MIGRAÇÃO FAZ
--   Event triggers `blindagem_guarda_ddl` (ddl_command_end) e
--   `blindagem_guarda_drop` (sql_drop), donos `postgres`, molde do precedente
--   vivo `trava_conta_hotmart`. Recusam (42501), sem
--   `select blindagem.autorizar_guarda('<motivo 10+>')` na mesma transação
--   (valor amarrado ao txid: alter role/database set ou set vazado não valem):
--     • CREATE/ALTER/DROP de public.gp_is_admin, gps.aluno_atual,
--       gps.eh_equipe, gps.gerador_sso_dados, public.handle_new_user,
--       public.gps_handle_new_user, a função atual dos gatilhos
--       on_auth_user_created/on_auth_user_created_gps, qualquer função já
--       registrada em auditoria_funcoes (pega RENAME/SET SCHEMA) e blindagem.*;
--     • CREATE/ALTER/DROP TRIGGER blindagem_*, ALTER TABLE que deixe algum
--       gatilho da blindagem fora de ENABLE ALWAYS (DISABLE TRIGGER) e
--       ALTER TABLE em tabela do schema blindagem;
--     • DROP de qualquer objeto do schema blindagem.
--   Com o motivo: passa e grava em blindagem.auditoria_funcoes (antes = último
--   `depois` registrado do objeto; esta migração grava a LINHA DE BASE).
--   Qualquer outro objeto: sai sem tocar em nada. Falha interna na fase de
--   IDENTIFICAÇÃO vira WARNING e o DDL segue — nunca bloqueia DDL alheio.
--   O filtro WHEN TAG impede até o disparo em CREATE TABLE, CREATE INDEX etc.
--   supautils pula event trigger de dono não-superusuário quando quem executa é
--   superusuário (supabase_admin): o DDL da plataforma não passa por aqui.
--
-- AS 5 PERGUNTAS
--   1. Escala: custo por comando DDL, proporcional aos objetos do comando;
--      não depende de tabela nenhuma.
--   2. Índice: lookups por OID em pg_proc/pg_trigger (índices do catálogo);
--      auditoria_funcoes tem (objeto, id) para achar o `antes`.
--   3. Frequência: só em DDL das tags listadas (migrações, dezenas/dia no pico).
--   4. Repetição: um disparo por comando; nada em DML.
--   5. Reversão (sem deploy):
--        alter event trigger blindagem_guarda_ddl  disable;
--        alter event trigger blindagem_guarda_drop disable;
--      ou, de vez (a trilha fica):
--        drop event trigger if exists blindagem_guarda_ddl;
--        drop event trigger if exists blindagem_guarda_drop;
--      (DDL de event trigger não dispara event trigger: não precisa de motivo.)
--
-- COMO MUDAR UMA FUNÇÃO GUARDADA (numa migração, que já roda em transação):
--   select blindagem.autorizar_guarda('gp_is_admin passa a exigir X — pedido do João');
--   create or replace function public.gp_is_admin() ...
-- No SQL editor (autocommit): begin; select blindagem.autorizar_guarda(...); create or replace ...; commit;
-- ═══════════════════════════════════════════════════════════════════════════



create function blindagem.guarda_ddl()
returns event_trigger
language plpgsql
security definer
set search_path = ''
as $f$
declare
  c        record;
  a        jsonb;
  v_alvos  jsonb := '[]'::jsonb;
  v_motivo text;
  v_antes  text;
  v_depois text;
begin
  -- ── Fase 1: identificar. Qualquer falha aqui → WARNING e o DDL segue. ──
  begin
    if tg_event = 'ddl_command_end' then
      for c in
        select d.classid, d.objid, d.command_tag, d.object_identity
          from pg_catalog.pg_event_trigger_ddl_commands() d
         where d.classid in ('pg_catalog.pg_proc'::regclass,
                             'pg_catalog.pg_trigger'::regclass,
                             'pg_catalog.pg_class'::regclass)
      loop
        if c.classid = 'pg_catalog.pg_proc'::regclass then
          if exists (
            select 1
              from pg_catalog.pg_proc p
              join pg_catalog.pg_namespace n on n.oid = p.pronamespace
             where p.oid = c.objid
               and (   n.nspname = 'blindagem'
                    or (n.nspname, p.proname) in (('public', 'gp_is_admin'),
                                                  ('gps', 'aluno_atual'),
                                                  ('gps', 'eh_equipe'),
                                                  ('gps', 'gerador_sso_dados'),
                                                  ('public', 'handle_new_user'),
                                                  ('public', 'gps_handle_new_user'))
                    or p.oid in (select t.tgfoid from pg_catalog.pg_trigger t
                                  where t.tgrelid = 'auth.users'::regclass
                                    and t.tgname in ('on_auth_user_created', 'on_auth_user_created_gps'))
                    or p.oid in (select f.objeto_oid from blindagem.auditoria_funcoes f
                                  where f.objeto_oid is not null))
          ) then
            v_alvos := v_alvos || jsonb_build_object('tipo', 'funcao', 'oid', c.objid,
                                                     'objeto', c.object_identity);
          end if;
        elsif c.classid = 'pg_catalog.pg_trigger'::regclass then
          if exists (
            select 1
              from pg_catalog.pg_trigger t
              join pg_catalog.pg_proc p on p.oid = t.tgfoid
              join pg_catalog.pg_namespace n on n.oid = p.pronamespace
             where t.oid = c.objid
               and (n.nspname = 'blindagem' or t.tgname like 'blindagem\_%')
          ) then
            v_alvos := v_alvos || jsonb_build_object('tipo', 'gatilho', 'oid', c.objid,
                                                     'objeto', c.object_identity);
          end if;
        elsif c.command_tag = 'ALTER TABLE' then
          if exists (
            select 1
              from pg_catalog.pg_trigger t
              join pg_catalog.pg_proc p on p.oid = t.tgfoid
              join pg_catalog.pg_namespace n on n.oid = p.pronamespace
             where t.tgrelid = c.objid
               and n.nspname = 'blindagem'
               and t.tgenabled <> 'A'
          ) or exists (
            select 1
              from pg_catalog.pg_class r
              join pg_catalog.pg_namespace n on n.oid = r.relnamespace
             where r.oid = c.objid and n.nspname = 'blindagem'
          ) then
            v_alvos := v_alvos || jsonb_build_object('tipo', 'gatilho_desligado', 'oid', c.objid,
                                                     'objeto', c.object_identity);
          end if;
        end if;
      end loop;
    elsif tg_event = 'sql_drop' then
      for c in
        select d.object_type, d.schema_name, d.object_name, d.object_identity, d.address_names
          from pg_catalog.pg_event_trigger_dropped_objects() d
      loop
        if    c.schema_name = 'blindagem'
           or (c.object_type = 'schema' and c.object_name = 'blindagem')
           or (c.object_type in ('function', 'procedure')
               and (c.address_names[1], c.address_names[2]) in (('public', 'gp_is_admin'),
                                                                ('gps', 'aluno_atual'),
                                                                ('gps', 'eh_equipe'),
                                                                ('gps', 'gerador_sso_dados'),
                                                                ('public', 'handle_new_user'),
                                                                ('public', 'gps_handle_new_user')))
           or (c.object_type = 'trigger' and c.object_identity like 'blindagem\_% on %') then
          v_alvos := v_alvos || jsonb_build_object('tipo', 'drop_' || c.object_type,
                                                   'objeto', c.object_identity);
        end if;
      end loop;
    end if;
  exception when others then
    raise warning 'blindagem.guarda_ddl: conferência falhou (%: %) — DDL segue sem conferir', sqlstate, sqlerrm;
    return;
  end;

  if jsonb_array_length(v_alvos) = 0 then
    return;
  end if;

  -- ── Fase 2: objeto guardado. Daqui em diante, falha BLOQUEIA (fecha). ──
  v_motivo := blindagem._motivo(current_setting('app.mudanca_guarda', true));
  if v_motivo is null then
    raise exception 'blindagem: % mexe em objeto guardado (%). Autorize na mesma transação: select blindagem.autorizar_guarda(''<motivo com 10+ caracteres>'')',
      tg_tag, (select string_agg(x ->> 'objeto', ', ') from jsonb_array_elements(v_alvos) x)
      using errcode = '42501',
            hint = 'Funções de acesso trocadas sem aviso derrubaram a equipe em 07/10/2026. Emergência (dono postgres): alter event trigger blindagem_guarda_ddl disable; alter event trigger blindagem_guarda_drop disable;';
  end if;

  for a in select x from jsonb_array_elements(v_alvos) x loop
    v_depois := case a ->> 'tipo'
                  when 'funcao'  then pg_catalog.pg_get_functiondef((a ->> 'oid')::oid)
                  when 'gatilho' then pg_catalog.pg_get_triggerdef((a ->> 'oid')::oid)
                  else null
                end;
    begin
      select f.depois into v_antes
        from blindagem.auditoria_funcoes f
       where f.objeto = a ->> 'objeto'
       order by f.id desc
       limit 1;
      insert into blindagem.auditoria_funcoes
        (objeto, objeto_oid, comando, antes, depois, usuario_corrente, jwt_sub, application_name, motivo)
      values (a ->> 'objeto', (a ->> 'oid')::oid, tg_tag, v_antes, v_depois,
              blindagem._papel(), blindagem._jwt_sub(), current_setting('application_name', true), v_motivo);
    exception when undefined_table or undefined_function or invalid_schema_name then
      -- só acontece quando o próprio schema blindagem está sendo removido (com motivo)
      raise warning 'blindagem.guarda_ddl: % autorizado, sem trilha (schema blindagem removido)', tg_tag;
    end;
  end loop;
end
$f$;

revoke all on function blindagem.guarda_ddl() from public, anon, authenticated, service_role;

-- Linha de base: a definição de hoje de cada função guardada vira o `antes`
-- da primeira mudança. objeto = mesma identidade que o event trigger recebe.
insert into blindagem.auditoria_funcoes (objeto, objeto_oid, comando, depois, usuario_corrente, motivo)
select (pg_catalog.pg_identify_object('pg_catalog.pg_proc'::regclass, p.oid, 0)).identity,
       p.oid, 'LINHA DE BASE', pg_catalog.pg_get_functiondef(p.oid), blindagem._papel(),
       'migração 20261007000363: definição vigente em 07/10/2026'
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
 where p.prokind in ('f', 'p')
   and (   n.nspname = 'blindagem'
        or (n.nspname, p.proname) in (('public', 'gp_is_admin'),
                                      ('gps', 'aluno_atual'),
                                      ('gps', 'eh_equipe'),
                                      ('gps', 'gerador_sso_dados'),
                                      ('public', 'handle_new_user'),
                                      ('public', 'gps_handle_new_user'))
        or p.oid in (select t.tgfoid from pg_catalog.pg_trigger t
                      where t.tgrelid = 'auth.users'::regclass
                        and t.tgname in ('on_auth_user_created', 'on_auth_user_created_gps')));

create event trigger blindagem_guarda_ddl on ddl_command_end
  when tag in ('CREATE FUNCTION', 'ALTER FUNCTION', 'CREATE PROCEDURE', 'ALTER PROCEDURE',
               'CREATE TRIGGER', 'ALTER TRIGGER', 'ALTER TABLE')
  execute function blindagem.guarda_ddl();

create event trigger blindagem_guarda_drop on sql_drop
  when tag in ('DROP FUNCTION', 'DROP PROCEDURE', 'DROP ROUTINE', 'DROP TRIGGER',
               'DROP TABLE', 'DROP SCHEMA')
  execute function blindagem.guarda_ddl();

-- dispara mesmo com session_replication_role = replica
alter event trigger blindagem_guarda_ddl  enable always;
alter event trigger blindagem_guarda_drop enable always;


-- ══ SEÇÃO 2 — provas ═══════════════════════════════════════════════════════
create temp table _z_out (n serial, passo text, linha text);
grant all on _z_out to authenticated, anon;
grant usage on sequence _z_out_n_seq to authenticated, anon;

do $t$
declare
  v_joao  uuid := '843d43db-73b3-44a9-b449-1731e362dbc3';
  v_outro uuid;
  v_visu0 int; v_visu1 int; v_visu2 int; v_n bigint; v_aud bigint;
  v_r jsonb; v_st text; v_msg text; v_line text; v_def text;
  v_amb uuid; v_soc uuid; v_alu uuid; v_u1 uuid := gen_random_uuid(); v_x uuid;
  v_a0 bigint; v_a1 bigint;
begin
  select id into v_outro from public.perfis
   where status='ativo' and cargo in ('dev','admin') and email ilike '%@advmais.com'
     and id not in (v_joao, '3bd183e5-34bf-4d4a-9ee9-b9cae2ed4975') limit 1;

  select count(*) filter (where cargo='visualizador') into v_visu0 from public.perfis where email ilike '%@advmais.com';
  insert into _z_out(passo,linha) select 'P0 base', format('advmais=%s visualizador=%s; gatilhos ALWAYS=%s de %s; event triggers=%s',
     (select count(*) from public.perfis where email ilike '%@advmais.com'), v_visu0,
     (select count(*) from pg_trigger t join pg_proc p on p.oid=t.tgfoid where p.pronamespace='blindagem'::regnamespace and t.tgenabled='A'),
     (select count(*) from pg_trigger t join pg_proc p on p.oid=t.tgfoid where p.pronamespace='blindagem'::regnamespace),
     (select string_agg(evtname||'='||evtenabled::text, ',') from pg_event_trigger where evtname like 'blindagem%'));

  begin
    update public.perfis set cargo='visualizador' where email ilike '%@advmais.com';
    insert into _z_out(passo,linha) values ('a sem motivo','ERRO DO ENSAIO: passou');
  exception when others then
    get stacked diagnostics v_st = returned_sqlstate, v_msg = message_text;
    insert into _z_out(passo,linha) values ('a sem motivo', v_st||' '||left(v_msg,75));
  end;
  begin
    set local session_replication_role = replica;
    update public.perfis set cargo='visualizador' where email ilike '%@advmais.com';
    insert into _z_out(passo,linha) values ('a2 replica','ERRO DO ENSAIO: passou');
  exception when others then
    get stacked diagnostics v_st = returned_sqlstate, v_msg = message_text;
    insert into _z_out(passo,linha) values ('a2 replica', v_st||' '||left(v_msg,60));
  end;
  set local session_replication_role = origin;

  perform blindagem.autorizar('ensaio blindagem 07/10');
  update public.perfis set cargo='visualizador' where email ilike '%@advmais.com';
  get diagnostics v_n = row_count;
  select count(*) into v_aud from blindagem.auditoria_acesso where txid = txid_current() and tabela='public.perfis' and op='UPDATE';
  select count(*) filter (where cargo='visualizador') into v_visu1 from public.perfis where email ilike '%@advmais.com';
  insert into _z_out(passo,linha) values ('b com motivo', format('passou; row_count=%s; mudaram=%s; auditadas=%s; autorizado=%s; motivo=%s',
     v_n, v_visu1 - v_visu0, v_aud,
     (select string_agg(distinct autorizado::text, ',') from blindagem.auditoria_acesso where txid=txid_current()),
     (select string_agg(distinct motivo, ',') from blindagem.auditoria_acesso where txid=txid_current())));
  perform set_config('app.mudanca_em_massa','',true);

  v_r := blindagem.restaurar_txid(txid_current(), 'ensaio restaura');
  select count(*) filter (where cargo='visualizador') into v_visu2 from public.perfis where email ilike '%@advmais.com';
  insert into _z_out(passo,linha) values ('c restaurar postgres', format('restauradas=%s conflitos=%s apagados_nao_reinseridos=%s; visualizador %s -> %s (base %s); flag depois=[%s]',
     v_r->>'restauradas', v_r->>'conflitos', v_r->>'apagados_nao_reinseridos', v_visu1, v_visu2, v_visu0, current_setting('app.mudanca_em_massa', true)));

  perform set_config('request.jwt.claims', json_build_object('sub',v_outro,'role','authenticated')::text, true);
  begin
    perform blindagem.restaurar_txid(1, 'tentativa de nao restaurador');
    insert into _z_out(passo,linha) values ('c2 nao restaurador','ERRO DO ENSAIO: passou');
  exception when others then
    get stacked diagnostics v_st = returned_sqlstate, v_msg = message_text;
    insert into _z_out(passo,linha) values ('c2 nao restaurador', v_st||' '||v_msg);
  end;
  perform set_config('request.jwt.claims', json_build_object('sub',v_joao,'role','authenticated')::text, true);
  v_r := blindagem.restaurar_txid(1, 'guarda do restaurador');
  insert into _z_out(passo,linha) values ('c3 JWT Joao', 'passou: '||(v_r - 'detalhe')::text);
  begin
    perform blindagem.restaurar_txid(1, 'curto');
    insert into _z_out(passo,linha) values ('c4 motivo curto','ERRO DO ENSAIO: passou');
  exception when others then
    get stacked diagnostics v_st = returned_sqlstate, v_msg = message_text;
    insert into _z_out(passo,linha) values ('c4 motivo curto', v_st);
  end;

  select t.aluno_id, s.id into v_amb, v_soc
    from gps.membros t join gps.membros s on s.aluno_id=t.aluno_id and s.papel='socio' and s.user_id is not null
   where t.papel='titular' and t.user_id is not null and not gps.admin_alvo_e_equipe(s.user_id) limit 1;
  select count(*) into v_a0 from blindagem.auditoria_acesso where txid=txid_current() and tabela='gps.membros';
  begin
    set local role authenticated;
    v_r := gps.admin_trocar_titular(v_amb, v_soc);
    reset role;
    select count(*) into v_a1 from blindagem.auditoria_acesso where txid=txid_current() and tabela='gps.membros';
    insert into _z_out(passo,linha) values ('d admin_trocar_titular', format('passou; auditadas=%s (%s); usuario_corrente=%s',
      v_a1 - v_a0,
      (select string_agg((antes->>'papel')||'->'||(depois->>'papel'), ' , ' order by id) from blindagem.auditoria_acesso where txid=txid_current() and tabela='gps.membros'),
      (select string_agg(distinct usuario_corrente, ',') from blindagem.auditoria_acesso where txid=txid_current() and tabela='gps.membros')));
  exception when others then
    reset role;
    get stacked diagnostics v_st = returned_sqlstate, v_msg = message_text;
    insert into _z_out(passo,linha) values ('d admin_trocar_titular', 'ERRO DO ENSAIO: '||v_st||' '||v_msg);
  end;

  perform set_config('request.jwt.claims', '', true);
  insert into public.thb_alunos (nome, email)
  values ('ALUNO DE TESTE BLINDAGEM (ensaio)', 'ensaio.blindagem.'||substr(md5(random()::text),1,10)||'@exemplo.invalid')
  returning id into v_alu;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', v_u1, 'authenticated', 'authenticated',
    'ensaio.blindagem.tit.'||substr(md5(random()::text),1,10)||'@exemplo.invalid', '', now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, '', '', '', '');
  insert into gps.membros (aluno_id, user_id, papel) values (v_alu, v_u1, 'titular');
  insert into gps.membros (aluno_id, user_id, papel) values (v_alu, null, 'socio');
  perform set_config('request.jwt.claims', json_build_object('sub',v_joao,'role','authenticated')::text, true);
  begin
    set local role authenticated;
    v_r := gps.admin_excluir_acesso(v_alu, true);
    reset role;
    insert into _z_out(passo,linha) values ('e admin_excluir_acesso', format('passou; membros restantes=%s ambiente=%s; auditadas DELETE membros=%s ambientes=%s',
      (select count(*) from gps.membros where aluno_id=v_alu), (select count(*) from gps.ambientes where aluno_id=v_alu),
      (select count(*) from blindagem.auditoria_acesso where txid=txid_current() and tabela='gps.membros' and op='DELETE' and antes->>'aluno_id'=v_alu::text),
      (select count(*) from blindagem.auditoria_acesso where txid=txid_current() and tabela='gps.ambientes' and op='DELETE' and pk->>'id'=v_alu::text)));
  exception when others then
    reset role;
    get stacked diagnostics v_st = returned_sqlstate, v_msg = message_text;
    insert into _z_out(passo,linha) values ('e admin_excluir_acesso', 'ERRO DO ENSAIO: '||v_st||' '||v_msg);
  end;

  begin
    set local role authenticated;
    perform count(*) from blindagem.auditoria_acesso;
    reset role;
    insert into _z_out(passo,linha) values ('g authenticated','ERRO DO ENSAIO: leu');
  exception when others then
    reset role;
    get stacked diagnostics v_st = returned_sqlstate, v_msg = message_text;
    insert into _z_out(passo,linha) values ('g authenticated', v_st||' '||v_msg);
  end;
  begin
    set local role anon;
    perform count(*) from blindagem.auditoria_acesso;
    reset role;
    insert into _z_out(passo,linha) values ('g2 anon','ERRO DO ENSAIO: leu');
  exception when others then
    reset role;
    get stacked diagnostics v_st = returned_sqlstate, v_msg = message_text;
    insert into _z_out(passo,linha) values ('g2 anon', v_st||' '||v_msg);
  end;
  perform set_config('request.jwt.claims', '', true);
  insert into _z_out(passo,linha) select 'g3 ACL', format('funcoes=%s; EXECUTE anon=%s authenticated=%s(%s) service_role=%s; PUBLIC=%s; tabelas abertas=%s; USAGE=%s',
     count(*), count(*) filter (where has_function_privilege('anon',p.oid,'execute')),
     count(*) filter (where has_function_privilege('authenticated',p.oid,'execute')),
     string_agg(p.proname, ',') filter (where has_function_privilege('authenticated',p.oid,'execute')),
     count(*) filter (where has_function_privilege('service_role',p.oid,'execute')),
     count(*) filter (where exists (select 1 from unnest(p.proacl) a where a::text like '=%')),
     (select count(*) from pg_class c where c.relnamespace='blindagem'::regnamespace and c.relkind='r'
        and (has_table_privilege('anon',c.oid,'select,insert,update,delete') or has_table_privilege('authenticated',c.oid,'select,insert,update,delete') or has_table_privilege('service_role',c.oid,'select,insert,update,delete'))),
     has_schema_privilege('authenticated','blindagem','usage'))
    from pg_proc p where p.pronamespace='blindagem'::regnamespace;

  begin
    update blindagem.auditoria_acesso set motivo='x' where id=(select max(id) from blindagem.auditoria_acesso);
    insert into _z_out(passo,linha) values ('f update','ERRO DO ENSAIO: passou');
  exception when others then
    get stacked diagnostics v_st = returned_sqlstate;
    insert into _z_out(passo,linha) values ('f update', v_st);
  end;
  begin
    delete from blindagem.auditoria_acesso where id=(select max(id) from blindagem.auditoria_acesso);
    insert into _z_out(passo,linha) values ('f delete','ERRO DO ENSAIO: passou');
  exception when others then
    get stacked diagnostics v_st = returned_sqlstate;
    insert into _z_out(passo,linha) values ('f delete', v_st);
  end;
  begin
    perform set_config('blindagem.expurgo', txid_current()::text||':180', true);
    delete from blindagem.auditoria_acesso where id=(select max(id) from blindagem.auditoria_acesso);
    insert into _z_out(passo,linha) values ('f2 delete recente c/ flag','ERRO DO ENSAIO: passou');
  exception when others then
    get stacked diagnostics v_st = returned_sqlstate;
    insert into _z_out(passo,linha) values ('f2 delete recente c/ flag', v_st);
  end;
  perform set_config('blindagem.expurgo','',true);
  begin
    truncate blindagem.auditoria_acesso;
    insert into _z_out(passo,linha) values ('f truncate','ERRO DO ENSAIO: passou');
  exception when others then
    get stacked diagnostics v_st = returned_sqlstate;
    insert into _z_out(passo,linha) values ('f truncate', v_st);
  end;
  begin
    update blindagem.auditoria_funcoes set motivo='x' where id=(select max(id) from blindagem.auditoria_funcoes);
    insert into _z_out(passo,linha) values ('f update auditoria_funcoes','ERRO DO ENSAIO: passou');
  exception when others then
    get stacked diagnostics v_st = returned_sqlstate;
    insert into _z_out(passo,linha) values ('f update auditoria_funcoes', v_st);
  end;
  v_r := blindagem.expurgar('ensaio do expurgo LGPD');
  insert into _z_out(passo,linha) values ('f3 expurgar', v_r::text);
  begin
    update blindagem.config set modo='observar' where tabela='public.perfis';
    insert into _z_out(passo,linha) values ('f4 config sem guarda','ERRO DO ENSAIO: passou');
  exception when others then
    get stacked diagnostics v_st = returned_sqlstate;
    insert into _z_out(passo,linha) values ('f4 config sem guarda', v_st);
  end;
  begin
    truncate gps.membros;
    insert into _z_out(passo,linha) values ('f5 truncate membros','ERRO DO ENSAIO: passou');
  exception when others then
    get stacked diagnostics v_st = returned_sqlstate;
    insert into _z_out(passo,linha) values ('f5 truncate membros', v_st);
  end;

  v_def := pg_get_functiondef('public.gp_is_admin()'::regprocedure);
  begin
    execute v_def;
    insert into _z_out(passo,linha) values ('h gp_is_admin sem guarda','ERRO DO ENSAIO: passou');
  exception when others then
    get stacked diagnostics v_st = returned_sqlstate, v_msg = message_text;
    insert into _z_out(passo,linha) values ('h gp_is_admin sem guarda', v_st||' '||left(v_msg,70));
  end;
  perform blindagem.autorizar_guarda('ensaio blindagem 07/10');
  execute v_def;
  insert into _z_out(passo,linha) select 'h2 gp_is_admin com guarda', format('passou; registros=%s; antes=depois=%s; antes da linha de base=%s',
     count(*), bool_and(antes = depois), bool_and(antes is not null))
    from blindagem.auditoria_funcoes where objeto='public.gp_is_admin()' and comando <> 'LINHA DE BASE';
  perform set_config('app.mudanca_guarda','',true);
  begin
    alter table public.perfis disable trigger blindagem_upd;
    insert into _z_out(passo,linha) values ('h3 disable trigger','ERRO DO ENSAIO: passou');
  exception when others then
    get stacked diagnostics v_st = returned_sqlstate;
    insert into _z_out(passo,linha) values ('h3 disable trigger', v_st);
  end;
  begin
    drop trigger blindagem_del on gps.ambientes;
    insert into _z_out(passo,linha) values ('h4 drop trigger','ERRO DO ENSAIO: passou');
  exception when others then
    get stacked diagnostics v_st = returned_sqlstate;
    insert into _z_out(passo,linha) values ('h4 drop trigger', v_st);
  end;
  begin
    alter function public.gp_is_admin() rename to gp_is_admin_ensaio;
    insert into _z_out(passo,linha) values ('h5 rename','ERRO DO ENSAIO: passou');
  exception when others then
    get stacked diagnostics v_st = returned_sqlstate;
    insert into _z_out(passo,linha) values ('h5 rename', v_st);
  end;
  begin
    drop function blindagem._papel();
    insert into _z_out(passo,linha) values ('h6 drop blindagem._papel','ERRO DO ENSAIO: passou');
  exception when others then
    get stacked diagnostics v_st = returned_sqlstate;
    insert into _z_out(passo,linha) values ('h6 drop blindagem._papel', v_st);
  end;
  begin
    execute pg_get_functiondef('public.handle_new_user()'::regprocedure);
    insert into _z_out(passo,linha) values ('h7 handle_new_user','ERRO DO ENSAIO: passou');
  exception when others then
    get stacked diagnostics v_st = returned_sqlstate;
    insert into _z_out(passo,linha) values ('h7 handle_new_user', v_st);
  end;
  begin
    alter table blindagem.auditoria_acesso drop column antes;
    insert into _z_out(passo,linha) values ('h8 alter auditoria','ERRO DO ENSAIO: passou');
  exception when others then
    get stacked diagnostics v_st = returned_sqlstate;
    insert into _z_out(passo,linha) values ('h8 alter auditoria', v_st);
  end;

  begin
    create temp table _z_k (x int);
    alter table _z_k add column y int;
    create function pg_temp.z_k() returns int language sql as 'select 1';
    create table public._z_blindagem_ensaio (x int);
    alter table public._z_blindagem_ensaio add column y int;
    create function public._z_blindagem_ensaio_fn() returns int language sql as 'select 1';
    drop function public._z_blindagem_ensaio_fn();
    drop table public._z_blindagem_ensaio;
    alter table public.perfis alter column time set default null;
    insert into _z_out(passo,linha) values ('k DDL alheio','passou: 9 comandos');
  exception when others then
    get stacked diagnostics v_st = returned_sqlstate, v_msg = message_text;
    insert into _z_out(passo,linha) values ('k DDL alheio', 'ERRO DO ENSAIO: '||v_st||' '||v_msg);
  end;

  select id into v_x from public.perfis where cargo='visualizador' and status='ativo' and email ilike '%@advmais.com' limit 1;
  for v_line in execute format('explain (analyze, buffers, costs off, timing on) update public.perfis set status = %L where id = %L', 'negado', v_x) loop
    if v_line ~ '(Index Scan|blindagem|Execution)' then
      insert into _z_out(passo,linha) values ('i perfis 1 linha', btrim(v_line));
    end if;
  end loop;
  select m.id into v_x from gps.membros m
   where m.papel='socio' and m.user_id is not null
     and not exists (select 1 from gps.membros o where o.aluno_id=m.aluno_id and o.user_id is null) limit 1;
  for v_line in execute format('explain (analyze, buffers, costs off, timing on) update gps.membros set user_id = null where id = %L', v_x) loop
    if v_line ~ '(Index Scan|blindagem|Execution)' then
      insert into _z_out(passo,linha) values ('i membros 1 linha', btrim(v_line));
    end if;
  end loop;

  select count(*) into v_a0 from blindagem.auditoria_acesso where txid=txid_current() and tabela='public.thb_alunos';
  update public.thb_alunos set canal_aquisicao = canal_aquisicao where id in (select id from public.thb_alunos order by id limit 300);
  get diagnostics v_n = row_count;
  insert into _z_out(passo,linha) values ('j1 thb 300 no-op', format('passou; row_count=%s', v_n));
  for v_line in execute 'explain (analyze, buffers, costs off, timing on) update public.thb_alunos set canal_aquisicao = coalesce(canal_aquisicao, '''') || ''~ensaio'' where id in (select id from public.thb_alunos order by id limit 300)' loop
    if v_line ~ '(blindagem|Execution)' then
      insert into _z_out(passo,linha) values ('j2 thb 300 canal muda', btrim(v_line));
    end if;
  end loop;
  select count(*) into v_a1 from blindagem.auditoria_acesso where txid=txid_current() and tabela='public.thb_alunos';
  insert into _z_out(passo,linha) values ('j3 auditadas thb', format('%s (esperado 0)', v_a1 - v_a0));
  update public.thb_alunos set email = email || '.ensaio' where id in (select id from public.thb_alunos where email is not null order by id limit 60);
  get diagnostics v_n = row_count;
  select count(*) into v_a1 from blindagem.auditoria_acesso where txid=txid_current() and tabela='public.thb_alunos';
  insert into _z_out(passo,linha) values ('j4 thb observar 60 e-mails', format('passou; row_count=%s; auditadas=%s', v_n, v_a1 - v_a0));
end
$t$;

do $t$
declare
  v_joao uuid := '843d43db-73b3-44a9-b449-1731e362dbc3';
  v_orf uuid[] := '{}'; v_id uuid; v_alu uuid; v_email text; v_r jsonb; v_st text; v_msg text; i int; v_cod text;
  v_u uuid; v_tx bigint := txid_current(); v_def text; v_t2 uuid;
begin
  -- D0 corpos recriados = arquivo (vivo + linhas de autorização)
  insert into _z_out(passo,linha) select 'D0 corpos recriados',
    format('entrada=arquivo:%s; excluir=arquivo:%s; ACL entrada=%s; ACL excluir=%s',
      pg_get_functiondef('gps.entrada_pelo_codigo(text,text,text)'::regprocedure) = $novo1$CREATE OR REPLACE FUNCTION gps.entrada_pelo_codigo(p_email text, p_codigo text, p_ip_hash text DEFAULT NULL::text)
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
$function$
$novo1$,
      pg_get_functiondef('gps.admin_excluir_acesso(uuid,boolean)'::regprocedure) = $novo2$CREATE OR REPLACE FUNCTION gps.admin_excluir_acesso(p_aluno_id uuid, p_confirmar_perda boolean DEFAULT false)
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
end $function$
$novo2$,
      (select array_to_string(proacl,',') from pg_proc where oid='gps.entrada_pelo_codigo(text,text,text)'::regprocedure),
      (select array_to_string(proacl,',') from pg_proc where oid='gps.admin_excluir_acesso(uuid,boolean)'::regprocedure));

  -- N1 colunas sensíveis novas de perfis
  begin
    update public.perfis set eh_dev = not coalesce(eh_dev, false) where email ilike '%@advmais.com';
    insert into _z_out(passo,linha) values ('N1 perfis eh_dev em massa sem autorizar','ERRO DO ENSAIO: passou');
  exception when others then
    get stacked diagnostics v_st = returned_sqlstate, v_msg = message_text;
    insert into _z_out(passo,linha) values ('N1 perfis eh_dev em massa sem autorizar', v_st||' '||left(v_msg,75));
  end;
  begin
    update public.perfis set pode_ver_cpf_completo = not coalesce(pode_ver_cpf_completo, false), funcoes = funcoes || '{ensaio}'::text[], areas = areas || '{ensaio}'::text[]
     where email ilike '%@advmais.com';
    insert into _z_out(passo,linha) values ('N1b perfis cpf/funcoes/areas sem autorizar','ERRO DO ENSAIO: passou');
  exception when others then
    get stacked diagnostics v_st = returned_sqlstate, v_msg = message_text;
    insert into _z_out(passo,linha) values ('N1b perfis cpf/funcoes/areas sem autorizar', v_st||' '||left(v_msg,75));
  end;
  begin
    update public.perfis set nivel_hierarquia = 'visualizador' where email ilike '%@advmais.com';
    insert into _z_out(passo,linha) values ('N1c perfis nivel_hierarquia sem autorizar','ERRO DO ENSAIO: passou');
  exception when others then
    get stacked diagnostics v_st = returned_sqlstate, v_msg = message_text;
    insert into _z_out(passo,linha) values ('N1c perfis nivel_hierarquia sem autorizar', v_st||' '||left(v_msg,75));
  end;

  -- N2 autorização amarrada ao txid
  begin
    set app.mudanca_em_massa = '123:motivo longo aqui';  -- simula alter role/database set ou set vazado em pool
    update public.perfis set cargo='visualizador' where email ilike '%@advmais.com';
    insert into _z_out(passo,linha) values ('N2 set app.mudanca_em_massa=123:... (txid errado)','ERRO DO ENSAIO: passou');
  exception when others then
    get stacked diagnostics v_st = returned_sqlstate, v_msg = message_text;
    insert into _z_out(passo,linha) values ('N2 set app.mudanca_em_massa=123:... (txid errado)', v_st||' '||left(v_msg,60));
  end;
  begin
    perform set_config('app.mudanca_em_massa', txid_current()::text||':curto', true);
    update public.perfis set cargo='visualizador' where email ilike '%@advmais.com';
    insert into _z_out(passo,linha) values ('N2b txid certo, motivo curto','ERRO DO ENSAIO: passou');
  exception when others then
    get stacked diagnostics v_st = returned_sqlstate;
    insert into _z_out(passo,linha) values ('N2b txid certo, motivo curto', v_st);
  end;
  begin
    perform set_config('app.mudanca_em_massa', 'motivo antigo sem txid nenhum', true);
    update public.perfis set cargo='visualizador' where email ilike '%@advmais.com';
    insert into _z_out(passo,linha) values ('N2c formato antigo (sem txid)','ERRO DO ENSAIO: passou');
  exception when others then
    get stacked diagnostics v_st = returned_sqlstate;
    insert into _z_out(passo,linha) values ('N2c formato antigo (sem txid)', v_st);
  end;
  begin
    perform blindagem.autorizar('ensaio N2 autorizado');
    update public.perfis set cargo='visualizador' where email ilike '%@advmais.com';
    v_msg := format('passou; motivo gravado=%s',
      (select string_agg(distinct motivo, ',') from blindagem.auditoria_acesso where txid=txid_current() and motivo like 'ensaio N2%'));
    raise exception '%', v_msg using errcode = 'P0009';
  exception when sqlstate 'P0009' then
    get stacked diagnostics v_msg = message_text;
    insert into _z_out(passo,linha) values ('N2d blindagem.autorizar (desfeito)', v_msg);
  when others then
    get stacked diagnostics v_st = returned_sqlstate, v_msg = message_text;
    insert into _z_out(passo,linha) values ('N2d blindagem.autorizar', 'ERRO DO ENSAIO: '||v_st||' '||v_msg);
  end;
  perform set_config('app.mudanca_em_massa', '', true);
  begin
    set app.mudanca_guarda = '999:motivo longo de guarda';
    execute pg_get_functiondef('public.gp_is_admin()'::regprocedure);
    insert into _z_out(passo,linha) values ('N2e guarda com txid errado','ERRO DO ENSAIO: passou');
  exception when others then
    get stacked diagnostics v_st = returned_sqlstate;
    insert into _z_out(passo,linha) values ('N2e guarda com txid errado', v_st);
  end;
  perform set_config('app.mudanca_guarda', '', true);
  insert into _z_out(passo,linha) values ('N2f autorizar executável por', format('authenticated=%s anon=%s service_role=%s',
     has_function_privilege('authenticated','blindagem.autorizar(text)','execute'),
     has_function_privilege('anon','blindagem.autorizar(text)','execute'),
     has_function_privilege('service_role','blindagem.autorizar(text)','execute')));

  -- N3 admin_excluir_acesso com 6 membros
  perform set_config('request.jwt.claims', '', true);
  insert into public.thb_alunos (nome, email) values ('AMBIENTE 6 MEMBROS TESTE BLINDAGEM', 'seis.'||substr(md5(random()::text),1,8)||'@exemplo.invalid') returning id into v_t2;
  for i in 1..5 loop
    v_u := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', v_u, 'authenticated', 'authenticated',
      'seis.'||i||'.'||substr(md5(random()::text),1,8)||'@exemplo.invalid', '', now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, '', '', '', '');
    insert into gps.membros (aluno_id, user_id, papel) values (v_t2, v_u, case when i = 1 then 'titular' else 'socio' end);
  end loop;
  insert into gps.membros (aluno_id, user_id, papel) values (v_t2, null, 'socio');
  perform set_config('app.mudanca_em_massa', 'sentinela-anterior', true);
  perform set_config('request.jwt.claims', json_build_object('sub',v_joao,'role','authenticated')::text, true);
  begin
    set local role authenticated;
    v_r := gps.admin_excluir_acesso(v_t2, true);
    reset role;
    insert into _z_out(passo,linha) values ('N3 admin_excluir_acesso 6 membros', format('passou; membros restantes=%s; auditadas DELETE membros=%s ambientes=%s; motivo=%s; autorizado=%s; valor anterior devolvido=%s',
      (select count(*) from gps.membros where aluno_id=v_t2),
      (select count(*) from blindagem.auditoria_acesso where txid=txid_current() and tabela='gps.membros' and op='DELETE' and antes->>'aluno_id'=v_t2::text),
      (select count(*) from blindagem.auditoria_acesso where txid=txid_current() and tabela='gps.ambientes' and op='DELETE' and pk->>'id'=v_t2::text),
      (select string_agg(distinct motivo, ',') from blindagem.auditoria_acesso where txid=txid_current() and tabela in ('gps.membros','gps.ambientes') and (antes->>'aluno_id'=v_t2::text or pk->>'id'=v_t2::text)),
      (select string_agg(distinct autorizado::text, ',') from blindagem.auditoria_acesso where txid=txid_current() and tabela in ('gps.membros','gps.ambientes') and (antes->>'aluno_id'=v_t2::text or pk->>'id'=v_t2::text)),
      current_setting('app.mudanca_em_massa', true) = 'sentinela-anterior'));
  exception when others then
    reset role;
    get stacked diagnostics v_st = returned_sqlstate, v_msg = message_text;
    insert into _z_out(passo,linha) values ('N3 admin_excluir_acesso 6 membros', 'ERRO DO ENSAIO: '||v_st||' '||v_msg);
  end;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.mudanca_em_massa', '', true);

  -- E0–E2 órfãos via entrada_pelo_codigo
  for i in 1..4 loop
    insert into public.thb_alunos (nome, email) values ('ORFAO TESTE BLINDAGEM '||i, 'orfao.'||i||'.'||substr(md5(random()::text),1,8)||'@exemplo.invalid') returning id into v_id;
    insert into gps.ambientes (aluno_id) values (v_id);
    v_orf := v_orf || v_id;
  end loop;
  v_email := 'entrada.'||substr(md5(random()::text),1,8)||'@exemplo.invalid';
  insert into public.thb_alunos (nome, email) values ('ALUNO TESTE ENTRADA (ensaio)', v_email) returning id into v_alu;
  insert into gps.membros (aluno_id, user_id, papel) values (v_alu, null, 'titular');
  v_cod := 'ensaio-'||substr(md5(random()::text),1,8);
  update gps.config set valor = v_cod where chave = 'resgate_codigo';
  if not found then insert into gps.config (chave, valor) values ('resgate_codigo', v_cod); end if;
  insert into _z_out(passo,linha) values ('E0 antes', format('orfaos=%s', (select count(*) from gps.ambientes g where not exists (select 1 from gps.membros m where m.aluno_id=g.aluno_id))));
  perform set_config('app.mudanca_em_massa', 'sentinela-anterior', true);
  begin
    v_r := gps.entrada_pelo_codigo(v_email, v_cod, 'ensaio-blindagem');
    insert into _z_out(passo,linha) values ('E1 entrada_pelo_codigo', format('passou; orfaos de teste restantes=%s; auditadas DELETE=%s; motivo=%s; autorizado=%s; valor anterior devolvido=%s',
      (select count(*) from gps.ambientes where aluno_id = any(v_orf)),
      (select count(*) from blindagem.auditoria_acesso where txid=txid_current() and tabela='gps.ambientes' and op='DELETE' and (pk->>'id')::uuid = any(v_orf)),
      (select string_agg(distinct motivo, ',') from blindagem.auditoria_acesso where txid=txid_current() and tabela='gps.ambientes' and (pk->>'id')::uuid = any(v_orf)),
      (select string_agg(distinct autorizado::text, ',') from blindagem.auditoria_acesso where txid=txid_current() and tabela='gps.ambientes' and (pk->>'id')::uuid = any(v_orf)),
      current_setting('app.mudanca_em_massa', true) = 'sentinela-anterior'));
  exception when others then
    get stacked diagnostics v_st = returned_sqlstate, v_msg = message_text;
    insert into _z_out(passo,linha) values ('E1 entrada_pelo_codigo', 'ERRO DO ENSAIO: '||v_st||' '||v_msg);
  end;
  perform set_config('app.mudanca_em_massa', '', true);
  v_orf := '{}';
  for i in 1..3 loop
    insert into public.thb_alunos (nome, email) values ('ORFAO2 TESTE BLINDAGEM '||i, 'orfao2.'||i||'.'||substr(md5(random()::text),1,8)||'@exemplo.invalid') returning id into v_id;
    insert into gps.ambientes (aluno_id) values (v_id);
    v_orf := v_orf || v_id;
  end loop;
  begin
    delete from gps.ambientes where aluno_id = any(v_orf);
    insert into _z_out(passo,linha) values ('E2 delete 3 orfaos sem autorizar','ERRO DO ENSAIO: passou');
  exception when others then
    get stacked diagnostics v_st = returned_sqlstate, v_msg = message_text;
    insert into _z_out(passo,linha) values ('E2 delete 3 orfaos sem autorizar', v_st||' '||left(v_msg,75));
  end;

  -- L LGPD: DELETE em thb_alunos audita 4 colunas e não é restaurável
  delete from gps.ambientes where aluno_id = v_orf[1];
  delete from public.thb_alunos where id = v_orf[1];
  insert into _z_out(passo,linha) select 'L1 DELETE thb auditado', format('linhas=%s; chaves de antes=%s; restauravel=%s',
     count(*), string_agg(distinct (select string_agg(k, ',' order by k) from jsonb_object_keys(antes) k), ' | '), string_agg(distinct restauravel::text, ','))
    from blindagem.auditoria_acesso where txid=txid_current() and tabela='public.thb_alunos' and op='DELETE';
  v_r := blindagem.restaurar_txid(txid_current(), 'ensaio LGPD restaurar padrao');
  insert into _z_out(passo,linha) values ('L2 restaurar padrão (sem reinserir)', (v_r - 'detalhe')::text);
  v_r := blindagem.restaurar_txid(txid_current(), 'ensaio LGPD reinserir apagados', true);
  insert into _z_out(passo,linha) values ('L3 restaurar com reinserir', format('%s; thb apagado voltou=%s', (v_r - 'detalhe')::text,
     exists(select 1 from public.thb_alunos where id = v_orf[1])));
  v_r := blindagem.expurgar_titular('public.thb_alunos', v_orf[1]::text, 'pedido do titular (ensaio LGPD)');
  insert into _z_out(passo,linha) select 'L4 expurgar_titular', format('%s; restam do titular=%s; registro do expurgo tem id do titular=%s',
     v_r, (select count(*) from blindagem.auditoria_acesso where tabela='public.thb_alunos' and pk->>'id' = v_orf[1]::text),
     (select bool_or(pk ? 'id' or pk::text like '%'||v_orf[1]::text||'%') from blindagem.auditoria_acesso where op='EXPURGO'));
  insert into _z_out(passo,linha) select 'L5 cron', coalesce(string_agg(jobname||' '||schedule||' ativo='||active::text||' '||command, ' | '), 'AUSENTE')
    from cron.job where jobname = 'blindagem-expurgo';
end
$t$;

-- ── X. explain (analyze, buffers) — DML dentro da transação de ensaio ─────
do $x$
declare
  v_line text; v_ids uuid[]; v_alu uuid; v_u uuid := gen_random_uuid(); v_a0 bigint; v_a1 bigint;
begin
  -- X1 UPDATE perfis 1 linha (coluna sensível muda; 1 <= limite, sem autorizar)
  select array_agg(id) into v_ids from (select id from public.perfis where email ilike '%@advmais.com' and status = 'ativo' order by id limit 1) s;
  for v_line in execute format('explain (analyze, buffers) update public.perfis set status = %L where id = any(%L::uuid[])', 'negado', v_ids) loop
    insert into _z_out(passo,linha) values ('X1 perfis UPDATE 1 linha', v_line);
  end loop;
  -- X2 UPDATE perfis 4 linhas (acima do limite 3: exige autorizar)
  select array_agg(id) into v_ids from (select id from public.perfis where email ilike '%@advmais.com' and status = 'ativo' order by id offset 1 limit 4) s;
  perform blindagem.autorizar('verificacao 362: explain de 4 linhas');
  for v_line in execute format('explain (analyze, buffers) update public.perfis set status = %L where id = any(%L::uuid[])', 'negado', v_ids) loop
    insert into _z_out(passo,linha) values ('X2 perfis UPDATE 4 linhas (autorizar)', v_line);
  end loop;
  perform set_config('app.mudanca_em_massa', '', true);
  -- X3 DELETE gps.membros de um ambiente de teste (titular + sócio)
  insert into public.thb_alunos (nome, email) values ('X3 TESTE BLINDAGEM', 'x3.'||substr(md5(random()::text),1,8)||'@exemplo.invalid') returning id into v_alu;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', v_u, 'authenticated', 'authenticated',
    'x3u.'||substr(md5(random()::text),1,8)||'@exemplo.invalid', '', now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, '', '', '', '');
  insert into gps.membros (aluno_id, user_id, papel) values (v_alu, v_u, 'titular');
  insert into gps.membros (aluno_id, user_id, papel) values (v_alu, null, 'socio');
  for v_line in execute format('explain (analyze, buffers) delete from gps.membros where aluno_id = %L', v_alu) loop
    insert into _z_out(passo,linha) values ('X3 membros DELETE 2 linhas (ambiente de teste)', v_line);
  end loop;
  -- X4 UPDATE 300 linhas de thb_alunos em coluna NÃO sensível
  select count(*) into v_a0 from blindagem.auditoria_acesso where txid = txid_current() and tabela = 'public.thb_alunos';
  for v_line in execute 'explain (analyze, buffers) update public.thb_alunos set canal_aquisicao = coalesce(canal_aquisicao, '''') || ''~x4'' where id in (select id from public.thb_alunos order by id limit 300)' loop
    insert into _z_out(passo,linha) values ('X4 thb_alunos UPDATE 300 linhas (canal_aquisicao)', v_line);
  end loop;
  select count(*) into v_a1 from blindagem.auditoria_acesso where txid = txid_current() and tabela = 'public.thb_alunos';
  insert into _z_out(passo,linha) values ('X4 thb_alunos UPDATE 300 linhas (canal_aquisicao)', format('-- linhas auditadas por este comando: %s', v_a1 - v_a0));
  -- X5 restaurar_txid desta transação (desfaz os UPDATEs; DELETEs só reportados)
  for v_line in execute 'explain (analyze, buffers) select blindagem.restaurar_txid(txid_current(), ''verificacao 362: explain da restauracao'')' loop
    insert into _z_out(passo,linha) values ('X5 blindagem.restaurar_txid', v_line);
  end loop;
  insert into _z_out(passo,linha) values ('X5 blindagem.restaurar_txid', format('-- linhas de auditoria no txid ao final: %s',
    (select count(*) from blindagem.auditoria_acesso where txid = txid_current())));
end
$x$;

do $z$
begin
  raise exception 'ENSAIO (nada persiste)%', E'\n' || (select string_agg(passo || ' | ' || linha, E'\n' order by n) from _z_out);
end
$z$;


-- ═══ SAÍDA LITERAL — execução de 07/10/2026 (Management API, postgres) ═══
-- ENSAIO (nada persiste)
-- P0 base | advmais=41 visualizador=27; gatilhos ALWAYS=19 de 19; event triggers=blindagem_guarda_ddl=A,blindagem_guarda_drop=A
-- a sem motivo | 42501 blindagem: o comando altera 14 linhas sensíveis de public.perfis (limite 3)
-- a2 replica | 42501 blindagem: o comando altera 14 linhas sensíveis de public.pe
-- b com motivo | passou; row_count=41; mudaram=14; auditadas=14; autorizado=true; motivo=ensaio blindagem 07/10
-- c restaurar postgres | restauradas=14 conflitos=0 apagados_nao_reinseridos=0; visualizador 41 -> 27 (base 27); flag depois=[]
-- c2 nao restaurador | 42501 blindagem: sem permissão para restaurar.
-- c3 JWT Joao | passou: {"txid": 1, "conflitos": 0, "restauradas": 0, "apagados_nao_reinseridos": 0, "apagados_nao_restauraveis": 0}
-- c4 motivo curto | 22023
-- d admin_trocar_titular | passou; auditadas=2 (titular->socio , socio->titular); usuario_corrente=authenticated
-- e admin_excluir_acesso | passou; membros restantes=0 ambiente=0; auditadas DELETE membros=2 ambientes=1
-- g authenticated | 42501 permission denied for schema blindagem
-- g2 anon | 42501 permission denied for schema blindagem
-- g3 ACL | funcoes=13; EXECUTE anon=0 authenticated=0() service_role=0; PUBLIC=0; tabelas abertas=0; USAGE=f
-- f update | 42501
-- f delete | 42501
-- f2 delete recente c/ flag | 42501
-- f truncate | 42501
-- f update auditoria_funcoes | 42501
-- f3 expurgar | {"apagadas": 0}
-- f4 config sem guarda | 42501
-- f5 truncate membros | 42501
-- h gp_is_admin sem guarda | 42501 blindagem: CREATE FUNCTION mexe em objeto guardado (public.gp_is_admin
-- h2 gp_is_admin com guarda | passou; registros=1; antes=depois=t; antes da linha de base=t
-- h3 disable trigger | 42501
-- h4 drop trigger | 42501
-- h5 rename | 42501
-- h6 drop blindagem._papel | 42501
-- h7 handle_new_user | 42501
-- h8 alter auditoria | 42501
-- k DDL alheio | passou: 9 comandos
-- i perfis 1 linha | ->  Index Scan using perfis_pkey on perfis (actual time=0.009..0.024 rows=1 loops=1)
-- i perfis 1 linha | Trigger blindagem_upd: time=0.906 calls=1
-- i perfis 1 linha | Execution Time: 1.215 ms
-- i membros 1 linha | ->  Index Scan using membros_pkey on membros (actual time=0.007..0.009 rows=1 loops=1)
-- i membros 1 linha | Trigger blindagem_upd: time=0.691 calls=1
-- i membros 1 linha | Execution Time: 2.778 ms
-- j1 thb 300 no-op | passou; row_count=0
-- j2 thb 300 canal muda | Trigger blindagem_upd: time=0.961 calls=1
-- j2 thb 300 canal muda | Execution Time: 205.288 ms
-- j3 auditadas thb | 0 (esperado 0)
-- j4 thb observar 60 e-mails | passou; row_count=60; auditadas=60
-- D0 corpos recriados | entrada=arquivo:t; excluir=arquivo:t; ACL entrada=postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres,anon=X/postgres; ACL excluir=postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres
-- N1 perfis eh_dev em massa sem autorizar | 42501 blindagem: o comando altera 41 linhas sensíveis de public.perfis (limite 3)
-- N1b perfis cpf/funcoes/areas sem autorizar | 42501 blindagem: o comando altera 41 linhas sensíveis de public.perfis (limite 3)
-- N1c perfis nivel_hierarquia sem autorizar | 42501 blindagem: o comando altera 17 linhas sensíveis de public.perfis (limite 3)
-- N2 set app.mudanca_em_massa=123:... (txid errado) | 42501 blindagem: o comando altera 14 linhas sensíveis de public.pe
-- N2b txid certo, motivo curto | 42501
-- N2c formato antigo (sem txid) | 42501
-- N2d blindagem.autorizar (desfeito) | passou; motivo gravado=ensaio N2 autorizado
-- N2e guarda com txid errado | 42501
-- N2f autorizar executável por | authenticated=f anon=f service_role=f
-- N3 admin_excluir_acesso 6 membros | passou; membros restantes=0; auditadas DELETE membros=6 ambientes=1; motivo=exclusão de acesso de 1 ambiente (admin_excluir_acesso); autorizado=true; valor anterior devolvido=t
-- E0 antes | orfaos=4
-- E1 entrada_pelo_codigo | passou; orfaos de teste restantes=0; auditadas DELETE=4; motivo=limpeza de ambientes órfãos (entrada_pelo_codigo); autorizado=true; valor anterior devolvido=t
-- E2 delete 3 orfaos sem autorizar | 42501 blindagem: o comando altera 3 linhas sensíveis de gps.ambientes (limite 2).
-- L1 DELETE thb auditado | linhas=1; chaves de antes=documento,email,nome; restauravel=false
-- L2 restaurar padrão (sem reinserir) | {"txid": 13624504, "conflitos": 0, "restauradas": 93, "apagados_nao_reinseridos": 15, "apagados_nao_restauraveis": 1}
-- L3 restaurar com reinserir | {"txid": 13624504, "conflitos": 1, "restauradas": 200, "apagados_nao_reinseridos": 0, "apagados_nao_restauraveis": 1}; thb apagado voltou=f
-- L4 expurgar_titular | {"apagadas": 1}; restam do titular=0; registro do expurgo tem id do titular=f
-- L5 cron | blindagem-expurgo 30 6 * * * ativo=true select blindagem.expurgar('retenção LGPD 180 dias (cron diário blindagem-expurgo)')
-- X1 perfis UPDATE 1 linha | Update on perfis  (cost=0.27..2.49 rows=0 width=0) (actual time=0.105..0.105 rows=0 loops=1)
-- X1 perfis UPDATE 1 linha |   Buffers: shared hit=11
-- X1 perfis UPDATE 1 linha |   ->  Index Scan using perfis_pkey on perfis  (cost=0.27..2.49 rows=1 width=38) (actual time=0.017..0.018 rows=1 loops=1)
-- X1 perfis UPDATE 1 linha |         Index Cond: (id = ANY ('{00b177e0-3c8b-4e55-8f64-f57560bbbd74}'::uuid[]))
-- X1 perfis UPDATE 1 linha |         Buffers: shared hit=8
-- X1 perfis UPDATE 1 linha | Planning Time: 0.063 ms
-- X1 perfis UPDATE 1 linha | Trigger for constraint perfis_id_fkey: time=0.202 calls=1
-- X1 perfis UPDATE 1 linha | Trigger blindagem_upd: time=0.602 calls=1
-- X1 perfis UPDATE 1 linha | Execution Time: 0.955 ms
-- X2 perfis UPDATE 4 linhas (autorizar) | Update on perfis  (cost=0.27..8.50 rows=0 width=0) (actual time=0.225..0.225 rows=0 loops=1)
-- X2 perfis UPDATE 4 linhas (autorizar) |   Buffers: shared hit=44
-- X2 perfis UPDATE 4 linhas (autorizar) |   ->  Index Scan using perfis_pkey on perfis  (cost=0.27..8.50 rows=4 width=38) (actual time=0.022..0.048 rows=4 loops=1)
-- X2 perfis UPDATE 4 linhas (autorizar) |         Index Cond: (id = ANY ('{0788cdcd-9a6e-4850-897d-89f3724f57b4,0f6dd53c-6d1a-4f6b-af00-dc05e6284f68,1023e685-2b13-4365-a2d9-7e012afd4516,1b153c6d-6287-43ae-9e02-6caf6e6f9c33}'::uuid[]))
-- X2 perfis UPDATE 4 linhas (autorizar) |         Buffers: shared hit=21
-- X2 perfis UPDATE 4 linhas (autorizar) | Planning Time: 0.064 ms
-- X2 perfis UPDATE 4 linhas (autorizar) | Trigger for constraint perfis_id_fkey: time=0.116 calls=4
-- X2 perfis UPDATE 4 linhas (autorizar) | Trigger blindagem_upd: time=0.792 calls=1
-- X2 perfis UPDATE 4 linhas (autorizar) | Execution Time: 1.182 ms
-- X3 membros DELETE 2 linhas (ambiente de teste) | Delete on membros  (cost=0.14..2.36 rows=0 width=0) (actual time=0.063..0.063 rows=0 loops=1)
-- X3 membros DELETE 2 linhas (ambiente de teste) |   Buffers: shared hit=6
-- X3 membros DELETE 2 linhas (ambiente de teste) |   ->  Index Scan using membros_aluno_id_idx on membros  (cost=0.14..2.36 rows=1 width=6) (actual time=0.008..0.035 rows=2 loops=1)
-- X3 membros DELETE 2 linhas (ambiente de teste) |         Index Cond: (aluno_id = '59b0ff0b-5c90-4bef-9023-a13561634b64'::uuid)
-- X3 membros DELETE 2 linhas (ambiente de teste) |         Buffers: shared hit=2
-- X3 membros DELETE 2 linhas (ambiente de teste) | Planning Time: 0.079 ms
-- X3 membros DELETE 2 linhas (ambiente de teste) | Trigger blindagem_del: time=1.420 calls=1
-- X3 membros DELETE 2 linhas (ambiente de teste) | Trigger trg_membros_drive_revogar: time=0.134 calls=1
-- X3 membros DELETE 2 linhas (ambiente de teste) | Execution Time: 1.648 ms
-- X4 thb_alunos UPDATE 300 linhas (canal_aquisicao) | Update on thb_alunos  (cost=11.00..370.99 rows=0 width=0) (actual time=203.300..203.303 rows=0 loops=1)
-- X4 thb_alunos UPDATE 300 linhas (canal_aquisicao) |   Buffers: shared hit=18814 read=21 dirtied=37
-- X4 thb_alunos UPDATE 300 linhas (canal_aquisicao) |   ->  Nested Loop  (cost=11.00..370.99 rows=300 width=78) (actual time=1.963..11.549 rows=300 loops=1)
-- X4 thb_alunos UPDATE 300 linhas (canal_aquisicao) |         Buffers: shared hit=2204
-- X4 thb_alunos UPDATE 300 linhas (canal_aquisicao) |         ->  HashAggregate  (cost=10.72..13.72 rows=300 width=56) (actual time=1.943..2.681 rows=300 loops=1)
-- X4 thb_alunos UPDATE 300 linhas (canal_aquisicao) |               Group Key: "ANY_subquery".id
-- X4 thb_alunos UPDATE 300 linhas (canal_aquisicao) |               Batches: 1  Memory Usage: 93kB
-- X4 thb_alunos UPDATE 300 linhas (canal_aquisicao) |               Buffers: shared hit=779
-- X4 thb_alunos UPDATE 300 linhas (canal_aquisicao) |               ->  Subquery Scan on "ANY_subquery"  (cost=0.28..9.97 rows=300 width=56) (actual time=0.018..1.810 rows=300 loops=1)
-- X4 thb_alunos UPDATE 300 linhas (canal_aquisicao) |                     Buffers: shared hit=779
-- X4 thb_alunos UPDATE 300 linhas (canal_aquisicao) |                     ->  Limit  (cost=0.28..6.97 rows=300 width=16) (actual time=0.014..1.716 rows=300 loops=1)
-- X4 thb_alunos UPDATE 300 linhas (canal_aquisicao) |                           Buffers: shared hit=779
-- X4 thb_alunos UPDATE 300 linhas (canal_aquisicao) |                           ->  Index Only Scan using thb_alunos_pkey on thb_alunos thb_alunos_1  (cost=0.28..67.39 rows=3007 width=16) (actual time=0.013..1.667 rows=300 loops=1)
-- X4 thb_alunos UPDATE 300 linhas (canal_aquisicao) |                                 Heap Fetches: 1383
-- X4 thb_alunos UPDATE 300 linhas (canal_aquisicao) |                                 Buffers: shared hit=779
-- X4 thb_alunos UPDATE 300 linhas (canal_aquisicao) |         ->  Index Scan using thb_alunos_pkey on thb_alunos  (cost=0.28..1.27 rows=1 width=32) (actual time=0.017..0.017 rows=1 loops=300)
-- X4 thb_alunos UPDATE 300 linhas (canal_aquisicao) |               Index Cond: (id = "ANY_subquery".id)
-- X4 thb_alunos UPDATE 300 linhas (canal_aquisicao) |               Buffers: shared hit=1260
-- X4 thb_alunos UPDATE 300 linhas (canal_aquisicao) | Planning:
-- X4 thb_alunos UPDATE 300 linhas (canal_aquisicao) |   Buffers: shared hit=10
-- X4 thb_alunos UPDATE 300 linhas (canal_aquisicao) | Planning Time: 0.297 ms
-- X4 thb_alunos UPDATE 300 linhas (canal_aquisicao) | Trigger for constraint thb_alunos_socio_de_aluno_id_fkey: time=2.627 calls=88
-- X4 thb_alunos UPDATE 300 linhas (canal_aquisicao) | Trigger for constraint thb_alunos_turma_id_fkey: time=5.005 calls=291
-- X4 thb_alunos UPDATE 300 linhas (canal_aquisicao) | Trigger for constraint thb_alunos_turma_aurum_id_fkey: time=0.581 calls=33
-- X4 thb_alunos UPDATE 300 linhas (canal_aquisicao) | Trigger for constraint fk_thb_alunos_comprador: time=21.893 calls=99
-- X4 thb_alunos UPDATE 300 linhas (canal_aquisicao) | Trigger for constraint thb_alunos_comprador_id_fkey: time=1.949 calls=99
-- X4 thb_alunos UPDATE 300 linhas (canal_aquisicao) | Trigger for constraint fk_thb_alunos_placa_sol: time=6.457 calls=19
-- X4 thb_alunos UPDATE 300 linhas (canal_aquisicao) | Trigger for constraint fk_thb_alunos_atualizado_por: time=0.212 calls=4
-- X4 thb_alunos UPDATE 300 linhas (canal_aquisicao) | Trigger a_trg_thb_alunos_skip_noop: time=50.774 calls=300
-- X4 thb_alunos UPDATE 300 linhas (canal_aquisicao) | Trigger blindagem_upd: time=1.023 calls=1
-- X4 thb_alunos UPDATE 300 linhas (canal_aquisicao) | Trigger trg_aluno_retornou: time=4.476 calls=300
-- X4 thb_alunos UPDATE 300 linhas (canal_aquisicao) | Execution Time: 243.345 ms
-- X4 thb_alunos UPDATE 300 linhas (canal_aquisicao) | -- linhas auditadas por este comando: 0
-- X5 blindagem.restaurar_txid | Result  (cost=0.00..0.26 rows=1 width=32) (actual time=687.266..687.267 rows=1 loops=1)
-- X5 blindagem.restaurar_txid |   Buffers: shared hit=29024 read=18 dirtied=73 written=30
-- X5 blindagem.restaurar_txid | Planning Time: 0.008 ms
-- X5 blindagem.restaurar_txid | Execution Time: 687.277 ms
-- X5 blindagem.restaurar_txid | -- linhas de auditoria no txid ao final: 772

-- ═══════════════════════════════════════════════════════════════════════════
-- PRODUÇÃO — depois de aplicar 362 e 363 (07/10/2026, Management API em UTF-8)
-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência: 19 gatilhos blindagem_* com tgenabled='A'; event triggers
--   blindagem_guarda_ddl:A e blindagem_guarda_drop:A; cron "blindagem-expurgo
--   30 6 * * * ativo=true"; config perfis=3/travar, membros=4/travar,
--   ambientes=2/travar, thb_alunos=50/observar; 2 restauradores; anon e
--   authenticated sem USAGE no schema; 0 funções com acento quebrado.
-- Teste real (bloco DO que termina em raise, nada persiste):
--   update de 4 perfis @advmais (pode_ver_cpf_completo invertido) sem autorizar →
--   "42501 blindagem: o comando altera 4 linhas sensíveis de public.perfis (limite 3)…"
--   execute pg_get_functiondef('public.gp_is_admin()') sem autorizar_guarda →
--   "42501 blindagem: CREATE FUNCTION mexe em objeto guardado (public.gp_is_admin())…"
-- explain (analyze, buffers), produção, 1 linha, cache frio:
--   Update on perfis (actual time=0.953..0.954 rows=0 loops=1) Buffers: shared hit=265
--     ->  Index Scan using perfis_pkey on perfis (actual time=0.037..0.039 rows=1 loops=1)
--   Planning Time: 0.423 ms
--   Trigger blindagem_upd: time=3.984 calls=1
--   Execution Time: 5.124 ms
