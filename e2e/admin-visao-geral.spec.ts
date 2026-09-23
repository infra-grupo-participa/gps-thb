import { expect, test } from "@playwright/test";
import {
  alvosDeClique,
  contrasteAprovado,
  entrar,
  exigeAdmin,
  registrarTela,
  semRolagemHorizontal,
  vigiarConsole,
} from "./apoio";

/**
 * Visão geral de `/admin` — as 3 sub-abas (23/09/2026).
 *
 * O que esta suíte protege, e que `tsc`/`build` não pegam:
 *
 * 1. 🔴 **A porta de entrada some sozinha.** Já aconteceu 3× nesta casa (aba
 *    Tutoriais, Inventário, onboarding): a feature existe, compila, e a
 *    entrada não aparece. Aqui são 3 sub-abas novas dentro de `visao`.
 *
 * 2. 🔴 **`/admin` sem parâmetro tem de abrir ONDE ABRIA.** `LINK_LISTA` e os
 *    ~15 hrefs do dashboard dependem de `aba=ativos` continuar no lugar. Um
 *    padrão trocado quebraria os links sem erro nenhum.
 *
 * 3. 🔴 **Nenhum dos blocos novos pode desenhar FUNIL onde não há sequência.**
 *    Os 4 passos do contato são marcações independentes
 *    (`cliente-ficha.tsx:186-188`, três `useState` sem `disabled` encadeado),
 *    e os marcos até a reunião são 4 contagens sobre tabelas distintas —
 *    medido com o dado real (37·1·52·22), o componente `Funil` anunciaria
 *    "5200% passam de entrevista para reunião". O teste cobra a AUSÊNCIA da
 *    taxa de passagem nesses dois cards.
 *
 * 4. 🔴 **Número que não clica não pode PARECER que clica.** `favorito_parado`
 *    (18) e `reuniao_sem_entrevista` (51) são sobre clientes, e a lista do
 *    painel é de parceiros — ficam sem link nesta entrega. Se ganharem
 *    aparência de link, a pessoa clica, nada acontece, e ela deixa de confiar
 *    nos links que FUNCIONAM.
 *
 * 5. **Denominador honesto.** 1.640 de 1.699 clientes não têm marcação
 *    nenhuma. Toda barra escreve "N de 1.699" — vazio é resultado, não erro.
 *
 * ⚠️ Roda contra PRODUÇÃO com a conta de QA. Esta suíte é SÓ LEITURA: não
 * clica em nada que escreva, não cancela, não dispara e-mail.
 */

const admin = exigeAdmin();

test.describe("Admin · Visão geral · as 3 sub-abas", () => {
  test.skip(
    !admin,
    "Sem QA_ADMIN_EMAIL/SENHA. Defina QA_ENV_FILE apontando para o .env.qa.",
  );

  test("/admin sem parâmetro abre a Visão geral, e ela é a sub-aba Programa", async ({
    page,
  }, info) => {
    const console = vigiarConsole(page);
    await entrar(page, admin!, "/admin");

    await expect(page).toHaveURL(/\/admin(\?|$)/);

    // A aba de cima continua sendo "Visão geral" (não mudou de lugar).
    const visaoGeral = page.getByRole("tab", { name: /vis(ã|a)o geral/i });
    await expect(visaoGeral).toBeVisible();
    await expect(visaoGeral).toHaveAttribute("aria-selected", "true");

    // 🔑 A sub-aba padrão é Programa — e chegou lá SEM `?vis=` na URL.
    const programa = page.getByRole("tab", { name: /^programa$/i });
    await expect(programa).toBeVisible();
    await expect(programa).toHaveAttribute("aria-selected", "true");
    expect(page.url()).not.toContain("vis=");

    await registrarTela(page, info, "admin-visao-programa");
    console.semErros();
  });

  test("as 3 sub-abas existem e cada uma troca o conteúdo", async ({ page }) => {
    await entrar(page, admin!, "/admin");

    for (const nome of [/^programa$/i, /^aten(ç|c)(ã|a)o$/i, /^parceiros$/i]) {
      await expect(page.getByRole("tab", { name: nome })).toBeVisible();
    }

    // Atenção: as réguas da fila da equipe.
    await page.getByRole("tab", { name: /^aten(ç|c)(ã|a)o$/i }).click();
    await expect(page).toHaveURL(/vis=atencao/);
    await expect(
      page.getByText(/reuni(ã|a)o marcada sem entrevista/i).first(),
    ).toBeVisible();

    // Parceiros: o ranking, com nome.
    await page.getByRole("tab", { name: /^parceiros$/i }).click();
    await expect(page).toHaveURL(/vis=parceiros/);
    await expect(page.getByRole("table")).toBeVisible();
  });

  test("valor inválido em ?vis= cai no padrão, sem quebrar", async ({ page }) => {
    await entrar(page, admin!, "/admin?vis=<script>alert(1)</script>");

    // Allowlist fechada: o que não é da lista vira `programa`.
    await expect(
      page.getByRole("tab", { name: /^programa$/i }),
    ).toHaveAttribute("aria-selected", "true");
    // E o valor cru nunca chega ao DOM como conteúdo.
    await expect(page.locator("body")).not.toContainText("alert(1)");
  });

  test("🔴 os 4 passos do contato NÃO desenham funil (não existe sequência)", async ({
    page,
  }) => {
    await entrar(page, admin!, "/admin");

    const card = page
      .locator("section, article, div")
      .filter({ hasText: /passos marcados|andamento do contato/i })
      .first();
    await expect(card).toBeVisible();

    // Taxa de passagem entre passos independentes seria mentira: os 18 do
    // estudo de caso NÃO são subconjunto dos 117 da mensagem.
    await expect(card).not.toContainText(/passam de/i);
    await expect(card).not.toContainText(/taxa de convers(ã|a)o/i);
  });

  test("🔴 os marcos até a reunião NÃO desenham funil", async ({ page }) => {
    await entrar(page, admin!, "/admin");

    const card = page
      .locator("section, article, div")
      .filter({ hasText: /marcos at(é|e) a reuni(ã|a)o/i })
      .first();
    await expect(card).toBeVisible();

    // Com o dado real (37 · 1 · 52 · 22) o Funil diria "5200% passam de
    // entrevista prévia para reunião marcada".
    await expect(card).not.toContainText(/passam de/i);
    await expect(card).not.toContainText(/5200|520%/);
  });

  test("toda barra escreve o denominador, nunca o número solto", async ({
    page,
  }) => {
    await entrar(page, admin!, "/admin");

    // 1.640 de 1.699 clientes não têm marcação — a tela diz "N de N".
    await expect(page.getByText(/\d[\d.]* de [\d.]+/).first()).toBeVisible();
  });

  test("🔴 número sem link não parece link", async ({ page }) => {
    await entrar(page, admin!, "/admin?vis=atencao");

    // Os dois números que ficaram sem destino nesta entrega.
    for (const rotulo of [
      /favorito.*sem reuni(ã|a)o|sem movimento h(á|a) 7/i,
      /reuni(ã|a)o marcada sem entrevista/i,
    ]) {
      const bloco = page
        .locator("section, article, div")
        .filter({ hasText: rotulo })
        .first();
      await expect(bloco).toBeVisible();

      // O NÚMERO não é âncora. (O bloco pode ter um link nomeado de
      // encaminhamento — "ver em Clientes" —, que é outra coisa: tem nome
      // próprio e diz para onde vai.)
      const numeroAncora = bloco.locator("a").filter({ hasText: /^\s*\d+\s*$/ });
      await expect(numeroAncora).toHaveCount(0);
    }
  });

  test("o ranking mostra nome e nunca escreve R$ 0,00 no lugar de vazio", async ({
    page,
  }) => {
    await entrar(page, admin!, "/admin?vis=parceiros");

    const tabela = page.getByRole("table");
    await expect(tabela).toBeVisible();

    // O cabeçalho carrega o prazo: "parado" nunca aparece sozinho.
    const cabecalho = tabela.locator("thead");
    await expect(cabecalho).toContainText(/14/);

    // Honorário ausente é travessão, não zero (regra B7-d da casa).
    await expect(tabela).not.toContainText("R$ 0,00");
  });

  test("contraste WCAG AA medido no DOM pintado, nas 3 sub-abas", async ({
    page,
  }) => {
    await entrar(page, admin!, "/admin");
    await contrasteAprovado(page, "Visão geral · Programa");

    await page.goto("/admin?vis=atencao");
    await contrasteAprovado(page, "Visão geral · Atenção");

    await page.goto("/admin?vis=parceiros");
    await contrasteAprovado(page, "Visão geral · Parceiros");
  });

  test("sem rolagem lateral e com alvos tocáveis nas 3 sub-abas", async ({
    page,
  }) => {
    for (const vis of ["programa", "atencao", "parceiros"]) {
      await entrar(page, admin!, `/admin?vis=${vis}`);
      // ⚠️ A tabela do ranking PODE passar da largura — ela vive num
      // contêiner com overflow-x próprio. O que não pode é o BODY rolar.
      await semRolagemHorizontal(page);
      await alvosDeClique(page);
    }
  });
});
