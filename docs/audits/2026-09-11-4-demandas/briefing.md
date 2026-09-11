# As 5 demandas do Marcio — 11/09/2026

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

## 5. Biblioteca de vídeos (aulas/gravações) — autonomia do admin

> *"Precisamos disponibilizar os conteúdos das reuniões, gravações e tudo
> mais, porém subir um arquivo MP4 pro sistema consome demais à toa, queria
> uma alternativa melhor — tipo embedar a partir do link. Quero que os admins
> possam fazer isso por conta própria, autonomia para publicar os vídeos."*

🔑 Ele está certo sobre o MP4: upload de vídeo estoura o Storage, o egress (que
é **teto da organização**, dividido com o sip) e não tem streaming adaptativo.
**Embed por link é a decisão certa.**

### O estado de hoje
As aulas são **`tutorialUrl` hardcoded em `src/lib/etapa1.ts`** e agregadas por
`src/lib/materiais.ts`. Aula nova = editar TypeScript + **deploy**. É
exatamente a autonomia que falta.

### O que precisa ser desenhado
- Tabela de vídeos no banco (título, URL, a que etapa/tarefa pertence, ordem,
  publicado/rascunho) + CRUD no `/admin`.
- **Reconhecer o provedor pelo link** e montar o embed: YouTube (incl. não
  listado), Vimeo, Loom, Panda, Google Drive. ⚠️ Cada um tem formato próprio
  de URL de embed — e um link colado errado tem de dizer o que está errado,
  não quebrar a página.
- ⚠️ **CSP**: `next.config.ts` hoje tem `frame-ancestors` restritivo e o
  portal **não** embeda nada de terceiro. Vai precisar de `frame-src` por
  provedor, em allowlist — não `*`.
- Coexistir com o `tutorialUrl` do código sem duplicar a aula na tela.

---

## Ordem de execução sugerida

**Já entregues (11/09):** 1 (filtro "Nunca entrou") e 2 (submétricas de
acesso por papel no dashboard) — ambos reusando varredura existente.

**3 e 5 são as features de verdade** e vão em ciclos separados:
- **3** (chamados com categoria + aprovação) — tabela, RPCs que EXECUTAM
  troca, duas telas. Risco: mexe na trava do favorito e na remoção de sócio.
- **5** (biblioteca de vídeos) — tabela, CRUD do admin, embed por provedor,
  CSP. Risco menor, mas toca segurança de iframe.

**4** (botão da secretaria) é isolado e pequeno.

## Decisões do Marcio sobre a demanda 3 (2ª rodada)

| # | Pergunta | Decisão |
|---|---|---|
| 5 | "Troca de sócio" é trocar a pessoa ou promover a titular? | **Trocar o SÓCIO.** O chamado aprova a SAÍDA; a entrada do novo segue pela aba Equipe. |
| 6 | A conta do sócio removido? | **Apagar o login**, como `admin_excluir_membro` já faz. O que ele cadastrou FICA (é do ambiente). |

### 🔴 Correções ao plano do arquiteto (conferidas no banco)

1. **`gps.admin_excluir_membro` JÁ EXISTE** — o arquiteto afirmou que não há
   RPC de remover sócio. Ela recusa titular, recusa a própria conta, recusa
   conta de equipe, apaga `auth.users` (com `exception when
   foreign_key_violation then null`) e grava `membro_excluido` no log. **O
   BLOQUEIO 3 dele não existe** — é só chamar.
2. **ZERO favoritos confirmados hoje** (41 favoritos, 0 confirmados). O caso
   complexo da reconfirmação (liberar → desmarcar → marcar → confirmar) **não
   acontece ainda** — mas a RPC precisa tratá-lo, porque vai acontecer.
3. **Máximo de 110 clientes num ambiente** (média 16) — o seletor de cliente
   precisa de **busca**, não é um `<select>` simples.
