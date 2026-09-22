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
 * `/sessoes` — a tela do PARCEIRO.
 *
 * O que esta suíte cobra, e por quê:
 *   • a porta de entrada existe (a aba no header) — esta casa já teve 3 casos
 *     de "a feature existe e ninguém acha", inclusive uma aba que só aparecia
 *     quando já havia conteúdo;
 *   • o ESTADO VAZIO é o caso comum aqui (34 elegíveis para 4 blocos por
 *     semana), então ele precisa ser tão testado quanto o caso feliz;
 *   • nenhum date-picker: a decisão do Marcio foi mostrar HORÁRIOS, não uma
 *     data para escolher;
 *   • geometria e contraste no Chromium que PINTA.
 */

const cred = exigeLogin();

test.describe("Parceiro · /sessoes", () => {
  test.skip(
    !cred,
    "Sem QA_PARCEIRO_EMAIL/SENHA — defina-os em .env.qa (aponte QA_ENV_FILE).",
  );

  test.beforeEach(async ({ page }) => {
    await entrar(page, cred!, "/sessoes");
  });

  test("a aba Sessões existe no header e leva à tela", async ({ page }) => {
    await page.goto("/");
    const aba = page.getByRole("link", { name: /sess(õ|o)es/i }).first();
    await expect(
      aba,
      "A aba 'Sessões' precisa existir no header do parceiro. Sem porta de " +
        "entrada, a feature não existe para quem usa — já aconteceu 3× neste portal.",
    ).toBeVisible();

    // Visível de verdade: dentro do scroller horizontal do header, um item
    // pode existir no DOM e estar fora do alcance sem ninguém notar.
    const alcancavel = await aba.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    expect(alcancavel, "A aba existe no DOM mas não tem área clicável.").toBe(true);

    await aba.click();
    await page.waitForURL(/\/sessoes/);
  });

  test("a tela carrega com título, sem erro de console e sem rolagem lateral", async ({
    page,
  }, info) => {
    const console_ = vigiarConsole(page);
    await page.goto("/sessoes");

    await expect(page.getByRole("heading", { name: /sess(õ|o)es com a equipe/i }))
      .toBeVisible();

    await semRolagemHorizontal(page);
    await registrarTela(page, info, `sessoes-${test.info().project.name}.png`);
    console_.semErros();
  });

  test("🔴 não existe date-picker: a tela oferece HORÁRIOS, não uma data para escolher", async ({
    page,
  }) => {
    await page.goto("/sessoes");

    // A decisão é literal (PRD §7.1): "não tem que exibir uma data para ele
    // escolher, tem que exibir as opções de horário".
    const camposDeData = page.locator('input[type="date"], input[type="datetime-local"]');
    await expect(
      camposDeData,
      "Apareceu um seletor de data. A grade tem de oferecer blocos de horário " +
        "que a equipe publicou — pedir uma data faz o sistema prometer o que ninguém assumiu.",
    ).toHaveCount(0);
  });

  test("a tela diz o que está acontecendo: ou há horários, ou explica a ausência", async ({
    page,
  }, info) => {
    await page.goto("/sessoes");
    // `#conteudo` (o alvo do skip link) e não `main`: o portal do onboarding
    // também monta um <main>. E `.last()` porque durante a transição de rota
    // o `loading.tsx` e o `page.tsx` coexistem no DOM, cada um com o seu
    // `id="conteudo"` — o último é o da página já montada. Não é id duplicado
    // no produto: o padrão do repo é um por página, e foi conferido.
    const corpo = (await page.locator("#conteudo").last().innerText()).toLowerCase();

    // Um dos dois tem de ser verdade. O que NÃO pode é a tela ficar muda —
    // o estado vazio é o caso comum e precisa dizer o porquê, não sumir.
    const temHorario = /\d{1,2}:\d{2}/.test(corpo);
    const explicaAusencia =
      /não tem|nenhum hor|sem hor|nada dispon|próximas \d+ semanas|avisaremos|fale com/.test(corpo);

    expect(
      temHorario || explicaAusencia,
      `A tela não mostra horário nem explica a ausência. Estado vazio mudo faz ` +
        `o parceiro concluir que a feature está quebrada.\n\nTexto lido:\n${corpo.slice(0, 700)}`,
    ).toBe(true);

    await registrarTela(page, info, `sessoes-estado-${test.info().project.name}.png`);
  });

  test("contraste WCAG AA medido no DOM pintado", async ({ page }) => {
    await page.goto("/sessoes");
    await contrasteAprovado(page, "/sessoes");
  });

  test("todo alvo de clique tem tamanho tocável", async ({ page }) => {
    await page.goto("/sessoes");
    await alvosDeClique(page);
  });

  test("o link da sala: o campo existe e recusa endereço que não é URL", async ({
    page,
  }) => {
    await page.goto("/sessoes");

    const botaoLink = page.getByRole("button", { name: /colar (o )?link/i }).first();
    const temSessao = await botaoLink.isVisible().catch(() => false);
    test.skip(
      !temSessao,
      "A conta de QA não tem sessão marcada agora — nada a validar neste passo.",
    );

    await botaoLink.click();
    const campo = page.locator('input[type="url"], input[type="text"]').last();
    await campo.fill("isto-nao-e-um-link");
    await page.getByRole("button", { name: /salvar link/i }).click();

    // Ou o navegador barra (type=url), ou o servidor devolve frase em
    // português. O que não pode é aceitar lixo em silêncio.
    const barrou = await page.evaluate(() => {
      const el = document.querySelector<HTMLInputElement>('input[type="url"]');
      return el ? !el.checkValidity() : false;
    });
    const avisoNaTela = await page
      .getByRole("alert")
      .first()
      .isVisible()
      .catch(() => false);

    expect(
      barrou || avisoNaTela,
      "O campo aceitou um texto que não é link, sem barrar e sem avisar. " +
        "O link vai para a doutora e para o e-mail do parceiro.",
    ).toBe(true);
  });
});
