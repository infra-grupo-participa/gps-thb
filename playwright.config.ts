import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Suíte E2E do GPS — valida a feature NO NAVEGADOR, não no `tsc`.
 *
 * 🔴 POR QUE ISTO EXISTE (pedido do Marcio, 22/09/2026):
 * *"muitas das coisas que a gente builda, você acaba validando pelo lint ou
 * pela requisição… preciso que valide visualmente, no browser mesmo"*.
 *
 * O que `tsc`/`lint`/`build` NÃO pegam, e esta suíte pega:
 *   • geometria: `sticky` quebrado, overflow horizontal, alvo de clique pequeno
 *   • contraste COMPUTADO (a cor final depois de herança e sobreposição)
 *   • o fluxo ligado de ponta a ponta: clicar → gravar → repintar
 *   • "a feature existe mas a porta de entrada some" (aba fora da dobra)
 *
 * 🔑 Esta casa já pagou por não ter isto: 1.790 testes verdes com a tela
 * quebrada, porque jsdom mocka `getBoundingClientRect` e NÃO PINTA. Aqui o
 * Chromium pinta de verdade.
 *
 * ── CREDENCIAIS ────────────────────────────────────────────────────────────
 * Ficam em `.env.qa`, FORA do repositório (no scratchpad da sessão). O
 * caminho vem de `QA_ENV_FILE`; sem ele, os testes que exigem login são
 * PULADOS com aviso — nunca falham por falta de segredo, e segredo nenhum
 * entra no git.
 */

function carregarEnvQa() {
  const arquivo =
    process.env.QA_ENV_FILE ??
    path.join(process.cwd(), ".env.qa");
  try {
    for (const linha of fs.readFileSync(arquivo, "utf8").split(/\r?\n/)) {
      const i = linha.indexOf("=");
      if (i <= 0 || linha.trimStart().startsWith("#")) continue;
      const chave = linha.slice(0, i).trim();
      if (!process.env[chave]) process.env[chave] = linha.slice(i + 1).trim();
    }
  } catch {
    // Sem arquivo: os specs que precisam de login se pulam sozinhos.
  }
}
carregarEnvQa();

export default defineConfig({
  testDir: "./e2e",
  // Sequencial: os testes compartilham UM ambiente real (o mesmo parceiro, a
  // mesma grade de 4 horários por semana). Em paralelo, dois testes marcariam
  // o mesmo bloco e a trava `sessao_slot_unico` derrubaria um deles — falha
  // que parece defeito do produto e é do teste.
  workers: 1,
  fullyParallel: false,
  // Sem retry: teste que só passa na 2ª tentativa esconde intermitência, e
  // intermitência em E2E quase sempre é defeito de verdade (corrida, espera
  // mal escrita). Prefiro ver vermelho.
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "e2e/.relatorio", open: "never" }],
    ["json", { outputFile: "e2e/.relatorio/resultado.json" }],
  ],
  use: {
    baseURL: process.env.QA_BASE_URL ?? "http://localhost:3000",
    // Rastro só quando falha: vídeo + screenshots + DOM, para eu ver o que a
    // tela mostrava no instante do erro, em vez de adivinhar pelo stack.
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 768 } },
    },
    {
      // 390px é o alvo real: a casa já mediu que a home mobile tinha 5.350px
      // de rolagem antes do redesign. Header com 9+ abas e a ficha do cliente
      // (a tela mais usada) são os pontos que quebram aqui primeiro.
      name: "celular",
      use: { ...devices["Pixel 7"] },
    },
    /**
     * ═══════════════════════════════════════════════════════════════════════
     * 🔴 `chrome` — O CHROME DE VERDADE, ATRÁS DE UMA VARIÁVEL DE AMBIENTE
     * ═══════════════════════════════════════════════════════════════════════
     *
     * Existe por UMA prova que os outros dois projetos não conseguem dar: que
     * o PDF **PINTA** no visor nativo (teste 6b de `ficha-abas.spec.ts`). O
     * `chromium` dos projetos `desktop`/`celular` é o **headless shell**, que
     * não embarca o viewer de PDF e ABORTA o request — o frame filho nunca
     * vira `chrome-extension://…`, e o teste se PULA com a razão escrita.
     * "1 iframe no DOM" nunca provou que pintou: foi assim que um `sandbox=""`
     * sobreviveu a uma suíte verde, com o elemento presente e o conteúdo em
     * `chrome-error://chromewebdata/`.
     *
     * 🔴 POR QUE GATEADO, e não um projeto a mais na lista. `npm run e2e` é um
     * `playwright test` **sem `--project`**, então TODO projeto declarado roda.
     * Um `headless: false` fixo aqui abriria janela em toda execução da suíte —
     * inclusive em CI, onde não há display. Com o gate, `npm run e2e` não muda
     * em nada sem a variável.
     *
     * Rodar a prova da junção:
     *   E2E_CHROME=1 npx playwright test e2e/ficha-abas.spec.ts --project=chrome
     *
     * 🔑 Não há `testMatch`/`testIgnore`/`grep` neste config, então todo spec
     * de `./e2e` roda em todo projeto declarado — o teste 6b entra neste
     * projeto sem precisar de filtro. Conferido em 24/09/2026.
     *
     * ⚠️ Exige o **Chrome instalado na máquina** (`channel: "chrome"` usa o
     * binário do sistema, não o Chromium que o Playwright baixa). Sem ele o
     * projeto falha ao abrir o navegador — por isso ele não entra por padrão.
     */
    ...(process.env.E2E_CHROME
      ? [
          {
            name: "chrome",
            use: {
              ...devices["Desktop Chrome"],
              channel: "chrome",
              // `headless: false` é REQUISITO, não preferência: o viewer de
              // PDF não existe no modo headless nem no Chrome de verdade.
              headless: false,
              viewport: { width: 1366, height: 768 },
            },
          },
        ]
      : []),
  ],
});
