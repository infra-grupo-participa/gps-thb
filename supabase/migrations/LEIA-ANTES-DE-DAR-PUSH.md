# ✅ RESOLVIDO em 22/09/2026 — as migrations já estão registradas

**Projeto:** `mbvybujpkwuorhtdzcde`

## O que era o problema

As 9 migrations da Agenda de Sessões estavam **aplicadas em produção**, mas o
banco **não as conhecia por estes nomes de arquivo**: foram aplicadas em 19
pedaços (limite de tamanho por chamada), e `supabase_migrations.schema_migrations`
guardava os nomes dos pedaços (`gps_sessao_estrutura_parte1`, …).

Consequência: `supabase db push` veria 9 arquivos desconhecidos, tentaria
aplicá-los e **abortaria** no `create table` da `…291` (**42P07**, a tabela já
existe). Não perderia dado — travaria o deploy, e quem investigasse concluiria
que o banco divergiu do repo, quando na verdade estava adiantado.

## O que foi feito

As 9 versões foram inseridas em `schema_migrations` **sem executar o conteúdo**
— o equivalente a `supabase migration repair --status applied <versao>`:

```
20260922000291  gps_sessao_estrutura
20260922000292  gps_sessao_rpcs
20260922000293  gps_sessao_emails
20260923000294  gps_sessao_disc_link_resumo
20260923000295  gps_sessao_concluir
20260923000296  gps_sessao_link
20260923000297  gps_entrevista_pelo_aluno
20260923000298  gps_sessao_resumo_ler
20260923000299  gps_config_definir_sessoes_e_minuta
```

Seguro porque o **conteúdo já estava no banco**; o registro é que faltava.
Os 19 registros de pedaço continuam lá, como histórico do que de fato rodou.

## Conferir o estado real

```sql
-- as 9 do repo, registradas:
select version, name from supabase_migrations.schema_migrations
 where version in ('20260922000291','20260922000292','20260922000293',
   '20260923000294','20260923000295','20260923000296','20260923000297',
   '20260923000298','20260923000299') order by version;   -- 9 linhas

select count(*) from information_schema.tables
 where table_schema='gps' and table_name like 'sessao_%';   -- 5

select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='gps' and p.proname like 'sessao\_%';       -- 17
```

## ⚠️ A lição, para a próxima feature grande

Aplicar migration em pedaços por causa do limite de tamanho **desalinha o
registro do repo em silêncio** — nada falha na hora, e a conta só chega no
próximo `db push`, possivelmente com outra pessoa no comando. Quando precisar
fatiar, registre a versão do ARQUIVO no fim, não a do pedaço.
