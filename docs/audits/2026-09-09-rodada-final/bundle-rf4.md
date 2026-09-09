# Onda 4 — bundle, medido (09/09/2026)

Método: `npm run build` → `PORT=3987 node server.js` → baixar o HTML de cada rota,
extrair os `<script src="/_next/static/...">`, baixar cada chunk com
`accept-encoding: identity` e somar `gzipSync(level:9)`.
Script: `tmp/squad/mede-bundle.mjs`. Mesmo comando, mesma porta, antes e depois.

Rota autenticada não dá para medir por HTML (o servidor redireciona para `/login`):
`tmp/squad/mede-manifest.mjs` soma os chunks únicos do
`page_client-reference-manifest.js` de cada rota. É superset do que o browser baixa,
mas é o MESMO método nos dois lados, então a diferença vale.

## Rotas públicas (soma dos `<script>` do HTML)

| rota | ANTES | DEPOIS | Δ |
|---|---:|---:|---:|
| `/login` | 242 KB | **236 KB** | −6 |
| `/cadastro` | 243 KB | **236 KB** | −7 |
| `/esqueci-senha` | 304 KB | **235 KB** | **−69** |
| `/p/plantao` | 280 KB | **284 KB** | +4 |

## Rotas autenticadas (manifest)

| rota | ANTES | DEPOIS | Δ | chunk do SDK Supabase |
|---|---:|---:|---:|---|
| `/` | 143 KB | **74 KB** | −69 | antes sim → **não** |
| `/admin` | 223 KB | **158 KB** | −65 | antes sim → **não** |
| `/admin/aluno/[alunoId]` | 181 KB | **75 KB** | −106 | antes sim → **não** |
| `/perfil` | 157 KB | **97 KB** | −60 | antes sim → **não** |
| `/pasta` | 152 KB | **72 KB** | −80 | antes sim → **não** |
| `/chamados` | 174 KB | **114 KB** | −60 | antes sim → **não** |
| `/clientes` | 209 KB | **149 KB** | −60 | antes sim → **não** |
| `/etapa/[etapa]` | 162 KB | **102 KB** | −60 | antes sim → **não** |

O chunk `AuthClient`/`GoTrue`/`Realtime` era referenciado por **27** manifests de rota
(21 ocorrências só no da home). Hoje: **0**.

## `/login` — por que 236 e não 190

| gzip | chunk | o que é |
|---:|---|---|
| 70,8 KB | `27s_y8udhw0o1.js` | `react-dom` |
| **38,6 KB** | `0cz1d0mv5g_q7.js` | **polyfill `noModule` — nenhum browser moderno baixa** |
| 28,4 KB | `2u-_0oirjw3tn.js` | runtime do Next / App Router |
| 12,9 + 12,9 + 8,2 KB | 3 chunks | `@base-ui/react` (Input, InputSenha, Button, Label) |
| 12,5 + 8,3 + 7,1 + 2,5 + 1,6 + 1,4 KB | 6 chunks | módulos da própria página |
| 8,6 + 8,8 + 8,9 + 4,1 + 0,3 KB | 5 chunks | runtime/turbopack |

**236 KB medidos · 197 KB é o que um browser moderno baixa** (o polyfill sai com
`noModule`). O piso de framework — `react-dom` + runtime do Next — é ~120 KB gzip, e o
design system (Base UI) custa mais ~34 KB. Não há SDK, `sonner` nem código de admin em
`/login`: o que sobrou é framework e a biblioteca de componentes.

## O que foi testado e REVERTIDO

| tentativa | movimento medido | veredito |
|---|---|---|
| `experimental.optimizePackageImports: ["lucide-react"]` | **0 KB em 12 rotas** | revertido — `lucide-react` 1.x já publica um módulo por ícone |
| `next/dynamic` no `AnexoCampo` | `/chamados` 0 KB · `/chamados/[id]` −1 KB | revertido — abaixo do corte de 5 KB, e piscava na tela de responder |
