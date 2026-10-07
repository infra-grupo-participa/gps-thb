-- ═══════════════════════════════════════════════════════════════════════════
-- ENSAIO da …364 (NÃO é migration: só leitura + rollback). Rodar DEPOIS de
-- aplicar a 20261007000364_gps_drive_automatico.sql e colar a saída no
-- relatório. Nenhum UPDATE/DELETE/INSERT sob explain analyze: as duas
-- consultas são os SELECTs puros das funções.
-- 🔴 Tirar este arquivo de supabase/migrations antes de `supabase db push`:
--    o prefixo 20261007000364 colide com a migration de mesma versão.
-- ═══════════════════════════════════════════════════════════════════════════

begin;
set local statement_timeout = '20s';

-- 0) Contagens (número medido antes do backfill)
select
  (select count(*) from gps.ambientes where pasta_drive_url is null)       as ambientes_sem_link,
  (select count(*) from gps.ambientes a
    where a.pasta_drive_url is null
      and not exists (select 1 from gps.drive_tarefas t
                       where t.aluno_id = a.aluno_id
                         and t.tipo in ('provisionar_parceiro', 'compartilhar'))
      and not exists (select 1 from gps.drive_pastas p
                       where p.aluno_id = a.aluno_id
                         and p.papel = 'raiz_parceiro'))                  as elegiveis_backfill,
  -- elegíveis sem titular = pasta criada sem convite (aviso sem_login)
  (select count(*) from gps.ambientes a
    where a.pasta_drive_url is null
      and not exists (select 1 from gps.membros m
                       where m.aluno_id = a.aluno_id and m.papel = 'titular')) as sem_titular,
  (select count(*) from gps.drive_tarefas)                                 as drive_tarefas_total;

-- 1) Backfill: o SELECT que alimenta o INSERT de gps.drive_backfill_enfileirar
--    (limit 10 = teto de drive_backfill_simultaneas).
explain (analyze, buffers)
select 'provisionar_parceiro', a.aluno_id, null, 'backfill'
  from gps.ambientes a
 where a.pasta_drive_url is null
   and not exists (select 1 from gps.drive_tarefas t
                    where t.aluno_id = a.aluno_id
                      and t.tipo in ('provisionar_parceiro', 'compartilhar'))
   and not exists (select 1 from gps.drive_pastas p
                    where p.aluno_id = a.aluno_id
                      and p.papel = 'raiz_parceiro')
 order by a.criado_em nulls last, a.aluno_id
 limit 10;

-- 1b) Vagas do backfill (roda 1×/min com a chave ligada)
explain (analyze, buffers)
select count(*)
  from gps.drive_tarefas t
 where t.origem = 'backfill'
   and t.estado in ('pendente', 'rodando');

-- 2) Pendências: o SELECT inteiro de gps.drive_pendencias (placar + itens)
explain (analyze, buffers)
with ult as (
  select distinct on (t.aluno_id)
         t.aluno_id, t.estado, t.erro, t.aviso, t.atualizado_em
    from gps.drive_tarefas t
   where t.aluno_id is not null
     and t.tipo in ('provisionar_parceiro', 'compartilhar')
   order by t.aluno_id, t.criado_em desc
)
select jsonb_build_object(
         'placar', (select jsonb_build_object(
                             'feitas',   count(*) filter (where u.estado = 'feito'),
                             'na_fila',  count(*) filter (where u.estado in ('pendente', 'rodando')),
                             'com_erro', count(*) filter (where u.estado = 'erro'),
                             'faltando', (select count(*) from gps.ambientes a
                                           where a.pasta_drive_url is null))
                      from ult u),
         'itens',  (select coalesce(jsonb_agg(jsonb_build_object(
                             'aluno_id',      x.aluno_id,
                             'nome',          x.nome,
                             'estado',        x.estado,
                             'erro',          x.erro,
                             'aviso',         x.aviso,
                             'atualizado_em', x.atualizado_em)
                           order by x.atualizado_em desc), '[]'::jsonb)
                      from (select u.aluno_id, u.estado, u.erro, u.aviso, u.atualizado_em,
                                   (select nullif(btrim(al.nome), '')
                                      from public.thb_alunos al
                                     where al.id = u.aluno_id) as nome
                              from ult u
                             where u.erro is not null or u.aviso is not null
                             order by u.atualizado_em desc
                             limit 200) x));

-- 3) Grants das funções novas/recriadas (esperado: só os listados)
select p.proname, p.proacl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'gps'
   and p.proname in ('drive_ambiente_nasceu', 'drive_backfill_enfileirar', 'drive_pendencias',
                     'drive_varrer', 'drive_tarefa_pegar')
 order by 1;

-- 4) Gatilho criado e as chaves desligadas
select tgname, tgenabled from pg_trigger
 where tgrelid = 'gps.ambientes'::regclass and tgname = 'trg_ambientes_drive_nasceu';
select chave, valor from gps.config
 where chave in ('drive_auto_nascimento', 'drive_backfill_ativo', 'drive_backfill_simultaneas',
                 'drive_provisionar_ativo')
 order by 1;

rollback;
