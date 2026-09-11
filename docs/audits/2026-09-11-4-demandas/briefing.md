# As 4 demandas do Marcio — 11/09/2026

> *"não estamos com urgência toda, podemos estruturar com calma e fazer algo
> sólido e bem elaborado, que colabore com todos e não quebre quando subirmos
> e testarmos na produção"*

## 1. Filtro "ainda não fez login"

⚠️ **NÃO é o `sem_login` que já existe.** Aquele é `!temLogin` = ambiente sem
conta criada. O pedido é **tem conta e NUNCA usou** (`ultimoAcesso === null`).

Os dois são estados diferentes e ambos importam:

| estado | hoje | quantos |
|---|---|---:|
| sem conta criada | filtro `sem_login` | 1 |
| tem conta, nunca entrou | **não existe filtro** | 0 titulares |

Hoje dá 0 entre titulares (142 de 143 já entraram), mas **com os sócios
chegando pela aba Equipe, passa a valer**: convite aceito cria a conta, e quem
nunca abriu o portal depois disso é exatamente quem a equipe precisa achar.

O dado já existe (`ultimoAcesso`) e `ordenacao.ts` já trata `null` como
"nunca entrou" — é acrescentar o filtro na allowlist, não criar consulta.

## 2. Dashboard: acessos com submétrica titular × sócio

Hoje o bloco `acesso` conta AMBIENTES; o bloco `equipe` (criado hoje) conta
pessoas por papel. O pedido é **cruzar os dois**: total de acessos, e dentro
dele quem é titular e quem é sócio.

⚠️ Reusar a varredura de `gps.membros` que os dois blocos já fazem — não criar
consulta nova (medido: o bloco `equipe` custa 1,34 ms reusando `amb`).

## 3. Chamados com CATEGORIA + fluxo de aprovação

**As 4 categorias:** Dificuldade no sistema · Troca de cliente · Troca de
sócio · Outros.

### Decisões do Marcio

| # | Decisão |
|---|---|
| 1 | **Troca de favorito: seletor com os clientes DELE.** O atual vem preenchido (o sistema sabe quem é); ele escolhe o novo numa lista do próprio ambiente. Nada de texto livre — nome digitado errado vira retrabalho. |
| 2 | **Aprovar EXECUTA a troca**, grava quem aprovou e fecha o chamado. Reversível pelo histórico do chamado + Diário. |
| 3 | Troca de sócio: **mesmo fluxo** (aprovar/declinar antes de qualquer mudança). |
| 4 | "Dificuldade no sistema" e "Outros" seguem o padrão atual. |

### O que a tela da equipe mostra
Nome do **atual × futuro** lado a lado, e dois botões: **Aprovar** e
**Declinar**. A conversa por mensagem continua existindo — aprovar não é a
única saída.

### ⚠️ Amarras que já existem e não podem quebrar
- `gps.etapa1_clientes_acompanhamento_travado` (…203/…215): depois que a
  equipe CONFIRMA, o aluno não desmarca. A aprovação tem de passar por
  `admin_confirmar/liberar_acompanhamento`, não por UPDATE cru.
- Teto de 1 sócio por ambiente (…244 + correção …248).
- `gps.chamados` é **append-only**: só RPC escreve, `authenticated` só lê.
- 🔴 `chamados_email_equipe` está **VAZIO** — chamado novo não avisa ninguém.
  Com categoria e aprovação, isso fica pior: a fila vira operação.

## 4. Botão flutuante da secretaria (WhatsApp)

- **Botão fixo no canto**, desktop e celular. Não interrompe, sempre à mão.
- **WhatsApp: +55 21 98865-6552** (secretaria).
- Mensagem pré-preenchida com nome e turma do parceiro, para a secretaria
  saber quem é sem perguntar.
- ⚠️ **Não** aparece em `/p/*` (Plantão é de outro produto, com a monitoria
  própria) nem nas telas do admin.
- Guardar o número em `gps.config` para a equipe trocar sem deploy.

## Ordem de execução sugerida

1 e 2 são pequenos e independentes (filtro + submétrica). 4 é isolado.
**3 é a feature de verdade** — tabela, RPCs de aprovação, tela da equipe,
tela do parceiro — e é onde mora o risco de quebrar o que já existe.
