# Plano das 9 features — GPS (planejado em 08/09/2026)

Documento de continuidade: o pedido do Marcio, o que foi levantado no banco, e
as 7 fases ordenadas **da mais fácil para a mais difícil**. Serve para retomar
o trabalho em outra máquina sem perder contexto.

> Etapas 1–3 **concluídas em 08/09/2026** para as Fases 1, 2, 2-bis, 3 e 4 (+ Fase 8, pedido
> novo do mesmo dia). Etapa 4 (auditoria) feita pelo pentest (2 rodadas) e pelo Fable.
> Fases 5, 6 e 7 seguem bloqueadas por decisão do Marcio (B2, B5–B9). Ver "Executado" no fim.

---

## O pedido original

1. **Acesso de sócio com titular vinculado** — compartilham a área, um faz tarefa para o outro.
2. **Seletor de nível de visualização para o admin** — ver a tela como o aluno vê.
3. **Olhinho de mostrar senha** no painel de acesso.
4. **Tarefa sequencial** — a copy de mensagem só libera depois dos 30 clientes listados.
5. **Filtro e busca na lista de alunos** — mais engajados, mais avançados, mais tempo de casa, quem tem os 30 clientes.
6. **Comprovação de faturamento (meta 150k)** — ao cadastrar cliente escolher a etapa; em "execução", anexar contrato e registrar honorários.
7. **Aba financeira do aluno** — quanto pagou, quanto falta, quanto falta para os 150k.
8. **Três fases de cliente** — Prospecção, Fechamento (croqui entra aqui), Contratados.
9. **Notas de status por aluno** — histórico com data, nota nova no topo.
10. **Ticket de suporte** com anexo, substituindo o e-mail.

---

## 🔍 O que o levantamento no banco revelou

Feito antes de planejar. Mudou o custo de metade das features.

### Feature 1 (sócio) — **JÁ EXISTE, ponta a ponta**

`gps.membros.papel` populado: **125 titulares, 13 sócios em 13 ambientes
compartilhados**. Modelo, auth (`src/lib/auth.ts` distingue `alunoId` do
ambiente de `membroAlunoId` da pessoa), UI de criação
(`gerenciar-acesso.tsx` → `AdicionarSocio`), remoção, RPC
`admin_adicionar_socio`, banner (`ambiente-compartilhado-banner.tsx`) e badge
"N pessoas" — tudo pronto e em uso.

🔴 **Nada a construir.** Falta descobrir o caso concreto que o Marcio viu.

### Feature 10 (ticket) — pode ser mais barata do que parecia

Existem **dois sistemas de ticket completos** no mesmo banco:
`central.chamados` (+ `chamado_mensagens`, `chamado_leituras`) e
`sip.ticket_messages`. E os **buckets de anexo já existem**:
`chamados-anexos` e `ticket-attachments`, ambos privados, com arquivos.

⚠️ **Mas o reuso foi descartado.** `central.chamados` usa
`aluno_id = auth.uid()` e `central.is_admin()` — o modelo de papel da Central.
No GPS, `aluno_id` é o **ambiente**, não o usuário. Reusar exigiria alterar
RLS de um sistema em produção que este repo nem versiona.

✅ **Decisão: tabela nova `gps.chamados` + reaproveitar o bucket.**

### Feature 7 (financeiro) — o dado existe, com buraco

`cs.contatos_hm` tem `valor_pago`, `valor_total`, `saldo_a_pagar_manual`,
`cancelamento_valor`, `credito_valor_pago` — e liga por `aluno_id` **direto**,
sem cruzamento por CPF/e-mail.

🔴 **Cobertura medida: dos 127 alunos no GPS, só 96 têm linha.** 31 ficariam
com a aba vazia. Ver **B7**.

`cs.vw_gps_acessos` (a view que o GPS já usa) **não expõe** esses campos.

### Feature 8 (3 fases) — migração de baixo risco

879 clientes em `gps.etapa1_clientes`:

| status | qtd | com data_reuniao | aderiu |
|---|---|---|---|
| pendente | **833** | 12 | 12 |
| contatado | 35 | 3 | 2 |
| agendado | 5 | 4 | 2 |
| realizada | 5 | 4 | 3 |
| recusou | 1 | 0 | 0 |

95% é Prospecção. ⚠️ Mas **12 "pendente" já têm reunião e aderiram** — o
status atual já não descreve a realidade. A migração **não pode ser de-para
por status**: tem de olhar `data_reuniao_preliminar`/`aderiu_reuniao`.

### Feature 9 (notas) — base pronta, mas com trava de LGPD

`gps.aluno_notas` existe (append-only, ordem desc já) — porém é
**exclusiva do admin**, e a migração `20260908000001` **proíbe em texto**
expor a tabela ao aluno. Ver **B2**.

### Feature 3 (olhinho) — existe em 1 lugar, falta em 3

Existe em `perfil/trocar-senha.tsx`. Falta em `gerenciar-acesso.tsx` (o painel
que o Marcio citou — hoje **texto puro, sem `type="password"`**),
`login-form.tsx` e `auth/redefinir/redefinir-form.tsx`.

### Alarme falso desarmado

O `CLAUDE.md` lista como pendência que "um aluno logado leria os 2.459
alunos". **Testado com JWT real: lê 1.** As policies `qual=true` são
RESTRICTIVE (combinam com AND), e `thb_alunos_gps_aluno_restrito` limita à
própria linha. Já estava resolvido; o documento é que não foi atualizado.

---

## 📋 As 7 fases, da mais fácil à mais difícil

### FASE 1 — Higiene visível (1 commit, zero banco)

Nenhuma toca banco ou RLS; todas visíveis no mesmo dia. Risco ≈ 0.

**`frontend-engineer`:**
- Criar `src/components/ui/input-senha.tsx` (Input + toggle olho), extraído de `trocar-senha.tsx`.
- Aplicar em `gerenciar-acesso.tsx`, `login-form.tsx`, `auth/redefinir/redefinir-form.tsx`, e refatorar `trocar-senha.tsx` para consumir.
- Busca por nome/e-mail + ordenação em `alunos-ativos-lista.tsx` (memória, sobre o array já recebido).

**Não tocar:** `src/lib/data.ts`, `src/app/**/actions.ts`, `supabase/migrations/**`.

**Limpa:** hoje há 4 implementações divergentes de campo de senha, uma delas mostrando senha em texto puro.

### FASE 2 — Tarefa sequencial (1 commit, zero banco)

**`frontend-engineer`:**
- `src/lib/etapa1.ts`: `exigeTarefa?: number` em `TarefaDef`; marcar `num: 3` (copy padrão) com `exigeTarefa: 1`. **Não mexer nos `num`** — são identidade estável no banco.
- `etapa1-guide.tsx`: `bloqueada` passa a ser `(exigeFavorito && !temFavorito) || (exigeTarefa && !tarefaConcluida(exigeTarefa))`.
- `tarefa-item.tsx`: mensagem de bloqueio parametrizada.

⚠️ **A trava é de UI, não de banco.** `marcarTarefa` continua aceitando qualquer tarefa. Aceitável (é guia pedagógico, não dado sensível), mas **tem de ser dito no commit**.

### FASE 2-bis — Seletor de visualização (encaixa em qualquer ponto)

Ver **C1**: o Modo Assistência já faz isso. A versão barata e segura é um botão "Pré-visualizar como o aluno vê" que só **oculta os elementos de admin** (`AssistBanner`, aba Diário, controles de ênfase) — sem tocar em `ehAdmin()`.

### FASE 3 — Filtros de engajamento (banco só leitura)

**`backend-engineer`:** acrescentar `desde` e `ultimoAcesso` a `AlunoGps` em `getAlunosGps` (`data.ts:134`).

🔴 **`ultimoAcesso` é o ponto crítico.** Hoje vem de `gps.admin_status_acesso(uuid)` — **uma RPC por aluno**. Em loop no painel = 127 RPCs por abertura. Duas saídas: RPC nova que devolve o conjunto, ou derivar de `gps.acessos_log` (já tem `idx_acessos_log_aluno`).

🔴 **A dívida que esta fase deve pagar (MEDIDA):** `getAlunosGps` hoje traz as **879 linhas inteiras** de `etapa1_clientes` (`width=307`, ~270 KB, `Seq Scan`) para calcular 3 números por aluno. Hoje 0,98 ms; com 10× são ~8.800 linhas por abertura. **Se a feature entrar sem pagar isso, reprova em otimização.**

**`frontend-engineer`:** consumir os campos, ordenar em memória.

⚠️ **Colisão prevista:** os dois agentes no mesmo fluxo. Sequenciar — backend fecha o contrato de `AlunoGps` **antes** de o frontend começar. Rodar `npm run build` depois do último.

### FASE 4 — Três fases de cliente (migration com dado real)

**`backend-engineer`:** coluna `fase text` com CHECK, **convivendo com `status`** por uma janela.

Backfill **por evidência, não por status**:
- `aderiu_reuniao` OU `data_reuniao_preliminar is not null` → `fechamento` (pega os 12 incoerentes)
- `realizada` / `recusou` → **decisão do Marcio (B4)**
- resto → `prospeccao`

Só depois, em commit separado, remover `status`.

🔑 Manter `status` na janela é o que torna a migração reversível **sem restore**.

**`frontend-engineer`:** `clientes-manager.tsx`, `cliente-ficha.tsx`, `STATUS_CLIENTE` → `FASES_CLIENTE`. **Manter o filtro em memória** (sobre os ≤30 clientes já carregados) — não criar query por fase.

🔴 `explain (analyze)` obrigatório no backfill.

### FASE 5 — Notas por aluno (depende de B2)

Se for o Diário que já existe: **fase sai do escopo** (o trabalho vira UX — o Marcio não sabe que existe).
Se for lado-aluno: **feature nova, pentest obrigatório**, e **não pode reusar** `gps.aluno_notas`.

### FASE 6 — Ticket com anexo

**Investigação primeiro**, depois tabela nova `gps.chamados` + bucket reaproveitado.

**Trava:** índice `(aluno_id, criado_em desc)`; interruptor `app.gps_chamados_aberto` no padrão do Plantão (desliga sem deploy); **retenção não definida (B6)**.

**`security-pentester` obrigatório:** upload + dado pessoal + endpoint novo. Vetores: path traversal no nome, MIME, tamanho, aluno A lendo anexo do aluno B, `anon` no bucket.

### FASE 7 — Financeiro (6 + 7), a mais cara

Provável: `valor_honorarios` + `contrato_url` em `etapa1_clientes` (depende das fases 4 e 6); meta 150k somando os `contratado`. A aba lê `cs.contatos_hm` — **e aí mora o problema dos 31 alunos**.

---

## ⚔️ CONFLITOS

**C1 — Feature 2 já existe, e "virar aluno" quebraria a LGPD do Diário.**
O Modo Assistência já mostra a tela do aluno. A **única** diferença é a aba
Diário, injetada por `assistenciaNavItems` — que existe precisamente para o
Diário não vazar. Se virar "admin assume a sessão do aluno", colide com o
aviso em `nav.ts` e com a migração `20260908000001`.
✅ **Solução sem conflito:** pré-visualização puramente visual.

**C3 — Notas visíveis ao aluno são expressamente proibidas** na tabela
existente. Não é escolha técnica, está escrito na migração.

**C4 — Anexo de ticket reabre o storage no GPS.** A decisão de 07/2026 tirou
documentos do sistema e mandou para o Drive. Ticket ≠ documento do cliente,
mas é reversão parcial de decisão registrada. Ver **B5**.

**C5 — "Financeiro pertence ao sip".** A feature 6 (honorários que o **aluno**
cobra do **cliente dele**) é dado novo, não conflita. A feature 7 é dado do
sip: **ler, nunca escrever**, e a tela tem de dizer de onde vem.

**C6 — A feature 5 empilha numa query que já varre a base inteira.** Ver Fase 3.

---

## 🚧 BLOQUEIOS — precisam de decisão do Marcio

| # | Pergunta |
|---|---|
| **B1** | **Feature 1:** está tudo implementado e em uso por 13 sócios. Qual sócio, tentando o quê, esbarrou em quê? |
| **B2** | **Feature 9:** é o Diário que já existe, ou uma tela para o **aluno**? Muda de "zero trabalho" para "feature nova com pentest". |
| **B3** | **Feature 2:** pré-visualização visual (barato, seguro) ou assumir a sessão do aluno (caro, mexe em auth)? **Recomendo a primeira.** |
| **B4** | **Feature 8:** onde vão parar `realizada` (5) e `recusou` (1)? As 3 fases não têm lugar para "recusou". E: **o cliente pode voltar de fase?** |
| **B5** | **Feature 10:** reabrir upload no GPS está autorizado? |
| **B6** | **Feature 10:** retenção dos anexos. Quanto tempo um anexo de chamado fechado fica guardado? (O Plantão expurga em 90 dias — não herdar sem decidir.) |
| **B7** | **Feature 7:** o que a tela mostra para os **31 alunos sem financeiro**? (a) esconder a aba, (b) mostrar zerado — **mente**, (c) "não disponível" — honesto e feio. **Recomendo (c).** E antes: por que 31 alunos do programa não têm registro? Se for lacuna de cadastro, a correção é lá. |
| **B8** | **Feature 6:** a meta de 150k é de quê — programa inteiro, por ano, por turma? E conta valor **contratado** ou **recebido**? |
| **B9** | **Feature 6:** o valor de honorários é visível ao admin? É dado comercial do aluno com o cliente dele — mesma família de risco do Diário. |

---

## 👥 Divisão por agente (contextos isolados)

| Agente | Toca | **NÃO** toca |
|---|---|---|
| `frontend-engineer` (ctx A) | `src/components/**`, `src/app/login/*`, `src/app/auth/*`, `src/lib/etapa1.ts` (só catálogo) | `src/lib/data.ts`, `src/app/**/actions.ts`, `supabase/migrations/**` |
| `backend-engineer` (ctx B) | `src/lib/data.ts`, `src/app/**/actions.ts`, `supabase/migrations/**` | `src/components/**` |
| `security-pentester` | Fases 6 e 7 (obrigatório); Fase 5 se B2 = lado-aluno | — |
| `fable-orchestrator` | Trava final de cada fase | — |

---

## Ordem final

**1** (senha+busca) → **2** (sequencial) → **2-bis** (pré-visualizar) →
**3** (filtros + dívida da query) → **4** (3 fases) → **5** (notas, se B2 pedir) →
**6** (ticket) → **7** (financeiro).

Justificativa por **esforço × risco**, não por importância: 1, 2 e 2-bis não
tocam banco nem auth e revertem por `git revert`. A 3 é a primeira que mexe em
query de base inteira. A 4 é a primeira com dado real migrado. A 6 é a
primeira com storage e pentest. A 7 é a única bloqueada por dado que não
existe para 24% dos alunos.

---

## Etapas do trabalho (pedido do Marcio)

- [x] **1 — Planejamento** (este documento)
- [x] **2 — Sequência de tarefas em fases de implementação** (`tmp/squad/9-features.md` → resumo abaixo)
- [x] **3 — Codificação por fases + observações** (Fases 1, 2, 2-bis, 3, 4, 8)
- [x] **4 — Auditoria geral + validação** (pentest ×2 + fable-orchestrator)

**A Fase 1 não depende de nenhum bloqueio** — pode começar a qualquer momento.

---

## Executado em 08/09/2026 (commits `282c1a7..`)

| Fase | Commit(s) | Estado |
|---|---|---|
| 1 senha + busca | `282c1a7` | feito |
| 2 copy sequencial | `4ada717` | feito — **B10:** só 5 de 63 ambientes liberam a copy hoje; é o pedido literal, levar o número ao Marcio |
| 2-bis pré-visualizar | `b4cf375` | feito (visual, B3 = recomendação) |
| 3 filtros + dívida da query | `2f6a9a9`, `e05c27e` | feito — RPC `gps.admin_painel_alunos()`, 125 linhas/7,7 ms; igualdade provada (0 divergências) |
| 4 três fases | `503ac60`, `4dcd96a`, `b65746f` | feito — B4 decidido: `realizada`/`agendado`/evidência → fechamento; `recusou` → prospecção com marcador; sem catraca; `status` congelado por trigger |
| 8 Plantão (pedido novo) | `3bfc583` | feito — cancelar, pausar, trocar mentora, série semanal |
| 5 notas | — | bloqueada (B2) |
| 6 ticket | — | bloqueada (B5/B6) |
| 7 financeiro | — | bloqueada (B7–B9) |
| 1 sócio | — | já existia (B1: qual caso o Marcio viu?) |

**Pendências que só o Marcio/João resolvem:** B1, B2, B5–B9 (tabela acima); B10 (copy fechada
para 58 de 63 ambientes); conta para **Ilan** (não existe em `auth.users`, logo não dá para
promover a admin — Isabela e Cristiane já são admin, Elaine é dev); C7 (onde "recusou" mora
antes de remover `status`).
