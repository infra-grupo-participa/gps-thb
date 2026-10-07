-- ENSAIO da …365 (NÃO é migration; só leitura + rollback). Rodar DEPOIS de aplicar
-- e colar a saída no relatório. Manter fora de supabase/migrations.
begin;
set local statement_timeout = '20s';

explain (analyze, buffers)
select jsonb_agg(jsonb_build_object(
         'aluno_id', s.aluno_id, 'nome', s.nome,
         'email_google', s.email_google, 'criado_em', s.criado_em)
       order by s.nome nulls last, s.aluno_id)
  from (select a.aluno_id, al.nome, a.criado_em,
               coalesce(lower(btrim(al.email)) ~ '@(gmail|googlemail)\.com$', false) as email_google
          from gps.ambientes a
          left join public.thb_alunos al on al.id = a.aluno_id
         where a.pasta_drive_url is null
           and not exists (select 1 from gps.drive_tarefas t
                            where t.aluno_id = a.aluno_id
                              and t.tipo in ('provisionar_parceiro', 'compartilhar')
                              and t.estado in ('pendente', 'rodando'))
         order by al.nome nulls last, a.aluno_id
         limit 300) s;

rollback;
