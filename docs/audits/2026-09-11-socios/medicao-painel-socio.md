# Medição — acrescentar `socio_nome` a `gps.admin_painel_alunos`

O Marcio pediu o nome do sócio no cartão do aluno. Duas formas de obtê-lo;
medi as duas antes de escolher (protocolo de sustentabilidade).

## Linha de base (o que a RPC faz hoje)

```sql
select m.aluno_id, count(*)::int, bool_or(m.user_id is not null)
from gps.membros m left join auth.users u on u.id=m.user_id
group by m.aluno_id;
```
**0,31 ms · 95 buffers · Index Only Scan** (`membros_aluno_user_uk`)

## Opção A — join do sócio dentro da CTE `amb` (a que o arquiteto sugeriu)

```sql
left join public.thb_alunos ts on ts.id = m.pessoa_aluno_id and m.papel='socio'
```
**1,98 ms · 1049 buffers** — 6,4× mais lento.

🔑 **Por quê:** o `left join` em `thb_alunos` **mata o Index Only Scan**. O plano
vira Nested Loop com heap fetch em TODAS as 153 linhas de membro, para
aproveitar só as 10 que são sócio. Paga-se o acesso à heap por todo mundo.

## Opção B — CTE separada só com os sócios ✅ ESCOLHIDA

```sql
with soc as (
  select m.aluno_id, coalesce(ts.nome, u.email) socio_nome
  from gps.membros m
  left join auth.users u on u.id = m.user_id
  left join public.thb_alunos ts on ts.id = m.pessoa_aluno_id
  where m.papel = 'socio'
)
```
**0,60 ms · 163 buffers** — 3,3× mais rápida que a A, +0,29 ms sobre a base.

A varredura principal continua **Index Only Scan**; a CTE toca só as **10**
linhas de sócio e entra por `Merge Left Join`.

## Escala

Hoje: 143 ambientes, 10 sócios. Com a feature no ar, o teto é **1 sócio por
ambiente** → no máximo ~143 linhas na CTE. Com 10× a base (1.430 ambientes),
a CTE cresce linearmente e continua indexada por `membros_aluno_id_idx`.

⚠️ O `Seq Scan` no filtro `papel='socio'` é sobre 153 linhas (10 buffers) —
irrelevante nesta escala. **Se `gps.membros` passar de ~5.000 linhas**, criar
`idx (aluno_id) where papel='socio'` e medir de novo.

## Como aplicar

🔴 Extrair o corpo vigente com **`pg_get_functiondef`**, nunca copiar de
migration antiga — a regra está escrita na `…234` e ignorá-la já reverteu os
5 cards de classe em silêncio.
`drop function` antes (mudar `returns table` exige).
Conferência de não-regressão obrigatória: `classe` hoje = captação 19 ·
inicial 118.
