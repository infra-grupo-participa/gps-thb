import { test, expect, type Page, type Locator } from "@playwright/test";
import { exigeLogin, exigeAdmin, entrar, registrarTela } from "./apoio";

/**
 * A Entrevista Prévia com o Marco, a partir de 06/10/2026.
 *
 * O parceiro marca a EP (tipo 1, 40 min) em /sessoes; o Marco abre o
 * questionário do cliente direto da agenda (/admin/sessoes → "Abrir
 * entrevista"), sem as ~5 telas do espelho.
 *
 * 🔴 ESCREVE: marcar e cancelar disparam e-mail real (cron sessao-emails).
 * Por isso o spec inteiro se pula sem `QA_PERMITE_EMAIL=1`, e o `finally`
 * cancela pela equipe — SÓ a sessão do `CLIENTE DE TESTE (QA)`, conferido na
 * linha e de novo no diálogo (mesmo helper de `sessoes-fluxo.spec.ts`).
 *
 * ⚠️ Depende da migration da grade do Marco (…328). Sem ela aplicada, o
 * primeiro teste falha por horário fora do conjunto — é o sinal certo.
 */

const parceiro = exigeLogin();
const admin = exigeAdmin();
const PERMITE_EMAIL = process.env.QA_PERMITE_EMAIL === "1";

const CLIENTE_DE_TESTE = /CLIENTE DE TESTE \(QA\)/i;
const TITULO_GRADE_EP = /^marque sua entrevista pr(é|e)via$/i;
/** A grade do Marco: estes inícios, e só eles, de 06/10 em diante. */
const HORARIOS_DO_MARCO = ["09:00", "11:00", "14:00", "15:00", "16:00"];
const PRIMEIRO_DIA = "2026-10-06";
const URL_ENTREVISTA_ADMIN = /\/admin\/aluno\/[^/]+\/clientes\/[0-9a-f-]{36}\/entrevista(\?.*)?$/i;

/** O bloco "Marque sua Entrevista Prévia" de /sessoes (o `<div>` mais interno). */
function gradeDaEp(page: Page): Locator {
  return page
    .locator("div")
    .filter({ has: page.getByRole("heading", { name: TITULO_GRADE_EP }) })
    .last();
}

/** `{ "2026-10-06": ["09:00", …] }` lido do DOM pintado da grade. */
async function horariosPorDia(grade: Locator): Promise<Record<string, string[]>> {
  return grade.evaluate((raiz) => {
    const saida: Record<string, string[]> = {};
    for (const ul of Array.from(raiz.querySelectorAll("ul"))) {
      const rotulo = ul.previousElementSibling?.textContent ?? "";
      const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(rotulo);
      if (!m) continue;
      const dia = `${m[3]}-${m[2]}-${m[1]}`;
      saida[dia] = Array.from(ul.querySelectorAll("button"))
        .map((b) => /escolher (\d{2}:\d{2})/i.exec(b.textContent ?? "")?.[1])
        .filter((h): h is string => Boolean(h));
    }
    return saida;
  });
}

/** Cancela pela equipe SÓ a sessão do cliente de teste (duas travas). */
async function cancelarPelaEquipe(page: Page, motivo: string) {
  for (let i = 0; i < 10; i++) {
    await page.goto("/admin/sessoes");
    await page.waitForTimeout(1_500);
    const linha = page
      .locator("li, article, div")
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
    const campo = page.locator("textarea").last();
    if (await campo.isVisible().catch(() => false)) await campo.fill(motivo);
    await page.getByRole("button", { name: /^cancelar sess(ã|a)o$/i }).last().click();
    await page.waitForTimeout(3_500);
  }
}

test.describe("EP com o Marco · /sessoes → /admin/sessoes → questionário", () => {
  test.skip(!parceiro || !admin, "Precisa das DUAS contas (QA_PARCEIRO_* e QA_ADMIN_*) no .env.qa.");
  test.skip(
    !PERMITE_EMAIL,
    "Marcar e cancelar disparam e-mail real (cron sessao-emails). Rode com QA_PERMITE_EMAIL=1 só quando isso for aceitável.",
  );
  test.describe.configure({ mode: "serial" });

  test("o parceiro vê a EP de 40 min com os horários do Marco a partir de 06/10", async ({
    page,
  }, info) => {
    await entrar(page, parceiro!, "/sessoes");
    await page.goto("/sessoes");
    const grade = gradeDaEp(page);
    await expect(grade, "Sem a grade da EP em /sessoes — favorito não é o cliente de teste?").toBeVisible({
      timeout: 15_000,
    });
    await expect(grade.getByText(/40 min/).first()).toBeVisible();

    const porDia = await horariosPorDia(grade);
    const doMarco = Object.entries(porDia).filter(([dia]) => dia >= PRIMEIRO_DIA);
    expect(doMarco.length, "Nenhum dia de 06/10 em diante na grade da EP.").toBeGreaterThan(0);
    for (const [dia, horas] of doMarco) {
      for (const h of horas) {
        expect(HORARIOS_DO_MARCO, `${dia} ${h} fora da grade do Marco`).toContain(h);
      }
    }
    await registrarTela(page, info, "ep-marco-grade-parceiro.png");
  });

  test("o admin vê 'Abrir entrevista' e cai no questionário do cliente certo; abrir 2× não cria linha", async ({
    browser,
  }, info) => {
    const ctxParceiro = await browser.newContext();
    const ctxAdmin = await browser.newContext();
    const pp = await ctxParceiro.newPage();
    const pa = await ctxAdmin.newPage();
    try {
      // Admin entra ANTES de marcar: o `finally` precisa dele para cancelar.
      await entrar(pa, admin!, "/admin/sessoes");
      // 1) Parceiro marca o 1º horário da EP — só se o diálogo nomear o cliente de teste.
      await entrar(pp, parceiro!, "/sessoes");
      await pp.goto("/sessoes");
      const grade = gradeDaEp(pp);
      const botao = grade.getByRole("button", { name: /^escolher \d{2}:\d{2}$/i }).first();
      const temHorario = await botao
        .waitFor({ state: "visible", timeout: 15_000 })
        .then(() => true)
        .catch(() => false);
      test.skip(!temHorario, "Sem horário livre de EP para marcar.");
      await botao.click();
      const dialogo = pp.getByRole("dialog").last();
      const texto = await dialogo.innerText();
      if (!CLIENTE_DE_TESTE.test(texto)) {
        await pp.getByRole("button", { name: /^voltar$/i }).last().click();
        test.skip(true, "A sessão seria de outro cliente — o favorito não é o CLIENTE DE TESTE (QA).");
      }
      await dialogo.getByRole("button", { name: /^marcar /i }).last().click();
      await pp.waitForTimeout(3_000);

      // 2) Admin acha a linha do cliente de teste com o atalho.
      await pa.goto("/admin/sessoes");
      const linha = pa
        .locator("li, article, div")
        .filter({ hasText: CLIENTE_DE_TESTE })
        .filter({ has: pa.getByRole("link", { name: /^abrir entrevista$/i }) })
        .last();
      await expect(linha, "A sessão de EP marcada não oferece 'Abrir entrevista'.").toBeVisible({
        timeout: 15_000,
      });
      const link = linha.getByRole("link", { name: /^abrir entrevista$/i }).first();
      expect(await link.getAttribute("href")).toMatch(URL_ENTREVISTA_ADMIN);
      // O diálogo de remarcar continua ali, ao lado do atalho.
      await expect(linha.getByRole("button", { name: /^remarcar$/i }).first()).toBeVisible();

      // 3) Abre: rota do admin, questionário do cliente certo.
      await link.click();
      await pa.waitForURL(URL_ENTREVISTA_ADMIN, { timeout: 15_000 });
      await expect(pa.getByRole("heading", { name: /entrevista prévia/i })).toBeVisible();
      await expect(pa.getByText(/conversa com cliente de teste \(qa\)/i)).toBeVisible();
      await registrarTela(pa, info, "ep-marco-admin-questionario.png");

      // 4) Abrir 2× não cria linha. 🔑 A prova só é forte quando a 1ª
      // abertura mostra o RESUMO (última concluída, nenhuma em aberto): se o
      // GET criasse linha, a 2ª abertura cairia no formulário. Nos outros
      // estados, a tela tem de ser a mesma nas duas aberturas.
      const resumo = pa.getByRole("link", { name: /^nova entrevista$/i });
      const viaResumo = await resumo.isVisible().catch(() => false);
      const url = pa.url();
      await pa.goto(url);
      await pa.goto(url);
      if (viaResumo) {
        await expect(
          resumo,
          "Depois de 2 aberturas a página não mostra mais o resumo: o GET criou uma entrevista.",
        ).toBeVisible({ timeout: 12_000 });
      } else {
        info.annotations.push({
          type: "aviso",
          description: "Havia entrevista em aberto (ou nenhuma): a prova de 'sem linha nova' é só de tela igual.",
        });
        await expect(
          pa.getByRole("button", { name: /^começar$/i }).or(pa.getByRole("progressbar")),
        ).toBeVisible({ timeout: 12_000 });
      }
    } finally {
      await cancelarPelaEquipe(pa, "Teste automático da suíte E2E de QA (EP com o Marco) — desconsidere.");
      await ctxParceiro.close();
      await ctxAdmin.close();
    }
  });
});
