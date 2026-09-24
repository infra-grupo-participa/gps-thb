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
 * Visão geral de `/admin` — as 3 sub-abas, e a sub-aba "O programa" **em 3
 * zonas** (23/09/2026, redesenho: 20 cards viraram régua + gráfico + ranking).
 *
 * O que esta suíte protege, e que `tsc`/`build` não pegam:
 *
 * 1. 🔴 **A porta de entrada some sozinha.** Já aconteceu 3× nesta casa (aba
 *    Tutoriais, Inventário, onboarding): a feature existe, compila, e a
 *    entrada não aparece. Aqui são 3 sub-abas e uma régua de 6 estágios.
 *
 * 2. 🔴 **`/admin` sem parâmetro tem de abrir ONDE ABRIA.** `LINK_LISTA` e os
 *    ~15 hrefs do dashboard dependem de `aba=ativos` continuar no lugar. Um
 *    padrão trocado quebraria os links sem erro nenhum. E `?foco=` **não pode
 *    nascer na URL**: `/admin` limpo tem de continuar `/admin`.
 *
 * 3. 🔴 **A RÉGUA NÃO TEM TAXA DE PASSAGEM — e esta é a proteção que quase
 *    morreu com os cards.** Os 6 estágios NÃO são subconjuntos encadeados:
 *    `favorito` (37) é MAIOR que `mensagem` (22), então "passam de mensagem
 *    para favorito" daria **168%**. Os testes que cobravam isso viviam nos
 *    cards "passos marcados" e "marcos até a reunião" (medido com o dado real
 *    37·1·52·22, o `Funil` anunciava "5200% passam de entrevista para
 *    reunião"). **Os cards saíram da tela; a trava não.** Ela foi reescrita
 *    para a régua e continua valendo nos dois blocos, agora em `atencao`.
 *
 * 4. 🔴 **Zero fetch ao clicar na régua.** `regua.tsx` escreve `?foco=` por
 *    `history.replaceState` justamente para não re-executar o Server
 *    Component (`router.replace` rodaria a RPC de novo, e 6 cliques de
 *    exploração virariam 6 RPCs). Se um dia alguém "uniformizar" com o
 *    `?vis=` de `abas-painel.tsx`, este teste vermelha. **Não maquiar: é o
 *    motivo de a Zona 1 existir.**
 *
 * 5. 🔴 **Número que não clica não pode PARECER que clica.**
 *    `favorito_parado` e `reuniao_sem_entrevista` são sobre clientes, e a
 *    lista do painel é de parceiros — ficam sem link. Se ganharem aparência
 *    de link, a pessoa clica, nada acontece, e ela deixa de confiar nos links
 *    que FUNCIONAM.
 *
 * 6. **Denominador honesto.** A régua escreve `de 148` UMA vez, no rodapé da
 *    fita, e o gráfico marca a semana parcial com `em curso` **na legenda**
 *    (não no eixo X) — barra baixa de período incompleto lida como queda é
 *    erro de leitura, não de dado.
 *
 * 7. **Nenhum número migrado some.** Os 20 cards viraram 3 zonas + `atencao` +
 *    `parceiros`; os testes 7 e 8 procuram os rótulos-chave nas duas sub-abas
 *    de destino. Card que vira zona é redesenho; número que evapora é perda.
 *
 * ⚠️ Roda contra PRODUÇÃO com a conta de QA. Esta suíte é SÓ LEITURA: não
 * clica em nada que escreva, não cancela, não dispara e-mail. Os cliques da
 * régua trocam `?foco=` no endereço, que é estado de tela — não toca o banco.
 */

const admin = exigeAdmin();

/** Os 6 estágios da régua, na ordem de `FOCOS`. Rótulo de uma palavra. */
const ESTAGIOS = [
  "entrou",
  "onboarding",
  "cadastrou",
  "mensagem",
  "favorito",
  "contrato",
] as const;

test.describe("Admin · Visão geral · régua + cruzamento + ranking", () => {
  test.skip(
    !admin,
    "Sem QA_ADMIN_EMAIL/SENHA. Defina QA_ENV_FILE apontando para o .env.qa.",
  );

  test("1 · /admin sem parâmetro abre visao·programa, sem ?foco=, e a régua tem 6 itens sem marcação", async ({
    page,
  }, info) => {
    const console = vigiarConsole(page);
    await entrar(page, admin!, "/admin");

    await expect(page).toHaveURL(/\/admin(\?|$)/);

    // A aba de cima continua sendo "Visão geral" (não mudou de lugar).
    const visaoGeral = page.getByRole("tab", { name: /vis(ã|a)o geral/i });
    await expect(visaoGeral).toBeVisible();
    await expect(visaoGeral).toHaveAttribute("aria-selected", "true");

    // A sub-aba padrão é Programa — e chegou lá SEM `?vis=` na URL.
    const programa = page.getByRole("tab", { name: /^o programa$/i });
    await expect(programa).toBeVisible();
    await expect(programa).toHaveAttribute("aria-selected", "true");
    expect(page.url()).not.toContain("vis=");

    // 🔴 `?foco=` NÃO nasce na URL. `/admin` limpo continua `/admin`.
    expect(page.url()).not.toContain("foco=");

    // A régua: 6 itens, dentro do próprio tablist (não os da barra de abas).
    const regua = page.getByRole("tablist", {
      name: /est(á|a)gio da jornada/i,
    });
    await expect(regua).toBeVisible();
    const itens = regua.getByRole("tab");
    await expect(itens).toHaveCount(6);

    // Sem `?foco=`, NENHUM item está marcado.
    await expect(regua.locator('[aria-current="true"]')).toHaveCount(0);

    await registrarTela(page, info, "admin-visao-regua");
    console.semErros();
  });

  test("2 · os 6 estágios clicam; 'mensagem' marca a URL, o item e recorta a tabela", async ({
    page,
  }) => {
    await entrar(page, admin!, "/admin");

    const regua = page.getByRole("tablist", {
      name: /est(á|a)gio da jornada/i,
    });

    // Todos os 6 existem pelo nome e são clicáveis (têm o papel `tab`).
    for (const rotulo of ESTAGIOS) {
      await expect(
        regua.getByRole("tab", { name: new RegExp(rotulo, "i") }),
      ).toBeVisible();
    }

    // O cabeçalho da tabela ANTES do recorte: "N parceiros", sem filtro.
    const semRecorte = page.getByText(/^\d+ parceiros$/);
    await expect(semRecorte.first()).toBeVisible();

    const alvo = regua.getByRole("tab", { name: /mensagem/i });
    await alvo.click();

    // A URL ganha `foco=mensagem` — escrita por `replaceState`, sem navegar.
    await expect(page).toHaveURL(/foco=mensagem/);

    // O item ativo se anuncia por ARIA, não só por cor (a régua de 2px).
    await expect(alvo).toHaveAttribute("aria-current", "true");

    // 🔑 A tabela passa a dizer "N de M" — o recorte com o denominador ao
    // lado. Não prendo ao número exato (o dado de produção muda): o que o
    // teste cobra é a FORMA, que é o contrato de `parceiros.tsx`.
    await expect(page.getByText(/^\d+ de \d+$/).first()).toBeVisible();

    // 🔴 23/09/2026 (achado do João): `entrou` era clique morto — a tabela
    // não recorta por este estágio e nada mais aparecia. Clicar nele agora
    // mostra a submétrica "Sem login" entre o gráfico e o ranking, dentro do
    // painel da sub-aba "O programa".
    const alvoEntrou = regua.getByRole("tab", { name: /entrou/i });
    await alvoEntrou.click();
    await expect(page).toHaveURL(/foco=entrou/);

    const painelPrograma = page.getByRole("tabpanel", { name: /^o programa$/i });
    await expect(painelPrograma.getByText(/sem login/i).first()).toBeVisible();
  });

  test("3 · clicar no estágio ativo de novo limpa o foco e a tabela volta ao total", async ({
    page,
  }) => {
    await entrar(page, admin!, "/admin?foco=mensagem");

    const regua = page.getByRole("tablist", {
      name: /est(á|a)gio da jornada/i,
    });
    const alvo = regua.getByRole("tab", { name: /mensagem/i });
    await expect(alvo).toHaveAttribute("aria-current", "true");

    await alvo.click();

    // 🔑 Sem este gesto o admin fica preso no recorte: marcou e não há como
    // voltar ao conjunto inteiro a não ser editando a URL.
    await expect(page).not.toHaveURL(/foco=/);
    await expect(regua.locator('[aria-current="true"]')).toHaveCount(0);
    await expect(page.getByText(/^\d+ parceiros$/).first()).toBeVisible();
  });

  test("4 · ?foco= inválido não marca nada e o valor cru não chega ao DOM", async ({
    page,
  }) => {
    await entrar(page, admin!, "/admin?foco=<script>alert(1)</script>");

    const regua = page.getByRole("tablist", {
      name: /est(á|a)gio da jornada/i,
    });
    await expect(regua).toBeVisible();

    // Allowlist fechada (`lerFoco`): fora de `FOCOS` vira `null` — régua sem
    // marcação e variante "todos". Nunca deixa a zona vazia.
    await expect(regua.locator('[aria-current="true"]')).toHaveCount(0);
    await expect(regua.getByRole("tab")).toHaveCount(6);
    await expect(page.locator("body")).not.toContainText("alert(1)");
  });

  test("5 · 🔴 a régua NÃO tem taxa de passagem (nem %, nem 'passam de', nem seta)", async ({
    page,
  }) => {
    await entrar(page, admin!, "/admin");

    const regua = page.getByRole("tablist", {
      name: /est(á|a)gio da jornada/i,
    });
    await expect(regua).toBeVisible();

    // 🔴 ESTA É A PROTEÇÃO QUE MORREU COM OS CARDS DE "NÃO É FUNIL" E NÃO
    // PODE MORRER COM ELES. Os 6 estágios não se encadeiam: `favorito` (37)
    // é maior que `mensagem` (22) — qualquer taxa de passagem daria 168%.
    const texto = (await regua.innerText()).trim();
    expect(texto).not.toMatch(/passam de/i);
    expect(texto).not.toMatch(/taxa de convers(ã|a)o/i);
    expect(texto).not.toMatch(/→|->/);
    // Nenhum percentual ENTRE os itens: a fita é contagem sobre denominador
    // comum, e o denominador é escrito por extenso uma vez, fora da fita.
    expect(texto).not.toMatch(/%/);

    // E os dois blocos que carregavam a mesma trava (passos e marcos) foram
    // para `atencao` — a proibição vai junto com eles.
    await page.goto("/admin?vis=atencao");
    for (const rotulo of [/passos da ficha/i, /marcos at(é|e) a reuni(ã|a)o/i]) {
      const bloco = page
        .locator("section, div")
        .filter({ hasText: rotulo })
        .last();
      await expect(bloco).toBeVisible();
      await expect(bloco).not.toContainText(/passam de/i);
      await expect(bloco).not.toContainText(/taxa de convers(ã|a)o/i);
    }
  });

  test("6 · o denominador aparece UMA vez na régua, e o gráfico marca 'em curso'", async ({
    page,
  }) => {
    await entrar(page, admin!, "/admin");

    // 🔑 `de N parceiros` é o rodapé da fita — escrito uma vez, não colado em
    // cada um dos 6 números (repetir seis vezes faria a régua parecer 6 cards).
    const rodape = page.getByText(/^de \d+ parceiros$/);
    await expect(rodape).toHaveCount(1);

    // ⚠️ A semana corrente é PARCIAL, e isso se diz com um token — hoje na
    // LEGENDA do gráfico, não mais no eixo X (mudou depois que este teste foi
    // escrito; a asserção abaixo continua válida porque procura o texto na
    // página, não no eixo). A barra baixa do período incompleto não pode ser
    // lida como queda. Só cobro quando existe série: sem semanas, a Zona 2
    // diz outra coisa.
    const vazio = page.getByText(/^sem semanas no per(í|i)odo$/);
    if ((await vazio.count()) === 0) {
      await expect(page.getByText(/em curso/).first()).toBeVisible();
    }
  });

  test("7 · os números migrados para 'Atenção' estão lá, nas duas seções", async ({
    page,
  }) => {
    await entrar(page, admin!, "/admin?vis=atencao");

    // As duas seções, cada uma com o SEU denominador escrito uma vez só.
    await expect(
      page.getByRole("heading", { name: /^parceiros$/i }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /^clientes$/i }).first(),
    ).toBeVisible();

    // Rótulos-chave do que migrou do dashboard (um por origem):
    //  · "Parados há 30+ dias"  ← KPI "ativos 30 dias"
    //  · "Sem login"            ← card "acesso ao portal"
    //  · "Onboarding parado"    ← card "onboarding"
    //  · "Em fechamento"        ← KPI "clientes em fechamento" (seção Clientes)
    for (const rotulo of [
      /parados h(á|a) 30\+ dias/i,
      /^sem login$/i,
      /onboarding parado/i,
      /em fechamento/i,
    ]) {
      await expect(page.getByText(rotulo).first()).toBeVisible();
    }

    // 🔴 Número sem link não parece link: os dois que ficaram sem destino.
    for (const rotulo of [
      /favoritos parados/i,
      /reuni(ã|a)o sem entrevista/i,
    ]) {
      const bloco = page.locator("div").filter({ hasText: rotulo }).last();
      await expect(bloco).toBeVisible();
      // O NÚMERO não é âncora. (O bloco pode ter um link NOMEADO de
      // encaminhamento — "Procure em Clientes" —, que é outra coisa: tem nome
      // próprio e diz para onde vai.)
      await expect(
        bloco.locator("a").filter({ hasText: /^\s*\d+\s*$/ }),
      ).toHaveCount(0);
    }
  });

  test("8 · a sub-aba Parceiros tem o ranking primeiro e os números da base", async ({
    page,
  }) => {
    await entrar(page, admin!, "/admin?vis=parceiros");

    // O ranking é a primeira peça (foi a que o Marcio aprovou).
    const tabela = page.getByRole("table").first();
    await expect(tabela).toBeVisible();
    // O cabeçalho carrega o prazo: "parado" nunca aparece sozinho.
    await expect(tabela.locator("thead")).toContainText(/14/);
    // Honorário ausente é travessão, não zero (regra B7-d da casa).
    await expect(tabela).not.toContainText("R$ 0,00");

    // E abaixo dele, os blocos da composição da base que migraram do
    // dashboard — título de até 3 palavras, sem card.
    for (const rotulo of [
      /fecharam os \d+/i,
      /entradas por m(ê|e)s/i,
      /progresso etapa 01/i,
      /titulares e s(ó|o)cios/i,
      /grau de rela(ç|c)(ã|a)o/i,
    ]) {
      await expect(page.getByText(rotulo).first()).toBeVisible();
    }
  });

  test("9 · 🔴 clicar na régua NÃO dispara requisição ao servidor", async ({
    page,
  }) => {
    await entrar(page, admin!, "/admin");

    const regua = page.getByRole("tablist", {
      name: /est(á|a)gio da jornada/i,
    });
    const alvo = regua.getByRole("tab", { name: /contrato/i });

    /**
     * 🔑 A Zona 1 existe para que varrer os 6 estágios custe ZERO RPC. Com
     * `router.replace` (o que `abas-painel.tsx` faz com `?vis=`), o App Router
     * re-executa o Server Component porque `page.tsx` lê `searchParams` — e a
     * RPC de ~60 ms rodaria a cada clique de exploração, 1 chamada virando 6.
     *
     * Espero por QUALQUER requisição a `/admin` (o RSC payload vai para a
     * mesma rota, com `?_rsc=`). Se `waitForRequest` RESOLVER, houve fetch e
     * o teste falha; o caminho feliz é o timeout.
     *
     * 🔴 Se este teste ficar vermelho, é o `history.replaceState` falhando —
     * **reporte, não troque por um timeout maior.**
     */
    const houveFetch = page
      .waitForRequest(
        (r) => r.url().includes("/admin") && r.resourceType() !== "image",
        { timeout: 2_000 },
      )
      .then(() => true)
      .catch(() => false);

    await alvo.click();
    await expect(page).toHaveURL(/foco=contrato/);

    expect(
      await houveFetch,
      "clicar na régua foi ao servidor — `?foco=` deveria ser escrito por history.replaceState",
    ).toBe(false);
  });

  test("10 · contraste WCAG AA medido no DOM pintado, nas 3 sub-abas", async ({
    page,
  }) => {
    await entrar(page, admin!, "/admin");
    await contrasteAprovado(page, "Visão geral · Programa");

    await page.goto("/admin?vis=atencao");
    await contrasteAprovado(page, "Visão geral · Atenção");

    await page.goto("/admin?vis=parceiros");
    await contrasteAprovado(page, "Visão geral · Parceiros");
  });

  test("11 · sem rolagem lateral e com alvos tocáveis nas 3 sub-abas", async ({
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

  test("12 · a régua recortada continua sem rolagem lateral (a variante troca o conteúdo)", async ({
    page,
  }) => {
    // 🔑 Só a variante ATIVA entra no DOM (as outras 6 não ficam com
    // `hidden`: elemento invisível continua contando na área rolável do
    // ancestral, e 7 tabelas empilhadas dariam rolagem sobre o vazio).
    // Este teste confere o recorte mais estreito (`contrato`) no menor
    // dispositivo da matriz.
    await entrar(page, admin!, "/admin?foco=contrato");
    await semRolagemHorizontal(page);
  });
});
