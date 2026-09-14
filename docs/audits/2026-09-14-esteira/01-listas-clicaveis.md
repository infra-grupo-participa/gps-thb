# Listas clicáveis com download — decisões (14/09/2026)

Item 3 dos 9. Pedido: *"quero todos os numeros que a gente pode extrair
dados [...] ao clicar no numero exibir a lista e poder baixar"*.

## 🔴 Bug achado ao desenhar — JÁ CORRIGIDO (commit 10722e0)

| Card | Mostrava | Clique abria |
|---|---|---|
| "Já entraram no portal" | 139 | lista de 1 SEM LOGIN |
| "Ativos nos últimos 30 dias" | 120 | lista de 19 PARADOS |

Conjunto OPOSTO. Existia como "atalho para a exceção" enquanto só o link de
11 px do rodapé era clicável e dizia "Ver sem login". **Virou bug quando o
card inteiro passou a ser alvo** (6c1f213, mesmo dia): clicar num número de
30 px e cair no complemento é erro silencioso — a lista abre cheia, com
outras pessoas.

Corrigido com dois filtros de MEMÓRIA (zero consulta): `ja_entrou` e
`ativos30`. Este último é a **negação exata** de `inativos`, com a mesma
função e a mesma constante — reimplementar a conta criaria duas verdades.

## Decisões do Marcio

| # | Decisão | Consequência aceita |
|---|---|---|
| 1 | **`registro_contato` FORA** da lista e do CSV | Quem precisa da anotação abre a ficha, um a um, com trilha |
| 2 | **Rota própria `/admin/clientes`** | +1 item no menu; zero custo para quem não abre (5ª aba custaria +500 KB por abertura do `/admin`) |
| 3 | **100 por página + busca**; CSV leva os 1.214 | A tela mostra 100 e DIZ "de 1.214" no topo |
| 4 | Barras de "Entradas por mês" **não** ficam clicáveis | Filtro com valor (`mes=2026-08`) é tipo novo; muda o parse que 3 telas leem. Frente própria |

## Medições que sustentam as decisões

**Payload dos 1.214 clientes** (dados realistas, não linhas repetidas):
- JSON bruto 564 KB · **gzip 94,1 KB** · CSV 305,7 KB
- `montarCsv` de 1.214 linhas: **1,6 ms**
- 🔑 O payload NÃO é o gargalo. São os **~30 mil nós no DOM** — e o fato de
  ninguém achar nada rolando 1.214 linhas. 100/página = ~2.500 nós.

**Consulta** (`explain analyze`, com o parceiro dono via join):
- **2,58 ms**, `Seq Scan` + `Hash Left Join`, 479 buffers
- `gps.etapa1_clientes` tem só 2 índices, ambos em `aluno_id`. **Nenhum em
  `fase`** — e está certo: em 1.214 linhas o planner ignora índice de fase.
  Decisão final vem do `explain` do backend, não daqui.

## O que a feature LIMPA (critério de otimização)

1. ✅ Os dois links invertidos (feito)
2. `clientes_com_perda` sai da RPC do painel — o próprio SQL diz "sai na
   próxima migração que mexer aqui"
3. `ORDEM_POR_PROGRESSO` deixa de ser muleta: 3 números diferentes apontavam
   para a MESMA ordenação por falta de filtro
4. Zero consulta nova em `/admin`: os 10 filtros de pessoas saem de campos
   que a RPC já devolve

## Guardas de LGPD (decisão 1)

- `registro_contato` fora do retorno da RPC — não é "esconder na tela"
- `gp_is_admin()` na primeira linha, `revoke` antes de `grant`
- **Export grava trilha** em `gps.acessos_log`: quem, quantas linhas, qual
  filtro. 🔴 Se o log falhar, o export falha — oposto do padrão das triggers,
  de propósito: aqui a trilha é a guarda
- CPF/documento não entra (mesma regra do export de parceiros)
