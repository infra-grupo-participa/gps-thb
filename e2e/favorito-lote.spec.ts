import { test, expect } from "@playwright/test";
import { exigeAdmin, entrar, registrarTela } from "./apoio";

/**
 * Tirar a estrela em lote (02/10/2026) — tela → action → RPC, SÓ a prévia.
 *
 * 🔴 Roda contra PRODUÇÃO. Este teste nunca confirma a gravação: clica em
 * "Ver prévia" (simular = true, zero escrita no banco) e fecha o diálogo.
 * O que ele prova: a porta de entrada existe, a seleção ancora nos 2 alunos
 * de QA declarados, o contrato action/RPC responde (nomes de parâmetro e de
 * campo que o `tsc` não enxerga) e a tela escreve a contagem.
 *
 * Âncora: os mesmos `QA_LOTE_BUSCA` / `QA_LOTE_NOMES` do lote de etapas.
 */

const cred = exigeAdmin();
const buscaLote = (process.env.QA_LOTE_BUSCA ?? "").trim();
const nomesLote = (process.env.QA_LOTE_NOMES ?? "")
  .split(";")
  .map((n) => n.trim())
  .filter(Boolean);

test.describe("Tirar estrela em lote — prévia", () => {
  test.skip(!cred, "Sem credencial de admin de QA no .env.qa.");
  test.skip(
    !buscaLote || nomesLote.length !== 2,
    "Sem QA_LOTE_BUSCA e QA_LOTE_NOMES (2 nomes, separados por ';') no .env.qa.",
  );

  test("a prévia de 2 alunos de QA devolve a contagem e não grava", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "Uma vez só basta.");
    test.setTimeout(180_000);

    await entrar(page, cred!, "/admin?aba=ativos");
    await page.goto("/admin?aba=ativos");

    await page.getByRole("button", { name: "Etapas e estrela em lote" }).click();
    await expect(page).toHaveURL(/[?&]lote=etapas\b/);

    await page
      .getByRole("searchbox", { name: "Buscar parceiro por nome ou e-mail" })
      .fill(buscaLote);
    await expect(
      page.getByRole("checkbox", { name: /^Selecionar .+ para o lote de etapas e estrela$/ }),
    ).toHaveCount(2, { timeout: 15_000 });
    for (const nome of nomesLote) {
      await page
        .getByRole("checkbox", {
          name: `Selecionar ${nome} para o lote de etapas e estrela`,
          exact: true,
        })
        .check();
    }

    await page.getByRole("button", { name: "Tirar estrela dos selecionados" }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toBeVisible();
    await dialogo
      .getByLabel(/Motivo/)
      .fill("E2E QA — só prévia, nada é gravado");
    await dialogo.getByRole("button", { name: "Ver prévia" }).click();

    // A contagem vem do banco (simular): os 3 números somam os 2 selecionados.
    await expect(dialogo.getByText(/sem favorito/)).toBeVisible({ timeout: 20_000 });
    await expect(dialogo.getByText(/pulado/)).toBeVisible();
    await expect(dialogo.getByRole("alert")).toHaveCount(0);
    await registrarTela(page, info, "favorito-lote-previa");

    // Fecha sem confirmar: nenhuma escrita.
    await page.keyboard.press("Escape");
    await expect(dialogo).toBeHidden();
  });
});
