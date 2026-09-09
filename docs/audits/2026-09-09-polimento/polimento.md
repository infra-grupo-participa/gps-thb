# Polimento do GPS — plano do arquiteto

**Data:** 2026-09-08 (noite) · **Escopo:** sistema como um todo, exceto Fases 5/6/7
(notas, ticket com anexo, financeiro) — outro arquiteto está desenhando isso em paralelo.
**Regra:** manter a lógica de produto. Nada de framework novo, nada de redesenho do zero.

---

## A) Baseline medido

Tudo abaixo foi capturado nesta máquina em 08/09/2026, com `npm run build` (exit 0) e o
servidor de produção (`next start`) de pé em `:3987`.

### Build

```
▲ Next.js 16.2.10 (Turbopack) — Compiled in 7.6s · TypeScript 7.7s · 19 páginas estáticas em 504ms
```

⚠️ **O Turbopack do Next 16 não imprime mais a coluna "First Load JS" na tabela de rotas**, e
não emite `.next/app-build-manifest.json`. Os números abaixo foram medidos servindo as rotas
públicas de verdade e somando os `<script>` que o HTML pede.

| Rota pública | JS bruto | **JS gzip** | chunks |
|---|---:|---:|---:|
| `/login` | 769 KB | **235 KB** | 16 |
| `/cadastro` | 771 KB | **236 KB** | 16 |
| `/p/plantao` | 915 KB | **282 KB** | 19 |
| `/esqueci-senha` | 1008 KB | **297 KB** | 17 |

`.next/static/chunks` = **2,3 MB** no total. Os 3 maiores chunks: 246 KB→64 KB gzip,
227 KB→71 KB gzip, 137 KB→37 KB gzip.

> Leitura: **235 KB gzip para uma tela com dois campos e um botão** é ~2× o baseline típico de
> um app Next 16 + React 19. E `/esqueci-senha` (um campo só) puxa **62 KB gzip a mais que o
> `/login`** — sinal de chunk mal dividido, não de conteúdo.

### Rotas

24 `page.tsx`. Renderização: **quase tudo `ƒ` (dinâmico)**. Estáticas só
`/_not-found`, `/admin/solicitacoes` (é um `redirect()` stub, 10 KB de HTML shell inútil),
`/auth/redefinir`, `/cadastro`, `/esqueci-senha`.

### Cache / streaming / erro

| Sinal | Contagem |
|---|---:|
| `loading.tsx` | **0** |
| `<Suspense>` | **0** |
| `export const dynamic` / `revalidate` | **0** |
| `unstable_cache` / `cacheLife` | **0** |
| `React.cache` | **0** |
| `error.tsx` | 1 (raiz) · `global-error.tsx` **0** |
| `not-found.tsx` | 1 (raiz) |
| `revalidatePath` | 53 chamadas em 9 arquivos de action |
| `next/dynamic` | 0 |

### Client components

**49 de 145** arquivos `.ts/.tsx` têm `"use client"` (34%), somando **10.162 linhas**.
Os 10 maiores:

```
1198  src/components/admin/plantao-calendario.tsx
 784  src/components/clientes/clientes-manager.tsx
 624  src/components/admin/gerenciar-acesso.tsx
 449  src/components/admin/alunos-ativos-lista.tsx
 443  src/components/admin/criar-acesso.tsx
 392  src/components/admin/cadastrar-aluno-form.tsx
 356  src/components/admin/plantao-mentoras.tsx
 337  src/components/admin/trilha-item.tsx
 332  src/components/clientes/cliente-ficha.tsx
 296  src/components/etapa1/etapa1-guide.tsx
```

### Sessão e banco

- `getContextoSessao()` chamado em **26 lugares**; `ehAdmin()` (que chama
  `getContextoSessao()` de novo) em **43**. **Zero memoização.**
- Latência medida contra `mbvybujpkwuorhtdzcde.supabase.co` (sa-east-1), 5 amostras:
  **GoTrue `/auth/v1/user` ≈ 57 ms** (89/56/55/62/59); **PostgREST ≈ 44 ms** (54/37/40).
- `select("*")` em **13 queries** (12 em `src/lib/data.ts`, 1 em `src/app/etapa/actions.ts`).
- `src/lib/data.ts` = 880 linhas.

### Migrations

39 arquivos, o mais antigo de **2026-09-01**. `security definer`: **68 ocorrências, 68 com
`set search_path`** — 100% coberto, sem furo.

⚠️ **Nenhuma migration cria as tabelas do núcleo.** `create table gps.*` no repo só existe para
`aluno_eventos`, `aluno_notas` e as 8 `plantao_*`. **`gps.etapas`, `gps.membros`,
`gps.ambientes`, `gps.etapa1_clientes`, `gps.progresso`, `gps.tarefa_enfase`,
`gps.solicitacoes_acesso`, `gps.acessos_log`, `gps.etapa3_*` e as 4 `gps.reuniao_*` não têm
DDL versionada** — foram aplicadas direto no banco.

### Fontes / imagens

`next/font/google` com Inter + Space Grotesk, `display: swap`, 2 `.woff2` com `rel=preload`.
`<img>` cru: **0**. `next/image`: 1 (`thb-logo.tsx`). Nada a consertar aqui.

### Headers de resposta (medidos)

```
Cache-Control: no-cache, no-store, must-revalidate   (todas as rotas dinâmicas)
X-Frame-Options: DENY  +  CSP: frame-ancestors 'none'   (tudo, menos /p/*)
Referrer-Policy: strict-origin-when-cross-origin
X-Powered-By: Next.js                      ← vaza stack
```

**Ausentes:** `X-Content-Type-Options`, `Strict-Transport-Security`, `Permissions-Policy`,
`Cross-Origin-Opener-Policy`, e CSP completa (só há `frame-ancestors`).

### Observabilidade

Sentry: **ausente** (não está em `package.json`). Log estruturado: ausente — só
`console.error` avulso. Erro em produção hoje é invisível.

### Divergência de premissa do pedido

`docs/audits/2026-09-08-9-features/9-features.md` **não existe**. A pasta tem só
`fase8-plantao.md`. A "seção A = mapa do sistema" citada no briefing não está no repo — o mapa
real é o `CLAUDE.md`.

---

## B) Achados

| id | área | arquivo:linha | problema | impacto | esforço |
|---|---|---|---|---|---|
| **P1** | perf | `src/lib/auth.ts:38` | `getContextoSessao()` não é memoizado. `ehAdmin()` (`:113`) o chama de novo. A página do Diário chama 1 vez direto + 6 vezes via `ehAdmin()` dentro do `Promise.all` → **7 `auth.getUser()` + 7 `select perfis` por render**, mais 1 `getUser` do proxy = **8 idas ao GoTrue para carregar uma tela**. Nenhuma query real começa antes de 2 round-trips (~100 ms) resolverem. | Alto — ~100 ms no caminho crítico de toda página autenticada + 7× de carga no GoTrue por render. É a maior relação ganho/esforço do sistema. | **P** (3 linhas) |
| **P2** | segurança | `src/app/login/actions.ts:36` + `src/app/login/page.tsx:14` | Open redirect pós-autenticação. `destino.startsWith("/")` aceita `//evil.com` e `/\evil.com` — URLs protocolo-relativas. `redirect("//evil.com")` emite `Location: //evil.com` e o browser sai do domínio. O `proxy.ts` alimenta esse parâmetro (`?redirect=`) em toda rota protegida, então o link é trivial de montar. | Alto — phishing com o domínio do portal na barra até o clique em "Entrar". | **P** |
| **P3** | segurança | `next.config.ts:35` | Faltam `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `Permissions-Policy`. `poweredByHeader` não desligado → `X-Powered-By: Next.js` em toda resposta. | Médio | **P** |
| **P4** | perf | `src/app/admin/page.tsx:36` | N+1 **em cascata**: `acharAlunoPorEmail` roda uma query por solicitação pendente, e o `Promise.all` só começa **depois** do primeiro `Promise.all` terminar (waterfall serial). Com 20 solicitações são 20 queries em série depois de tudo. | Médio — cresce com a fila | **P** |
| **P5** | escalabilidade | `src/lib/data.ts:161` + `alunos-ativos-lista.tsx:119` | `getAlunosGps()` traz **todas** as linhas e `AlunosAtivosLista` renderiza **todas** (hoje 125). Sem paginação nem teto: o payload RSC de `/admin` e o custo de hidratação crescem linearmente. A 10× (1.250 alunos) o painel vira uma página de ~1 MB de HTML+RSC e busca/ordenação em memória no client. | Médio — assintomático hoje, quebra sem aviso | **M** |
| **P6** | perf | `src/lib/data.ts` (12×: `:29 :111 :231 :245 :286 :297 :309 :323 :336 :351 :382 :401`) | `select("*")`. `etapa1_clientes` é a tabela larga (879 linhas hoje) e é lida inteira na home, na Etapa 01 e na aba Clientes. | Médio — egress do Supabase é teto **da organização**, dividido com o sip | **M** |
| **P7** | perf | `src/app/page.tsx:96` | Depois de um `Promise.all` de 7 queries, o código faz mais **2 awaits em série** (`getAlunoById(membroAlunoId)` e `getTurmaCodigo`). Dois round-trips (~90 ms) pendurados no fim do caminho crítico da home. | Baixo/Médio | **P** |
| **UX1** | UX | 24 páginas, 0 `loading.tsx`, 0 `<Suspense>` | Toda navegação é uma tela **congelada** até o servidor terminar. Em rota dinâmica com 7–10 queries em sa-east-1, o usuário fica olhando a página anterior sem nenhum sinal de que algo está acontecendo. `src/components/ui/skeleton.tsx` **existe e tem 0 usos**. | Alto — é a percepção nº 1 de "sistema lento" | **M** |
| **UX2** | visual | 17 arquivos com `<h1 className="text-2xl font-semibold">` copiado à mão | Cabeçalho de página reescrito 17 vezes, com divergência real: 5 têm `mt-2`, 12 não. Não existe `PageHeader`. | Médio — inconsistência visível ao trocar de aba | **M** |
| **VIS1** | visual | `stat-card.tsx:17` `pt-5` · `home-resumo.tsx:32` `pt-6` · `etapas-overview.tsx:53` `pt-6` · `page.tsx:47` `pt-6` | `CardContent` **não tem padding vertical** (`ui/card.tsx:73` só tem `px-`); o `Card` já aplica `py-(--card-spacing)`. Todo `pt-5`/`pt-6` colado no `CardContent` **soma** ao padding do Card. Resultado: cards com topo de 16 px, 36 px e 40 px lado a lado na mesma tela. | Médio — é a origem do "não está redondo" | **P** |
| **VIS2** | visual | `stat-card.tsx:38` · `home-resumo.tsx:79` · `etapas-overview.tsx:57` · `auth-layout.tsx:49` | O mesmo "chip de ícone" (`size-8/9 rounded-lg bg-primary/10 text-primary`) escrito 4 vezes, com 2 tamanhos diferentes. `stat-card` e `etapas-overview` ainda concatenam className com `+` em vez de `cn()`. | Baixo | **P** |
| **VIS3** | visual | `etapas-overview.tsx:47` | Etapa bloqueada recebe `opacity-70` no card inteiro — derruba o contraste do texto junto com o resto, e não diz **quando** libera. O `Badge "Em breve"` é a única pista. | Médio (é a tela principal do aluno hoje: 5 de 6 etapas estão bloqueadas) | **P** |
| **A11Y1** | a11y | 25 ocorrências de `<p className="text-sm text-destructive">` sem `role="alert"` — incl. `login-form.tsx:51`, `cadastro-form.tsx:140`, `esqueci-form.tsx:63`, `redefinir-form.tsx:67` | Erro de formulário **não é anunciado**. O padrão certo já existe no projeto (`trocar-senha.tsx:97`, `identificacao-form.tsx:106`, todo o `plantao-calendario.tsx`) — só não foi aplicado nas telas de entrada, que são as mais críticas. | Alto (WCAG 3.3.1 / 4.1.3) | **P** |
| **A11Y2** | a11y | `src/app/admin/solicitacoes/page.tsx` · `auth/redefinir/page.tsx` · `esqueci-senha/page.tsx` · `p/plantao/page.tsx` | 4 páginas **sem `<h1>`**. Duas delas (`/esqueci-senha`, `/p/plantao`) são públicas. No `/login` o `h1` está dentro de `lg:hidden` — **no desktop a página de login não tem `h1` nenhum**. | Médio (WCAG 1.3.1, 2.4.6) | **P** |
| **A11Y3** | a11y | `src/app/layout.tsx:41` | Sem skip link. Com 5–6 abas no header, o teclado atravessa a navegação inteira em toda página. | Médio (WCAG 2.4.1) | **P** |
| **A11Y4** | a11y/mobile | `app-header.tsx:37` e `:59` | `NavTabs` é renderizado **duas vezes** (uma `hidden md:block`, outra `md:hidden`) — DOM duplicado e dois conjuntos de links na ordem de tabulação. No mobile os 5–6 itens ficam num `flex` sem `overflow-x-auto`: em 360 px eles espremem ou estouram. | Médio | **P** |
| **ARQ1** | arquitetura | `supabase/migrations/` | **O núcleo do schema `gps` não tem DDL versionada** (ver Baseline). Não dá para recriar o banco, nem revisar as policies de `membros`/`etapa1_clientes`/`progresso` em code review, nem saber se existe índice em `etapa1_clientes(aluno_id)` — a coluna do `where` mais quente do sistema. O CLAUDE.md já registra que isso mordeu uma vez: `admin_adotar_login_existente` viveu 15 dias quebrada porque só existia no banco. | Alto — é a raiz do risco de drift | **M** |
| **ARQ2** | arquitetura | `src/app/agenda/actions.ts` (128 linhas) + `data.ts:377` `getAgenda` + `:394` `getAgendaDeTodos` + `:252` `contarSolicitacoesPendentes` + `types.ts:233` `AgendaItem`/`AgendaItemComAluno` | Código morto do agendamento removido em 10/08. `src/app/agenda/` **não tem `page.tsx`** — é uma pasta só com actions que ninguém importa, apontando para a tabela `agenda`. Server Actions órfãs continuam **compiladas e expostas** com endpoint próprio. | Médio (superfície de ataque + confusão) | **P** |
| **ARQ3** | arquitetura | `src/app/admin/solicitacoes/page.tsx` | Rota inteira (com bundle e HTML shell de 10 KB) existindo só para `redirect("/admin")`. É uma entrada de `redirects()` no `next.config.ts`. | Baixo | **P** |
| **ARQ4** | perf/deps | `package.json` + `globals.css:98-127` | `next-themes` está instalado e `useTheme()` é chamado em `ui/sonner.tsx:8`, mas **não existe `ThemeProvider` em lugar nenhum** e nada nunca adiciona a classe `dark`. Os ~30 tokens do bloco `.dark` são CSS morto e uma armadilha: quem escrever `dark:` acha que funciona. | Baixo | **P** |
| **OBS1** | arquitetura | ausente | Sem `global-error.tsx` — erro no root layout cai na tela crua do Next, sem marca. Sem Sentry e sem log estruturado: **erro em produção hoje não deixa rastro**. `src/app/error.tsx:8` recebe `error` e descarta. | Médio | **M** |
| **SEC1** | segurança | `next.config.ts:96` | `frame-ancestors https://*.hotmart.com` libera **todo produtor da Hotmart** a embedar `/p/plantao`. Já documentado no próprio arquivo como dívida consciente, com o roteiro de fechamento. Repito aqui só para não sumir do radar. | Médio | **P** (depende de ensaio) |
| **SEC2** | segurança | `src/app/api/plantao/manutencao/route.ts:64` | Comparação de segredo com `!==` (não constant-time) e sem rate limit na rota. O risco real é baixo (segredo de 16+ chars, chamada por `pg_cron`), mas é o único endpoint sem sessão do portal. | Baixo | **P** |

---

## C) Plano em ondas

Cada onda = **1 commit por agente**. `backend-engineer` e `frontend-engineer` rodam em paralelo,
contextos isolados — por isso cada onda declara o **contrato** entre os dois.

---

### 🌊 Onda 1 — "parar de fazer o mesmo trabalho 8 vezes"

Maior impacto por esforço do plano inteiro. Resolve P1, P2, P3, P4, P7, ARQ2, ARQ3 + o
design system que a Onda 2 vai consumir.

#### `backend-engineer` — commit `perf(auth): memoiza a sessão e fecha o open redirect do login`

**Contexto que ele precisa:** medições P1 (57 ms/round-trip, 8 `getUser` por render do Diário),
P2 (`//evil.com` passa no `startsWith("/")`).

- [ ] **`src/lib/auth.ts`** — envolver `getContextoSessao` em `cache()` do `react` e
      `ehAdmin` também. Duas funções, `import { cache } from "react"`. Escopo é por
      requisição (React `cache`, **não** `unstable_cache`) — nada de sessão atravessa requests.
      Comentar no código **por que**: sem isso, `ehAdmin()` refaz `auth.getUser()` (ida à rede)
      a cada função de `data.ts`.
      *O que NÃO fazer:* não trocar `getUser()` por `getSession()`. `getSession()` não valida
      o JWT no servidor — seria trocar latência por buraco de auth.
- [ ] **`src/app/login/actions.ts:36`** e **`src/app/login/page.tsx:14`** — endurecer o destino:
      aceitar só `/` seguido de caractere que **não** seja `/` nem `\`. Extrair para
      `destinoInterno(v: string | undefined): string` em `src/lib/nav.ts` e usar **nos dois
      lugares** (a página monta o hidden field, a action confia nele — precisa validar de novo,
      é input do cliente).
      Casos que têm de virar `/`: `//evil.com`, `/\evil.com`, `https://evil.com`, `""`, `null`.
- [ ] **`next.config.ts`** — `poweredByHeader: false`; no bloco de headers de todas as rotas
      acrescentar `X-Content-Type-Options: nosniff`,
      `Strict-Transport-Security: max-age=31536000; includeSubDomains`,
      `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`.
      **Não** mexer nos blocos `frame-ancestors` existentes (SEC1 é decisão pendente do João).
      **Não** adicionar CSP `script-src` nesta onda — Next inline-eia bootstrap e isso quebra a
      página sem nonce; fica para uma onda própria, se o João quiser.
- [ ] **`src/app/admin/page.tsx:36`** — matar o N+1: substituir o
      `Promise.all(pendentes.map(acharAlunoPorEmail))` por **uma** query em lote. Nova função
      `acharAlunosPorEmails(emails: string[])` em `data.ts` (`.in("email", ...)`, normalizando
      com `lower(trim())` como o resto do projeto) e casar em memória. Mover a chamada **para
      dentro** do `Promise.all` de cima (hoje é waterfall serial).
- [ ] **`src/app/page.tsx:96`** — trazer `getAlunoById(ctx.membroAlunoId)` e `getTurmaCodigo`
      para dentro de um único `Promise.all`. `getTurmaCodigo` depende de `aluno?.turma_id`, então
      são 2 estágios, não 1 — mas o `getAlunoById` do sócio pode subir para o primeiro batch.
- [ ] **Remover código morto (ARQ2/ARQ3):** apagar `src/app/agenda/` inteira (é só `actions.ts`,
      sem `page.tsx`, sem nenhum import); apagar `getAgenda`, `getAgendaDeTodos` e
      `contarSolicitacoesPendentes` de `data.ts`; apagar `AgendaItem` e `AgendaItemComAluno` de
      `types.ts`; trocar `src/app/admin/solicitacoes/page.tsx` por uma entrada em
      `redirects()` no `next.config.ts` (`/admin/solicitacoes` → `/admin`, permanent).
      **Não tocar no banco.** A tabela `agenda` fica de pé, órfã, como as `gps.reuniao_*` —
      mesma regra do projeto: preservar histórico, remover só o caminho de código.

**Aceite (comandos):**
```bash
npm run build                                   # exit 0
rg -n "cache\(" src/lib/auth.ts                 # 2 ocorrências
rg -n "getSession\(" src                        # 0 (não pode ter surgido)
rg -rn "agenda" src --glob '!**/etapa*.ts'      # 0 fora dos textos de tarefa
test ! -d src/app/agenda                        # pasta some
curl -sI http://localhost:3000/login | grep -Ei "x-content-type|strict-transport|permissions-policy"   # 3 linhas
curl -sI http://localhost:3000/login | grep -i "x-powered-by"                                          # vazio
```
Prova do P1 (rodar com `npm run dev` e o log de rede do Supabase, ou instrumentando um
`console.time` temporário em `getContextoSessao`): **abrir `/admin/aluno/<id>/diario` tem de
disparar 1 `auth.getUser()`, não 7.**

#### `frontend-engineer` — commit `feat(ui): design system mínimo + estados de carregamento e erro`

**Contexto:** os 17 cabeçalhos duplicados (UX2), o `pt-6` que soma ao padding do Card (VIS1),
`ui/skeleton.tsx` com 0 usos, 25 erros mudos (A11Y1).

- [ ] **Novo `src/components/ui/page-header.tsx`** — `PageHeader({ titulo, descricao, voltar?, acao? })`.
      `<h1 className="text-2xl font-semibold">` + `<p className="text-muted-foreground">` +
      slot `acao` alinhado à direita (`flex-wrap items-end justify-between`, exatamente o que
      `admin/page.tsx:57` já faz) + slot `voltar` (o `mt-2` de 5 páginas existe porque há um
      link "voltar" acima — o componente absorve isso e a divergência acaba).
- [ ] **Novo `src/components/ui/empty-state.tsx`** — `EmptyState({ icone, titulo, descricao, acao? })`.
      Substitui os 3 blocos `<Card><CardContent className="p-10 text-center text-sm text-muted-foreground">`
      de `admin/page.tsx:120`, `alunos-ativos-lista.tsx:238` e `:312`.
      **Microcopy em português com saída:** título é o que aconteceu, descrição é o que fazer.
- [ ] **Novo `src/components/ui/kpi-card.tsx`** — absorve `StatCard` **e** o `Linha` interno de
      `home-resumo.tsx:68`. Um "chip de ícone" só (VIS2), um tamanho só, `cn()` no lugar de `+`.
      Manter a prop `destaque`. `StatCard` vira reexport fino ou some (o admin é o único
      consumidor — trocar direto).
- [ ] **Novo `src/components/ui/lista-skeleton.tsx`** — `ListaSkeleton({ linhas = 5 })` usando o
      `Skeleton` que já existe. Espelhar a **altura real** do card de lista (`py-4` + 2 linhas de
      texto) — skeleton de altura errada é CLS, e CLS é pior que spinner.
- [ ] **Consertar VIS1 em `ui/card.tsx`:** dar padding vertical padrão ao `CardContent`
      (`py-0` explícito não — o Card já paga; a correção é **remover** os `pt-5`/`pt-6` dos
      consumidores). Tocar: `stat-card.tsx:17`, `home-resumo.tsx:32`, `etapas-overview.tsx:53`,
      `app/page.tsx:47`. Se algum ficar apertado, ajustar `--card-spacing` no `Card`, nunca
      `pt-` avulso no filho.
- [ ] **`loading.tsx` em 6 rotas** (as com mais queries): `/`, `/clientes`, `/admin`,
      `/admin/aluno/[alunoId]`, `/admin/aluno/[alunoId]/diario`, `/etapa/[etapa]`.
      Cada um = `PageHeader` estático (o título já é conhecido) + `ListaSkeleton`.
      **Não** usar spinner genérico centralizado — o esqueleto tem de ter a forma da página.
- [ ] **A11Y1** — `role="alert"` nos 4 formulários de entrada:
      `login-form.tsx:51`, `cadastro-form.tsx:140`, `esqueci-form.tsx:63`,
      `redefinir-form.tsx:67`. Seguir o padrão que já está em `trocar-senha.tsx:97`.
- [ ] **A11Y3** — skip link em `src/app/layout.tsx`: `<a href="#conteudo">` com
      `sr-only focus:not-sr-only`, e `id="conteudo"` no `<main>` das páginas
      (entra junto com o `PageHeader`, na Onda 2).

**Aceite:**
```bash
npm run build                                          # exit 0
ls src/app/loading.tsx src/app/clientes/loading.tsx src/app/admin/loading.tsx   # existem
rg -c "role=\"alert\"" src/app/login/login-form.tsx src/app/cadastro/cadastro-form.tsx \
   src/app/esqueci-senha/esqueci-form.tsx src/app/auth/redefinir/redefinir-form.tsx   # 1 cada
rg -n "CardContent className=\"pt-" src                # 0
rg -n "Skeleton" src --glob '!**/ui/skeleton.tsx' | wc -l   # > 0 (era 0)
```
Visual: `npm run dev` → `/login` com JS desligado no DevTools não é exigido, mas **tirar a rede
para 3G lento e navegar `/` → `/clientes`** tem de mostrar o esqueleto, não a tela anterior.

**Contrato entre os dois (Onda 1):** nenhum arquivo em comum, exceto `next.config.ts` — que é
**só do backend** nesta onda. O frontend não encosta nele. `src/app/page.tsx` é tocado pelos
dois (backend nas queries `:96`, frontend no `pt-6` da linha `:47`): **o frontend faz esse
arquivo, o backend descreve a mudança de query no PR e o orquestrador aplica** — ou, mais
simples, o backend faz `page.tsx` inteiro e o frontend deixa o `pt-6` dele para a Onda 2.
Escolher a segunda: **`src/app/page.tsx` é do backend na Onda 1.**

---

### 🌊 Onda 2 — a polida propriamente dita

Aplica o design system e fecha a inconsistência visível. Resolve UX2, VIS2, VIS3, A11Y2,
A11Y4, P5, P6.

#### `frontend-engineer` — commit `refactor(ui): PageHeader em todas as páginas e polimento visual`

- [ ] **Aplicar `PageHeader` nas 17 páginas** listadas em UX2. Cada uma perde 4–8 linhas de
      markup e ganha `<main id="conteudo">`. **Zero mudança de texto** — o microcopy atual fica.
- [ ] **A11Y2** — `h1` nas 4 páginas sem: `/esqueci-senha`, `/auth/redefinir`, `/p/plantao`
      (via `PageHeader`), e em `/login` **tirar o `h1` de dentro do `lg:hidden`**: o
      "Bem-vindo de volta" de `login/page.tsx:29` vira o `h1` da página (hoje é `h2` e o `h1`
      só existe no mobile). Ajustar a hierarquia do `auth-layout.tsx:44` (o `h2` do painel de
      marca vira o que é: texto de marca, não título de documento).
- [ ] **VIS3** — etapa bloqueada: trocar `opacity-70` do card inteiro por esmaecimento **só do
      bloco de conteúdo** (o título e o badge mantêm contraste AA), e o `Badge "Em breve"` ganha
      microcopy de expectativa. **Não inventar data.** Se `gps.etapas` não tem campo de previsão,
      o texto é "Libera conforme sua turma avança" — verdade, não promessa.
      O `<div>` não clicável recebe `aria-disabled="true"`.
- [ ] **A11Y4 / mobile** — `app-header.tsx`: renderizar `NavTabs` **uma vez**. Container com
      `overflow-x-auto` + `scrollbar-none` no mobile e `md:overflow-visible`. Testar em 360 px
      com as 6 abas do modo assistência.
- [ ] **VIS2** — extrair o "chip de ícone" para dentro do `KpiCard`/utilitário e apagar as
      cópias de `etapas-overview.tsx:57` e `auth-layout.tsx:49`. Trocar as concatenações `+ ` de
      className por `cn()` em `stat-card.tsx` e `etapas-overview.tsx`.
- [ ] **`EmptyState` nos estados vazios restantes** (~8 lugares com "Nenhum…" hoje sem forma
      compartilhada).
- [ ] **ARQ4** — apagar o bloco `.dark` de `globals.css:98-127`, remover `next-themes` do
      `package.json` e fixar `theme="light"` em `ui/sonner.tsx:8`.
      🔑 Isso **não é** "tirar o tema escuro": não existe tema escuro hoje: nada adiciona a
      classe `dark`. É remover 30 linhas que mentem. **Se o João quiser tema escuro, é feature,
      não polimento** — e aí volta com `ThemeProvider` de verdade e QA visual das 24 telas.

#### `backend-engineer` — commit `perf(data): colunas explícitas e teto no painel do admin`

- [ ] **P6** — trocar os 12 `select("*")` de `data.ts` por listas explícitas de coluna.
      Começar por `getClientesEtapa1` (`:110`) e `getClienteById` (`:285`) — são a tabela larga
      e a de leitura mais frequente. Derivar a lista dos campos que os tipos em `types.ts`
      realmente declaram; **se um campo não é usado por ninguém, não entra** (e isso vira nota
      no PR, não `drop column`).
      ⚠️ Um `select` explícito quebra em silêncio se alguém adicionar coluna e esquecer daqui —
      por isso a lista fica em **uma constante nomeada por tabela** no topo de `data.ts`, como
      `COLUNAS_NOTA` (`:528`) e `COLUNAS_EVENTO` (`:754`) já fazem. Seguir esse padrão.
- [ ] **P5** — teto e paginação no painel: `gps.admin_painel_alunos()` passa a aceitar
      `p_limite`/`p_offset` (default 100) **e** devolver o total. `getAlunosGps` repassa.
      `AlunosAtivosLista` ganha "mostrar mais".
      🔑 **A busca e os filtros hoje são em memória** — paginar o servidor sem paginar a busca
      faria o aluno da página 3 sumir do resultado. Duas leituras possíveis; escolher a
      conservadora: **manter busca/filtro em memória sobre o conjunto carregado e exibir
      "mostrando 100 de N"**, com o botão trazendo o próximo lote. Não mover busca para o
      servidor nesta onda — é feature, não polimento. **Ver BLOQUEIO 2.**

**Contrato (Onda 2):** o frontend não toca `src/lib/data.ts` nem `supabase/migrations/`.
O backend não toca `src/components/**` nem `src/app/**/page.tsx`, **exceto**
`alunos-ativos-lista.tsx` — que é do backend nesta onda (o "mostrar mais" é consequência direta
da assinatura da RPC). O frontend deixa esse arquivo intocado na Onda 2.

---

### 🌊 Onda 3 — o banco entra no controle de versão + o erro deixa de ser invisível

Resolve ARQ1 e OBS1. É a onda que menos aparece na tela e mais muda o risco.

#### `backend-engineer` — commit `chore(db): versiona o schema núcleo do gps e verifica índices`

- [ ] **Migration `00000000000000_gps_baseline.sql`** (timestamp zero, para ordenar antes de
      tudo) com o DDL **idempotente** (`create table if not exists`, `create policy` guardado por
      `do $$ ... exception when duplicate_object then null; end $$`) de: `gps.etapas`,
      `gps.membros`, `gps.ambientes`, `gps.etapa1_clientes`, `gps.progresso`,
      `gps.tarefa_enfase`, `gps.solicitacoes_acesso`, `gps.acessos_log`,
      `gps.etapa3_agendamentos`, `gps.etapa3_revisao`, as 4 `gps.reuniao_*` (órfãs, mas
      versionadas — apagar do banco não está em pauta) e as funções `gps.aluno_atual()`,
      `gps.touch_atualizado_em()`, `public.gp_is_admin()`.
      🔴 **Esta migration NÃO altera nada.** É um retrato. Se ela rodar num banco vazio,
      reconstrói; se rodar no banco atual, é no-op. O backend **não inventa DDL**: extrai do
      banco (`pg_dump --schema=gps --schema-only`) — **ver BLOQUEIO 1**, o dump depende do João.
      Cabeçalho da migration explica que ela é retrato e por que existe (o caso
      `admin_adotar_login_existente`, quebrada 15 dias por não ter migration).
- [ ] **Índices** — no mesmo arquivo ou num `..._idx.sql` irmão, garantir
      `etapa1_clientes(aluno_id)`, `progresso(aluno_id, etapa)`, `tarefa_enfase(aluno_id, etapa)`,
      `membros(user_id)` e `membros(aluno_id)`.
      🔑 **Cada índice novo entra com `explain analyze` colado no comentário**, do jeito que a
      Fase 2 do Diário fez (`idx_aluno_eventos_backfill_corte`). Índice sem plano medido é
      chute, e chute em tabela append-only cobra caro na escrita. Se o plano mostrar que o
      índice já existe ou não é usado, **não criar** e registrar isso.
- [ ] **SEC2** — comparação do segredo em `api/plantao/manutencao/route.ts:64` com
      `crypto.timingSafeEqual` sobre buffers de mesmo tamanho.
- [ ] **OBS1** — log estruturado nas actions e no `route.ts`: um helper
      `src/lib/log.ts` (`logErro(escopo, erro, contexto)`) que emite JSON de uma linha
      (`{nivel, escopo, msg, alunoId?, ts}`) — **sem PII**: nada de e-mail, nome, telefone ou
      texto de nota do Diário. Substituir os `console.error` avulsos. Não instalar Sentry nesta
      onda (é dependência nova + DSN + decisão de custo); deixar o helper pronto para plugar.

#### `frontend-engineer` — commit `feat(ui): global-error e erro com identidade`

- [ ] **`src/app/global-error.tsx`** — hoje não existe: erro no root layout mostra a tela crua do
      Next. Mesmo visual do `error.tsx` atual, com `<html lang="pt-BR">` próprio.
- [ ] **`src/app/error.tsx:8`** — a prop `error` é recebida e **descartada**. Passar
      `error.digest` para a tela em texto pequeno ("código: abc123") — é o que liga a queixa do
      aluno ao log do servidor. **Nunca `error.message`** (pode conter detalhe interno).
- [ ] **`error.tsx` por segmento** onde a falha é localizada e a página tem valor sem ela:
      `src/app/admin/aluno/[alunoId]/diario/error.tsx` e `src/app/clientes/error.tsx`.
- [ ] Revisar o **microcopy de erro** das 4 telas de entrada: hoje o login diz "E-mail ou senha
      inválidos" (correto, não vaza qual dos dois). Conferir que nenhuma outra tela vaza
      existência de conta.

#### `security-pentester` — **obrigatório** (a Onda 1 mexeu em redirect de auth, headers e a
Onda 3 versiona RLS)

- [ ] Auditar `destinoInterno()` (P2) com a lista completa de bypass de open redirect:
      `//`, `/\`, `/%2f`, `/%5c`, `\/`, `https:/evil`, `/…@evil.com`, unicode.
- [ ] Auditar o baseline de RLS que a migration expõe pela primeira vez em código:
      **para cada tabela `gps.*`, existe policy de aluno E de admin?** `using` sem `with check`
      em UPDATE? View sem `security_invoker`? `grant` para `anon` onde não devia?
      (Checklist do `.agents/skills/supabase/SKILL.md`.)
- [ ] Confirmar que o `React.cache` da Onda 1 **não** vazou contexto entre requisições
      (é escopo de request no React — confirmar por leitura, não por fé).
- [ ] Reavaliar SEC1 (`*.hotmart.com`) com o resultado do ensaio, se o João tiver rodado.

---

### 🌊 Onda 4 — bundle (só se as 3 primeiras passarem no Fable)

Onda de medição, não de fé. **Só entra com número antes e depois.**

#### `frontend-engineer` — commit `perf(bundle): reduz o JS das telas públicas`

- [ ] Medir de novo com o mesmo método da seção A (o script está lá) e comparar com
      **235 KB gzip no `/login`** e **297 KB no `/esqueci-senha`**.
- [ ] Investigar por que `/esqueci-senha` (um campo) pesa **62 KB gzip a mais** que `/login`
      (dois campos). É chunk mal dividido, não conteúdo.
- [ ] `experimental.optimizePackageImports: ["react-icons", "lucide-react"]` no `next.config.ts`
      e **medir**. Se não mover a agulha, reverter — não deixar config que não faz nada.
- [ ] Avaliar `next/dynamic` para `plantao-calendario.tsx` (1.198 linhas, usado numa rota só) e
      `gerenciar-acesso.tsx` (624 linhas, num diálogo que a maioria das sessões nunca abre).
      **Só o diálogo**: componente atrás de interação é o caso didático de import dinâmico.
- [ ] **Critério de aceite:** `/login` abaixo de **180 KB gzip** ou justificativa escrita de por
      que não dá. Sem número, a onda não fecha.

---

## D) O que NÃO fazer

| Não fazer | Por quê |
|---|---|
| **Reconstruir agendamento de reunião com a equipe** | Removido em 10/08 por decisão **operacional** do Marcio (a equipe não comparecia). Já voltou uma vez por engano. As tabelas `gps.reuniao_*` órfãs vão parecer "feature pela metade" para quem ler o baseline da Onda 3 — **são histórico preservado de propósito.** |
| **Ler as tabelas `gps.reuniao_*`** | Idem. Proibido sem decisão explícita do Marcio. |
| **`drop column status` de `gps.etapa1_clientes`** | É o caminho de volta da migração de `fase`, e a linha `status='recusou'` não tem lugar nas 3 fases. Congelada por trigger de propósito (C7 do PLANO-9-FEATURES). |
| **CSP com `script-src` nesta rodada** | O Next inline-eia bootstrap; sem nonce (que exige middleware por request e derruba qualquer cache) a política quebra a página inteira. Header de frame + nosniff + HSTS já é a parte que rende. CSP completa é projeto próprio. |
| **Trocar `getUser()` por `getSession()` para "ganhar" os 57 ms** | `getSession()` não valida o JWT no servidor. Seria trocar latência por buraco de auth. O `React.cache` resolve o mesmo problema sem abrir nada. |
| **`unstable_cache` / ISR nas páginas do aluno** | Todo dado é por usuário e atrás de RLS. Cache cross-request aqui é vazamento de dado entre alunos esperando acontecer. `React.cache` (por requisição) sim; cache persistente não. |
| **Mover busca/ordenação do painel para o servidor** | Funciona bem em memória com 125 alunos e a busca tolerante de `src/lib/texto.ts` é boa. Mover é feature nova, com risco de regressão de comportamento, sem ganho hoje. Ver P5. |
| **Virtualizar listas** | 125 alunos e 30 clientes por aluno. Virtualização quebra Ctrl+F, âncora e a11y por um problema que ainda não existe. Paginar (Onda 2) resolve com menos dano. |
| **Redesenhar o `auth-layout` / trocar a paleta** | O pedido é polida. A paleta laranja + Inter/Space Grotesk é padrão do grupo e está correta no `globals.css`. |
| **Instalar Sentry na Onda 3** | Dependência nova + DSN + custo. O helper de log fica pronto; a decisão é do João. |
| **Apagar o bucket `gps-documentos` ou as policies `documentos_public_*`** | O segundo é de outro sistema (o sip). Fora de escopo. |
| **Tocar em notas / ticket com anexo / financeiro** | Fases 5/6/7, outro arquiteto. |

---

## CONFLITO

**"Um redesign maneiro sem mudar muita coisa" × o que o polimento de verdade exige.**

O sistema não tem um problema de *aparência* — tem um problema de *repetição*. O cabeçalho de
página está escrito à mão **17 vezes**, com `mt-2` em 5 delas e não nas outras 12. O "chip de
ícone" existe em **4 cópias** com 2 tamanhos. O `pt-6` que soma ao padding do `Card` produz
cards com topo de 16, 36 e 40 px **na mesma tela**.

Consequência: deixar redondo mexe em **17 arquivos de página** e move **quase nenhum pixel**.
Um diff grande com aparência quase idêntica é exatamente o que o pedido diz para não fazer — e é
exatamente o que o pedido *precisa*. Estou nomeando isso para não parecer surpresa no PR: as
Ondas 1–2 tocam ~35 arquivos e a tela vai continuar reconhecível. **Essa é a entrega, não um
desvio dela.**

Segundo ponto, menor: o briefing aponta `docs/audits/2026-09-08-9-features/9-features.md`
como "seção A = mapa do sistema". **Esse arquivo não existe** — a pasta tem só
`fase8-plantao.md`. Trabalhei com o `CLAUDE.md` como mapa. Se o documento existe fora do repo,
vale colar antes da Onda 1.

## BLOQUEIO

1. **O baseline do schema núcleo (ARQ1 / Onda 3) depende de acesso ao banco que eu não tenho.**
   As tabelas `gps.etapas`, `membros`, `ambientes`, `etapa1_clientes`, `progresso`,
   `tarefa_enfase`, `solicitacoes_acesso`, `acessos_log`, `etapa3_*` e `reuniao_*` não têm DDL
   no repo — foram criadas direto no banco. **Não vou escrever esse DDL de cabeça**: inventar o
   que eu acho que são as policies de `etapa1_clientes` e chamar de "baseline" é pior que não
   ter baseline, porque parece verdade em code review. O João precisa rodar
   `pg_dump --schema=gps --schema-only` (ou o `supabase db dump`) e colar o resultado; o backend
   transforma em migration idempotente. **Sem isso, a Onda 3 do backend não começa.** As Ondas 1
   e 2 não dependem disso e podem correr antes.

2. **Paginação do painel (P5): duas leituras do pedido geram trabalhos diferentes.**
   - *Leitura A:* "carregar 100 e ter botão mostrar mais; busca continua sobre o que foi
     carregado". Barato, sem regressão, mas o admin que buscar "Silva" com 300 alunos no sistema
     pode não achar quem está no lote 4. É meia-verdade na tela.
   - *Leitura B:* busca e ordenação vão para o servidor (a RPC recebe termo e ordem). Correto em
     qualquer volume, mas é reescrever a busca tolerante de `src/lib/texto.ts` em SQL — feature,
     não polimento, e com risco real de a busca ficar **pior** do que a atual, que é boa.
   Com 125 alunos hoje, nenhuma das duas é urgente. Escolhi A no plano e marquei o limite na
   tela ("mostrando 100 de N") — mas **a escolha é do João**, porque a diferença aparece para o
   usuário. Se ele disser B, a Onda 2 do backend muda de tamanho (P → G).

3. **SEC1 (`frame-ancestors https://*.hotmart.com`) não fecha daqui.** Exige o ensaio do passo 5
   do `ATIVAR-PLANTAO-AGORA.md` — abrir o Plantão dentro do iframe da Hotmart e ler o
   `document.referrer`. Fechar às cegas tira 421 pessoas do ar. Não é bloqueio do plano, é
   pendência de campo que continua aberta.

---

## E) Como validar sem credencial de admin

### Páginas públicas (dá para fotografar sem login)

| Rota | O que conferir |
|---|---|
| `/login` | painel laranja no desktop (`lg:`), selo com anel branco, `h1` presente (A11Y2), link "Esqueci minha senha" ao lado do label, erro anunciado ao errar a senha de propósito |
| `/esqueci-senha` | ganhou `h1`; erro com `role="alert"` |
| `/cadastro` | máscara de CPF/CNPJ, olho na senha, erro anunciado |
| `/p/plantao` | ganhou `h1`; calendário mensal; aviso de prazo de cancelamento **acima** da lista de slots |
| `/rota-que-nao-existe` | `not-found.tsx` com a marca |
| `/admin` sem sessão | redireciona para `/login?redirect=/admin` |

**Teste do open redirect (P2), sem login nenhum:**
```bash
curl -s "https://programa.timeholdingbrasil.com.br/login?redirect=//example.com" -o /dev/null -w "%{http_code}\n"
```
Depois: abrir essa URL, entrar com uma conta de teste e confirmar que **cai em `/`**, não em
`example.com`. Antes da Onda 1 isso sai do domínio.

**Headers (Onda 1), de qualquer lugar:**
```bash
curl -sI https://programa.timeholdingbrasil.com.br/login | \
  grep -Ei "x-content-type|strict-transport|permissions-policy|x-powered-by|x-frame"
```
Esperado depois da Onda 1: 3 headers novos presentes, `x-powered-by` **ausente**.

**Peso do JS (Onda 4), reprodutível:**
```bash
curl -s https://programa.timeholdingbrasil.com.br/login \
 | grep -o '/_next/static/[A-Za-z0-9_./-]*\.js' | sort -u | wc -l
```
Comparar com os **16 chunks / 235 KB gzip** do baseline.

### Checklist logado (só o João consegue)

Cinco minutos, na ordem:

1. **`/admin` → abrir um aluno → aba Diário.** A tela tem de abrir *visivelmente* mais rápido
   depois da Onda 1. É a página com 8 idas ao GoTrue hoje.
2. **Navegar `/` → Clientes → Materiais → Pasta** com a rede em "Slow 3G" (DevTools → Network).
   Depois da Onda 1 tem de aparecer **esqueleto**, não a tela anterior congelada.
3. **Trocar de aba 4 vezes e olhar o topo de cada página.** O espaço acima do título tem de ser
   o mesmo nas 4 (VIS1/UX2). É o teste mais direto de "está redondo".
4. **Home do aluno, olhar o card de etapa bloqueada.** Texto tem de ser legível (não esmaecido
   junto com o card) e dizer algo verdadeiro sobre quando libera.
5. **Celular de verdade, retrato.** Header com as abas: tem de rolar na horizontal, não espremer
   nem estourar. No modo assistência são 6 abas — é o pior caso.
6. **Teclado, sem mouse, no `/login`:** primeiro Tab tem de oferecer "Pular para o conteúdo".
   Errar a senha de propósito com o leitor de tela ligado — o erro tem de ser falado.
7. **Painel do admin com a lista cheia:** conferir que o rodapé diz "mostrando 100 de N" e que
   o "mostrar mais" traz o resto (Onda 2, se o João aprovar a Leitura A do BLOQUEIO 2).

---

## Os 5 critérios do Fable

| Critério | O que este plano garante |
|---|---|
| **Segurança** | Fecha o open redirect pós-login (P2 — hoje explorável com um link), adiciona `nosniff`/HSTS/`Permissions-Policy` e tira o `X-Powered-By` (P3), põe o segredo do job em comparação constant-time (SEC2), e coloca as policies RLS do núcleo **em código revisável pela primeira vez** (ARQ1). Nenhum privilégio novo é concedido a ninguém: `ehAdmin()` continua sendo a mesma pergunta, só deixa de ser feita 7 vezes. Tarefa de pentester é obrigatória na Onda 3 e cobre redirect, RLS e o escopo do `React.cache`. |
| **Escalabilidade** | Corta a carga no GoTrue de 8 para 1 chamada por render (P1) — a 10× o tráfego atual isso é a diferença entre caber e bater no rate limit do Auth. Mata o N+1 do painel (P4), põe teto e paginação onde hoje não há (P5), e reduz o egress por leitura com colunas explícitas (P6) — teto que é **da organização**, dividido com o sip. Índices só entram com `explain analyze` colado. |
| **Solidificação** | Aqui está a fraqueza que assumo: o ganho principal é **DDL versionada**, não `constraint` nova. O núcleo do schema passa a existir em código idempotente e auditável (ARQ1) — hoje o repo **não sabe** se `etapa1_clientes(aluno_id)` tem índice ou se `progresso` tem policy de aluno. Invariante nova de verdade só uma, e no código: `destinoInterno()` vira o **único** caminho de validação de redirect, chamado no page e na action (hoje a regra está duplicada em dois lugares com a mesma falha). Argumento explícito: adicionar `check`/`unique` em tabela cujo DDL eu não posso ler seria chute — por isso o baseline vem **antes** de qualquer constraint, e constraint fica para depois da Onda 3. |
| **UX** | O usuário vê: (a) esqueleto no lugar de tela congelada em 6 rotas — é o que hoje faz o sistema *parecer* lento; (b) espaçamento igual no topo de todas as páginas (VIS1/UX2 — a queixa "não está redondo" tem endereço); (c) etapa bloqueada legível, dizendo algo verdadeiro em vez de só esmaecer; (d) header que rola no celular em vez de espremer; (e) erro de login **falado** pelo leitor de tela e "pular para o conteúdo" no primeiro Tab. Microcopy segue em português correto e **nenhum texto de produto muda** — o `PageHeader` recebe as mesmas strings. |
| **Otimização** | O saldo é **negativo em código**, que é o ponto. Saem: `src/app/agenda/` inteira (128 linhas órfãs, com Server Actions expostas), 3 funções mortas de `data.ts`, 2 tipos mortos, a rota `/admin/solicitacoes` (vira 1 linha de `redirects()`), 30 linhas de `.dark` que nada ativa, `next-themes` do `package.json`, e 17 cabeçalhos duplicados que viram 1 componente. Entram 4 componentes pequenos que substituem código existente em vez de somar. A Onda 4 só fecha **com número**: `/login` abaixo de 180 KB gzip ou justificativa escrita. Nenhuma onda adiciona dependência nova. |

---

## Divisão de tarefas

### backend-engineer
- [ ] **Onda 1** — `React.cache` em `getContextoSessao`/`ehAdmin`; `destinoInterno()` em `nav.ts` usado no page e na action; headers `nosniff`/HSTS/`Permissions-Policy` + `poweredByHeader:false`; `acharAlunosPorEmails()` em lote matando o N+1 do `/admin`; achatar o waterfall de `src/app/page.tsx`; remover `src/app/agenda/`, `getAgenda`/`getAgendaDeTodos`/`contarSolicitacoesPendentes`, `AgendaItem`/`AgendaItemComAluno` e a rota `/admin/solicitacoes`. **Não tocar no banco.**
- [ ] **Onda 2** — 12 `select("*")` → constantes `COLUNAS_*` por tabela; `p_limite`/`p_offset` + total na RPC `admin_painel_alunos` e "mostrar mais" em `alunos-ativos-lista.tsx`. **Depende do BLOQUEIO 2.**
- [ ] **Onda 3** — migration `00000000000000_gps_baseline.sql` (retrato idempotente, a partir do `pg_dump` do João — **BLOQUEIO 1**); índices só com `explain analyze` no comentário; `timingSafeEqual` no segredo do job; `src/lib/log.ts` sem PII substituindo os `console.error`.

### frontend-engineer
- [ ] **Onda 1** — `PageHeader`, `EmptyState`, `KpiCard`, `ListaSkeleton`; remover os `pt-5`/`pt-6` que somam ao padding do `Card`; `loading.tsx` em 6 rotas; `role="alert"` nos 4 formulários de entrada; skip link no root layout.
- [ ] **Onda 2** — `PageHeader` nas 17 páginas + `<main id="conteudo">`; `h1` nas 4 páginas sem e no desktop do `/login`; etapa bloqueada legível + `aria-disabled`; `NavTabs` renderizado uma vez com scroll horizontal no mobile; `cn()` no lugar de `+`; `EmptyState` nos vazios restantes; remover `.dark` + `next-themes`.
- [ ] **Onda 3** — `global-error.tsx`; `error.digest` na tela (nunca `error.message`); `error.tsx` por segmento em `diario` e `clientes`; revisão do microcopy de erro das telas de entrada.
- [ ] **Onda 4** — medir bundle com o método da seção A; investigar os 62 KB a mais do `/esqueci-senha`; `optimizePackageImports` **com medição antes/depois**; `next/dynamic` no diálogo `gerenciar-acesso`. Fecha só com número.

### security-pentester (obrigatório — o plano toca redirect de auth, headers e RLS)
- [ ] **Onda 3** — auditar `destinoInterno()` contra a lista completa de bypass (`//`, `/\`, `/%2f`, `/%5c`, `\/`, `https:/`, `/…@evil.com`, unicode); auditar o baseline de RLS que a migration expõe pela primeira vez (policy de aluno **e** de admin por tabela `gps.*`, `with check` nos UPDATE, view sem `security_invoker`, `grant` a `anon`) usando o checklist de `.agents/skills/supabase/SKILL.md`; confirmar por leitura que o `React.cache` é escopo de requisição e não atravessa sessões; reavaliar SEC1 se o ensaio do iframe tiver sido feito.

## Adendo do orquestrador após a Onda 1 (09/09)
- Onda 1 fechada: backend `f9a763a`, frontend `4631b59`. Achados novos para a **Onda 2 (frontend)**:
  - Contraste: `KpiCard` `destaque` usa `text-primary` (#FF6300 sobre branco = 2,97:1). Trocar o valor em destaque para `text-accent-foreground` (#B04300, 6,4:1). Chip de ícone decorativo pode ficar.
  - `src/components/admin/plantao-calendario.tsx:462` tem o mesmo bug "Setembro De 2026" — usar o mesmo `rotuloMes()` de `calendario-mes.tsx`.
  - `#conteudo` tem de existir no `<main>` de toda página (entra com o `PageHeader`).
- Bloqueio 2 (paginação do painel) decidido pelo orquestrador: **Leitura A** com `p_limite` default 200 e "mostrar mais"; busca/filtros em memória sobre o carregado; rodapé "mostrando X de N".
- Bloqueio 1 (baseline do schema): o orquestrador extraiu o retrato do banco em `tmp/squad/schema-gps-dump.md` — a Onda 3 do backend parte dele (não inventa DDL).
- Fases 5/6/7 rodam intercaladas com as ondas (spec em `tmp/squad/fases-5-6-7.md`). Ordem: Fase 5 ‖ Fase 7-A → Fase 7-B ‖ Onda 2 → Fase 6 ‖ Onda 3 → pentest → Fable → Onda 4 (se der).
