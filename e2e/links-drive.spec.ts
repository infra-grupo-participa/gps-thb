import { test, expect } from "@playwright/test";
import { entrar, exigeLogin, registrarTela } from "./apoio";

/**
 * Links do Drive na ficha do cliente — tela → action → RPC → tela.
 *
 * 🔴 Roda contra PRODUÇÃO. Âncora no "CLIENTE DE TESTE (QA)", conferido na
 * lista e no campo "Nome" da ficha antes de qualquer escrita. O teste grava UM
 * link (URL de QA, sem https, para provar a normalização) e o remove no fim;
 * não há upload nem e-mail. Se falhar no meio, sobra um link "QA E2E" no
 * cliente de teste: o próprio teste remove sobras no início.
 */

const cred = exigeLogin();
const NOME_LINK = "QA E2E link";
const URL_SEM_HTTPS = "drive.google.com/drive/folders/qa-e2e?usp=sharing";

test.describe("Links do Drive na ficha", () => {
  test.skip(!cred, "Sem credencial de parceiro de QA no .env.qa.");

  test("adiciona link sem https, vê na lista, remove e confirma", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "Uma vez só basta.");
    test.setTimeout(120_000);

    await entrar(page, cred!, "/clientes");
    await page.goto("/clientes");
    await page.getByPlaceholder(/buscar por nome/i).fill("CLIENTE DE TESTE");
    const link = page.getByRole("link", { name: /CLIENTE DE TESTE \(QA\)/i }).first();
    const existe = await link
      .waitFor({ state: "visible", timeout: 12_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!existe, 'Não há "CLIENTE DE TESTE (QA)" alcançável pela conta de QA.');

    await link.click();
    await page.waitForURL(/\/clientes\/[0-9a-f-]{36}/i, { timeout: 15_000 });
    const base = page.url().split("?")[0];

    // 2ª conferência da âncora: o campo Nome da ficha.
    await page.goto(`${base}?aba=dados`);
    await expect(
      page.getByLabel(/^Nome\s*\(obrigatório\)$/),
      "A ficha aberta não é a do cliente de teste — abortando antes de escrever.",
    ).toHaveValue(/CLIENTE DE TESTE \(QA\)/i);

    // O card pode morar em outra aba: percorre as abas até achá-lo visível.
    const card = page.getByRole("region", { name: "Links do Drive deste cliente" });
    let achou = false;
    for (const aba of ["dados", "preliminar", "croqui", "fechamento"]) {
      await page.goto(`${base}?aba=${aba}`);
      achou = await card
        .waitFor({ state: "visible", timeout: 4_000 })
        .then(() => true)
        .catch(() => false);
      if (achou) break;
    }
    expect(achou, "O card 'Links do Drive deste cliente' não apareceu em nenhuma aba.").toBe(true);

    const removerSobras = async () => {
      while (await card.getByRole("link", { name: new RegExp(NOME_LINK) }).count()) {
        await card.getByRole("button", { name: new RegExp(`Remover o link ${NOME_LINK}`) }).first().click();
        const d = page.getByRole("dialog");
        await d.getByRole("button", { name: "Remover link" }).click();
        await expect(d).toBeHidden({ timeout: 15_000 });
        await page.reload();
      }
    };
    await removerSobras();

    // Erro de formato: não chega ao servidor e fala em role=alert.
    await card.getByLabel("Nome").fill(NOME_LINK);
    await card.getByLabel("Link do Drive").fill("https://exemplo.com/x");
    await card.getByRole("button", { name: "Adicionar link" }).click();
    await expect(card.getByRole("alert")).toContainText("Cole o link do Drive");
    await expect(card.getByLabel("Link do Drive")).toHaveAttribute("aria-invalid", "true");

    // Caminho feliz: sem https, o app normaliza.
    await card.getByLabel("Link do Drive").fill(URL_SEM_HTTPS);
    await card.getByRole("button", { name: "Adicionar link" }).click();
    const item = card.getByRole("link", { name: new RegExp(NOME_LINK) });
    await expect(item).toBeVisible({ timeout: 20_000 });
    await expect(item).toHaveAttribute("href", /^https:\/\/drive\.google\.com\/drive\/folders\/qa-e2e/);
    await expect(item).toHaveAttribute("target", "_blank");
    await expect(item).toHaveAttribute("rel", /noopener/);
    await registrarTela(page, info, "links-drive-adicionado");

    // Remover: o diálogo nomeia o link; confirmar tira da lista.
    await card.getByRole("button", { name: `Remover o link ${NOME_LINK}` }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toContainText(NOME_LINK);
    await dialogo.getByRole("button", { name: "Remover link" }).click();
    await expect(dialogo).toBeHidden({ timeout: 15_000 });
    await expect(card.getByRole("link", { name: new RegExp(NOME_LINK) })).toHaveCount(0, {
      timeout: 15_000,
    });

    // Prova de persistência: recarrega e continua sem o link.
    await page.reload();
    await expect(card.getByRole("link", { name: new RegExp(NOME_LINK) })).toHaveCount(0);
  });
});
