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
| **Os 30 clientes** | 🔴 **Perdidos.** Não há vestígio em lixeira, evento ou log |

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

## Decisões pendentes

**1. Os 30 clientes.** Não são recuperáveis por backup (o restore não pôde ser
trazido para projeto novo). A única saída é **pedir a lista a ele** — ele
montou uma vez, provavelmente tem em algum lugar.

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
