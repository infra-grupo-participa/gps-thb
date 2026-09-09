# Plano das 9 features — GPS (planejado em 08/09/2026)

Documento de continuidade: o pedido do Marcio, o que foi levantado no banco, e
as 7 fases ordenadas **da mais fácil para a mais difícil**. Serve para retomar
o trabalho em outra máquina sem perder contexto.

> Etapas 1–3 **concluídas em 08/09/2026** para as Fases 1, 2, 2-bis, 3 e 4 (+ Fase 8, pedido
> novo do mesmo dia). Etapa 4 (auditoria) feita pelo pentest (2 rodadas) e pelo Fable.
> **Fases 5, 6 e 7 entraram em 09/09/2026** (`1c0b253`, `184487f`, `845f79d`, `cb8fbdd`):
> B2 e B5–B9 foram decididos por caminho conservador e reversível — ver "BLOQUEIOS" e
> "Executado" no fim, e a seção "Polimento geral + Fases 5, 6 e 7" do `CLAUDE.md`.

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

## ✅ BLOQUEIOS — decididos em 09/09/2026 (todos reversíveis)

Decisões tomadas pelo arquiteto no lugar do Marcio, por caminho conservador, com o custo na
mesa e o caminho de volta escrito. **B1 continua aberta** — é pergunta, não decisão.

| # | Pergunta | Decisão em 09/09 | Reversível como |
|---|---|---|---|
| **B1** | **Feature 1:** qual sócio esbarrou em quê? | ⚠️ **Continua aberta.** Nada a construir: 13 sócios em 13 ambientes já usam. | — |
| **B2** | **Feature 9:** Diário existente ou tela para o aluno? | **É o Diário que já existe.** Fase 5 = descoberta e velocidade (última nota no card, "Nota rápida", filtros). Nenhuma tela para o aluno. | Abrir ao aluno seria **feature nova com pentest** — a migração `20260908000001` proíbe em texto expor `gps.aluno_notas` ao aluno. |
| **B3** | **Feature 2:** pré-visualização ou assumir a sessão? | Pré-visualização visual (decidido em 08/09, `b4cf375`). | `git revert` do commit. |
| **B4** | **Feature 8:** onde vão `realizada` e `recusou`? | Evidência → `fechamento`; `recusou` → `prospeccao` com marcador (08/09). Sem catraca. | `drop column fase` restaura sem restore — `status` segue congelado por trigger. |
| **B5** | **Feature 10:** reabrir upload no GPS? | **Autorizado só para anexo de chamado** (prova de problema do portal). Documento do cliente continua **só no Drive** — decisão de 07/2026 mantida, e a UI diz isso. | Desligar `chamados_aberto` em `gps.config` (sem deploy) e apagar o bucket. |
| **B5-b** | Qual bucket? | Bucket **novo `gps-chamados`** (privado, 5 MB, `png/jpeg/webp/pdf`), não o `gps-documentos` órfão — que está sem limite de tamanho e sem allowlist de MIME. | — |
| **B5-c** | Quem anexa? | **Só o aluno.** A equipe responde com texto e link (ela já tem o Drive). | Acrescentar `or public.gp_is_admin()` em `gps.pode_anexar_chamado`. |
| **B6** | Retenção do anexo. | **180 dias** após o fechamento, com **expurgo por clique do admin** — não `pg_cron`: apagar a linha de `storage.objects` por SQL **não apaga o byte**, e a Storage API exige sessão (o GPS não usa `service_role`). | Trocar o `interval '180 days'` e reaplicar a função. |
| **B7** | **Feature 7:** o que veem os alunos sem financeiro? | **(c) honesto:** "Financeiro não disponível para este cadastro". A aba **fica visível** — esconder deixaria a lacuna de cadastro invisível. **31 de 125** ambientes; o admin vê o diagnóstico. | Esconder a aba é um `if` no `alunoNavItems`. A correção de verdade é no `sip`. |
| **B7-b** | O sócio vê o financeiro? | 🔴 **Não.** Só titular e admin — o contrato é do titular, o sócio nunca assinou (13 sócios reais). | Apagar o `exists (… papel='titular')` da guarda de `gps.financeiro_do_aluno`. |
| **B7-c** | `credito_valor_pago` / `cancelamento_valor`? | **Fora da aritmética**, exibidos como linha própria rotulada — a semântica é do `sip` e não está provada aqui. | Provar a semântica no `sip` e somar em `src/lib/financeiro.ts`. |
| **B7-d** | Saldo desconhecido? | **`null` → "não informado"**, nunca R$ 0,00 (4 linhas hoje). | — (`coalesce(…,0)` seria o retrocesso). |
| **B8** | Meta de 150k: de quê? | **Programa inteiro**, valor **contratado**, somando `valor_honorarios` dos clientes em `fase='contratado'` **do ambiente**. Não há coluna de competência para recortar por ano/turma. | Mudar `resumoHonorarios` (`src/lib/etapa1.ts`) e a RPC `…091` — a regra vive em um lugar só. |
| **B9** | Honorário é visível ao admin? | **Sim**, e editável pelo aluno: é número que ele mesmo digita sobre o cliente dele — **não é família do Diário** (texto da equipe sobre o aluno, com PII de terceiro). | — |
| **B9-b** | CHECK ligando valor à fase? | **Não.** Voltar de fase não apaga o valor, só o tira da meta (ficha mostra em somente-leitura, com aviso). | Acrescentar o CHECK — mas ele vira catraca: mover o cliente de volta falha até alguém apagar o valor. |

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
| 5 notas (Diário descoberto) | `1c0b253` | feito em **09/09** — **B2:** é o Diário que já existe; `gps.admin_painel_atendimento()` (última nota cortada em 140 caracteres **no banco**) + "Nota rápida" no card; nenhuma tela para o aluno |
| 7-A financeiro do aluno | `184487f` | feito em **09/09** — RPC `gps.financeiro_do_aluno` lê `cs.contatos_hm` (**só leitura**); **B7** (c) honesto com a aba visível (31 de 125 sem registro), **B7-b** sócio não vê, **B7-c** crédito/cancelamento fora da aritmética, **B7-d** saldo `null` = "não informado" |
| 7-B honorários + meta 150k | `845f79d` | feito em **09/09** — `valor_honorarios`/`contrato_url` (zero backfill, 879 linhas nascem `NULL`); **B8** programa inteiro, valor contratado, soma dos `contratado` do ambiente; **B9** aluno digita e admin vê; **B9-b** sem CHECK ligando valor à fase |
| 6 chamados com anexo | `cb8fbdd` | feito em **09/09** — `gps.chamados`/`chamado_mensagens` append-only + bucket novo `gps-chamados`; **B5** upload só para anexo de chamado (documento do cliente segue no Drive), **B5-c** só o aluno anexa, **B6** 180 dias com expurgo por clique do admin |
| polimento geral (fora das 9) | `f9a763a`…`edae452` | feito em **09/09** — design system, `loading`/`global-error`, contraste AA, sessão memoizada, open redirect fechado, colunas explícitas, painel paginado, baseline do schema. Ver `CLAUDE.md` |
| 1 sócio | — | já existia (B1: qual caso o Marcio viu?) |

**Pendências que só o Marcio/João resolvem** (B2 e B5–B9 saíram da lista em 09/09):
**B1** (qual caso de sócio o Marcio viu); **B10** (a copy sequencial fecha a Etapa 01 para 58
de 63 ambientes); conta para **Ilan** (não existe em `auth.users`, logo não dá para promover a
admin — Isabela e Cristiane já são admin, Elaine é dev); **C7** (onde "recusou" mora antes de
remover `status`); 🔴 **`gps.senhas_bkp_20260810`** (hashes bcrypt parados desde 10/08 sem
finalidade — `drop table` é irreversível); **`chamados_email_equipe` vazio** (preencher em
`/admin/chamados` ou definir `EMAIL_SUPORTE` na Hostinger, senão chamado novo não avisa
ninguém); e o ensaio do iframe da Hotmart para fechar `frame-ancestors *.hotmart.com`.

**Pentest de 09/09:** dois relatórios, ambos **APROVADOS** (0 crítico, 0 alto). Fases 5–7: 1 MÉDIO documentado (MIME de anexo vem do que o cliente declarou no PUT, não de inspeção de bytes — a trava real é `download=` em todo link; nunca servir anexo inline) e 1 BAIXO corrigido (equipe não anexa, agora imposto em `gps.chamado_gravar_mensagem`, migração ...116). Polimento: 1 MÉDIO corrigido (`gps.agenda`/`gps.reuniao_agendamentos` aceitavam escrita do dono pela REST — policies derrubadas e grants revogados, ...117, histórico preservado) e 1 BAIXO corrigido (`emailParaIlike` escapa `%`/`_`; `acharAlunoPorEmail` morta removida). Correções em `cd87aa5`.
