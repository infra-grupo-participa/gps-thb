import { test, expect, type Page } from "@playwright/test";
import { exigeLogin, exigeAdmin, entrar, registrarTela } from "./apoio";

/**
 * REMARCAR pela equipe (`/admin/sessoes`) → o parceiro vê o novo horário.
 *
 * O que este spec prova, e só um navegador prova:
 *   1. o diálogo de remarcar mostra a GRADE LIVRE (lista agrupada por dia) e
 *      NÃO tem campo de data/hora — PRD §7.1, regra literal do Marcio;
 *   2. escolher um bloco e confirmar MUDA a sessão — o parceiro vê o novo
 *      dia/hora em `/sessoes`;
 *   3. o parceiro NÃO tem botão "Remarcar" (só a equipe remarca).
 *
 * 🔴 ÂNCORA ÚNICA: `CLIENTE DE TESTE (QA)`, conferida DUAS vezes (na linha e
 * no diálogo aberto) — o mesmo padrão de `sessoes-fluxo.spec.ts`.
 * `/admin/sessoes` é a agenda inteira da equipe; remarcar a sessão de um
 * parceiro real mandaria a ele um e-mail dizendo que a reunião mudou.
 *
 * 🔴 MANDA E-MAIL DE VERDADE (marcar, remarcar e cancelar disparam o cron
 * `sessao-emails`). Por isso tudo aqui fica PULADO sem `QA_PERMITE_EMAIL=1`.
 *
 * ⚠️ Depende da migration `…327_gps_sessao_remarcar` aplicada. Sem ela a RPC
 * `gps.sessao_remarcar` não existe e o passo 2 falha com a frase de erro.
 */

const parceiro = exigeLogin();
const admin = exigeAdmin();
const CLIENTE_DE_TESTE = /CLIENTE DE TESTE \(QA\)/i;
const MOTIVO =
  "Remarcação feita pela suíte E2E de QA. Não é cliente real; desfeita automaticamente.";

/** O parceiro marca o primeiro horário livre, se ainda não tiver sessão. */
async function garantirSessaoDeTeste(page: Page): Promise<boolean> {
  await page.goto("/sessoes");
  const botao = page.getByRole("button", { name: /^escolher \d{1,2}:\d{2}/i }).first();
  const temGrade = await botao
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (!temGrade) {
    // Sem grade pode ser "já tem sessão marcada" — e isso serve.
    const texto = await page.locator("#conteudo").last().innerText();
    return /cancelar|marcada|confirmada/i.test(texto);
  }
  await botao.click();
  await page.getByRole("button", { name: /^marcar /i }).last().click();
  await page.waitForTimeout(3_000);
  return true;
}

/** A linha do cliente de teste que tem botão Remarcar. */
function linhaDeTeste(page: Page) {
  return page
    .locator("li")
    .filter({ hasText: CLIENTE_DE_TESTE })
    .filter({ has: page.getByRole("button", { name: /^remarcar$/i }) })
    .first();
}

/** Cancela, pela equipe, SÓ sessão do cliente de teste (2 travas). */
async function cancelarSessaoDeTeste(page: Page) {
  for (let i = 0; i < 10; i++) {
    await page.goto("/admin/sessoes");
    await page.waitForTimeout(1_500);
    const linha = page
      .locator("li")
      .filter({ hasText: CLIENTE_DE_TESTE })
      .filter({ has: page.getByRole("button", { name: /^cancelar$/i }) })
      .last();
    if (!(await linha.isVisible().catch(() => false))) return;
    await linha.getByRole("button", { name: /^cancelar$/i }).first().click();
    const dialogo = page.getByRole("dialog").last();
    if (!CLIENTE_DE_TESTE.test(await dialogo.innerText().catch(() => ""))) {
      await page.getByRole("button", { name: /^voltar$/i }).last().click().catch(() => {});
      return;
    }
    await dialogo.locator("textarea").fill(MOTIVO);
    await page.getByRole("button", { name: /^cancelar sess(ã|a)o$/i }).last().click();
    await page.waitForTimeout(3_500);
  }
}

test.describe("Remarcar · equipe remarca, parceiro vê", () => {
  test.skip(
    !parceiro || !admin,
    "Precisa das DUAS contas (QA_PARCEIRO_* e QA_ADMIN_*) no .env.qa.",
  );
  test.skip(
    process.env.QA_PERMITE_EMAIL !== "1",
    "Marcar, remarcar e cancelar disparam e-mail real (cron sessao-emails). " +
      "Rode com QA_PERMITE_EMAIL=1 só quando isso for aceitável.",
  );

  test("o parceiro não vê botão Remarcar em /sessoes", async ({ browser }) => {
    test.skip(test.info().project.name !== "desktop", "Fluxo de dado: só desktop.");
    const ctx = await browser.newContext({ locale: "pt-BR" });
    const pg = await ctx.newPage();
    try {
      await entrar(pg, parceiro!, "/sessoes");
      await pg.goto("/sessoes");
      await pg.locator("#conteudo").last().waitFor();
      await expect(pg.getByRole("button", { name: /remarcar/i })).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });

  test("admin abre a lista (sem date/time), remarca, e o parceiro vê o novo horário", async ({
    browser,
  }, info) => {
    test.skip(test.info().project.name !== "desktop", "Fluxo de dado: só desktop.");

    const ctxP = await browser.newContext({ locale: "pt-BR" });
    const ctxA = await browser.newContext({ locale: "pt-BR" });
    const pgP = await ctxP.newPage();
    const pgA = await ctxA.newPage();

    try {
      await entrar(pgP, parceiro!, "/sessoes");
      await entrar(pgA, admin!, "/admin/sessoes");

      const temSessao = await garantirSessaoDeTeste(pgP);
      test.skip(!temSessao, "Sem grade e sem sessão do cliente de teste — nada a remarcar.");

      await pgA.goto("/admin/sessoes");
      const linha = linhaDeTeste(pgA);
      await linha.waitFor({ state: "visible", timeout: 15_000 });
      await linha.getByRole("button", { name: /^remarcar$/i }).click();

      // 🔴 2ª trava: o diálogo descreve a sessão; sem o cliente de teste, sai.
      const dialogo = pgA.getByRole("dialog").last();
      const textoDialogo = await dialogo.innerText();
      if (!CLIENTE_DE_TESTE.test(textoDialogo)) {
        await pgA.getByRole("button", { name: /^voltar$/i }).last().click();
        throw new Error("Diálogo aberto não é do CLIENTE DE TESTE (QA); nada foi remarcado.");
      }

      // 1) Sem campo de data/hora (PRD §7.1).
      await expect(dialogo.locator('input[type="date"], input[type="time"]')).toHaveCount(0);

      // A grade carrega sob demanda; espera sair do "Carregando".
      await expect(dialogo.getByText(/carregando horários livres/i)).toHaveCount(0, {
        timeout: 15_000,
      });
      const opcoes = dialogo.getByRole("radio");
      const qtd = await opcoes.count();
      test.skip(qtd === 0, "Nenhum outro horário livre da mesma profissional.");

      // O bloco escolhido: rótulo do dia (cabeçalho do grupo) + hora.
      const primeira = opcoes.first();
      const rotuloHora = (await primeira.locator("xpath=..").innerText()).trim();
      const hora = rotuloHora.match(/\d{2}:\d{2}/)?.[0] ?? "";
      const dia = (
        await primeira
          .locator("xpath=ancestor::ul[1]/preceding-sibling::p[1]")
          .innerText()
      ).trim();
      await primeira.check();
      await dialogo.locator("textarea").fill(MOTIVO);
      await registrarTela(pgA, info, "remarcar-1-dialogo.png");
      await pgA.getByRole("button", { name: /^remarcar sess(ã|a)o$/i }).click();
      await expect(pgA.getByRole("status").filter({ hasText: /avisado por e-mail/i }))
        .toBeVisible({ timeout: 15_000 });

      // 2) O parceiro vê o NOVO horário.
      await pgP.goto("/sessoes");
      const textoP = await pgP.locator("#conteudo").last().innerText();
      expect(
        textoP.includes(`${dia}, ${hora}`),
        `Remarquei para "${dia}, ${hora}" e /sessoes do parceiro não mostra.\n\n` +
          textoP.slice(0, 600),
      ).toBe(true);
      await registrarTela(pgP, info, "remarcar-2-parceiro-ve.png");
    } finally {
      await cancelarSessaoDeTeste(pgA).catch(() => {});
      await ctxP.close();
      await ctxA.close();
    }
  });
});
