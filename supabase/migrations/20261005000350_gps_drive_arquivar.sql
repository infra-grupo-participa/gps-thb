-- ═══════════════════════════════════════════════════════════════════════════
-- 350 — Google Drive, Fase 2: arquivar a pasta do cliente/parceiro excluído
-- ═══════════════════════════════════════════════════════════════════════════
-- Fecha a lacuna LGPD da 347: excluir cliente (ou o ambiente) deixava a pasta
-- do cliente, com documentos de terceiros, em "Pastas dos Alunos".
--
-- * Tarefa nova 'arquivar' (aluno_id e cliente_id NULOS → sobrevive ao
--   cascade, como a 'revogar'); o file_id da pasta fica em
--   drive_tarefas.file_id e sai em drive_tarefa_pegar (chave 'file_id').
--   A edge move a pasta para `_Arquivados` (gps_id 'arquivados', criada uma
--   vez dentro de 1CRSsOfNm…).
-- * Gatilho BEFORE DELETE em gps.etapa1_clientes: arquiva a raiz_cliente,
--   marca arquivada_em e anonimiza o nome da raiz ('(cliente excluído)').
-- * Gatilho BEFORE DELETE em gps.ambientes: arquiva a raiz_parceiro, marca
--   as pastas do parceiro, marca para revogar as permissões vivas que o
--   sistema deu, e ABSORVE as tarefas de cliente do mesmo ambiente (a pasta
--   do parceiro leva as dos clientes junto): excluir o ambiente = UMA tarefa.
-- * drive_pastas: FKs cliente_id/aluno_id viram ON DELETE SET NULL (a linha
--   fica como trilha do que foi arquivado), aluno_id aceita null.
--
-- 🔑 Por que NÃO recriei gps.admin_excluir_acesso (set_config
-- 'gps.excluindo_ambiente'): etapa1_clientes.aluno_id referencia
-- public.thb_alunos, NÃO gps.ambientes — não há cascade ambiente→cliente.
-- admin_excluir_acesso (…288) e admin_converter_titular_em_socio (…287)
-- apagam os clientes EXPLICITAMENTE antes do ambiente. Os gatilhos dos
-- clientes rodam primeiro; o do ambiente, por último, descarta as tarefas
-- de cliente criadas nesta mesma transação e marca 'feito' as pendentes
-- antigas do mesmo ambiente. Cobre todo caminho que apaga ambiente, sem
-- recriar função viva.
--
-- 🔴 drive_tarefa_pegar É recriada (para devolver file_id): a trava abaixo
-- confere o md5 do corpo VIVO contra o corpo da 347 do repo (com e sem as
-- linhas de comentário) e aborta se divergir.
--
-- DOWN (comentado — rodar à mão):
--   drop trigger if exists trg_etapa1_clientes_drive_arquivar on gps.etapa1_clientes;
--   drop trigger if exists trg_ambientes_drive_arquivar on gps.ambientes;
--   drop function if exists gps.drive_cliente_arquivar();
--   drop function if exists gps.drive_ambiente_arquivar();
--   (drive_tarefa_pegar: recriar com o corpo da 347, seção 8.1)
--   CHECKs/FKs: só depois de resolver as linhas com tipo 'arquivar' e as
--   drive_pastas com aluno_id/cliente_id nulos (arquivar, nunca apagar).
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '2s';
set local statement_timeout = '20s';

-- ═══════════════════════════════════════════════════════════════════════════
-- 0) Trava: corpo VIVO de drive_tarefa_pegar = o da 347
-- ═══════════════════════════════════════════════════════════════════════════
-- 011057164cee3aa099f135691b7358c1 = corpo da 347 byte a byte
-- fd6babfaf4c3d17c75210c361e4776e6 = o mesmo sem as linhas '--' (aplicação pelo MCP)
-- <<MD5_VIVO>> = escape manual: preencher só depois de conferir à mão o
--               diff entre o vivo e o corpo abaixo.
do $$
declare
  v_md5 text;
begin
  select md5(p.prosrc) into v_md5
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'gps' and p.proname = 'drive_tarefa_pegar'
     and pg_get_function_identity_arguments(p.oid) = 'p_limite integer';
  if v_md5 is null then
    raise exception 'gps.drive_tarefa_pegar(int) nao encontrada -- migracao abortada';
  end if;
  if v_md5 not in ('011057164cee3aa099f135691b7358c1',
                   'fd6babfaf4c3d17c75210c361e4776e6',
                   '<<MD5_VIVO>>') then
    raise exception 'drive_tarefa_pegar viva diverge da 347 (md5 %) -- migracao abortada; ler pg_get_functiondef e reconciliar', v_md5;
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) drive_tarefas: tipo 'arquivar', file_id, origem_aluno_id
-- ═══════════════════════════════════════════════════════════════════════════
alter table gps.drive_tarefas
  add column file_id text
    constraint drive_tarefas_file_id_formato check (file_id is null or file_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  add column origem_aluno_id uuid;

comment on column gps.drive_tarefas.file_id is
  'So tarefa arquivar (…350): pasta a mover para _Arquivados. Devolvido por drive_tarefa_pegar.';
comment on column gps.drive_tarefas.origem_aluno_id is
  'So tarefa arquivar (…350): ambiente de origem, SEM FK (sobrevive a exclusao). Usado pelo gatilho do ambiente para absorver as tarefas dos clientes.';

-- 1.1 CHECK do tipo, a partir do VIVO (molde da …345)
do $$
declare
  v_def   text;
  v_vivos text[];
  v_novos text[];
begin
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
   where c.conrelid = 'gps.drive_tarefas'::regclass
     and c.conname  = 'drive_tarefas_tipo_check';
  if v_def is null then
    raise exception 'drive_tarefas_tipo_check nao encontrado -- migracao abortada';
  end if;
  if v_def !~ 'ARRAY\[' or v_def ~ '''\{' then
    raise exception 'drive_tarefas_tipo_check em formato inesperado -- migracao abortada. Def: %', v_def;
  end if;

  select array_agg(m[1] order by ord) into v_vivos
    from regexp_matches(v_def, '''([^'']+)''', 'g') with ordinality as r(m, ord);
  if v_vivos is null or not ('revogar' = any (v_vivos)) then
    raise exception 'drive_tarefas_tipo_check sem revogar (ancora da 347) -- migracao abortada. Def: %', v_def;
  end if;
  if exists (select 1 from unnest(v_vivos) x where x ~ '[,{}]') then
    raise exception 'valor extraido do CHECK com virgula/chave -- migracao abortada. Def: %', v_def;
  end if;

  select array_agg(distinct x order by x) into v_novos
    from unnest(v_vivos || array['arquivar']) x;
  if exists (select 1 from unnest(v_vivos) x where x <> all (v_novos)) then
    raise exception 'lista nova perdeu valor vivo -- migracao abortada';
  end if;

  alter table gps.drive_tarefas drop constraint drive_tarefas_tipo_check;
  execute format(
    'alter table gps.drive_tarefas add constraint drive_tarefas_tipo_check check (tipo = any (array[%s])) not valid',
    (select string_agg(quote_literal(x) || '::text', ', ' order by x) from unnest(v_novos) x));
  alter table gps.drive_tarefas validate constraint drive_tarefas_tipo_check;
end $$;

-- 1.2 aluno nulo: 'revogar' E 'arquivar' (conferido contra o vivo)
do $$
declare
  v_def  text;
  v_norm text;
begin
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
   where c.conrelid = 'gps.drive_tarefas'::regclass
     and c.conname  = 'drive_tarefas_aluno_coerente';
  v_norm := regexp_replace(coalesce(v_def, ''), '[\s()]|::text', '', 'g');
  if v_norm <> 'CHECKtipo=''revogar''=aluno_idISNULL' then
    raise exception 'drive_tarefas_aluno_coerente diverge do esperado -- migracao abortada. Def: %', v_def;
  end if;
  alter table gps.drive_tarefas drop constraint drive_tarefas_aluno_coerente;
  alter table gps.drive_tarefas add constraint drive_tarefas_aluno_coerente
    check ((tipo in ('revogar', 'arquivar')) = (aluno_id is null)) not valid;
  alter table gps.drive_tarefas validate constraint drive_tarefas_aluno_coerente;
end $$;

alter table gps.drive_tarefas
  add constraint drive_tarefas_arquivar_coerente
  check ((tipo = 'arquivar') = (file_id is not null));

-- No máximo UMA 'arquivar' ativa por pasta (aluno_id nulo escapa de
-- drive_tarefas_ativa_uq: nulos são distintos).
create unique index drive_tarefas_arquivar_ativa_uq
  on gps.drive_tarefas (file_id)
  where tipo = 'arquivar' and estado in ('pendente', 'rodando');

-- Absorção pelo gatilho do ambiente.
create index drive_tarefas_arquivar_origem_idx
  on gps.drive_tarefas (origem_aluno_id)
  where tipo = 'arquivar' and estado = 'pendente';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) drive_pastas: arquivada_em, FKs ON DELETE SET NULL, CHECK coerente
-- ═══════════════════════════════════════════════════════════════════════════
alter table gps.drive_pastas
  add column arquivada_em timestamptz;

comment on column gps.drive_pastas.arquivada_em is
  'Carimbo do arquivamento (…350): cliente ou ambiente excluido. A linha fica (cliente_id/aluno_id viram null pelo ON DELETE SET NULL) como trilha da pasta movida para _Arquivados.';

alter table gps.drive_pastas alter column aluno_id drop not null;

do $$
declare
  v_fk record;
begin
  for v_fk in
    select c.conname, a.attname
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.conrelid = 'gps.drive_pastas'::regclass
       and c.contype = 'f'
       and cardinality(c.conkey) = 1
       and a.attname in ('aluno_id', 'cliente_id')
  loop
    execute format('alter table gps.drive_pastas drop constraint %I', v_fk.conname);
  end loop;
end $$;

alter table gps.drive_pastas
  add constraint drive_pastas_aluno_id_fkey
    foreign key (aluno_id) references gps.ambientes(aluno_id) on delete set null not valid,
  add constraint drive_pastas_cliente_id_fkey
    foreign key (cliente_id) references gps.etapa1_clientes(id) on delete set null not valid;
alter table gps.drive_pastas validate constraint drive_pastas_aluno_id_fkey;
alter table gps.drive_pastas validate constraint drive_pastas_cliente_id_fkey;

do $$
declare
  v_def  text;
  v_norm text;
begin
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
   where c.conrelid = 'gps.drive_pastas'::regclass
     and c.conname  = 'drive_pastas_cliente_coerente';
  v_norm := regexp_replace(coalesce(v_def, ''), '[\s()]|::text', '', 'g');
  if v_norm <> 'CHECKpapel=ANYARRAY[''raiz_cliente'',''sub_cliente'']=cliente_idISNOTNULL' then
    raise exception 'drive_pastas_cliente_coerente diverge do esperado -- migracao abortada. Def: %', v_def;
  end if;
  alter table gps.drive_pastas drop constraint drive_pastas_cliente_coerente;
  -- cliente_id só em pasta de cliente; pasta de cliente pode ficar com
  -- cliente_id null (SET NULL da exclusão). NÃO exige arquivada_em: o
  -- gatilho engole erro, e a exclusão nunca pode depender dele.
  alter table gps.drive_pastas add constraint drive_pastas_cliente_coerente
    check (cliente_id is null or papel in ('raiz_cliente', 'sub_cliente')) not valid;
  alter table gps.drive_pastas validate constraint drive_pastas_cliente_coerente;
end $$;

-- RI do SET NULL e os gatilhos: sem índice por aluno/cliente cheio, cada
-- exclusão varreria drive_pastas inteira.
create index drive_pastas_aluno_idx   on gps.drive_pastas (aluno_id);
create index drive_pastas_cliente_idx on gps.drive_pastas (cliente_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) Gatilhos de arquivamento
-- ═══════════════════════════════════════════════════════════════════════════
-- Regra da casa (347/348): falha aqui NUNCA impede a exclusão. Corpo em
-- begin/exception → warning. Pior caso: pasta não arquivada, com cliente_id/
-- aluno_id null e arquivada_em null em drive_pastas (achável por SQL).
create or replace function gps.drive_cliente_arquivar()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_raiz  text;
  v_aluno uuid;
begin
  begin
    select p.file_id, p.aluno_id into v_raiz, v_aluno
      from gps.drive_pastas p
     where p.cliente_id = old.id and p.papel = 'raiz_cliente';

    update gps.drive_pastas p
       set arquivada_em = coalesce(p.arquivada_em, now()),
           nome = case when p.papel = 'raiz_cliente' then '(cliente excluído)' else p.nome end
     where p.cliente_id = old.id;

    if v_raiz is not null then
      insert into gps.drive_tarefas (tipo, aluno_id, file_id, origem_aluno_id)
      values ('arquivar', null, v_raiz, coalesce(v_aluno, old.aluno_id))
      on conflict (file_id) where tipo = 'arquivar' and estado in ('pendente', 'rodando') do nothing;
    end if;
  exception when others then
    raise warning 'drive: arquivamento do cliente nao enfileirado (%): %', sqlstate, sqlerrm;
  end;
  return old;
end;
$function$;

revoke all on function gps.drive_cliente_arquivar() from public, anon, authenticated, service_role;

create trigger trg_etapa1_clientes_drive_arquivar
  before delete on gps.etapa1_clientes
  for each row execute function gps.drive_cliente_arquivar();

create or replace function gps.drive_ambiente_arquivar()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_raiz text;
  v_n    int;
begin
  begin
    select p.file_id into v_raiz
      from gps.drive_pastas p
     where p.aluno_id = old.aluno_id and p.papel = 'raiz_parceiro';

    update gps.drive_pastas p
       set arquivada_em = coalesce(p.arquivada_em, now()),
           nome = case p.papel
                    when 'raiz_parceiro' then '(parceiro excluído)'
                    when 'raiz_cliente'  then '(cliente excluído)'
                    else p.nome
                  end
     where p.aluno_id = old.aluno_id;

    if v_raiz is not null then
      -- A pasta do parceiro leva as dos clientes junto: as tarefas de cliente
      -- desta transação (criado_em = now() = início da transação) somem; as
      -- pendentes antigas do mesmo ambiente ficam como 'feito' com aviso.
      delete from gps.drive_tarefas t
       where t.tipo = 'arquivar' and t.estado = 'pendente'
         and t.origem_aluno_id = old.aluno_id
         and t.criado_em = now();
      update gps.drive_tarefas t
         set estado = 'feito', aviso = 'coberto_pelo_parceiro', concluido_em = now()
       where t.tipo = 'arquivar' and t.estado = 'pendente'
         and t.origem_aluno_id = old.aluno_id;

      insert into gps.drive_tarefas (tipo, aluno_id, file_id, origem_aluno_id)
      values ('arquivar', null, v_raiz, old.aluno_id)
      on conflict (file_id) where tipo = 'arquivar' and estado in ('pendente', 'rodando') do nothing;
    end if;

    -- Reusa a marcação da 347: permissão viva que o sistema deu neste ambiente
    -- (o gatilho de gps.membros já marca a do titular; isto cobre o resto).
    update gps.drive_permissoes p
       set revogar_desde = now(), revogar_motivo = 'membro_removido',
           tentativas = 0, erro_detalhe = null
     where p.aluno_id = old.aluno_id
       and p.revogado_em is null
       and p.revogar_desde is null;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      perform gps.drive_revogar_enfileirar();
    end if;
  exception when others then
    raise warning 'drive: arquivamento do ambiente nao enfileirado (%): %', sqlstate, sqlerrm;
  end;

  return old;
end;
$function$;

revoke all on function gps.drive_ambiente_arquivar() from public, anon, authenticated, service_role;

create trigger trg_ambientes_drive_arquivar
  before delete on gps.ambientes
  for each row execute function gps.drive_ambiente_arquivar();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) drive_tarefa_pegar: + 'file_id' (corpo da 347, conferido acima)
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function gps.drive_tarefa_pegar(p_limite int default 3)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_ids uuid[];
  v_n   int;
begin
  if not gps.drive_ativo() then
    return '[]'::jsonb;
  end if;

  perform pg_advisory_xact_lock(hashtext('gps.drive_tarefa_pegar'));

  with cand as (
    select distinct on (t.aluno_id) t.id, t.proxima_em
      from gps.drive_tarefas t
     where t.estado = 'pendente'
       and t.proxima_em <= now()
       -- 'revogar' tem aluno_id nulo: "is not distinct from" faz duas
       -- revogar nunca rodarem juntas (o conjunto rodando é minúsculo).
       and not exists (
         select 1 from gps.drive_tarefas r
          where r.aluno_id is not distinct from t.aluno_id and r.estado = 'rodando')
     order by t.aluno_id, t.proxima_em
  ), lim as (
    select c.id from cand c
     order by c.proxima_em
     limit least(greatest(coalesce(p_limite, 3), 1), 10)
  ), upd as (
    update gps.drive_tarefas t
       set estado = 'rodando', iniciado_em = now()
      from lim
     where t.id = lim.id
    returning t.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from upd;

  -- E-mail trocado FORA do painel (updateUser, outro portal do grupo): nenhum
  -- gatilho do GPS vê. Ao processar provisionar/compartilhar, toda permissão
  -- viva que o sistema deu a quem não é mais (titular, mesmo e-mail atual)
  -- vira revogação. Aqui e não em drive_revogacoes_listar: a listagem só roda
  -- quando já existe tarefa 'revogar', e a troca externa não cria nenhuma.
  update gps.drive_permissoes p
     set revogar_desde = now(), revogar_motivo = 'email_trocado',
         tentativas = 0, erro_detalhe = null
   where p.revogado_em is null
     and p.revogar_desde is null
     and p.aluno_id in (select t.aluno_id from gps.drive_tarefas t
                         where t.id = any(v_ids)
                           and t.tipo in ('provisionar_parceiro', 'compartilhar'))
     and not exists (select 1
                       from gps.membros m
                       join auth.users u on u.id = m.user_id
                      where m.aluno_id = p.aluno_id
                        and m.user_id = p.user_id
                        and m.papel = 'titular'
                        and lower(btrim(u.email)) = p.email);
  get diagnostics v_n = row_count;
  if v_n > 0 then
    perform gps.drive_revogar_enfileirar();
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',              t.id,
      'tipo',            t.tipo,
      'aluno_id',        t.aluno_id,
      'cliente_id',      t.cliente_id,
      -- …350: tarefa 'arquivar' (aluno_id nulo) leva a pasta aqui.
      'file_id',         t.file_id,
      'tentativas',      t.tentativas,
      'parceiro_nome',   (select nullif(btrim(a.nome), '') from public.thb_alunos a where a.id = t.aluno_id),
      'pasta_drive_url', amb.pasta_drive_url,
      -- Adoção de pasta existente exige origem 'equipe' E pedido de admin
      -- (mesmo predicado de public.gp_is_admin, aplicado a quem pediu).
      'pasta_drive_origem', amb.pasta_drive_origem,
      'solicitado_por_admin', coalesce((select true from public.perfis p
                                         where p.id = t.solicitado_por
                                           and p.status = 'ativo'
                                           and p.cargo in ('dev', 'admin')), false),
      'titular_email',   (select lower(btrim(u.email))
                            from gps.membros m
                            join auth.users u on u.id = m.user_id
                           where m.aluno_id = t.aluno_id and m.papel = 'titular'
                           order by m.criado_em
                           limit 1),
      'cliente_nome',    (select nullif(btrim(c.nome), '') from gps.etapa1_clientes c where c.id = t.cliente_id),
      'cliente_link_url',(select l.url from gps.cliente_links_drive l
                           where l.cliente_id = t.cliente_id and l.removido_em is null),
      'pastas',          (select coalesce(jsonb_object_agg(p.papel,
                                   jsonb_build_object('file_id', p.file_id, 'adotada', p.adotada)), '{}'::jsonb)
                            from gps.drive_pastas p
                           where p.aluno_id = t.aluno_id
                             and p.papel in ('raiz_parceiro', 'documentos', 'clientes')),
      'pasta_cliente',   (select p.file_id from gps.drive_pastas p
                           where p.cliente_id = t.cliente_id and p.papel = 'raiz_cliente')
    ))
      from gps.drive_tarefas t
      left join gps.ambientes amb on amb.aluno_id = t.aluno_id
     where t.id = any(v_ids)
  ), '[]'::jsonb);
end;
$function$;

revoke all on function gps.drive_tarefa_pegar(int) from public, anon, authenticated;
grant execute on function gps.drive_tarefa_pegar(int) to service_role;

commit;
