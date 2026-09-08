# Ativar o job diário do Diário de ações do aluno (Fase 2)

Migrations já aplicadas. Falta **1 passo** para o `primeiro_acesso` continuar
sendo capturado para alunos que entrarem DEPOIS do backfill.

Não é uma rota HTTP nem exige segredo/env novo — é uma função SQL
(`gps.aluno_eventos_job_primeiro_acesso()`) chamada direto pelo `pg_cron`,
sem round-trip por fora do banco. Motivo dessa escolha (em vez de encaixar em
`/api/plantao/manutencao`): ver comentário no topo da migração
`20260909000006_gps_aluno_eventos_job_primeiro_acesso.sql` — é outro domínio
(Plantão da Acelera Holding ≠ Diário do GPS) e este job não faz I/O externo.

## Agendar o job diário (SQL Editor do Supabase)

```sql
select cron.schedule(
  'gps-diario-primeiro-acesso',
  '0 9 * * *',  -- 09:00 UTC = 06:00 em São Paulo
  $$select gps.aluno_eventos_job_primeiro_acesso();$$
);
```

Idempotente: rodar mais de uma vez no mesmo dia (ou reprocessar dias
anteriores) não duplica — a função só insere quem ainda não tem
`primeiro_acesso` em `gps.aluno_eventos`.

## Conferir que funcionou

```sql
-- Chamada manual (exige estar logado como admin no SQL Editor, ou psql como
-- postgres): devolve quantos eventos novos foram inseridos nesta chamada.
select gps.aluno_eventos_job_primeiro_acesso();

-- Ver os cron jobs agendados:
select jobid, jobname, schedule, active from cron.job where jobname = 'gps-diario-primeiro-acesso';

-- Ver as últimas execuções:
select * from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'gps-diario-primeiro-acesso')
order by start_time desc limit 5;
```

## Desligar (reversão)

```sql
select cron.unschedule('gps-diario-primeiro-acesso');
```
