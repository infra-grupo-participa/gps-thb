import { expect, test } from "@playwright/test";
import { entrar, exigeAdmin, vigiarConsole } from "./apoio";

/**
 * Sino de avisos da equipe (08/10/2026) — `src/components/admin/sino-avisos.tsx`
 * + a loja `src/lib/avisos-equipe-loja.ts`.
 *
 * O que esta suíte protege, e que `tsc`/`node --test` não pegam:
 * 1. A porta de entrada: o sino aparece no header do admin.
 * 2. Teclado: abrir o painel, Esc fecha e o foco VOLTA ao sino.
 * 3. Rede: trocar de página pelo header NÃO chama `avisos_contar` de novo (o
 *    header é renderizado por página e remonta; a contagem vive na loja do
 *    módulo, 1× por aba). É a prova em navegador de "0 por navegação".
 *
 * ⚠️ Roda contra PRODUÇÃO com a conta de QA admin. Abrir o painel chama
 * `avisos_marcar_lidos` — escreve SÓ o ponteiro de leitura da própria conta de
 * QA (nenhum e-mail, nenhum efeito em outra pessoa).
 */

const admin = exigeAdmin();

test.describe("Sino de avisos · admin", () => {
  test.skip(!admin, "Sem QA_ADMIN_EMAIL/SENHA — defina-os em .env.qa (aponte QA_ENV_FILE).");

  test("sino visível, abre o painel e Esc devolve o foco", async ({ page }) => {
    const erros = vigiarConsole(page);
    await entrar(page, admin!, "/admin");

    const sino = page.getByRole("button", { name: /^Avisos da equipe/ });
    await expect(sino).toBeVisible();
    // Visível de verdade (pai não oculto), não só presente no DOM.
    expect(await sino.evaluate((e) => (e as HTMLElement).offsetParent !== null)).toBe(true);

    await sino.click();
    const painel = page.getByRole("dialog", { name: "Avisos da equipe" });
    await expect(painel).toBeVisible();
    await expect(sino).toHaveAttribute("aria-expanded", "true");
    // Carregou: lista, vazio ou erro — nunca preso em "Carregando…".
    await expect(painel.getByText("Carregando…")).toHaveCount(0, { timeout: 10_000 });

    await page.keyboard.press("Escape");
    await expect(painel).toHaveCount(0);
    await expect(sino).toBeFocused();
    await expect(sino).toHaveAttribute("aria-expanded", "false");

    erros.semErros();
  });

  test("trocar de página pelo header não relê a contagem", async ({ page }) => {
    const chamadas: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/rpc/avisos_contar")) chamadas.push(r.url());
    });
    await entrar(page, admin!, "/admin");
    await expect(page.getByRole("button", { name: /^Avisos da equipe/ })).toBeVisible();
    await expect.poll(() => chamadas.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
    const noCarregamento = chamadas.length;

    // Até 3 navegações client-side por links do header que levam a outra tela do admin.
    const destinos = await page
      .locator('header a[href^="/admin/"]')
      .evaluateAll((as) =>
        [...new Set(as.map((a) => a.getAttribute("href") ?? ""))]
          .filter((h) => h && !h.includes("?") && h !== location.pathname)
          .slice(0, 3),
      );
    expect(destinos.length, "header do admin tem links para navegar").toBeGreaterThan(0);
    for (const href of destinos) {
      const link = page.locator(`header a[href="${href}"]`).first();
      if (!(await link.isVisible())) continue;
      await link.click();
      await page.waitForURL((u) => u.pathname === href);
      await expect(page.getByRole("button", { name: /^Avisos da equipe/ })).toBeVisible();
    }
    expect(
      chamadas.length - noCarregamento,
      `avisos_contar a mais em ${destinos.length} navegações`,
    ).toBe(0);
  });
});
