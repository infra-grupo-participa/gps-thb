-- ═══════════════════════════════════════════════════════════════════════════
-- 375 — ADMIN DO GPS SEPARADO (5/5): a blindagem deixa de travar o que não é do GPS
-- ═══════════════════════════════════════════════════════════════════════════
-- Decisão do João (08/10): "liberar e só auditar". Com 366–374 aplicadas o GPS
-- não lê mais public.gp_is_admin() nem public.perfis.cargo para decidir admin;
-- travar DDL/DML de outro sistema deixou de proteger o GPS e só atrapalha o
-- dono daquelas peças.
--   • blindagem.guarda_ddl(): public.gp_is_admin, public.handle_new_user e a
--     função do gatilho on_auth_user_created passam SEM motivo — continuam
--     registradas em blindagem.auditoria_funcoes (motivo "SEM AUTORIZAÇÃO — só
--     auditado …", antes/depois completos) e geram WARNING. Tudo do schema
--     blindagem e gps.* (aluno_atual, eh_equipe, gerador_sso_dados) e
--     public.gps_handle_new_user / on_auth_user_created_gps seguem TRAVADOS;
--   • ENTRAM na lista travada (com LINHA DE BASE em auditoria_funcoes):
--     gps.eh_admin, gps.admin_definir, gps.admins_listar, gps.admins_historico,
--     gps.admins_log_somente_inclusao, gps.admins_guarda_escrita,
--     gps.admins_registrar_log (gps.eh_equipe já estava, desde a 363);
--   • GRANT/REVOKE/POLICY/RLS/gatilhos de gps.admins e gps.admins_log: novo
--     event trigger blindagem_guarda_gps_admins compara o ESTADO das duas
--     tabelas com a assinatura registrada em blindagem.assinaturas (o event
--     trigger não identifica o alvo de um GRANT); mudou sem
--     blindagem.autorizar_guarda → 42501; com motivo → audita e registra;
--   • blindagem.config: public.perfis passa de 'travar' para 'observar' (o
--     vigia continua auditando cada linha sensível; acima de 3 só avisa).
-- Migração própria e por ÚLTIMO: é decisão independente da separação (reverte
-- sozinha) e só é segura DEPOIS que o GPS deixou de depender de gp_is_admin —
-- aplicada antes, reabriria a janela do incidente de 07/10.
--
-- AS 5 PERGUNTAS: custo por DDL igual ao da 363 (um select a mais no
-- catálogo, por OID); o guarda novo faz 1 consulta ao catálogo por
-- GRANT/POLICY/ALTER TABLE/TRIGGER de QUALQUER sistema (medido no ensaio);
-- nenhum custo em DML; frequência só em DDL.
--
-- REVERTER (volta a travar tudo como na 363):
--   begin;
--   select blindagem.autorizar_guarda('reverte 20261008000375: volta a travar gp_is_admin/handle_new_user');
--   update blindagem.config set modo = 'travar' where tabela = 'public.perfis';
--   -- corpo da 363 = o "depois" da LINHA DE BASE de 'blindagem.guarda_ddl()'
--   -- em blindagem.auditoria_funcoes (ou o arquivo 20261007000363):
--   create or replace function blindagem.guarda_ddl() … ;
--   drop event trigger blindagem_guarda_gps_admins;  -- DDL de event trigger não dispara event trigger
--   commit;
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '3s';
set local statement_timeout = '30s';

select blindagem.autorizar_guarda('20261008000375: liberar e só auditar gp_is_admin/handle_new_user; perfis em observar; gps.eh_admin guardada (João 08/10)');

create or replace function blindagem.guarda_ddl()
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
  v_modo   text;
  v_travar jsonb;
  c_auditar constant text := 'SEM AUTORIZAÇÃO — só auditado (20261008000375: função de outro sistema, decisão do João 08/10)';
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
          -- 20261008000375: gp_is_admin/handle_new_user (e a função do gatilho
          -- on_auth_user_created) são de OUTRO sistema: passam sem motivo e só
          -- são auditadas. blindagem.* e gps.* continuam travados.
          v_modo := null;
          select case
                   when n.nspname in ('blindagem', 'gps') then 'travar'
                   when (n.nspname, p.proname) in (('public', 'gp_is_admin'), ('public', 'handle_new_user'))
                     or p.oid in (select f.objeto_oid from blindagem.auditoria_funcoes f
                                   where f.objeto in ('public.gp_is_admin()', 'public.handle_new_user()')
                                     and f.objeto_oid is not null)
                     or p.oid in (select t.tgfoid from pg_catalog.pg_trigger t
                                   where t.tgrelid = 'auth.users'::regclass
                                     and t.tgname = 'on_auth_user_created')
                   then 'auditar'
                   else 'travar'
                 end
            into v_modo
              from pg_catalog.pg_proc p
              join pg_catalog.pg_namespace n on n.oid = p.pronamespace
             where p.oid = c.objid
               and (   n.nspname = 'blindagem'
                    or (n.nspname, p.proname) in (('public', 'gp_is_admin'),
                                                  ('gps', 'aluno_atual'),
                                                  ('gps', 'eh_equipe'),
                                                  ('gps', 'eh_admin'),
                                                  ('gps', 'admin_definir'),
                                                  ('gps', 'admins_listar'),
                                                  ('gps', 'admins_historico'),
                                                  ('gps', 'admins_log_somente_inclusao'),
                                                  ('gps', 'admins_guarda_escrita'),
                                                  ('gps', 'admins_registrar_log'),
                                                  ('gps', 'gerador_sso_dados'),
                                                  ('public', 'handle_new_user'),
                                                  ('public', 'gps_handle_new_user'))
                    or p.oid in (select t.tgfoid from pg_catalog.pg_trigger t
                                  where t.tgrelid = 'auth.users'::regclass
                                    and t.tgname in ('on_auth_user_created', 'on_auth_user_created_gps'))
                    or p.oid in (select f.objeto_oid from blindagem.auditoria_funcoes f
                                  where f.objeto_oid is not null));
          if v_modo is not null then
            v_alvos := v_alvos || jsonb_build_object('tipo', 'funcao', 'oid', c.objid,
                                                     'objeto', c.object_identity, 'modo', v_modo);
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
                                                                ('gps', 'eh_admin'),
                                                                ('gps', 'admin_definir'),
                                                                ('gps', 'admins_listar'),
                                                                ('gps', 'admins_historico'),
                                                                ('gps', 'admins_log_somente_inclusao'),
                                                                ('gps', 'admins_guarda_escrita'),
                                                                ('gps', 'admins_registrar_log'),
                                                                ('gps', 'gerador_sso_dados'),
                                                                ('public', 'handle_new_user'),
                                                                ('public', 'gps_handle_new_user')))
           or (c.object_type = 'trigger' and c.object_identity like 'blindagem\_% on %') then
          v_alvos := v_alvos || jsonb_build_object('tipo', 'drop_' || c.object_type,
                                                   'objeto', c.object_identity,
                                                   'modo', case when c.object_type in ('function', 'procedure')
                                                                 and (c.address_names[1], c.address_names[2]) in
                                                                     (('public', 'gp_is_admin'), ('public', 'handle_new_user'))
                                                                then 'auditar' else 'travar' end);
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
  select jsonb_agg(x) into v_travar
    from jsonb_array_elements(v_alvos) x
   where coalesce(x ->> 'modo', 'travar') = 'travar';
  if v_motivo is null and v_travar is not null then
    raise exception 'blindagem: % mexe em objeto guardado (%). Autorize na mesma transação: select blindagem.autorizar_guarda(''<motivo com 10+ caracteres>'')',
      tg_tag, (select string_agg(x ->> 'objeto', ', ') from jsonb_array_elements(v_travar) x)
      using errcode = '42501',
            hint = 'Funções de acesso trocadas sem aviso derrubaram a equipe em 07/10/2026. Emergência (dono postgres): alter event trigger blindagem_guarda_ddl disable; alter event trigger blindagem_guarda_drop disable;';
  end if;

  if v_motivo is null then
    raise warning 'blindagem (só auditoria): % em % sem autorização — registrado em blindagem.auditoria_funcoes',
      tg_tag, (select string_agg(x ->> 'objeto', ', ') from jsonb_array_elements(v_alvos) x);
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
              blindagem._papel(), blindagem._jwt_sub(), current_setting('application_name', true),
              coalesce(v_motivo, c_auditar));
    exception when undefined_table or undefined_function or invalid_schema_name then
      -- só acontece quando o próprio schema blindagem está sendo removido (com motivo)
      raise warning 'blindagem.guarda_ddl: % autorizado, sem trilha (schema blindagem removido)', tg_tag;
    end;
  end loop;
end
$f$;

revoke all on function blindagem.guarda_ddl() from public, anon, authenticated, service_role;

update blindagem.config set modo = 'observar' where tabela = 'public.perfis';

-- linha de base das funções do GPS que passam a ser guardadas
insert into blindagem.auditoria_funcoes (objeto, objeto_oid, comando, depois, usuario_corrente, motivo)
select (pg_catalog.pg_identify_object('pg_catalog.pg_proc'::regclass, p.oid, 0)).identity,
       p.oid, 'LINHA DE BASE', pg_catalog.pg_get_functiondef(p.oid), blindagem._papel(),
       'migração 20261008000375: funções do admin do GPS passam a ser guardadas'
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'gps'
   and p.proname in ('eh_admin', 'admin_definir', 'admins_listar', 'admins_historico',
                     'admins_log_somente_inclusao', 'admins_guarda_escrita', 'admins_registrar_log')
   and not exists (select 1 from blindagem.auditoria_funcoes f
                    where f.objeto_oid = p.oid and f.comando = 'LINHA DE BASE');

-- ─── GRANT / POLICY / RLS / gatilhos de gps.admins e gps.admins_log ──────────
-- O event trigger não identifica o objeto de um GRANT; então a guarda compara
-- o ESTADO: depois de todo GRANT/REVOKE/POLICY/ALTER TABLE/TRIGGER/DROP TABLE
-- / RULE do banco, recalcula a assinatura das duas tabelas (ACL, RLS,
-- policies, gatilhos e se estão ligados, rules, colunas, constraints).
-- PENDÊNCIA conhecida (mesma classe dos event triggers da 363): DDL de event
-- trigger não dispara event trigger — `alter event trigger … disable` não é pego.
-- Igual à registrada → sai (custo: uma consulta ao catálogo). Diferente sem
-- blindagem.autorizar_guarda → 42501. Com motivo →
-- passa, audita antes/depois e a nova vira a registrada.
create table if not exists blindagem.assinaturas (
  objeto     text primary key,
  assinatura text not null,
  texto      text not null,
  em         timestamptz not null default clock_timestamp()
);
comment on table blindagem.assinaturas is
  'Estado esperado de objetos guardados por assinatura (20261008000375). Alterar exige blindagem.autorizar_guarda.';
alter table blindagem.assinaturas enable row level security;
drop trigger if exists blindagem_guarda on blindagem.assinaturas;
drop trigger if exists blindagem_guarda_trunc on blindagem.assinaturas;
create trigger blindagem_guarda before insert or update or delete on blindagem.assinaturas
  for each row execute function blindagem.guarda_tabela();
create trigger blindagem_guarda_trunc before truncate on blindagem.assinaturas
  for each statement execute function blindagem.guarda_tabela();
alter table blindagem.assinaturas enable always trigger blindagem_guarda;
alter table blindagem.assinaturas enable always trigger blindagem_guarda_trunc;
revoke all on blindagem.assinaturas from public, anon, authenticated, service_role;

create or replace function blindagem._gps_admins_estado()
returns text
language sql
stable
set search_path = ''
as $f$
  select coalesce(string_agg(x, E'\n' order by x), '<sem tabelas>')
    from (
      select format('rel %s rls=%s force=%s acl=%s', c.oid::regclass, c.relrowsecurity, c.relforcerowsecurity,
                    coalesce(c.relacl::text, 'null'))
        from pg_catalog.pg_class c
       where c.oid in (to_regclass('gps.admins'), to_regclass('gps.admins_log'))
      union all
      select format('pol %s.%s %s %s %s using=%s check=%s', p.tablename, p.policyname, p.permissive,
                    p.roles::text, p.cmd, coalesce(p.qual, '-'), coalesce(p.with_check, '-'))
        from pg_catalog.pg_policies p
       where p.schemaname = 'gps' and p.tablename in ('admins', 'admins_log')
      union all
      select format('trg %s.%s %s %s', t.tgrelid::regclass, t.tgname, t.tgenabled, t.tgfoid::regprocedure)
        from pg_catalog.pg_trigger t
       where t.tgrelid in (to_regclass('gps.admins'), to_regclass('gps.admins_log'))
         and not t.tgisinternal
      union all
      select format('rule %s.%s %s', r.ev_class::regclass, r.rulename, pg_catalog.pg_get_ruledef(r.oid))
        from pg_catalog.pg_rewrite r
       where r.ev_class in (to_regclass('gps.admins'), to_regclass('gps.admins_log'))
      union all
      select format('col %s.%s %s notnull=%s default=%s', a.attrelid::regclass, a.attname,
                    pg_catalog.format_type(a.atttypid, a.atttypmod), a.attnotnull,
                    coalesce(pg_catalog.pg_get_expr(d.adbin, d.adrelid), '-'))
        from pg_catalog.pg_attribute a
        left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
       where a.attrelid in (to_regclass('gps.admins'), to_regclass('gps.admins_log'))
         and a.attnum > 0 and not a.attisdropped
      union all
      select format('con %s.%s %s', c.conrelid::regclass, c.conname, pg_catalog.pg_get_constraintdef(c.oid))
        from pg_catalog.pg_constraint c
       where c.conrelid in (to_regclass('gps.admins'), to_regclass('gps.admins_log'))
    ) s(x)
$f$;

create or replace function blindagem.guarda_gps_admins()
returns event_trigger
language plpgsql
security definer
set search_path = ''
as $f$
declare
  v_texto  text;
  v_antes  blindagem.assinaturas%rowtype;
  v_motivo text;
begin
  begin
    v_texto := blindagem._gps_admins_estado();
    select * into v_antes from blindagem.assinaturas a where a.objeto = 'gps.admins+admins_log';
  exception when others then
    raise warning 'blindagem.guarda_gps_admins: conferência falhou (%: %) — DDL segue sem conferir', sqlstate, sqlerrm;
    return;
  end;
  if v_antes.assinatura is null or v_antes.assinatura = md5(v_texto) then
    return;
  end if;
  v_motivo := blindagem._motivo(current_setting('app.mudanca_guarda', true));
  if v_motivo is null then
    raise exception 'blindagem: % mudou privilégio, policy, RLS ou gatilho de gps.admins/gps.admins_log. Autorize na mesma transação: select blindagem.autorizar_guarda(''<motivo com 10+ caracteres>'')', tg_tag
      using errcode = '42501';
  end if;
  insert into blindagem.auditoria_funcoes
    (objeto, comando, antes, depois, usuario_corrente, jwt_sub, application_name, motivo)
  values ('gps.admins+admins_log (acl/policy/rls/gatilhos)', tg_tag, v_antes.texto, v_texto,
          blindagem._papel(), blindagem._jwt_sub(), current_setting('application_name', true), v_motivo);
  update blindagem.assinaturas
     set assinatura = md5(v_texto), texto = v_texto, em = clock_timestamp()
   where objeto = 'gps.admins+admins_log';
end
$f$;

revoke all on function blindagem._gps_admins_estado()  from public, anon, authenticated, service_role;
revoke all on function blindagem.guarda_gps_admins()   from public, anon, authenticated, service_role;

insert into blindagem.assinaturas (objeto, assinatura, texto)
select 'gps.admins+admins_log', md5(blindagem._gps_admins_estado()), blindagem._gps_admins_estado()
on conflict (objeto) do nothing;

drop event trigger if exists blindagem_guarda_gps_admins;
create event trigger blindagem_guarda_gps_admins on ddl_command_end
  when tag in ('GRANT', 'REVOKE', 'CREATE POLICY', 'ALTER POLICY', 'DROP POLICY', 'ALTER TABLE',
               'CREATE TRIGGER', 'ALTER TRIGGER', 'DROP TRIGGER', 'DROP TABLE',
               'CREATE RULE', 'DROP RULE')
  execute function blindagem.guarda_gps_admins();
alter event trigger blindagem_guarda_gps_admins enable always;

commit;
