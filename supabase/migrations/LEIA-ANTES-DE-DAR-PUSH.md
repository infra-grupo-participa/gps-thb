# ⚠️ As migrations `…291` a `…298` JÁ ESTÃO APLICADAS no banco

**Data:** 22/09/2026 · **Projeto:** `mbvybujpkwuorhtdzcde`

## O fato

As **8** migrations da Agenda de Sessões estão **aplicadas em produção**, mas o
banco **não as registrou com estes nomes de arquivo**. Elas foram aplicadas em
17 pedaços (limite de tamanho por chamada), e `supabase_migrations.schema_migrations`
guarda os nomes dos pedaços:

```
20260922184438  gps_sessao_estrutura_parte1
20260922184511  gps_sessao_estrutura_parte2
20260922184635  gps_sessao_rpcs_parte1
20260922184745  gps_sessao_rpcs_parte2a
20260922184812  gps_sessao_agendar
20260922184913  gps_sessao_cancelar_falta_briefing
20260922185049  gps_sessao_emails_colunas_e_reconciliacao
20260922185130  gps_sessao_alarme_saude_envio
20260922185249  gps_sessao_disparar_emails
20260922193916  gps_disc_rico_colunas
20260922193938  gps_sessao_resumo_e_link_dono
20260922194003  gps_sessao_briefing_disc_ao_vivo
20260922194840  gps_sessao_concluir_e_resumo
20260922195058  gps_sessao_link_base
20260922195150  gps_sessao_link_rpcs
20260922195631  gps_sessao_resumo_ler        ← hoje tem arquivo: …298
20260922200521  gps_entrevista_colunas_travadas
20260922xxxxxx  gps_sessao_link_precedencia_falha_fechado  ← correção do pentest
```

## 🔴 O que acontece num `supabase db push`

O CLI vê 8 arquivos que o banco não conhece e tenta aplicá-los. Medido:

| statement | efeito ao reaplicar |
|---|---|
| `create table` (na `…291`, **sem** `if not exists`) | 🔴 **42P07 — o push ABORTA** |
| `create or replace function` | idempotente |
| `add column if not exists` | idempotente |
| `drop constraint if exists` + `add constraint` | idempotente |
| `insert … on conflict do nothing` | idempotente |
| `cron.schedule('sessao-emails', …)` | atualiza o job, não duplica |

**Não perde dado.** Trava o deploy, e quem investigar vai concluir que o banco
divergiu do repo — quando na verdade está adiantado.

## O que fazer antes do próximo push

Uma das duas, **nunca as duas**:

1. **Marcar as 8 como aplicadas** sem executar:
   `supabase migration repair --status applied 20260922000291` (e as outras 7).
   É o caminho certo: o banco já tem o conteúdo delas.

2. **Ou** tornar a `…291` idempotente (`create table if not exists` nas 5) e
   deixar o push rodar. Mais arriscado: `create or replace function` sobre
   função viva reescreve o corpo, e se o arquivo tiver ficado para trás do que
   está no banco, **regride**.

⚠️ O arquivo `…296` no repo tem uma correção que o banco também tem
(`split_part` com o delimitador, achado ao aplicar) — os dois estão em dia.
✅ **`gps.sessao_resumo_ler` JÁ TEM arquivo**: `…298`, criado em 22/09 depois
de se notar que ela existia no banco e não no repo. Reconstruir do zero agora
a inclui.

⚠️ **A `…296` mudou depois de aplicada**: a precedência do link passou a falhar
FECHADO (`coalesce(link_por_equipe, true)`), correção de um achado MÉDIO do
pentest que eu explorei e confirmei. **O arquivo e o banco estão em dia** — a
correção foi aplicada nos dois.

## Como conferir o estado real

```sql
select version, name from supabase_migrations.schema_migrations
 where version >= '20260922' order by version;

select count(*) from information_schema.tables
 where table_schema='gps' and table_name like 'sessao_%';   -- 5

select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='gps' and p.proname like 'sessao\_%';       -- 17
```
