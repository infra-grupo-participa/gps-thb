import { test, expect } from "@playwright/test";
import {
  exigeLogin,
  entrar,
  semRolagemHorizontal,
  contrasteAprovado,
  alvosDeClique,
  vigiarConsole,
  registrarTela,
} from "./apoio";

/**
 * Entrevista Prévia 2.0 — o formulário guiado que gera o DISC sozinho.
 *
 * Regras do Marcio (23/09) que estes testes guardam:
 *   • botão na ficha do cliente que leva à entrevista
 *   • 20-30 perguntas, TODAS fechadas (nenhum campo de texto livre)
 *   • o DISC é gerado no fim, sem ninguém informar nem anexar
 *   • mais de um decisor ⇒ a Reunião Preliminar exige todos presentes
 *   • entrevistas ILIMITADAS por cliente
 *
 * 🔴 ESCREVE EM PRODUÇÃO: a conclusão grava DISC e decisores na ficha de um
 * cliente real. Por isso o fluxo completo só roda no CLIENTE DE TESTE, e só
 * no desktop — as travas da suíte valem aqui igual.
 */

const cred = exigeLogin();

/** A ficha do cliente de teste. Os outros testes não escrevem nada. */
const CLIENTE_TESTE = /CLIENTE DE TESTE/i;

test.describe("Entrevista Prévia 2.0", () => {
  test.skip(!cred, "Sem QA_PARCEIRO_EMAIL/SENHA no .env.qa.");

  test("a ficha do cliente oferece a Entrevista Prévia", async ({ page }, info) => {
    await entrar(page, cred!, "/clientes");
    await page.goto("/clientes");

    const link = page.getByRole("link", { name: CLIENTE_TESTE }).first();
    const achou = await link
      .waitFor({ state: "visible", timeout: 12_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!achou, "Cliente de teste não está na lista desta conta.");

    await link.click();
    await page.waitForURL(/\/clientes\/[0-9a-f-]+$/i, { timeout: 15_000 });

    await expect(
      page.getByText(/entrevista prévia/i).first(),
      "A ficha não oferece a Entrevista Prévia. O pedido era um botão AQUI " +
        "(Marcio, 23/09: 'tem que ter na aba do cliente um botão pra iniciar').",
    ).toBeVisible({ timeout: 12_000 });

    await expect(
      page.getByRole("link", { name: /iniciar entrevista|nova entrevista/i }).first(),
    ).toBeVisible();

    await registrarTela(page, info, "ficha-com-entrevista.png");
  });

  test("o formulário abre, mostra o progresso e NÃO tem pergunta aberta", async ({
    page,
  }, info) => {
    const console_ = vigiarConsole(page);
    await entrar(page, cred!, "/clientes");
    await page.goto("/clientes");

    const link = page.getByRole("link", { name: CLIENTE_TESTE }).first();
    test.skip(
      !(await link.waitFor({ state: "visible", timeout: 12_000 }).then(() => true).catch(() => false)),
      "Cliente de teste não está na lista.",
    );
    await link.click();
    await page.waitForURL(/\/clientes\/[0-9a-f-]+$/i, { timeout: 15_000 });
    await page.getByRole("link", { name: /iniciar entrevista|nova entrevista/i }).first().click();
    await page.waitForURL(/\/entrevista$/, { timeout: 15_000 });

    // Progresso visível: o parceiro precisa saber quanto falta para
    // administrar o tempo da conversa.
    const progresso = page.getByRole("progressbar");
    await expect(progresso).toBeVisible({ timeout: 12_000 });

    const total = Number(await progresso.getAttribute("aria-valuemax"));
    expect(
      total >= 20 && total <= 30,
      `O roteiro tem ${total} perguntas. O pedido foi "algo em torno de 20/30".`,
    ).toBe(true);

    // 🔴 NENHUMA PERGUNTA ABERTA — a regra que governa a feature inteira.
    // Um campo de texto aqui quebraria o cálculo do DISC e a contagem de
    // decisores, que dependem de resposta estruturada.
    await expect(
      page.locator('input[type="text"], input:not([type]), textarea'),
      "Apareceu campo de texto livre no meio das perguntas. A regra é " +
        "'nao tem pergunta aberta' — é da resposta fechada que saem o DISC " +
        "e a contagem de decisores.",
    ).toHaveCount(0);

    // As opções são botões grandes, marcáveis.
    await expect(page.locator("button[aria-pressed]").first()).toBeVisible();

    await semRolagemHorizontal(page);
    await registrarTela(page, info, `entrevista-${test.info().project.name}.png`);
    console_.semErros();
  });

  test("contraste WCAG AA no formulário", async ({ page }) => {
    await entrar(page, cred!, "/clientes");
    await page.goto("/clientes");
    const link = page.getByRole("link", { name: CLIENTE_TESTE }).first();
    test.skip(
      !(await link.waitFor({ state: "visible", timeout: 12_000 }).then(() => true).catch(() => false)),
      "Cliente de teste não está na lista.",
    );
    await link.click();
    await page.waitForURL(/\/clientes\/[0-9a-f-]+$/i, { timeout: 15_000 });
    await page.getByRole("link", { name: /iniciar entrevista|nova entrevista/i }).first().click();
    await page.waitForURL(/\/entrevista$/, { timeout: 15_000 });
    await page.getByRole("progressbar").waitFor({ state: "visible", timeout: 12_000 });

    await contrasteAprovado(page, "a Entrevista Prévia");
    await alvosDeClique(page);
  });
});
