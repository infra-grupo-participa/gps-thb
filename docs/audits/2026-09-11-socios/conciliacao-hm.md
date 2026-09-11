# Conciliação — "Sócios do Programa de Implementação — HM.xlsx" × sistema

Planilha entregue pelo Marcio em 11/09/2026 como **a referência correta**
(substitui a conferência anterior, feita sobre os CSVs do Acelera).

## A planilha

| Aba | Linhas |
|---|---:|
| Sócios | 53 linhas → **51 pares** após dedup |
| Titulares sem sócio | 84 |
| **Total de titulares** | **~134** |

Qualidade muito superior à anterior: **documento dos dois lados**, e-mail em
100% dos sócios, coluna `Fonte do sócio` (28 "Aplicação Sócios 2026" + 25
"Central") e `Sócio com cadastro completo? = SIM` em todas.

**2 duplicatas** removidas (mesma pessoa, mesmo documento, linha repetida):
Roberto Litel (Marcus Vale) e Cleuda/Cileida (Cileida).

## 🔴 Erro meu na primeira passada — registrado para não repetir

Na primeira leitura reportei "4 sócios no ambiente errado", incluindo um com
**25 clientes**. Era **erro meu de pareamento**, não da planilha.

Causa: montei a lista `(titular, sócio)` ordenando os dois lados separadamente
e casando por posição. Onde havia titular com 2 sócios, o alinhamento
deslizou e cada sócio ficou pareado com o titular da linha seguinte.

A planilha estava **certa nos quatro**: Rubens↔Lourival, Emanuela↔Tarcio,
Rodrigo↔Alfredo, Dayane↔Marco Aurélio — exatamente o que o sistema já tem.

**Regra:** par vem da MESMA LINHA da planilha, nunca de duas listas ordenadas
em paralelo. E antes de propor mover alguém com histórico, conferir na linha
original.

## Resultado da conciliação (51 pares)

| Situação | Qtd | Ação |
|---|---:|---|
| ✅ **Já correto** no sistema | **10** | nenhuma |
| 🔧 **Unificar** (sócio está como titular) | **1** | Rafael → sócio da Michelle |
| 📨 **Sócio sem login** | **38** | o titular convida pela aba Equipe |
| ⚠️ Titular sem login | 1 | Eder Fagundes — recriar acesso |
| ⚠️ Planilha com titular = sócio | 1 | Eurélio — perguntar |

🔑 **Os 10 sócios que já existem no sistema estão TODOS no ambiente certo.**
Nada a corrigir neles.

## Os casos que precisam de decisão

**1. Rafael Pinheiro Aguilar** (`rafaelpaguilar@yahoo.com.br`)
Titular com ambiente próprio; a planilha diz sócio da **Michelle Alicia
Pinto**. Ambiente dele: **0 clientes, 0 progresso**. Já decidido pelo Marcio:
**rebaixar a sócio**. ⚠️ O onboarding dele aponta para o ambiente que será
apagado — a migration precisa repontar.

**2. Eder Fagundes** (`fagundes.eder.2009@gmail.com`)
Titular na planilha, sócio **Josi Toste Campos**. **NÃO TEM LOGIN** — é o
ambiente que apaguei por engano em 10/09 (30 clientes perdidos). Precisa
recriar o acesso antes de qualquer coisa de sócio.

**3. Eurélio José da Silva** (`eureliojs@gmail.com`)
A planilha põe o **próprio e-mail dele** como e-mail do sócio (nome do sócio:
"Geraldo Nunes Silva"). Ele tem 1 cliente no sistema. Provável erro de
preenchimento: o sócio existe, mas o e-mail informado é o do titular.
**Perguntar o e-mail real do Geraldo.**

**4. Marcus Vale** (`marcusmvale@gmail.com`) — **2 sócios**
Roberto Litel (`robertolitel@gmail.com`) e Marcus Vinicius Fagundes Porto
(`robertolitel@yahoo.com.br`). São pessoas e documentos diferentes, mas os
e-mails só diferem no domínio — cheira a erro de digitação. O teto da feature
é 1 sócio. **Perguntar qual é o sócio de verdade.**

**5. Alexandro Gloria de Santana** (`asantana10@hotmail.com`)
Sócio "Não Tem", e-mail falso `nao.tem@kksj.com.br`. **Ignorar** — não é sócio.

## Conferência

```sql
-- os 10 já corretos continuam corretos?
select count(*) from gps.membros where papel='socio';  -- 10
```
