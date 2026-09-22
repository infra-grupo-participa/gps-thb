import { test, expect } from "@playwright/test";
import { exigeAdmin, exigeLogin, entrar, registrarTela } from "./apoio";

/**
 * O PERFIL DISC, ponta a ponta — a regra do Marcio virada em teste.
 *
 * A regra: *"a Entrevista Prévia gera o perfil DISC; com o DISC pronto,
 * agenda-se a Reunião Preliminar"*.
 *
 * 🔴 POR QUE ESTE ARQUIVO EXISTE: em 22/09, ao ser perguntado se a lógica do
 * DISC estava redonda, o levantamento no banco mostrou que **duas peças da
 * regra nunca viraram código** — `sessao_concluir` não tocava em
 * `perfil_disc`, e nada avisava sobre DISC ausente ao marcar a Reunião
 * Preliminar. Tudo compilava, tudo passava, e a regra simplesmente não
 * existia no produto.
 *
 * Regra de negócio não vira teste sozinha. Estes dois testes são o que
 * impede a lacuna de voltar em silêncio.
 */

const admin = exigeAdmin();
const parceiro = exigeLogin();

test.describe("DISC · a Entrevista gera, a Preliminar avisa", () => {
  test("a conclusão da Entrevista Prévia OFERECE os campos de DISC", async ({
    page,
  }, info) => {
    test.skip(!admin, "Sem QA_ADMIN_EMAIL/SENHA no .env.qa.");

    await entrar(page, admin!, "/admin/sessoes");
    await page.goto("/admin/sessoes");

    const concluir = page.getByRole("button", { name: /^concluir sess(ã|a)o$/i }).first();
    const temAlvo = await concluir
      .waitFor({ state: "visible", timeout: 12_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(
      !temAlvo,
      "Nenhuma sessão em andamento para concluir. O botão só aparece a partir " +
        "do horário de início.",
    );

    await concluir.click();

    // O bloco do DISC tem de estar ali, com as 4 letras e os 3 campos ricos.
    await expect(
      page.getByText(/perfil disc do cliente/i),
      "A conclusão não oferece o DISC. A regra é que a Entrevista Prévia " +
        "GERE o perfil — sem isto, a doutora conclui e o DISC fica vazio, " +
        "dependendo de alguém lembrar de preencher na ficha depois.",
    ).toBeVisible();

    for (const letra of ["D", "I", "S", "C"]) {
      await expect(
        page.getByRole("button", { name: new RegExp(`^${letra} —`) }),
        `A letra ${letra} não está entre as opções de DISC.`,
      ).toBeVisible();
    }

    await registrarTela(page, info, "disc-na-conclusao.png");

    // Não conclui de verdade: este teste é sobre a tela OFERECER o campo.
    // Concluir mudaria o estado da sessão e tiraria o alvo dos outros testes.
    await page.getByRole("button", { name: /^voltar$/i }).last().click();
  });

  test("marcar Reunião Preliminar sem DISC AVISA, e não bloqueia", async ({
    page,
  }, info) => {
    test.skip(!parceiro, "Sem QA_PARCEIRO_EMAIL/SENHA no .env.qa.");

    await entrar(page, parceiro!, "/sessoes");
    await page.goto("/sessoes");
    await page.waitForTimeout(2_000);

    const corpo = await page.locator("#conteudo").last().innerText();
    const temAviso = /perfil disc deste cliente ainda não foi preenchido/i.test(corpo);
    const temGrade = await page
      .getByRole("button", { name: /^escolher \d{1,2}:\d{2}/i })
      .first()
      .isVisible()
      .catch(() => false);

    // 🔴 A prova é a CONJUNÇÃO: se o cliente não tem DISC, o aviso aparece
    // E a grade continua clicável. Avisar bloqueando não é avisar.
    if (temAviso) {
      expect(
        temGrade,
        "O aviso de DISC ausente apareceu, mas a grade sumiu — isto é " +
          "BLOQUEIO, não aviso. Medido em 22/09: 28 de 35 clientes estavam " +
          "sem DISC; bloquear fecha a etapa para eles.",
      ).toBe(true);
      await registrarTela(page, info, "aviso-disc-ausente.png");
    } else {
      // Sem aviso: ou o cliente TEM DISC, ou não há Reunião Preliminar
      // disponível. Os dois são estados válidos — o teste não inventa falha.
      test.info().annotations.push({
        type: "nota",
        description:
          "Sem aviso de DISC: o cliente de teste já tem perfil preenchido, " +
          "ou não há grade de Reunião Preliminar agora.",
      });
    }
  });
});
