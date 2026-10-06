import { test, expect, type Page } from "@playwright/test";
import { entrar, exigeLogin } from "./apoio";

/**
 * Trajetória do cliente, funil de origem, aviso de revisão e as 4 seções de
 * `/sessoes` — tela → action → RPC → tela (migrações …345 e …346).
 *
 * 🔴 Roda contra PRODUÇÃO. Âncora no "CLIENTE DE TESTE (QA)", conferido na
 * lista e no campo "Nome" da ficha antes de qualquer escrita (nunca "o
 * primeiro da lista"). Mesmo molde de `links-drive.spec.ts`.
 *
 * O que este arquivo ESCREVE, e como volta ao que era:
 *   · trajetória: marca/desmarca caixas na hora (`marcarEtapaCliente` /
 *     `desmarcarEtapaCliente`). Lê o estado das 11 caixas ANTES, zera, e
 *     devolve cada uma ao estado original no `afterEach` — uma por vez.
 *   · funil de origem: grava "Sessão de Viabilidade" pelo "Salvar ficha" e
 *     devolve ao valor que tinha (normalmente "Não informado" = null).
 *
 * 🔑 Efeito EXTERNO conferido lendo as actions (`trajetoria-actions.ts`,
 * `atualizarCliente` em `clientes/actions.ts`): só RPC/UPDATE no banco. Nenhum
 * e-mail, webhook ou `net.http_post`; o e-mail do projeto sai do cron de
 * SESSÃO (`sessao-emails`), e nada aqui toca `gps.sessao_agendamentos`.
 * Nenhum upload.
 *
 * ⚠️ Se um teste morrer no meio, o `afterEach` ainda tenta restaurar. Se nem
 * ele rodar, sobra marcação na ficha do cliente de teste (inofensiva, só QA) —
 * o início de cada rodada lê o estado de partida e o restaura no fim.
 */

const cred = exigeLogin();

const CLIENTE_DE_TESTE = /CLIENTE DE TESTE \(QA\)/i;
const BUSCA = "CLIENTE DE TESTE";

/** As 11 etapas do catálogo (…345), pelo nome mostrado na caixa. */
const ETAPAS = [
  "Prospecção",
  "Reunião Preliminar",
  "Sessão de Viabilidade",
  "Croqui Estrutural",
  "Execução",
  "Reunião Inicial de Execução",
  "Elaboração das Minutas",
  "Junta Comercial",
  "Entrega da pasta",
  "Processamento do ITCMD",
  "Processamento do ITBI",
] as const;
type NomeEtapa = (typeof ETAPAS)[number];

/** Desfaz o que o teste em curso mexeu. Preenchido por cada teste que escreve. */
let restaurar: (() => Promise<void>) | null = null;

test.describe("Ficha: trajetória, funil e aviso · /sessoes com 4 tipos", () => {
  test.skip(!cred, "Sem credencial de parceiro de QA no .env.qa.");

  test.afterEach(async () => {
    const fn = restaurar;
    restaurar = null;
    if (fn) await fn();
  });

  /** Abre a ficha do cliente de teste conferindo o nome DUAS vezes. */
  async function abrirFichaDeTeste(page: Page): Promise<string | null> {
    await entrar(page, cred!, "/clientes");
    await page.goto("/clientes");
    await page.getByPlaceholder(/buscar por nome/i).fill(BUSCA);
    const link = page.getByRole("link", { name: CLIENTE_DE_TESTE }).first();
    const existe = await link
      .waitFor({ state: "visible", timeout: 12_000 })
      .then(() => true)
      .catch(() => false);
    if (!existe) return null;

    await link.click();
    await page.waitForURL(/\/clientes\/[0-9a-f-]{36}/i, { timeout: 15_000 });
    const base = page.url().split("?")[0];

    await page.goto(`${base}?aba=dados`);
    await expect(
      page.getByLabel(/^Nome\s*\(obrigatório\)$/),
      "A ficha aberta não é a do cliente de teste — abortando antes de escrever.",
    ).toHaveValue(CLIENTE_DE_TESTE);
    return base;
  }

  const regiao = (page: Page) =>
    page.getByRole("region", { name: "Por onde o cliente passou" });

  /** A linha (label) de uma etapa. Não depende do nome acessível da caixa. */
  const linha = (page: Page, nome: NomeEtapa) =>
    regiao(page)
      .locator("label")
      .filter({ hasText: new RegExp(`^${nome}`) });

  const caixa = (page: Page, nome: NomeEtapa) =>
    linha(page, nome).locator('[role="checkbox"]');

  async function marcada(page: Page, nome: NomeEtapa): Promise<boolean> {
    return (await caixa(page, nome).getAttribute("aria-checked")) === "true";
  }

  /**
   * Leva a caixa ao estado pedido e ESPERA a action responder (a caixa fica
   * desabilitada em voo — recarregar antes disso provaria nada). No erro, o
   * componente desfaz o ajuste e o `aria-checked` volta: a asserção reprova.
   */
  async function definir(page: Page, nome: NomeEtapa, alvo: boolean) {
    if ((await marcada(page, nome)) === alvo) return;
    await caixa(page, nome).click();
    await expect(
      caixa(page, nome),
      `"${nome}" não ficou ${alvo}`,
    ).toHaveAttribute("aria-checked", String(alvo));
    await expect(caixa(page, nome)).toBeEnabled({ timeout: 20_000 });
    await expect(
      regiao(page).getByRole("alert"),
      `A action recusou "${nome}".`,
    ).toHaveCount(0);
  }

  async function estadoDasCaixas(page: Page) {
    const estado = {} as Record<NomeEtapa, boolean>;
    for (const nome of ETAPAS) estado[nome] = await marcada(page, nome);
    return estado;
  }

  test("trajetória: filha não marca a mãe, pendente, desmarcar e reload", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "desktop", "Uma vez só basta.");
    test.setTimeout(240_000);

    const base = await abrirFichaDeTeste(page);
    test.skip(
      !base,
      'Não há "CLIENTE DE TESTE (QA)" alcançável pela conta de QA.',
    );

    await expect(regiao(page)).toBeVisible({ timeout: 15_000 });
    const inicial = await estadoDasCaixas(page);

    restaurar = async () => {
      await page.goto(`${base}?aba=dados`);
      await expect(regiao(page)).toBeVisible({ timeout: 15_000 });
      // Uma por vez; nada propaga. Primeiro as que voltam MARCADAS, depois as
      // que voltam desmarcadas: na ordem inversa a fase passaria por
      // Prospecção no meio do caminho e a trava do favorito recusaria.
      for (const nome of ETAPAS) if (inicial[nome]) await definir(page, nome, true);
      for (const nome of ETAPAS) if (!inicial[nome]) await definir(page, nome, false);
      await page.reload();
      await expect(regiao(page)).toBeVisible({ timeout: 15_000 });
      expect(
        await estadoDasCaixas(page),
        "Estado original não restaurado.",
      ).toEqual(inicial);
    };

    // Ponto de partida: só Prospecção + Reunião Preliminar (o fim devolve o
    // original). 🔴 Desde 05/10 (…353) a trajetória CALCULA a fase, e o
    // cliente de QA tem a estrela: zerar tudo levaria a fase a Prospecção e a
    // trava do favorito recusa (42501). Com a Preliminar sempre marcada a
    // fase nunca desce de Fechamento. As duas de base são marcadas ANTES de
    // desmarcar o resto, pela mesma razão.
    const BASE = new Set<NomeEtapa>(["Prospecção", "Reunião Preliminar"]);
    for (const nome of BASE) await definir(page, nome, true);
    for (const nome of ETAPAS) if (!BASE.has(nome)) await definir(page, nome, false);
    await expect(linha(page, "Sessão de Viabilidade")).not.toContainText(
      "pendente",
    );

    // 1. Filha marcada NÃO marca a mãe.
    await definir(page, "Processamento do ITCMD", true);
    await expect(caixa(page, "Elaboração das Minutas")).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await expect(caixa(page, "Execução")).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await page.reload();
    await expect(regiao(page)).toBeVisible({ timeout: 15_000 });
    await expect(caixa(page, "Processamento do ITCMD")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(caixa(page, "Elaboração das Minutas")).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await expect(caixa(page, "Execução")).toHaveAttribute(
      "aria-checked",
      "false",
    );

    // 2. Desmarcar volta (e persiste).
    await definir(page, "Processamento do ITCMD", false);
    await expect(linha(page, "Processamento do ITCMD")).not.toContainText(
      "marcada em",
    );
    await page.reload();
    await expect(regiao(page)).toBeVisible({ timeout: 15_000 });
    await expect(caixa(page, "Processamento do ITCMD")).toHaveAttribute(
      "aria-checked",
      "false",
    );

    // 3. Croqui sem a Viabilidade ⇒ "pendente" na Viabilidade.
    await definir(page, "Croqui Estrutural", true);
    await expect(linha(page, "Sessão de Viabilidade")).toContainText("pendente");
    await expect(linha(page, "Croqui Estrutural")).not.toContainText(
      "pendente",
    );
    await expect(caixa(page, "Sessão de Viabilidade")).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await page.reload();
    await expect(regiao(page)).toBeVisible({ timeout: 15_000 });
    await expect(caixa(page, "Croqui Estrutural")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(linha(page, "Sessão de Viabilidade")).toContainText("pendente");

    // 4. Desmarcar o Croqui apaga o pendente.
    await definir(page, "Croqui Estrutural", false);
    await expect(linha(page, "Sessão de Viabilidade")).not.toContainText(
      "pendente",
    );
  });

  test("funil de origem: salva, relê após reload e volta a Não informado", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "desktop", "Uma vez só basta.");
    test.setTimeout(180_000);

    const base = await abrirFichaDeTeste(page);
    test.skip(
      !base,
      'Não há "CLIENTE DE TESTE (QA)" alcançável pela conta de QA.',
    );

    const gatilho = page.locator("#f-funil");
    await expect(gatilho).toBeVisible({ timeout: 15_000 });
    const rotuloInicial = (
      (await gatilho.innerText()) || "Não informado"
    ).trim();

    async function gravar(rotulo: string) {
      await page.locator("#f-funil").click();
      await page.getByRole("option", { name: rotulo, exact: true }).click();
      await expect(page.locator("#f-funil")).toContainText(rotulo);
      await page.getByRole("button", { name: "Salvar ficha" }).click();
      await expect(
        page.getByText(/Ficha salva/),
        "O salvar não confirmou — a ficha pode ter recusado (ver alerta da barra).",
      ).toBeVisible({ timeout: 20_000 });
      await expect(
        page.getByRole("button", { name: "Salvar ficha" }),
      ).not.toHaveAttribute("aria-busy", "true");
    }

    restaurar = async () => {
      await page.goto(`${base}?aba=dados`);
      await expect(page.locator("#f-funil")).toBeVisible({ timeout: 15_000 });
      const atual = ((await page.locator("#f-funil").innerText()) || "").trim();
      if (atual !== rotuloInicial) await gravar(rotuloInicial);
    };

    await gravar("Sessão de Viabilidade");
    await page.reload();
    await expect(page.locator("#f-funil")).toContainText(
      "Sessão de Viabilidade",
      {
        timeout: 15_000,
      },
    );

    await gravar("Não informado");
    await page.reload();
    await expect(page.locator("#f-funil")).toContainText("Não informado", {
      timeout: 15_000,
    });
  });

  test("aviso de revisão nos anexos de croqui e minuta", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "desktop", "Uma vez só basta.");
    test.setTimeout(120_000);

    const base = await abrirFichaDeTeste(page);
    test.skip(
      !base,
      'Não há "CLIENTE DE TESTE (QA)" alcançável pela conta de QA.',
    );

    for (const aba of ["croqui", "fechamento"]) {
      await page.goto(`${base}?aba=${aba}`);
      // `getByRole("tabpanel")` só enxerga painel visível; o `offsetParent`
      // abaixo é a prova de que o texto não está dentro de pai oculto.
      const aviso = page
        .getByRole("tabpanel")
        .getByText(/Este anexo é só para a equipe revisar/);
      await expect(aviso, `Aviso ausente na aba ${aba}.`).toBeVisible({
        timeout: 15_000,
      });
      expect(
        await aviso.evaluate((el) => (el as HTMLElement).offsetParent !== null),
        `Aviso da aba ${aba} está dentro de pai oculto.`,
      ).toBe(true);

      const pasta = page
        .getByRole("tabpanel")
        .getByRole("link", { name: /Abrir pasta do cliente/ });
      if (await pasta.count()) {
        await expect(pasta).toHaveAttribute(
          "href",
          /^https:\/\/(drive|docs)\.google\.com\//,
        );
      } else {
        info.annotations.push({
          type: "aviso",
          description: `Cliente de QA sem link de Drive: botão "Abrir pasta do cliente" não conferido na aba ${aba}.`,
        });
      }
    }
  });

  test("/sessoes: 4 seções em ordem; Viabilidade e Croqui sem horário e sem botão", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "desktop", "Uma vez só basta.");

    await entrar(page, cred!, "/sessoes");
    await page.goto("/sessoes");
    const secao = page.locator('section[aria-labelledby="zona-reuniao"]');
    await expect(secao).toBeVisible({ timeout: 15_000 });

    const titulos = (await secao.locator("h3").allInnerTexts()).map((t) =>
      t.replace(/^Marque sua /, "").trim(),
    );
    const ordem = [
      "Entrevista Prévia",
      "Reunião Preliminar",
      "Sessão de Viabilidade",
      "Croqui Estrutural",
    ];
    // Tipo com sessão já marcada vira card sem <h3>; os dois primeiros podem
    // faltar por isso. Os dois últimos são o que este teste afirma.
    const presentes = ordem.filter((n) => titulos.includes(n));
    expect(titulos.filter((t) => ordem.includes(t))).toEqual(presentes);
    expect(presentes).toContain("Sessão de Viabilidade");
    expect(presentes).toContain("Croqui Estrutural");
    expect(presentes.slice(-2)).toEqual([
      "Sessão de Viabilidade",
      "Croqui Estrutural",
    ]);
    if (presentes.length < 4) {
      info.annotations.push({
        type: "aviso",
        description:
          "Entrevista/Preliminar sem <h3> (sessão já marcada na conta de QA): ordem completa não conferida.",
      });
    }

    for (const nome of ["Sessão de Viabilidade", "Croqui Estrutural"]) {
      const bloco = secao
        .locator("h3", { hasText: new RegExp(`^${nome}$`) })
        .locator("xpath=..");
      await expect(bloco).toContainText("Sem horários disponíveis no momento");
      await expect(
        bloco.getByRole("button"),
        `Botão em "${nome}".`,
      ).toHaveCount(0);
      await expect(
        bloco.getByRole("link", { name: /agendar|marcar/i }),
        `Link de agendar em "${nome}".`,
      ).toHaveCount(0);
    }
  });
});
