import { test, expect, type Page } from "@playwright/test";
import { exigeLogin, entrar, contrasteAprovado, vigiarConsole, registrarTela } from "./apoio";
import { BOTAO_ESCOLHER_OS_5 } from "../src/lib/clientes-textos";

/**
 * O PRÉ-REQUISITO DA ESTRELA — a prova em navegador que PINTA.
 *
 * 🔴 O DEFEITO QUE ISTO GUARDA (medido em 23/09/2026): "Marcar como cliente da
 * equipe" falhava para **48 de 86 parceiros (57%)** com a frase genérica
 * *"Algum campo está fora do formato aceito"*, sem haver campo errado nenhum.
 * Quem recusava era o CHECK `chk_etapa1_clientes_favorito_e_selecionado`:
 * `(NOT acompanhado_equipe) OR selecionado_entrevista`.
 *
 * A regra FICA (decisão do Marcio). A tela é que passou a dizer o que falta,
 * com nome, e a oferecer o caminho.
 *
 * 🔴 POR QUE E2E, e não teste de unidade: `disabled` em jsdom é atributo; aqui
 * é comportamento pintado. E o que mais interessa — **o contraste do texto do
 * motivo no DOM COMPOSTO** e o `aria-describedby` RESOLVENDO para um nó que
 * existe e é visível — jsdom não consegue afirmar: ele mocka
 * `getBoundingClientRect` e não calcula cor herdada. Esta casa já teve 1.790
 * testes verdes com a tela quebrada por exatamente isso.
 *
 * 🔴 RODA CONTRA PRODUÇÃO (não há ambiente de teste). Por isso:
 *  • âncora no **CLIENTE DE TESTE (QA)**, nunca "o primeiro da lista" — do
 *    outro lado há fichas de parceiros reais, e a ordenação é acaso;
 *  • **NADA é clicado que escreva**: o teste confere `disabled`, lê texto e
 *    recarrega. Nenhum "Salvar ficha", nenhum clique na estrela, nenhuma
 *    marcação — logo nenhuma escrita no banco e nenhum e-mail disparado;
 *  • sem `QA_ENV_FILE` o arquivo inteiro se pula com aviso.
 */

const CLIENTE_DE_TESTE = /CLIENTE DE TESTE \(QA\)/i;
const ROTULO_MARCAR = /Marcar como cliente da equipe/i;
const ROTULO_ACOMPANHADO = /Cliente acompanhado pela equipe/i;

const parceiro = exigeLogin();

/**
 * Abre a ficha de um cliente pelo NOME, conferindo duas vezes.
 *
 * 🔴 A 2ª conferência é dentro da ficha, no campo "Nome" — é o valor que a
 * ficha enviaria se alguém salvasse, ou seja, exatamente a ficha em que
 * estamos. Em produção, agir na ficha errada é estrago real.
 */
async function abrirFicha(page: Page, nome: RegExp, busca: string) {
  await page.goto("/clientes");
  await page.getByPlaceholder(/buscar por nome/i).fill(busca);
  const link = page.getByRole("link", { name: nome }).first();

  const existe = await link
    .waitFor({ state: "visible", timeout: 12_000 })
    .then(() => true)
    .catch(() => false);
  if (!existe) return false;

  await link.click();
  await page.waitForURL(/\/clientes\/[0-9a-f-]{36}/i, { timeout: 15_000 });
  await expect(
    page.getByLabel(/^Nome$/),
    "A ficha aberta não é a que o teste pediu — abortando antes de agir.",
  ).toHaveValue(nome);
  return true;
}

test.describe("Ficha do cliente · pré-requisito da estrela", () => {
  test.skip(!parceiro, "Sem QA_PARCEIRO_EMAIL/SENHA no .env.qa.");

  test.beforeEach(async ({ page }) => {
    await entrar(page, parceiro!, "/clientes");
  });

  test("cliente NÃO selecionado: botão desabilitado + motivo nomeado e acessível", async ({
    page,
  }, info) => {
    const console = vigiarConsole(page);
    const achou = await abrirFicha(page, CLIENTE_DE_TESTE, "CLIENTE DE TESTE");
    test.skip(
      !achou,
      'Não há "CLIENTE DE TESTE (QA)" na conta de QA. Crie um cliente com esse ' +
        "nome exato — esta suíte NUNCA usa cliente real, porque roda contra produção.",
    );

    const motivo = page.locator("#estrela-motivo-selecao");
    test.skip(
      !(await motivo.isVisible()),
      "O CLIENTE DE TESTE (QA) já está entre os 5 da entrevista — este caso " +
        "exige um que NÃO esteja. Tire-o da seleção para exercitar a trava.",
    );

    const botao = page.getByRole("button", { name: ROTULO_MARCAR });
    await expect(botao, "O botão da estrela deveria estar na tela.").toBeVisible();
    await expect(
      botao,
      "Botão HABILITADO para cliente fora dos 5 = o parceiro leva o erro " +
        'genérico "Algum campo está fora do formato aceito". É o defeito original.',
    ).toBeDisabled();

    // ── O motivo NOMEIA o cliente e o botão do caminho ──────────────────────
    const texto = (await motivo.textContent()) ?? "";
    expect(texto, "O motivo tem de citar a Entrevista Prévia.").toContain(
      "Entrevista Prévia",
    );
    expect(
      texto,
      "O motivo tem de nomear o botão que resolve, com o rótulo LITERAL da tela.",
    ).toContain(BOTAO_ESCOLHER_OS_5);
    expect(
      texto,
      "O motivo tem de citar o cliente pelo nome — frase sem nome não diz de quem se fala.",
    ).toMatch(CLIENTE_DE_TESTE);

    // 🔴 Nenhuma frase pode vazar nome de constraint, tabela ou coluna: quem
    // lê é o parceiro. Foi o que já aconteceu com o erro genérico do banco.
    for (const proibido of [
      "chk_",
      "constraint",
      "etapa1_clientes",
      "selecionado_entrevista",
      "acompanhado_equipe",
      "23514",
    ]) {
      expect(
        texto.toLowerCase(),
        `O motivo vazou jargão de banco ("${proibido}") para o parceiro.`,
      ).not.toContain(proibido.toLowerCase());
    }

    // ── `aria-describedby` RESOLVE para este parágrafo ──────────────────────
    const descrito = await botao.getAttribute("aria-describedby");
    expect(
      descrito,
      "Botão desabilitado sem `aria-describedby` é botão mudo para quem usa leitor de tela.",
    ).toBe("estrela-motivo-selecao");
    const alvo = page.locator(`#${descrito}`);
    await expect(alvo, "O `aria-describedby` aponta para um id que não existe.").toHaveCount(1);
    await expect(alvo, "O alvo do `aria-describedby` está invisível.").toBeVisible();

    // 🔴 NÃO é `role="alert"`: o pré-requisito é ESTADO, não erro. Com alert,
    // o leitor de tela anunciaria "alerta" na CARGA da página, toda vez.
    await expect(
      alvo,
      'O motivo virou `role="alert"` — isso faria o leitor anunciar "alerta" ' +
        "ao abrir a ficha, para uma condição que não é erro de ninguém.",
    ).not.toHaveAttribute("role", "alert");

    // O `role="alert"` do erro de SERVIDOR continua existindo e vazio.
    const alertas = page.locator('p[role="alert"]');
    for (let i = 0; i < (await alertas.count()); i++) {
      expect(
        await alertas.nth(i).getAttribute("id"),
        "O parágrafo do motivo não pode ser o mesmo nó do erro de servidor.",
      ).not.toBe("estrela-motivo-selecao");
    }

    // ── O caminho oferecido EXISTE ──────────────────────────────────────────
    const link = motivo.getByRole("link", { name: /Vá em Clientes/i });
    await expect(link, 'O link "Vá em Clientes" faltou no motivo.').toBeVisible();
    const href = await link.getAttribute("href");
    expect(href, "O link tem de levar à lista de clientes.").toMatch(/\/clientes$/);
    // Para o PARCEIRO o basePath é vazio: link absoluto. No Modo Assistência
    // ele tem de ser prefixado — coberto no teste do admin, abaixo.
    expect(href, "Para o parceiro o destino é a lista dele.").toBe("/clientes");

    // ── Geometria e cor, medidas no DOM pintado ─────────────────────────────
    await contrasteAprovado(page, "ficha com o motivo do pré-requisito");
    await registrarTela(page, info, "estrela-bloqueada");
    console.semErros();
  });

  test("o motivo NÃO aparece para quem está entre os 5 — e o botão funciona", async ({
    page,
  }) => {
    // 🔑 Este é o caso que prova que a trava não é um "desabilitado para
    // todos". Precisa de um cliente QA que ESTEJA entre os 5.
    const achou = await abrirFicha(page, /CLIENTE DOS 5 \(QA\)/i, "CLIENTE DOS 5");
    test.skip(
      !achou,
      'Não há "CLIENTE DOS 5 (QA)" na conta de QA. Crie um cliente com esse ' +
        'nome e inclua-o em "' +
        BOTAO_ESCOLHER_OS_5 +
        '" — sem ele não dá para provar que o botão HABILITA.',
    );

    await expect(
      page.locator("#estrela-motivo-selecao"),
      "Cliente entre os 5 não pode ver o motivo — a trava estaria ampla demais.",
    ).toHaveCount(0);

    const botao = page.getByRole("button", { name: ROTULO_MARCAR });
    await expect(botao).toBeVisible();
    await expect(
      botao,
      "Cliente entre os 5 tem de poder virar estrela: o CHECK aceita.",
    ).toBeEnabled();
    await expect(
      botao,
      "Sem motivo na tela, não há o que descrever.",
    ).not.toHaveAttribute("aria-describedby", /./);
    // ⚠️ NÃO clicamos: clicar marcaria a estrela em produção.
  });

  test("DESMARCAR nunca é travado — o caminho de volta não passa pelo CHECK", async ({
    page,
  }) => {
    /**
     * 🔴 O CASO DO `!acompanhado`. Se este cliente JÁ é a estrela, o botão
     * oferece DESMARCAR — e desmarcar zera `acompanhado_equipe`, satisfazendo
     * o primeiro ramo do CHECK sozinho. Travar aqui prenderia quem já é a
     * estrela, sem nenhum motivo de banco: seria trocar um erro por uma
     * prisão.
     */
    const achou = await abrirFicha(page, /CLIENTE ESTRELA \(QA\)/i, "CLIENTE ESTRELA");
    test.skip(
      !achou,
      'Não há "CLIENTE ESTRELA (QA)" na conta de QA — um cliente que JÁ seja a ' +
        "estrela (e não confirmado pela equipe). Sem ele o caso do `!acompanhado` " +
        "fica sem prova, e é justamente o que prenderia gente.",
    );

    const botao = page.getByRole("button", { name: ROTULO_ACOMPANHADO });
    await expect(
      botao,
      "O cliente da equipe tem de mostrar o botão de desmarcar (enquanto não confirmado).",
    ).toBeVisible();
    await expect(
      botao,
      "DESMARCAR travado = parceiro preso na própria escolha. O CHECK não recusa isso.",
    ).toBeEnabled();
    await expect(
      page.locator("#estrela-motivo-selecao"),
      "Quem já é a estrela não tem pré-requisito pendente a ler.",
    ).toHaveCount(0);
    // ⚠️ NÃO clicamos: desmarcar é escrita real e trancaria os passos 4–8.
  });
});

/**
 * O MODO ASSISTÊNCIA — o admin lê uma frase DIFERENTE, de propósito.
 *
 * Com a frase do parceiro, ele procuraria um botão de admin que não existe: a
 * seleção dos 5 é do parceiro. E o link tem de respeitar o `basePath`, senão
 * ejeta o admin do ambiente do aluno — defeito que já aconteceu neste arquivo
 * com "abra um chamado".
 */
test.describe("Modo Assistência · o admin sabe de quem é a escolha", () => {
  // Sem credencial de admin de QA este bloco se pula: o restante da suíte
  // continua valendo. Ver `exigeAdmin` em `apoio.ts`.
  test.skip(true, "Requer QA_ADMIN_EMAIL/SENHA e o id do ambiente de QA (QA_ALUNO_ID).");

  test("frase do admin, sem mandar clicar num botão que ele não tem", async ({ page }) => {
    const alunoId = process.env.QA_ALUNO_ID!;
    await page.goto(`/admin/aluno/${alunoId}/clientes`);
    await page.getByPlaceholder(/buscar por nome/i).fill("CLIENTE DE TESTE");
    await page.getByRole("link", { name: CLIENTE_DE_TESTE }).first().click();

    const motivo = page.locator("#estrela-motivo-selecao");
    await expect(motivo).toBeVisible();
    const texto = (await motivo.textContent()) ?? "";
    expect(texto, "O admin precisa ler que a seleção é do PARCEIRO.").toContain(
      "A seleção é do parceiro",
    );
    expect(texto).toContain(BOTAO_ESCOLHER_OS_5);
    // 🔴 A frase do admin não tem link: ele já está na aba Clientes do
    // ambiente. O que ele precisa é saber de quem é a ação.
    await expect(
      motivo.getByRole("link"),
      "A frase do admin não leva link — e não pode ejetá-lo do ambiente.",
    ).toHaveCount(0);
  });
});
