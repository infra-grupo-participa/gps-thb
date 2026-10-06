import { test, expect, type Page } from "@playwright/test";
import { exigeLogin, entrar, registrarTela } from "./apoio";

/**
 * Chamado ligado a UM cliente (06/10/2026).
 *
 * Fluxo: abre chamado ligado ao CLIENTE DE TESTE (QA) → a etiqueta aparece na
 * lista → no detalhe troca para "Nenhum cliente" → chamado `troca_*` não mostra
 * o bloco (o banco recusa ligar cliente ali, 22023).
 *
 * 🔴 Ancora SÓ no `CLIENTE DE TESTE (QA)`: se a opção não existir no ambiente de
 * QA, o teste se PULA — nunca escolhe "o primeiro cliente da lista", que pode
 * ser de parceiro real. Conferido 2×: na opção escolhida e na etiqueta da lista.
 *
 * 🔴 EFEITO EXTERNO: abrir chamado manda e-mail à equipe (e a troca cria
 * solicitação pendente). Exige `QA_PERMITE_EMAIL=1`, como `sessoes-fluxo`.
 * O teste fecha os chamados que abriu, mas e-mail enviado não se desfaz.
 */

const parceiro = exigeLogin();
const CLIENTE = "CLIENTE DE TESTE (QA)";
const ASSUNTO = "QA E2E cliente do chamado (pode ignorar)";

test.describe("chamado ligado a um cliente", () => {
  test.skip(!parceiro, "Sem QA_ENV_FILE: credenciais de QA ausentes.");
  test.skip(
    process.env.QA_PERMITE_EMAIL !== "1",
    "Abrir chamado manda e-mail à equipe. Rode com QA_PERMITE_EMAIL=1 só " +
      "quando isso for aceitável.",
  );

  async function fechar(page: Page) {
    await page
      .getByRole("button", { name: /^fechar chamado$/i })
      .first()
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^fechar chamado$/i })
      .click();
    await expect(page.getByText(/chamado fechado/i).first()).toBeVisible();
  }

  test("liga, mostra na lista, troca para nenhum; troca_* sem o bloco", async ({
    page,
  }, info) => {
    await entrar(page, parceiro!, "/chamados");
    await page.goto("/chamados");

    // --- abre o chamado ligado ao cliente de teste ---
    await page.getByRole("button", { name: /^abrir chamado$/i }).first().click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByLabel(/^assunto$/i).fill(ASSUNTO);
    await dialogo.getByLabel(/^mensagem$/i).fill("Teste automático da suíte E2E.");

    await dialogo.getByText("Um dos meus clientes").click();
    await dialogo.getByRole("combobox").fill("CLIENTE DE TESTE");
    const opcao = dialogo.getByRole("option", { name: new RegExp(CLIENTE, "i") });
    test.skip(
      (await opcao.count()) === 0,
      `O ambiente de QA não tem o cliente "${CLIENTE}" — nada seguro a ligar.`,
    );
    await expect(opcao.first()).toContainText(CLIENTE); // 1ª conferência
    await opcao.first().click();
    await expect(dialogo.getByRole("combobox")).toHaveValue(CLIENTE);

    await dialogo.getByRole("button", { name: /^abrir chamado$/i }).click();
    await page.waitForURL(/\/chamados\/[0-9a-f-]{36}/, { timeout: 20_000 });
    const urlDetalhe = page.url();

    try {
      // --- detalhe mostra o cliente ---
      await expect(page.getByText(`Sobre o cliente:`)).toBeVisible();
      await expect(page.getByText(CLIENTE, { exact: true }).first()).toBeVisible();

      // --- etiqueta na lista (2ª conferência: só vale com o nome de teste) ---
      await page.goto("/chamados");
      const item = page.getByRole("listitem").filter({ hasText: ASSUNTO }).first();
      await expect(item.getByText(`Cliente: ${CLIENTE}`)).toBeVisible();
      await registrarTela(page, info, "chamados-lista-com-etiqueta");

      // --- troca para "Nenhum cliente" ---
      await page.goto(urlDetalhe);
      const gatilho = page.getByRole("button", { name: /^trocar cliente$/i });
      await gatilho.click();
      await expect(gatilho).toHaveAttribute("aria-expanded", "true");
      // o foco foi para dentro do editor
      await expect(page.getByLabel("Nenhum cliente")).toBeFocused();
      await page.getByLabel("Nenhum cliente").check();
      await page.getByRole("button", { name: /^salvar cliente$/i }).click();
      await expect(page.getByText(/cliente removido do chamado/i)).toBeVisible();
      await expect(page.getByText("Sobre o cliente:")).toHaveCount(0);
      // o foco voltou ao botão, não caiu no body
      await expect(
        page.getByRole("button", { name: /ligar a um cliente/i }),
      ).toBeFocused();
    } finally {
      await page.goto(urlDetalhe);
      await fechar(page).catch(() => {});
    }
  });

  test("chamado troca_* não mostra 'Sobre o cliente'", async ({ page }) => {
    await entrar(page, parceiro!, "/chamados");
    await page.goto("/chamados");
    await page.getByRole("button", { name: /^abrir chamado$/i }).first().click();
    const dialogo = page.getByRole("dialog");

    const categoria = dialogo.getByRole("combobox", { name: /categoria/i });
    test.skip(
      (await categoria.count()) === 0,
      "Categorias desligadas neste ambiente — não há como abrir troca_*.",
    );
    await categoria.click();
    await page.getByRole("option", { name: /s[óo]cio/i }).click();
    // No formulário de troca o campo de cliente não existe.
    await expect(dialogo.getByText(/é sobre algum cliente seu/i)).toHaveCount(0);

    await dialogo.getByRole("textbox").first().fill("Teste automático da suíte E2E.");
    await dialogo.getByRole("button", { name: /enviar pedido/i }).click();
    await page.waitForURL(/\/chamados\/[0-9a-f-]{36}/, { timeout: 20_000 });
    const urlDetalhe = page.url();

    try {
      await expect(page.getByRole("heading").first()).toBeVisible();
      await expect(page.getByText("Sobre o cliente:")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /trocar cliente/i })).toHaveCount(0);
    } finally {
      await page.goto(urlDetalhe);
      await fechar(page).catch(() => {});
    }
  });
});
