import { test, expect } from "@playwright/test";
import {
  exigeAdmin,
  entrar,
  semRolagemHorizontal,
  contrasteAprovado,
  alvosDeClique,
  vigiarConsole,
  registrarTela,
} from "./apoio";

/**
 * `/admin/sessoes` — a tela da EQUIPE (doutoras e admins).
 *
 * 🔴 O teste mais importante deste arquivo é o do RESUMO. O pentest de 22/09
 * achou que "Registrar/editar resumo" abria o formulário VAZIO mesmo quando a
 * sessão já tinha resumo — e `sessao_resumo_editar` SOBRESCREVE. Quem clicasse
 * numa sessão já resumida apagava o texto anterior sem nunca tê-lo visto, e o
 * texto é IRRECUPERÁVEL: a trilha guarda o tamanho, nunca o conteúdo (LGPD).
 *
 * Um teste de unidade não pegaria isso: a RPC de leitura existia e passava
 * 3/3 no banco. O defeito era ela NÃO SER CHAMADA pela tela. Só abrir o
 * formulário no navegador revela.
 */

const cred = exigeAdmin();

test.describe("Equipe · /admin/sessoes", () => {
  test.skip(
    !cred,
    "Sem QA_ADMIN_EMAIL/SENHA — defina-os em .env.qa (aponte QA_ENV_FILE).",
  );

  test.beforeEach(async ({ page }) => {
    await entrar(page, cred!, "/admin/sessoes");
  });

  test("a tela carrega com as duas seções, sem erro de console", async ({ page }, info) => {
    const console_ = vigiarConsole(page);
    await page.goto("/admin/sessoes");

    await expect(
      page.getByRole("heading", { name: /sess(õ|o)es com a equipe/i }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: /próximas sess(õ|o)es/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /histórico/i })).toBeVisible();

    await semRolagemHorizontal(page);
    await registrarTela(page, info, `admin-sessoes-${test.info().project.name}.png`);
    console_.semErros();
  });

  test("🔴 ACHADO ALTO: 'Registrar/editar resumo' abre COM o texto já gravado", async ({
    page,
  }, info) => {
    await page.goto("/admin/sessoes");

    const botao = page.getByRole("button", { name: /registrar\/editar resumo/i }).first();
    const existe = await botao
      .waitFor({ state: "visible", timeout: 8_000 })
      .then(() => true)
      .catch(() => false);

    // 🔑 Este teste NÃO se pula em silêncio.
    //
    // É o que guarda o achado ALTO de 22/09, e um teste pulado não guarda
    // nada — fica verde para sempre enquanto a regressão volta. Se não há
    // sessão concluída, o teste DIZ o que fazer, em vez de sumir do relatório.
    //
    // Como produzir o alvo: `sessoes-fluxo.spec.ts` marca uma sessão, e
    // "Concluir sessão" aparece quando o horário já começou. A suíte não
    // adianta o relógio do servidor (não deve), então rode este arquivo
    // depois que houver ao menos uma sessão concluída na conta de QA.
    expect(
      existe,
      "Nenhuma sessão concluída na conta de QA, então o teste que protege o " +
        "achado ALTO (o resumo abrindo VAZIO e sobrescrevendo texto que " +
        "ninguém leu) NÃO foi exercitado.\n\n" +
        "Para destravar: conclua uma sessão de teste em /admin/sessoes " +
        "(o botão 'Concluir sessão' aparece a partir do horário de início) e " +
        "rode de novo. Deixar este teste pulado devolve a feature ao estado " +
        "em que o defeito passou despercebido.",
    ).toBe(true);

    await botao.click();

    const caixa = page.locator("textarea").first();
    await expect(caixa).toBeVisible();
    const textoAoAbrir = await caixa.inputValue();

    await registrarTela(page, info, "resumo-ao-abrir.png");

    // 🔑 A PROVA é o CICLO, não o estado inicial.
    //
    // Abrir e encontrar a caixa vazia não prova defeito: a sessão pode nunca
    // ter tido resumo. E abrir com texto não prova que está correto. O que
    // distingue os dois mundos é escrever → salvar → REABRIR: se a tela
    // busca o texto gravado, ele volta; se não busca, volta vazio e o próximo
    // "Salvar" apaga o que estava lá. Por isso o teste exercita o ciclo
    // inteiro em vez de afirmar algo sobre o primeiro `inputValue()`.
    const marca = `QA ${Date.now()} — resumo de teste da suíte E2E, texto suficientemente longo.`;
    await caixa.fill(marca);
    await page.getByRole("button", { name: /salvar resumo/i }).click();

    await expect(page.getByRole("button", { name: /registrar\/editar resumo/i }).first())
      .toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /registrar\/editar resumo/i }).first().click();

    const caixaDeNovo = page.locator("textarea").first();
    await expect(caixaDeNovo).toBeVisible();
    await expect(
      caixaDeNovo,
      "Reabrir o formulário NÃO trouxe o texto recém-salvo. É exatamente o " +
        "achado ALTO de 22/09: o próximo clique em 'Salvar' apagaria um resumo " +
        "que ninguém leu, e o texto antigo é irrecuperável (a trilha guarda só o tamanho).",
    ).toHaveValue(marca);

    // Não deixa lixo: devolve o texto que estava antes.
    await caixaDeNovo.fill(textoAoAbrir || marca);
    if (textoAoAbrir) {
      await page.getByRole("button", { name: /salvar resumo/i }).click();
    } else {
      await page.getByRole("button", { name: /voltar/i }).click();
    }
  });

  test("o resumo recusa texto curto demais, com frase em português", async ({ page }) => {
    await page.goto("/admin/sessoes");

    const botao = page.getByRole("button", { name: /registrar\/editar resumo/i }).first();
    test.skip(
      !(await botao.isVisible().catch(() => false)),
      "Nenhuma sessão concluída na conta de QA.",
    );

    await botao.click();
    const caixa = page.locator("textarea").first();
    await caixa.fill("curto");
    await page.getByRole("button", { name: /salvar resumo/i }).click();

    const aviso = page.getByRole("alert").first();
    await expect(aviso).toBeVisible();
    await expect(
      aviso,
      "O aviso de texto curto tem de estar em português e dizer o mínimo — " +
        "código de banco cru na tela não diz nada a quem usa.",
    ).toContainText(/caracteres/i);

    await page.getByRole("button", { name: /voltar/i }).click();
  });

  test("o briefing abre sob demanda e traz o DISC do cliente", async ({ page }, info) => {
    await page.goto("/admin/sessoes");

    const abrir = page.getByRole("button", { name: /briefing/i }).first();
    test.skip(
      !(await abrir.isVisible().catch(() => false)),
      "Nenhuma sessão com briefing na conta de QA.",
    );

    await abrir.click();
    const painel = page.locator("#conteudo").last();
    await expect(painel).toContainText(/perfil disc/i);

    // O DISC é lido AO VIVO, não do snapshot congelado: se estiver em branco,
    // a tela tem de dizer que não foi informado — nunca mostrar nada.
    const texto = await painel.innerText();
    const dizAlgoSobreDisc =
      /perfil disc/i.test(texto) &&
      (/ainda não informado/i.test(texto) || /consciência|gatilho|relacionamento/i.test(texto));
    expect(
      dizAlgoSobreDisc,
      "O bloco do DISC apareceu sem conteúdo e sem dizer que não foi preenchido.",
    ).toBe(true);

    await registrarTela(page, info, "briefing.png");
  });

  test("contraste WCAG AA medido no DOM pintado", async ({ page }) => {
    await page.goto("/admin/sessoes");
    await contrasteAprovado(page, "/admin/sessoes");
  });

  test("todo alvo de clique tem tamanho tocável", async ({ page }) => {
    await page.goto("/admin/sessoes");
    await alvosDeClique(page);
  });
});
