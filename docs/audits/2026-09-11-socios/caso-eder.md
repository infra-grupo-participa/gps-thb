# Caso Eder Fagundes da Silva — estado em 11/09/2026

## O que aconteceu

Em **10/09 às 15:20** excluí o ambiente dele por engano, na limpeza dos
acessos sobressalentes. A tabela mostrava "30 clientes" e eu não parei para
perguntar por que alguém com 30 clientes estaria fora da planilha — a resposta
era **duplicidade de CPF em dois e-mails**.

`gps.acessos_log` registra: `acesso_excluido` em 10/09 15:20.

## O que foi recuperado

| | |
|---|---|
| Acesso | ✅ **Recriado em 10/09 16:24** |
| Ele entrou? | ✅ Sim, **10/09 19:45** |
| Onboarding | ✅ Refez e **concluiu** (passo 6, origem "captação") |
| Financeiro | ✅ Vinculado (log `financeiro_vinculado`, 10/09 18:06) |
| **Os 30 clientes** | ✅ **RECUPERADOS em 11/09** — ver abaixo |

## A raiz: dois cadastros, mesmo CPF

`public.thb_alunos` tem **duas linhas** com o documento `74942778620`:

| e-mail | importado | fonte | tem login | membro |
|---|---|---|---|---|
| `eder.fagundes@adv.oabmg.org.br` | 29/06 | `central_2026` | ✅ | ✅ titular |
| `fagundes.eder.2009@gmail.com` | 17/03 | `planilha_acessos_2026` | ❌ | ❌ |

⚠️ **A planilha de sócios usa o e-mail `fagundes.eder.2009@gmail.com`** (o
SEM login), com sócio **Josi Toste Campos**. Por isso ele apareceu como
"titular sem login" na conciliação — o sistema conhece o OUTRO e-mail dele.

🔑 `thb_alunos` **não tem índice único em `documento`**, e o gatilho
`on_auth_user_created_gps` casa por CPF escolhendo o `importado_em` mais
recente. Com a duplicata, quem se cadastrasse pelo e-mail antigo grudaria na
linha errada.

## ✅ Como os 30 clientes foram recuperados (11/09/2026)

**O caminho que funcionou: "Restore to a New Project".**

O que eu havia dito na véspera — "não são recuperáveis" — estava errado. O
projeto tinha **backups físicos habilitados** (`walg_enabled: true`), e o de
**10/09 às 06:30 UTC (03:30 BRT)** era anterior à exclusão das 15:20.

### Por que NÃO se restaura por cima da produção

Medido antes de decidir: um PITR/restore para antes das 15:20 apagaria

| o que se perderia | qtd |
|---|---:|
| clientes cadastrados depois | **210** |
| onboardings concluídos | **66** |
| acessos criados no evento | 9 |
| chamados | 6 |
| inscrições do plantão | 20 |

Recuperar 30 destruindo 210 não é recuperação. O projeto separado existe
justamente para não fazer essa troca.

### Os caminhos que estavam fechados (conferidos, não supostos)

| caminho | por quê |
|---|---|
| WAL | só 16 MB retidos; os slots estavam atualizados, o log de ontem já reciclado |
| tuplas mortas | autovacuum passou em `etapa1_clientes` às **15:21**, 1 min após o delete |
| `pg_dirtyread` | não disponível no Supabase |
| eventos órfãos | zero — a exclusão em cascata levou tudo |
| API de restore | só existe sobre a produção; o clone é **exclusivo do painel web** |

### O passo a passo (para repetir, se precisar)

1. Painel → `database/backups/restore-to-new-project`, escolher o backup
   ANTERIOR ao incidente. Custa ~US$0,34/dia (cobrança por hora).
2. 🔴 **Assim que o projeto subir, DESLIGAR TODOS OS CRONS.** Ele vem com
   `pg_cron` + `pg_net` ativos, incluindo `plantao-emails-sala` (*/5 min), que
   dispara e-mail REAL pela Resend. No nosso caso ele chegou a rodar 1× às
   11:10 e devolveu `0 rows` — ninguém recebeu e-mail duplicado, mas foi por
   pouco.
3. Gerar o INSERT no banco de ORIGEM com `quote_nullable`/`quote_literal`.
   ⚠️ `format('%s', boolean)` imprime `f`/`t`, que **não é literal SQL válido**
   — usar `::text` no booleano, que dá `false`/`true`.
4. Conferir no destino que o ambiente está vazio e os IDs livres.
5. Inserir e conferir campo a campo contra a origem.
6. **Apagar o projeto** (`DELETE /v1/projects/{ref}`).

### O resultado

| | backup | produção depois |
|---|---:|---:|
| clientes | 30 | **30** |
| com nome + telefone | 28 | **28** |
| favorito | Ricardo Cancio | **Ricardo Cancio** |
| com anotação de contato | 8 | **8** |
| datas de criação | 17–27/07 | **17–27/07** |

Os IDs originais foram preservados, então nada quebra em referência antiga.

⚠️ As triggers de congelamento (`nivel_relacionamento`, `status`) barram
**UPDATE**, não INSERT — provado em rollback antes de gravar. Por isso os
valores históricos (`frio`/`morno`/`quente`, `pendente`) entraram intactos.

## Decisões pendentes

**2. O cadastro duplicado.** Hoje não causa dano (o membro está no cadastro
certo, o de 29/06), mas é uma armadilha: qualquer fluxo futuro que case por
CPF pode escolher a linha errada. Opções: apagar a linha órfã de 17/03, ou
deixar e documentar.

**3. O sócio dele (Josi Toste Campos).** A planilha aponta o par pelo e-mail
`fagundes.eder.2009@gmail.com`. Quando a aba Equipe for ligada, quem convida é
o login ativo (`eder.fagundes@adv.oabmg.org.br`) — o convite funciona
normalmente, é só o titular convidar.

## O que impediu a repetição

`gps.lixeira_ambientes` + `gps.admin_excluir_acesso(uuid, boolean)` com P0004:
exclusão passa a exigir confirmação explícita quando o ambiente tem conteúdo.
