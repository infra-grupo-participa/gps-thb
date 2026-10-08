-- ═══════════════════════════════════════════════════════════════════════════
-- 366 — ADMIN DO GPS SEPARADO DO RESTO DO BANCO (1/5): estrutura
-- ═══════════════════════════════════════════════════════════════════════════
-- INCIDENTE (07/10/2026): o projeto de acesso redefiniu public.gp_is_admin()
-- = coalesce(acesso.eh_admin(), false) e rebaixou public.perfis.cargo de
-- vários admins. RLS, RPCs e gps.eh_equipe() liam gp_is_admin() e o GPS caiu
-- junto. Desenho aprovado pelo João (08/10): o GPS passa a ter a SUA lista.
--
-- ESTA MIGRAÇÃO NÃO MUDA COMPORTAMENTO: cria a tabela, o log, a função
-- gps.eh_admin() e as RPCs de gestão. Ninguém lê gps.eh_admin() até a 368.
-- SEQUÊNCIA: 366 estrutura · carga inicial (FORA do repo, ver 367) · 367
-- conferência · 368–373 funções (6 partes, por tamanho) · 374 policies ·
-- 375 blindagem. Ensaiada inteira em begin…rollback.
--   • gps.admins (PK user_id → auth.users on delete cascade; sem FK para
--     public.perfis nem acesso.*);
--   • gatilho admins_guarda_escrita (BEFORE, ENABLE ALWAYS): RECUSA (42501)
--     INSERT/UPDATE/DELETE/TRUNCATE sem a marca da transação
--     gps.admins_via_rpc = txid_current() — só gps.admin_definir (e a carga
--     inicial, deliberadamente) a põem. Exceção: DELETE de linha JÁ REVOGADA
--     passa (ex.: login apagado em auth.users) e fica no log;
--   • gatilho admins_registrar_log (AFTER, ENABLE ALWAYS, SECURITY DEFINER):
--     TODA mudança vira linha em gps.admins_log (concedido/revogado/
--     reativado/alterado/removido), venha de onde vier — o log não depende
--     de quem escreve lembrar de escrever;
--   • gps.admins_log append-only (gatilho recusa UPDATE/DELETE/TRUNCATE);
--   • gps.eh_admin()           — a guarda única do GPS;
--   • gps.admin_definir(e-mail, ativo, motivo, simular=false) — conceder/
--     revogar; com simular=true valida tudo e não grava (a tela mostra
--     criado_em/ultimo_login da conta antes de confirmar);
--   • gps.admins_listar(), gps.admins_historico(limite);
--   • vigia da blindagem em gps.admins (UPDATE de user_id/ativo/motivo/
--     concedido_por, DELETE, TRUNCATE; limite 2 por comando, modo travar).
-- NUNCA escreve em public.perfis nem em acesso.* (perfis só é LIDO, para nome).
--
-- AS 5 PERGUNTAS
--   1. Escala: gps.admins tem ~11 linhas e cresce com a equipe (dezenas, não
--      milhares). admins_log cresce 1 linha por concessão/revogação.
--   2. Índice: eh_admin() é lookup pela PK (user_id). admin_definir resolve o
--      e-mail por auth.users.email = <valor normalizado> AND is_sso_user = false
--      (índice parcial users_email_partial_key, predicado literal, coluna
--      crua); "é aluno?" por gps.membros.user_id (membros_user_id_key).
--      Histórico: ORDER BY id DESC LIMIT n sobre a PK.
--   3. Frequência: eh_admin() é chamada por toda policy/RPC do GPS depois da
--      368 — por isso é PK lookup e, nas policies, embrulhada em (select …).
--   4. Repetição: nenhuma tela nova aqui.
--   5. Reversão: ver bloco REVERTER abaixo.
--
-- REVERTER (só depois de reverter 375, 374 e 368–373; se a ideia é "voltar a
-- seguir o acesso", NÃO reverta: use a reversão rápida global, que mantém
-- tudo e só troca a fonte da verdade):
--   -- reversão rápida global (o GPS volta a seguir public.gp_is_admin()):
--   begin;
--   select blindagem.autorizar_guarda('reversão rápida: GPS volta a seguir gp_is_admin');
--   create or replace function gps.eh_admin()
--     returns boolean language sql stable security definer set search_path = ''
--     as $$ select coalesce(public.gp_is_admin(), false) $$;
--   commit;
--   -- reversão completa desta migração (nada é apagado; as tabelas são arquivadas):
--   begin;
--   select blindagem.autorizar_guarda('reverte 20261008000366 gps.admins');
--   delete from blindagem.config where tabela = 'gps.admins';
--   drop trigger blindagem_upd on gps.admins; drop trigger blindagem_del on gps.admins;
--   drop trigger blindagem_trunc on gps.admins;
--   drop function gps.admins_historico(integer); drop function gps.admins_listar();
--   drop function gps.admin_definir(text, boolean, text, boolean); drop function gps.eh_admin();
--   alter table gps.admins rename to admins_arquivo_20261008;
--   alter table gps.admins_log rename to admins_log_arquivo_20261008;
--   commit;
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- CREATE TRIGGER blindagem_* e escrita em blindagem.config exigem a guarda.
select blindagem.autorizar_guarda('20261008000366: gps.admins entra no vigia (separação do admin do GPS, aprovado pelo João 08/10)');

-- ─── tabelas ────────────────────────────────────────────────────────────────

create table gps.admins (
  user_id       uuid        primary key references auth.users (id) on delete cascade,
  ativo         boolean     not null default true,
  concedido_por uuid,
  concedido_em  timestamptz not null default now(),
  revogado_em   timestamptz,
  motivo        text        not null check (length(btrim(motivo)) between 3 and 300)
);
comment on table gps.admins is
  'Admin do GPS (20261008000366). Fonte única de gps.eh_admin(). Independe de public.perfis e de acesso.*. Escrita só por gps.admin_definir (gatilho admins_guarda_escrita recusa o resto).';

create table gps.admins_log (
  id      bigserial   primary key,
  user_id uuid        not null,
  acao    text        not null check (acao in ('concedido', 'revogado', 'reativado', 'alterado', 'removido')),
  motivo  text        not null,
  ator    uuid,
  antes   jsonb,
  depois  jsonb,
  em      timestamptz not null default now()
);
comment on table gps.admins_log is
  'Append-only. Escrito SÓ pelo gatilho admins_registrar_log de gps.admins (toda mudança, qualquer caminho). ator = auth.uid() de quem mudou; null = migração/banco.';

create function gps.admins_log_somente_inclusao()
returns trigger
language plpgsql
set search_path = ''
as $f$
begin
  raise exception 'gps.admins_log é append-only (% recusado).', tg_op using errcode = '42501';
end
$f$;

create trigger admins_log_somente_inclusao before update or delete on gps.admins_log
  for each row execute function gps.admins_log_somente_inclusao();
create trigger admins_log_somente_inclusao_trunc before truncate on gps.admins_log
  for each statement execute function gps.admins_log_somente_inclusao();
alter table gps.admins_log enable always trigger admins_log_somente_inclusao;
alter table gps.admins_log enable always trigger admins_log_somente_inclusao_trunc;

-- ─── escrita em gps.admins só pela RPC ──────────────────────────────────────
-- A marca vale só para a transação que a pôs (valor = txid_current()):
-- `alter role/database set`, `set` sem local vazando em pool ou valor
-- digitado à mão em outra transação não liberam nada.
create function gps.admins_guarda_escrita()
returns trigger
language plpgsql
set search_path = ''
as $f$
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'gps.admins não aceita TRUNCATE.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' and not old.ativo then
    return old;  -- linha já revogada (ex.: login apagado em auth.users); o log registra
  end if;
  if coalesce(current_setting('gps.admins_via_rpc', true), '') = txid_current()::text then
    return coalesce(new, old);
  end if;
  raise exception 'gps.admins só muda por gps.admin_definir (% recusado).', tg_op
    using errcode = '42501',
          hint = 'Carga ou manutenção deliberada: na MESMA transação, select set_config(''gps.admins_via_rpc'', txid_current()::text, true). Fica no gps.admins_log.';
end
$f$;

create function gps.admins_registrar_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $f$
declare
  v_acao text;
begin
  if tg_op = 'INSERT' then
    v_acao := case when new.ativo then 'concedido' else 'revogado' end;
  elsif tg_op = 'UPDATE' then
    v_acao := case when old.ativo and not new.ativo then 'revogado'
                   when not old.ativo and new.ativo then 'reativado'
                   else 'alterado' end;
  else
    v_acao := 'removido';
  end if;
  insert into gps.admins_log (user_id, acao, motivo, ator, antes, depois)
  values (coalesce(new.user_id, old.user_id), v_acao,
          coalesce(new.motivo, old.motivo),
          (select auth.uid()),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end
$f$;

create trigger admins_guarda_escrita before insert or update or delete on gps.admins
  for each row execute function gps.admins_guarda_escrita();
create trigger admins_guarda_escrita_trunc before truncate on gps.admins
  for each statement execute function gps.admins_guarda_escrita();
create trigger admins_registrar_log after insert or update or delete on gps.admins
  for each row execute function gps.admins_registrar_log();
alter table gps.admins enable always trigger admins_guarda_escrita;
alter table gps.admins enable always trigger admins_guarda_escrita_trunc;
alter table gps.admins enable always trigger admins_registrar_log;

-- ─── RLS e privilégios (tabela nova em gps nasce com arwd para authenticated) ─
alter table gps.admins     enable row level security;
alter table gps.admins_log enable row level security;

revoke all on gps.admins     from public, anon, authenticated;
revoke all on gps.admins_log from public, anon, authenticated;
revoke all on sequence gps.admins_log_id_seq from public, anon, authenticated;
grant select on gps.admins     to authenticated;
grant select on gps.admins_log to authenticated;

-- ─── a guarda única ─────────────────────────────────────────────────────────
create function gps.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $f$
  select coalesce(exists (select 1 from gps.admins a
                           where a.user_id = (select auth.uid()) and a.ativo), false)
$f$;
comment on function gps.eh_admin() is
  'Admin do GPS = linha ativa em gps.admins (20261008000366). Reversão rápida: corpo = select coalesce(public.gp_is_admin(), false).';

create policy gps_admins_select on gps.admins
  for select to authenticated
  using (user_id = (select auth.uid()) or (select gps.eh_admin()));

create policy gps_admins_log_select on gps.admins_log
  for select to authenticated
  using ((select gps.eh_admin()));

-- ─── conceder / revogar ─────────────────────────────────────────────────────
create function gps.admin_definir(p_email text, p_ativo boolean, p_motivo text, p_simular boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
  v_ator   uuid := auth.uid();
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_user   uuid;
  v_criado timestamptz;
  v_login  timestamptz;
  v_atual  gps.admins%rowtype;
  v_ativos integer;
  v_acao   text;
  v_existe boolean;
  v_conta  jsonb;
begin
  if not coalesce(gps.eh_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_ativo is null then
    raise exception 'Informe se o acesso fica ativo ou não.' using errcode = '22023';
  end if;
  if char_length(v_motivo) < 3 or char_length(v_motivo) > 300 then
    raise exception 'Escreva o motivo (de 3 a 300 caracteres).' using errcode = '22023';
  end if;
  -- parte local só ASCII simples: recusa homoglifo, unicode, +, espaço, tab
  if v_email !~ '^[a-z0-9._-]+@advmais\.com$' then
    raise exception 'Só contas da equipe (@advmais.com) podem ser admin do programa.' using errcode = '22023';
  end if;

  -- coluna crua = valor normalizado + predicado do índice parcial
  select u.id, u.created_at, u.last_sign_in_at into v_user, v_criado, v_login
    from auth.users u
   where u.email = v_email and u.is_sso_user = false;
  if v_user is null then
    raise exception 'Não existe login com este e-mail.' using errcode = 'P0002';
  end if;
  v_conta := jsonb_build_object('user_id', v_user, 'email', v_email,
                                'criado_em', v_criado, 'ultimo_login', v_login);

  -- conta de aluno não vira admin (signup público com autoconfirm existe)
  -- (só gps.membros: public.thb_alunos tem contas de teste da equipe)
  if p_ativo and exists (select 1 from gps.membros m where m.user_id = v_user) then
    raise exception 'Esta conta é de aluno do programa e não pode ser admin.' using errcode = '22023';
  end if;

  -- trava todas as linhas ativas: duas revogações simultâneas não deixam o
  -- programa sem admin
  perform 1 from gps.admins a where a.ativo for update;
  -- reconfere o chamador DEPOIS da trava (pode ter sido revogado enquanto esperava)
  if not coalesce(gps.eh_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  select * into v_atual from gps.admins a where a.user_id = v_user for update;
  v_existe := found;

  if not p_ativo then
    if v_existe and v_atual.ativo then
      select count(*) into v_ativos from gps.admins a where a.ativo;
      if v_ativos <= 1 then
        raise exception 'Este é o último admin ativo do programa.' using errcode = 'P0001';
      end if;
    end if;
    if v_user = v_ator then
      raise exception 'Você não pode remover o seu próprio acesso de admin.' using errcode = 'P0001';
    end if;
  end if;

  if (not v_existe and not p_ativo) or (v_existe and v_atual.ativo = p_ativo) then
    return v_conta || jsonb_build_object('ativo', p_ativo, 'mudou', false, 'simulado', coalesce(p_simular, false));
  end if;
  if coalesce(p_simular, false) then
    return v_conta || jsonb_build_object('ativo', coalesce(v_atual.ativo, false), 'mudou', false,
                                         'mudaria', true, 'simulado', true);
  end if;

  perform set_config('gps.admins_via_rpc', txid_current()::text, true);
  if not v_existe then
    insert into gps.admins (user_id, ativo, concedido_por, concedido_em, motivo)
    values (v_user, true, v_ator, now(), v_motivo);
  elsif p_ativo then
    update gps.admins a
       set ativo = true, concedido_por = v_ator, concedido_em = now(), revogado_em = null, motivo = v_motivo
     where a.user_id = v_user;
  else
    update gps.admins a
       set ativo = false, revogado_em = now(), motivo = v_motivo
     where a.user_id = v_user;
  end if;
  perform set_config('gps.admins_via_rpc', '', true);
  -- a linha de gps.admins_log é do gatilho admins_registrar_log

  return v_conta || jsonb_build_object('ativo', p_ativo, 'mudou', true, 'simulado', false);
end
$f$;

-- ─── leitura ────────────────────────────────────────────────────────────────
create function gps.admins_listar()
returns table (user_id uuid, nome text, email text, ativo boolean, concedido_em timestamptz,
               revogado_em timestamptz, motivo text, concedido_por_nome text)
language plpgsql
stable
security definer
set search_path = ''
as $f$
begin
  if not coalesce(gps.eh_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  return query
  select a.user_id,
         coalesce(nullif(btrim(p.nome), ''), nullif(btrim(u.raw_user_meta_data ->> 'nome'), ''), u.email::text),
         u.email::text,
         a.ativo,
         a.concedido_em,
         a.revogado_em,
         a.motivo,
         case when a.concedido_por is null then null
              else coalesce(nullif(btrim(pc.nome), ''), nullif(btrim(uc.raw_user_meta_data ->> 'nome'), ''), uc.email::text)
         end
    from gps.admins a
    join auth.users u on u.id = a.user_id
    left join public.perfis p  on p.id  = a.user_id
    left join auth.users   uc on uc.id = a.concedido_por
    left join public.perfis pc on pc.id = a.concedido_por
   order by a.ativo desc, 2, 1;
end
$f$;

create function gps.admins_historico(p_limite integer default 50)
returns table (id bigint, em timestamptz, acao text, motivo text, alvo_id uuid, alvo_nome text,
               alvo_email text, ator_id uuid, ator_nome text, antes jsonb, depois jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $f$
begin
  if not coalesce(gps.eh_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  return query
  select l.id, l.em, l.acao, l.motivo, l.user_id,
         coalesce(nullif(btrim(p.nome), ''), nullif(btrim(u.raw_user_meta_data ->> 'nome'), ''), u.email::text),
         u.email::text,
         l.ator,
         case when l.ator is null then 'migração / banco'
              else coalesce(nullif(btrim(pa.nome), ''), nullif(btrim(ua.raw_user_meta_data ->> 'nome'), ''), ua.email::text)
         end,
         l.antes, l.depois
    from gps.admins_log l
    left join auth.users    u  on u.id  = l.user_id
    left join public.perfis p  on p.id  = l.user_id
    left join auth.users    ua on ua.id = l.ator
    left join public.perfis pa on pa.id = l.ator
   order by l.id desc
   limit least(greatest(coalesce(p_limite, 50), 1), 500);
end
$f$;

-- ─── privilégios de função (nascem com EXECUTE para PUBLIC/authenticated) ───
revoke all on function gps.admins_log_somente_inclusao()                   from public, anon, authenticated, service_role;
revoke all on function gps.admins_guarda_escrita()                         from public, anon, authenticated, service_role;
revoke all on function gps.admins_registrar_log()                          from public, anon, authenticated, service_role;
revoke all on function gps.eh_admin()                                       from public, anon;
revoke all on function gps.admin_definir(text, boolean, text, boolean)     from public, anon;
revoke all on function gps.admins_listar()                                  from public, anon;
revoke all on function gps.admins_historico(integer)                       from public, anon;
grant execute on function gps.eh_admin()                                    to authenticated, service_role;
grant execute on function gps.admin_definir(text, boolean, text, boolean)  to authenticated, service_role;
grant execute on function gps.admins_listar()                               to authenticated, service_role;
grant execute on function gps.admins_historico(integer)                    to authenticated, service_role;

-- ─── vigia da blindagem (molde da 362) ──────────────────────────────────────
insert into blindagem.config (tabela, limite, modo) values ('gps.admins', 2, 'travar');

create trigger blindagem_upd after update on gps.admins
  referencing old table as blindagem_old new table as blindagem_new
  for each statement execute function blindagem.vigiar('user_id', 'user_id,ativo,motivo,concedido_por', 'gps.admins');
create trigger blindagem_del after delete on gps.admins
  referencing old table as blindagem_old
  for each statement execute function blindagem.vigiar('user_id', '', 'gps.admins');
create trigger blindagem_trunc before truncate on gps.admins
  for each statement execute function blindagem.vigiar('user_id', '', 'gps.admins');
alter table gps.admins enable always trigger blindagem_upd;
alter table gps.admins enable always trigger blindagem_del;
alter table gps.admins enable always trigger blindagem_trunc;

-- ─── conferência (aborta a migração se algo nasceu aberto) ──────────────────
do $$
declare v_ruim text;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into v_ruim
    from pg_proc p
   where p.oid in ('gps.eh_admin()'::regprocedure, 'gps.admin_definir(text,boolean,text,boolean)'::regprocedure,
                   'gps.admins_listar()'::regprocedure, 'gps.admins_historico(integer)'::regprocedure,
                   'gps.admins_log_somente_inclusao()'::regprocedure, 'gps.admins_guarda_escrita()'::regprocedure,
                   'gps.admins_registrar_log()'::regprocedure)
     and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
                  where x.grantee = 0 or x.grantee = 'anon'::regrole);
  if v_ruim is not null then
    raise exception '366: função executável por PUBLIC/anon: %', v_ruim;
  end if;
  if has_table_privilege('authenticated', 'gps.admins', 'insert,update,delete,truncate')
     or has_table_privilege('authenticated', 'gps.admins_log', 'insert,update,delete,truncate')
     or has_table_privilege('anon', 'gps.admins', 'select')
     or has_table_privilege('anon', 'gps.admins_log', 'select') then
    raise exception '366: gps.admins/admins_log com privilégio de escrita para authenticated ou leitura para anon';
  end if;
end $$;

commit;
