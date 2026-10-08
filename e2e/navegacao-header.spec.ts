import { test, expect } from "@playwright/test";
import {
  exigeLogin,
  exigeAdmin,
  entrar,
  semRolagemHorizontal,
  contrasteAprovado,
  alvosDeClique,
} from "./apoio";

/**
 * Navegação do header em 2 NÍVEIS (24/09/2026) — o mapa de dados vive em
 * `src/lib/nav.ts` (`alunoNavItems`/`navDoAluno`/`assistenciaNavItems`/
 * `adminNavItems`); o mecanismo (`nav-tabs.tsx`, `app-header.tsx`,
 * `abas-painel.tsx`) é de outra fatia, em paralelo.
 *
 * 🔑 Ancoragem: `NavTabLink` (`src/components/nav-tabs.tsx`) renderiza
 * `<Link>`/`<span>` com `aria-current="page"` quando ativo — não `role="tab"`
 * nem `aria-selected` (esse é o contrato da `TabsList` interna de
 * `AbasPainel`, para o `?vis=`/`?aba=` do painel, que este arquivo não toca).
 * Os testes daqui usam `getByRole("link", …)` para o clicável e
 * `[aria-current="page"]` para "está ativo", nunca `role="tab"` para o
 * trilho do header.
 *
 * ⚠️ Roda contra PRODUÇÃO (ver `e2e/LEIA-ME.md`). Suíte SÓ LEITURA: nenhum
 * teste aqui escreve, cancela ou dispara e-mail — troca de aba é navegação ou
 * `history.replaceState`, nunca RPC de escrita.
 */

const parceiro = exigeLogin();
const admin = exigeAdmin();

test.describe("Header · parceiro · trilho de 1º nível + fixa + em breve", () => {
  test.skip(
    !parceiro,
    "Sem QA_PARCEIRO_EMAIL/SENHA — defina-os em .env.qa (aponte QA_ENV_FILE).",
  );

  test("a) trilho com 4 links + 2 grupos em menu suspenso + Tutoriais fixa (se ligada) + Pasta (nova aba) no menu Documentos + Financeiro 'em breve' depois de todos", async ({
    page,
  }) => {
    await entrar(page, parceiro!, "/");

    // 1º nível do aluno de verdade (basePath="") desde 07/10/2026 (grupos do
    // parceiro, decisão do João): Início, Clientes, [Encontros▾], [Documentos▾],
    // Materiais, Suporte. Os grupos são BOTÕES de menu suspenso (`comoMenu`),
    // não links. Não inclui Financeiro (`opts.financeiro` depende do papel)
    // nem Equipe (menu "Sua conta").
    const principal = page.getByRole("navigation", { name: "Navegação principal" });
    for (const grupo of [/^Encontros$/i, /^Documentos$/i]) {
      await expect(principal.getByRole("button", { name: grupo })).toHaveAttribute(
        "aria-haspopup",
        "menu",
      );
    }
    const rotulos = [
      /^In(í|i)cio$/i,
      /^Clientes$/i,
      /^Materiais$/i,
      // Sem `$`: com chamado respondido o nome vira "Suporte — 1 resposta da
      // equipe esperando você" (selo da Onda 1.1, 02/10/2026).
      /^Suporte( |$)/i,
    ];
    for (const rotulo of rotulos) {
      await expect(
        principal.getByRole("link", { name: rotulo }).first(),
        `Link "${rotulo}" ausente do trilho do parceiro.`,
      ).toBeVisible();
    }

    // Tutoriais é a aba FIXA (`navFixoDoAluno`), condicionada a um
    // interruptor fora de `INTERRUPTORES_CONFIG`. Branch por PRESENÇA, nunca
    // `OR` vazio: se a chave estiver desligada em produção agora, o teste não
    // pode fingir que viu algo que a tela não mostrou.
    const tutoriais = page.getByRole("link", { name: /^Tutoriais$/i });
    const tutoriaisLigada = await tutoriais.first().isVisible().catch(() => false);
    if (tutoriaisLigada) {
      await expect(tutoriais.first()).toBeVisible();
    }

    // Financeiro só existe quando `opts.financeiro` é true (titular). É o
    // único "em breve" que sobrou e vem DEPOIS de todos os links clicáveis.
    const xUltimoLink = await principal
      .getByRole("link", { name: /^Suporte( |$)/i })
      .first()
      .boundingBox();
    const financeiro = page.locator('[aria-disabled="true"]', {
      hasText: /^Financeiro/,
    });
    if (await financeiro.isVisible().catch(() => false)) {
      await expect(financeiro).toHaveAttribute("aria-disabled", "true");
      await expect(financeiro).toContainText(/em breve/i);
      const xFinanceiro = await financeiro.boundingBox();
      expect(xFinanceiro).not.toBeNull();
      expect(xFinanceiro!.x).toBeGreaterThan(xUltimoLink!.x);
    }

    // Pasta (25/09/2026) é LINK para `/pasta/abrir`, em nova aba; desde
    // 07/10/2026 mora no menu suspenso do grupo "Documentos". O `sr-only`
    // " (abre em nova aba)" entra no nome acessível — daí `^Pasta`.
    await principal.getByRole("button", { name: /^Documentos$/i }).click();
    const pasta = page.getByRole("menuitem", { name: /^Pasta/ });
    await expect(pasta).toBeVisible();
    await expect(pasta).toHaveAttribute("href", "/pasta/abrir");
    await expect(pasta).toHaveAttribute("target", "_blank");
    await page.keyboard.press("Escape");
    await expect(pasta).toBeHidden();
  });

  test("a2) /pasta/abrir redireciona para o Drive ou para /pasta — nunca para fora", async ({
    page,
  }) => {
    await entrar(page, parceiro!, "/");
    // Só leitura: um GET com a sessão do parceiro, sem seguir o redirect.
    const resp = await page.request.get("/pasta/abrir", { maxRedirects: 0 });
    expect(resp.status()).toBe(307);
    const destino = resp.headers()["location"] ?? "";
    expect(
      /^https:\/\/(drive|docs)\.google\.com\//.test(destino) ||
        new URL(destino, page.url()).pathname === "/pasta",
      `destino inesperado: ${destino}`,
    ).toBe(true);
  });

  test("b) 'Perfil' e 'Equipe' NÃO estão no trilho do header, e ESTÃO no menu 'Sua conta'", async ({
    page,
  }) => {
    await entrar(page, parceiro!, "/");

    // O(s) `<nav>` do trilho ficam DENTRO do header — escopar por `header`
    // para não confundir com o menu "Sua conta" (que também é um
    // `role="menu"` fora do `<header>` semântico, mas dentro do mesmo DOM).
    // Sem `.first()` de propósito: há até dois `<nav>` no header (o
    // principal, `aria-label="Navegação principal"`, e o fixo cujo rótulo
    // é o do próprio item — hoje "Tutoriais", variável) e "Perfil"/"Equipe"
    // não podem estar em NENHUM dos dois.
    const trilho = page.locator("header nav");
    await expect(
      trilho.getByRole("link", { name: /^Perfil$/i }),
      "'Perfil' saiu do trilho quando basePath==='' (24/09/2026) — já está " +
        "em 'Seu perfil', no menu 'Sua conta'.",
    ).toHaveCount(0);
    await expect(
      trilho.getByRole("link", { name: /^Equipe$/i }),
      "'Equipe' saiu do trilho quando basePath==='' (noMenuDeContas:true, 24/09/2026).",
    ).toHaveCount(0);

    // Abre o menu "Sua conta" e confere os dois itens lá dentro.
    const gatilho = page.getByRole("button", { name: /sua conta/i });
    await expect(gatilho).toBeVisible();
    await gatilho.click();

    const menu = page.getByRole("menu", { name: /sua conta/i });
    await expect(menu).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: /seu perfil/i }),
    ).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: /^Equipe$/i }),
    ).toBeVisible();
  });
});

test.describe("Header · admin · grupos de 1º nível + sub-abas de 2º nível", () => {
  test.skip(!admin, "Sem QA_ADMIN_EMAIL/SENHA — defina-os em .env.qa.");

  test("c) o trilho de 1º nível do admin tem exatamente os 5 grupos, e nenhuma das 10 abas antigas solta", async ({
    page,
  }) => {
    await entrar(page, admin!, "/admin");

    // 🔴 Ancorado por `aria-label="Navegação principal"` (o iromar deu esse
    // rótulo ao `<nav>` do trilho de 1º nível, `nav-tabs.tsx`), não mais por
    // `header nav` posicional: há três `<nav>` irmãos na mesma tela (fixo,
    // principal, "Seções de …") e `.first()` dependia da ORDEM em que
    // nasceram no DOM, não do papel de cada um.
    const trilho = page.getByRole("navigation", { name: /^Navega(ç|c)(ã|a)o principal$/i });
    // 🔴 Grupo FECHADO com badge tem nome acessível "Atendimento 3" (o
    // `Badge` é `inline-flex`, entra no nome) — `/^Atendimento$/` dava 0
    // elementos com um único chamado aberto em produção (achado do joao,
    // it.2). Os grupos que carregam número toleram o sufixo.
    // 🔴 08/10/2026: os 5 grupos são BOTÕES de menu suspenso (`comoMenu`, o
    // mesmo `NavGrupoMenu` do parceiro), não links. O contador do grupo
    // entra no nome acessível, colado ou com espaço — daí `\s*`.
    const grupos = [
      /^Parceiros\s*(\d+)?$/i,
      /^Agenda$/i,
      /^Atendimento\s*(\d+)?$/i,
      /^Conte(ú|u)do$/i,
      /^Configura(ç|c)(õ|o)es$/i,
    ];
    for (const rotulo of grupos) {
      await expect(
        trilho.getByRole("button", { name: rotulo }),
        `Grupo "${rotulo}" ausente do trilho de 1º nível do admin.`,
      ).toHaveAttribute("aria-haspopup", "menu");
    }

    // 🔴 Nenhum dos 10 rótulos ANTIGOS pode sobrar SOLTO no 1º nível — eles
    // viraram sub-abas (filhos). "Chamados", "Vídeos" e "Sessões" também são
    // rótulos de sub-aba, então a checagem é ESPECÍFICA: eles não podem ter
    // um `<Link>` de 1º nível próprio DENTRO do `<nav>` "Navegação principal"
    // — só dentro da 3ª linha (sub-abas), que é o `<nav>` "Seções de …",
    // presente só quando o grupo pai está ativo.
    const primeiroNivel = trilho;
    for (const antigo of [
      /^Alunos$/i,
      /^Plant(ã|a)o$/i,
      /^Chamados$/i,
      /^Fila de liga(ç|c)(õ|o)es$/i,
      /^Operadores$/i,
      /^Sess(õ|o)es$/i,
      /^V(í|i)deos$/i,
      /^Clientes$/i,
      /^Tutoriais$/i,
      /^Interruptores$/i,
    ]) {
      await expect(
        primeiroNivel.getByRole("link", { name: antigo }),
        `"${antigo}" apareceu solto no 1º nível do admin — deveria estar dentro de um grupo.`,
      ).toHaveCount(0);
    }
  });

  test("d) /admin/clientes: sem 3ª linha; no menu de Parceiros, Clientes é a página atual", async ({
    page,
  }) => {
    await entrar(page, admin!, "/admin/clientes");

    // 🔴 08/10/2026: a 3ª linha "Seções de …" não existe mais no admin — as
    // sub-abas moram no menu suspenso do grupo.
    await expect(
      page.getByRole("navigation", { name: /^Se(ç|c)(õ|o)es de /i }),
    ).toHaveCount(0);
    await page
      .getByRole("navigation", { name: "Navegação principal" })
      .getByRole("button", { name: /^Parceiros/ })
      .click();
    const atual = page.getByRole("menu").locator('[aria-current="page"]');
    await expect(atual).toHaveCount(1);
    await expect(atual).toHaveText(/^Clientes$/);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();
  });

  test("e) trocar sub-aba dentro de /admin não navega (zero request document); sair para /admin/clientes e voltar para Visão geral NAVEGA", async ({
    page,
  }) => {
    await entrar(page, admin!, "/admin");

    let houveDocumentRequest = false;
    page.on("request", (r) => {
      if (r.resourceType() === "document") houveDocumentRequest = true;
      // RSC payload também conta como ida ao servidor para o conteúdo da
      // página — mesmo critério do teste 9 de `admin-visao-geral.spec.ts`.
      const rsc = r.headers()["rsc"];
      if (rsc) houveDocumentRequest = true;
    });

    // 🔑 Dentro de `/admin`, sub-aba com `abaDoPainel` é `<button>`, não
    // `<Link>` (`SubNavTabs`, `src/components/nav-tabs.tsx`): não há
    // navegação, só troca de `?aba=` por `history.replaceState`. O GRUPO
    // "Parceiros" (1º nível, `href="/admin"`) continua `<Link>`.
    //
    // 🔴 A sub-aba `abaDoPainel: "ativos"` chama-se "Ativos" (2ª rodada,
    // veredito do João) — renomeada em `src/lib/nav.ts` para não repetir o
    // rótulo do grupo pai ("Parceiros" dentro de "Parceiros" confundia qual
    // dos dois era o clicado). O grupo continua "Parceiros".
    // 🔴 08/10/2026: "Ativos" é `menuitem` no menu suspenso de "Parceiros";
    // dentro de `/admin` continua sem navegar (`history.replaceState`).
    const principal = page.getByRole("navigation", { name: "Navegação principal" });
    await principal.getByRole("button", { name: /^Parceiros/ }).click();
    const subabaAtivos = page.getByRole("menuitem", { name: /^Ativos$/i });
    await subabaAtivos.click();
    await expect(page).toHaveURL(/[?&]aba=ativos/);
    expect(
      houveDocumentRequest,
      "Clicar na sub-aba 'Ativos' (?aba=ativos) foi ao servidor — deveria trocar por history.replaceState, como as demais abas de /admin.",
    ).toBe(false);

    // Sair para /admin/clientes e voltar para "Visão geral": esta é navegação
    // de VERDADE (rota diferente → mesma rota), então DEVE ir ao servidor —
    // o teste aqui é sobre a URL final, não sobre zero-fetch.
    await page.goto("/admin/clientes");
    await principal.getByRole("button", { name: /^Parceiros/ }).click();
    const visaoGeral = page.getByRole("menuitem", { name: /^Vis(ã|a)o geral$/i });
    await visaoGeral.click();
    // 🔴 Regex apertada para `/admin` LIMPO (2ª rodada): "Visão geral" agora
    // declara `href: "/admin", exact: true` em `nav.ts` (não mais
    // `/admin?aba=visao`), e a normalização que reescrevia o destino dentro
    // de `SubNavTabs` foi removida (fatia do iromar) — não há mais caminho
    // que produza `/admin?aba=visao` ao clicar neste link. Regex tolerante a
    // `?aba=visao` mascararia a regressão de a normalização voltar a viver
    // em dois lugares.
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("f) header sem rolagem horizontal, alvos tocáveis e contraste aprovado, em /admin e numa rota do parceiro", async ({
    page,
  }) => {
    await entrar(page, admin!, "/admin");
    await semRolagemHorizontal(page);
    await alvosDeClique(page);
    await contrasteAprovado(page, "Header · /admin");
  });
});

test.describe("Header · parceiro · geometria e contraste", () => {
  test.skip(
    !parceiro,
    "Sem QA_PARCEIRO_EMAIL/SENHA — defina-os em .env.qa (aponte QA_ENV_FILE).",
  );

  test("f) header sem rolagem horizontal, alvos tocáveis e contraste aprovado, numa rota do parceiro", async ({
    page,
  }) => {
    await entrar(page, parceiro!, "/");
    await semRolagemHorizontal(page);
    await alvosDeClique(page);
    await contrasteAprovado(page, "Header · parceiro");
  });
});
