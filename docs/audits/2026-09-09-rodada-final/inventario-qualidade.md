# Inventário de qualidade — GPS (medido em 09/09/2026, commit 75b7138)

## 1. Tamanho (linhas)
| linhas | arquivo | tipo |
|---|---|---|
| 1197 | src/components/admin/plantao-calendario.tsx | client |
| 1049 | src/lib/data.ts | server |
| 957 | src/app/admin/plantao/actions.ts | action |
| 801 | src/components/clientes/clientes-manager.tsx | client |
| 761 | src/components/admin/alunos-ativos-lista.tsx | client |
| 624 | src/components/admin/gerenciar-acesso.tsx | client |
| 610 | src/app/admin/actions.ts | action |
| 481 | src/components/clientes/cliente-ficha.tsx | client |
| 443 | src/components/admin/criar-acesso.tsx | client |
| 418 | src/lib/chamados-data.ts | server |
| 411 | src/lib/types.ts · src/components/financeiro/financeiro-view.tsx (server) | |
| 406 | src/app/chamados/actions.ts | action |
| 392 | src/components/admin/cadastrar-aluno-form.tsx | client |
| 370 | src/lib/etapa1.ts | server |

Maiores funções: `PlantaoCalendario` L139 ~652 linhas, `FormularioSlot` L951 ~195, `DialogoCancelamento` L854 ~97 · `ClientesManager` L57 ~379, `Kanban` L469 ~109, `ClienteCardLista` L578 ~99 · `AlunosAtivosLista` L216 ~545 · `GerenciarAcesso` L72 ~226, `AdicionarSocio` L389 ~167 · `data.ts`: `getClientesEtapa1` L153 ~118, `getAlunosGps` L271 ~94, `comNomesDeAutorEvento` L828 ~84, `getResumoDiario` L698 ~76, `comNomesDeAutor` L561 ~67.

## 2. Duplicação
- `Intl.NumberFormat` BRL (9): alunos-ativos-lista.tsx:106,113 · home-resumo.tsx:9 · clientes-manager.tsx:50 · favorito-destaque.tsx:10 · financeiro-view.tsx:47 · meta-honorarios.tsx:10,20 · etapa1-guide.tsx:32 — **não existe `brl()` central**; `masks.ts` só tem `numeroParaMoeda` (sem símbolo).
- `Intl.DateTimeFormat` (5): plantao.ts:22 · log-agregacao.ts:49,56 · alunos-ativos-lista.tsx:69 · trilha-do-aluno.tsx:24 — `datas.ts` (`formatarData`/`formatarDataHora`, `FUSO`) e `plantao.ts` (`hojeSaoPaulo`, `rotuloData`) já existem.
- `America/Sao_Paulo` literal: 17 ocorrências em 12 arquivos (`datas.ts:16` já tem `FUSO`; `alunos-ativos-lista.tsx:66` duplica).
- `toISOString().slice(0, 10)` (2): admin/plantao/actions.ts:67 · plantao-calendario.tsx:124.
- `.replace(/\D/g, "")` (4 duplicadas): cadastro/actions.ts:22 · admin/actions.ts:56,91,92 — `masks.ts:4` já tem `soDigitos()`.
- Regex de e-mail divergente: `plantao.ts:95 emailValido()` (helper) × `app/admin/chamados/actions.ts:34` e `app/chamados/actions.ts:404` (`EMAIL_REGEX` própria, padrão diferente).

## 3. Mortos (knip, 3 amostras confirmadas por rg)
- Arquivos não usados: `src/app/auth/actions.ts`, `src/components/ui/avatar.tsx`, `src/components/ui/dropdown-menu.tsx` (+ scripts em tmp/ e docs/audits, esperados).
- Exports não usados: `admin/actions.ts:{atualizarEmailAluno, removerAlunoGps}` · `diario-labels.ts:ROTULO_ACAO_ADMIN` · `previa-aluno.tsx:{PREVIA_ATTR, PREVIA_VALOR, PREVIA_CLASSE}` · `ui/badge.tsx:badgeVariants` · `ui/dialog.tsx:{DialogOverlay, DialogPortal}` · `ui/progress.tsx` (4) · `ui/select.tsx` (5) · `ui/table.tsx:{TableFooter, TableCaption}` · `ui/tabs.tsx:tabsListVariants` · `chamados-data.ts:contarChamadosAbertosPorAluno` · `chamados-tipos.ts:{STATUS_CHAMADO, ANEXO_MIMES, ANEXO_EXTENSOES}` · `etapa1.ts:rotuloProblema` · `etapas.ts:pctEtapaManual` · `financeiro.ts:TOLERANCIA_CENTAVOS` · `pasta.ts:{ESTRUTURA_PASTA, idPastaDrive}` · `types.ts:{TIPOS_EVENTO, ENTIDADES_EVENTO, ATORES_EVENTO, ORIGENS_EVENTO}`.
- Tipos não usados: `admin/actions.ts:ProgramaDoLogin` · `financeiro.ts:SituacaoContrato` · `pasta.ts:SecaoPasta` · `types.ts:{MembroStatus, StatusCliente, TarefaEnfase, EntidadeEvento, OrigemEvento}`.
- `server-only` "unlisted" = falso positivo do knip.

## 4. Padrões
- `useEffect` em src: 5 (auto-logout, cadastrar-aluno-form, previa-aluno, minha-inscricao-card, cadastro-form) — nenhum é setState derivado de props.
- `"use client"`: 60 arquivos. `dangerouslySetInnerHTML`: 0. `any`: 0. TODO/FIXME: 0. `console.log`: 0.
- Identificadores removidos (`STATUS_CLIENTE`, `getPendenciasPorAluno`, `next-themes`): 0 no código; `mudarStatusCliente` só em comentário (etapa-1/actions.ts:188); cabeçalhos "removido em 10/08/2026" em ~20 arquivos (documentação viva).

## 5. Textos
- Strings em inglês visíveis: 0. **"GPS" visível ao usuário: 1** — `gerenciar-acesso.tsx:148` toast "Ambiente do GPS excluído (não havia login)." (viola "GPS não aparece para o usuário").

## 6. Bundle (build do commit atual, servido em :3987)
| rota | chunks | raw | gzip | baseline 08/09 |
|---|---|---|---|---|
| /login | 16 | 811 KB | **248 KB** | 235 KB |
| /cadastro | 16 | 813 KB | 249 KB | — |
| /esqueci-senha | 17 | 1055 KB | **312 KB** | 297 KB |
| /p/plantao | 19 | 929 KB | 288 KB | 282 KB |

Top chunks gzip: 72,5 KB · 39,5 KB · 37,4 KB · 12,8 KB · 12,4 KB. **Por que /esqueci-senha pesa 64 KB gzip a mais:** `esqueci-form.tsx` importa `createClient` de `@/lib/supabase/client` (supabase-js no browser para `resetPasswordForEmail`); `login-form.tsx` usa Server Action. Mover o reset para action tira o SDK do bundle público.

## 7. Rotas × loading/error
29 `page.tsx`, todas cobertas (mínimo: root `loading.tsx` + `error.tsx` + `global-error.tsx`). Próprios: `admin/aluno/[alunoId]/` (loading), `.../diario/` (loading+error), `admin/chamados/`, `admin/`, `chamados/`, `chamados/[id]/`, `clientes/` (loading+error), `etapa/[etapa]/`, `financeiro/` (loading). 15 rotas só com o par root (login, cadastro, esqueci-senha, perfil, pasta, materiais, p/plantao, captacao, auth/redefinir).
