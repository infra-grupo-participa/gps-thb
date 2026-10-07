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

begin;

set local lock_timeout = '3s';
set local statement_timeout = '30s';

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

commit;
