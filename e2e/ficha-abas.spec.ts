import { test, expect, type Page } from "@playwright/test";
import {
  alvosDeClique,
  contrasteAprovado,
  entrar,
  exigeAdmin,
  exigeLogin,
  registrarTela,
  semRolagemHorizontal,
  vigiarConsole,
} from "./apoio";

/**
 * A FICHA DO CLIENTE EM QUATRO ABAS — a prova em navegador que PINTA.
 *
 * Fatia 7 da reforma da ficha (24/09/2026). As fatias 0–6 entregaram a pasta
 * com folhas (`ficha-abas.tsx`), o estado na URL (`ficha-abas-estado.ts`), a
 * aba do croqui, a pré-visualização inline (`visor-documento.tsx` + a rota
 * `/clientes/<id>/documento/<tipo>/<id>`) e o espelho do admin. Nada disso é
 * provável por `tsc`, e boa parte não é provável nem em jsdom:
 *
 * | o que só este arquivo pega | por quê |
 * |---|---|
 * | aba inativa é conteúdo ESCONDIDO | `hidden` do `TabsPanel`; `offsetParent` é quem prova, não `e.hidden` |
 * | trocar de aba ir ao servidor | `replaceState` virando `router.replace` não muda uma linha de tipo |
 * | 145 px de rolagem horizontal a 390 px | medido em Chromium; em 1366 não há sintoma |
 * | a rota inline devolver 200 + `application/pdf` + `XFO: SAMEORIGIN` | **não há outro teste desta rota em produção** |
 * | o PDF **PINTAR** no visor nativo | o frame filho é `chrome-extension://…`; com `sandbox` vira `chrome-error://` |
 * | a pendência puxar a aba e NÃO gravar | `salvar()` recusa ANTES da action — provado contando POSTs |
 *
 * ════════════════════════════════════════════════════════════════════════
 * 🔴 RODA CONTRA PRODUÇÃO — as travas, e por que cada uma existe
 * ════════════════════════════════════════════════════════════════════════
 *
 * Não há ambiente de teste (ver `e2e/LEIA-ME.md`). Do outro lado destas
 * URLs há fichas de pessoas reais. Este arquivo inteiro obedece a:
 *
 * 1. **Âncora no `CLIENTE DE TESTE (QA)`, conferida DUAS vezes** — na lista
 *    (pelo nome do link) e DENTRO da ficha (pelo campo "Nome", que é o valor
 *    que a ficha enviaria se alguém salvasse). Mesmo padrão de
 *    `sessoes-fluxo.spec.ts` e `estrela-pre-requisito.spec.ts`. Nunca "o
 *    primeiro da lista": a ordenação é acaso, e em 22/09 esse acaso quase
 *    cancelou a sessão de uma parceira real.
 *
 * 2. **NENHUM upload.** A aba Croqui é conferida pelo estado vazio e pela
 *    presença do formulário — o `<input type="file">` nunca recebe arquivo.
 *    Subir um PDF em produção deixa objeto no Storage e linha no banco.
 *
 * 3. **NENHUM e-mail.** Nada aqui escreve em sessão, que é o único caminho
 *    do projeto que dispara e-mail (o cron `sessao-emails`, que em 22/09
 *    mandou 7 avisos reais à Dra. Cristiane). Conferido: a ficha grava por
 *    `atualizarCliente`/RPC, sem `net.http_post`.
 *
 * 4. **NENHUM "Salvar ficha" que altere dado real.** Duas técnicas, e as
 *    duas foram conferidas no código antes de escritas aqui:
 *
 *    (a) **Parar ANTES do clique.** O teste 4 digita em `#f-reg` e lê a
 *        barra — a barra acusa "alterações não salvas" sem nenhum salvar. Um
 *        `reload` descarta (o estado é `useState`, nada foi ao servidor).
 *
 *    (b) **Usar o caminho que a GUARDA RECUSA.** O teste 5 limpa o telefone
 *        e clica em Salvar. `salvar()` em `cliente-ficha.tsx` abre com
 *        `if (faltaEssencial) { setErroSalvar(...); puxarParaCampo(...);
 *        return; }` — o `return` acontece ANTES do `startTransition` que
 *        chamaria `atualizarCliente`. Nenhuma action é invocada, nada é
 *        gravado. E o teste não acredita na leitura do código: ele **conta
 *        os POSTs** durante o clique (tem de ser 0) **e** recarrega para ver
 *        o telefone intacto. Duas provas independentes, porque "eu li o
 *        código e ele retorna cedo" é exatamente o tipo de afirmação que
 *        esta casa já viu falhar com a suíte verde.
 *
 * ════════════════════════════════════════════════════════════════════════
 * OS DOIS PAPÉIS
 * ════════════════════════════════════════════════════════════════════════
 * A ficha existe em duas páginas que montam o MESMO componente — a do
 * parceiro (`/clientes/<id>`) e o espelho do admin
 * (`/admin/aluno/<alunoId>/clientes/<id>`). `espelho-admin.spec.ts` prova
 * ESTATICAMENTE que as props batem; aqui se prova que a tela PINTADA bate.
 * Cada conta ausente do `.env.qa` pula o seu bloco com a razão escrita —
 * nunca falha por falta de segredo, e nunca fica verde sem ter olhado.
 */

const parceiro = exigeLogin();
const admin = exigeAdmin();

/** 🔴 A âncora. Nunca "o primeiro da lista". */
const CLIENTE_DE_TESTE = /CLIENTE DE TESTE \(QA\)/i;
const BUSCA = "CLIENTE DE TESTE";

/** As quatro folhas, na ordem de `ABAS_FICHA` — a ordem é do funil e é fixa. */
const ABAS = ["dados", "preliminar", "croqui", "fechamento"] as const;
type Aba = (typeof ABAS)[number];

/**
 * Os rótulos de `ROTULO_DA_ABA`, como regex — casando o **INÍCIO** do nome
 * acessível, nunca o nome inteiro.
 *
 * 🔴 POR QUE NÃO HÁ `$` AQUI. O nome acessível do `TabsTrigger` é o texto de
 * TODOS os descendentes, e o `Badge` do contador mora DENTRO do botão
 * (`ficha-abas.tsx`). Então o nome não é "Croqui": é
 * `"Croqui Nenhum croqui"` · `"Fechamento da Holding Sem contrato · nenhuma
 * minuta"` · `"Reunião preliminar 0 problemas · 1 de 4 passos"`. Com `$`, a
 * regex não casa aba NENHUMA — e como `aba()` é usada em 8 dos 9 testes, o
 * arquivo inteiro morre no primeiro locator. `--list` não pega isso: ele lê o
 * título do teste, não o corpo.
 *
 * Medido em Chromium headless (réplica do JSX real, 24/09/2026):
 *   /^croqui$/i           -> 0 abas
 *   /^fechamento$/i       -> 0 abas
 *   /^croqui/i            -> 1
 *   /^fechamento da holding/i -> 1
 *
 * 🔑 O `^` FICA. É ele que impede "Croqui" de casar a aba errada pelo
 * contador: a aba 4 vazia carrega "…nenhuma minuta", e uma ficha com croqui
 * anexado teria a palavra no meio de outros rótulos. Âncora no começo +
 * prefixo é o que dá exatamente 1.
 *
 * ⚠️ Rótulo novo ou contador novo em `ficha-abas-estado.ts` passa por aqui.
 */
const ROTULO: Record<Aba, RegExp> = {
  dados: /^dados b(á|a)sicos/i,
  // 🔴 "Reunião preliminar", NUNCA "Sessão de viabilidade" (Marcio,
  // 24/09/2026). São coisas diferentes no produto.
  preliminar: /^reuni(ã|a)o preliminar/i,
  croqui: /^croqui/i,
  // 🔴 "Fechamento da Holding" — o rótulo mudou em 24/09/2026
  // (`ficha-abas-estado.ts`). `/^fechamento$/i` casava zero.
  fechamento: /^fechamento da holding/i,
};

/**
 * O contador que CADA rótulo tem de carregar — a trava "recolhido não pode
 * ser invisível". Aba inativa é conteúdo escondido; o badge é o que diz o que
 * há lá dentro sem abrir.
 *
 * As regex são frouxas de propósito: prendem a FORMA que
 * `ficha-abas-estado.ts` produz, não o número de produção (que muda).
 *   · dados       → "PJ" quando há razão social; senão a aba fica sem badge,
 *                   e aí o rótulo sozinho já basta (é o único caso permitido)
 *   · preliminar  → "N problemas · N de 4 passos"
 *   · croqui      → "N versões" | "Nenhum croqui"
 *   · fechamento  → "Contrato · N minutas" | "Sem contrato · nenhuma minuta"
 */
const CONTADOR: Record<Aba, RegExp> = {
  dados: /PJ|Dados/i,
  preliminar: /problemas?/i,
  croqui: /vers(ã|õ|a|o)(o|es)?|Nenhum/i,
  fechamento: /Contrato|minutas?/i,
};

/**
 * A aba da ficha, pelo rótulo.
 *
 * 🔑 Os rótulos das 4 folhas são únicos na página — nenhum deles colide com
 * as abas do header, nos DOIS NÍVEIS (24/09/2026: 1º nível do parceiro —
 * `Início`, `Clientes`, `Sessões`… — e os 5 grupos do admin — `Parceiros`,
 * `Agenda`, `Atendimento`, `Conteúdo`, `Configurações` — nem com as sub-abas
 * de 2º nível dentro deles, ex. `Visão geral`/`Etapas` do grupo Parceiros).
 * Por isso o locator não precisa ser escopado a um `tablist` nomeado, e não
 * fica preso a um `aria-label` que a casca não declara.
 */
function aba(page: Page, id: Aba) {
  return page.getByRole("tab", { name: ROTULO[id] });
}

/**
 * Abre a ficha do cliente de teste, **conferindo o nome DUAS vezes**.
 *
 * 🔴 A 2ª conferência é dentro da ficha, no campo "Nome" — o valor que a
 * ficha enviaria se alguém salvasse. Em produção, agir na ficha errada é
 * estrago real. Mesmo helper de `estrela-pre-requisito.spec.ts`, com uma
 * diferença que a fatia 4 obrigou:
 *
 * 🔑 **O campo "Nome" mora na aba 1, e a aba 1 quase nunca é a que abre.**
 * `abaPadraoPorFase` devolve `preliminar` para `prospeccao`/`fechamento` e
 * `fechamento` para `contratado` — e essas são as únicas 3 fases que existem
 * (`FaseCliente`). Com `keepMounted`, o campo ESTÁ no DOM mas o painel leva
 * `hidden`, então `toHaveValue` sobre ele seria uma asserção sobre elemento
 * invisível. Por isso a conferência força `?aba=dados`: ela é sobre QUAL
 * ficha está aberta, não sobre qual folha.
 *
 * Devolve a URL base da ficha (sem query), que os testes reusam.
 */
async function abrirFichaDeTeste(
  page: Page,
  listaUrl: string,
): Promise<string | null> {
  await page.goto(listaUrl);
  await page.getByPlaceholder(/buscar por nome/i).fill(BUSCA);

  // 1ª conferência: o NOME no link da lista.
  const link = page.getByRole("link", { name: CLIENTE_DE_TESTE }).first();
  const existe = await link
    .waitFor({ state: "visible", timeout: 12_000 })
    .then(() => true)
    .catch(() => false);
  if (!existe) return null;

  await link.click();
  await page.waitForURL(/\/clientes\/[0-9a-f-]{36}/i, { timeout: 15_000 });
  const base = page.url().split("?")[0];

  // 2ª conferência: o campo "Nome" DENTRO da ficha, na folha em que ele mora.
  await page.goto(`${base}?aba=dados`);
  await expect(
    page.getByLabel(/^Nome$/),
    "A ficha aberta não é a que o teste pediu — abortando antes de agir. " +
      "Esta suíte roda contra PRODUÇÃO e nunca toca ficha de cliente real.",
  ).toHaveValue(CLIENTE_DE_TESTE);

  return base;
}

/**
 * 🔴 VISIBILIDADE SE PROVA POR `offsetParent`, NÃO POR `e.hidden`.
 *
 * Um filho "visível" dentro de pai oculto dá verde falso: `getComputedStyle`
 * do próprio elemento não sabe que um ancestral tem `hidden`/`display:none`.
 * `offsetParent === null` é o que o navegador de verdade responde para
 * "isto está fora do fluxo de renderização" — e essa é a pergunta certa
 * para `TabsPanel keepMounted`, que deixa as quatro folhas no DOM e esconde
 * três.
 */
async function folhaVisivel(page: Page, id: Aba): Promise<boolean> {
  return page.evaluate((valor) => {
    const todos = Array.from(
      document.querySelectorAll<HTMLElement>('[role="tabpanel"]'),
    );
    // Cada painel declara `aria-labelledby` apontando para a SUA aba — é por
    // esse par que se acha o painel da folha pedida, sem depender de ordem
    // no DOM nem de id gerado pelo React.
    for (const p of todos) {
      const idRotulo = p.getAttribute("aria-labelledby");
      if (!idRotulo) continue;
      const rotulo = document.getElementById(idRotulo);
      if (!rotulo) continue;
      const texto = (rotulo.textContent ?? "").toLowerCase();
      const casa =
        (valor === "dados" && texto.includes("dados")) ||
        (valor === "preliminar" && texto.includes("preliminar")) ||
        (valor === "croqui" && texto.includes("croqui")) ||
        (valor === "fechamento" && texto.includes("fechamento"));
      if (!casa) continue;
      // 🔴 A prova: `offsetParent`. `hidden` no próprio nó também conta, mas
      // não é suficiente sozinho — é por isso que as duas são lidas.
      return p.offsetParent !== null && !p.hasAttribute("hidden");
    }
    return false;
  }, id);
}

/**
 * Conta as idas ao SERVIDOR durante uma ação — payload RSC, documento e
 * navegação de página. Deixa de fora imagem, fonte, CSS e JS estático, que
 * não são "consultar o servidor de novo".
 *
 * 🔑 O RSC payload do App Router vai para a MESMA rota, com `?_rsc=`. É o
 * sinal de que `router.replace`/`router.refresh` re-executou o Server
 * Component — exatamente o que `history.replaceState` existe para evitar
 * (ver o cabeçalho de `ficha-abas.tsx` e o teste 9 de
 * `admin-visao-geral.spec.ts`, que guarda a mesma regra na régua do admin).
 */
function contarIdasAoServidor(page: Page) {
  const idas: string[] = [];
  const ouvinte = (r: import("@playwright/test").Request) => {
    const url = r.url();
    const tipo = r.resourceType();
    if (tipo === "image" || tipo === "font" || tipo === "stylesheet") return;
    if (/\/_next\/static\//.test(url)) return;
    if (url.includes("_rsc=") || tipo === "document" || tipo === "fetch") {
      idas.push(`${r.method()} ${tipo} ${url}`);
    }
  };
  page.on("request", ouvinte);
  return {
    get lista() {
      return idas;
    },
    parar() {
      page.off("request", ouvinte);
    },
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O CORPO DA SUÍTE — escrito uma vez, rodado nos DOIS papéis
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 🔑 A ficha do parceiro e o espelho do admin montam o MESMO
 * `ClienteFicha`. Escrever dois arquivos quase iguais garantiria que um
 * ficasse para trás — foi exatamente o defeito que `espelho-admin.spec.ts`
 * nasceu para pegar. Aqui a régua é uma só, parametrizada pelo papel.
 */
function suiteDaFicha(opts: {
  papel: "parceiro" | "admin";
  credencial: { email: string; senha: string } | null;
  /** Onde a lista de clientes do papel vive, já autenticado. */
  abrir: (page: Page) => Promise<string | null>;
}) {
  const { papel, credencial, abrir } = opts;

  test.describe(`Ficha em 4 abas · ${papel}`, () => {
    test.skip(
      !credencial,
      papel === "parceiro"
        ? "Sem QA_PARCEIRO_EMAIL/SENHA. Defina QA_ENV_FILE apontando para o .env.qa."
        : "Sem QA_ADMIN_EMAIL/SENHA — o espelho do admin fica SEM prova em " +
            "navegador nesta rodada. `espelho-admin.spec.ts` continua provando " +
            "as props estaticamente, mas isso não é a tela pintada.",
    );

    // ─────────────────────────────────────────────────────────────────────
    // 1 · `?aba=` — allowlist fechada, padrão por fase, e o padrão FORA da URL
    // ─────────────────────────────────────────────────────────────────────
    test("1 · ?aba=xyz cai no padrão da fase · ?aba=croqui vence · o padrão não vai à URL", async ({
      page,
    }, info) => {
      const console_ = vigiarConsole(page);
      const base = await abrir(page);
      test.skip(
        !base,
        `Não há "CLIENTE DE TESTE (QA)" alcançável pela conta de ${papel}. ` +
          "Esta suíte NUNCA usa cliente real — roda contra produção.",
      );

      // ── (a) Valor fora da allowlist NÃO deixa a pasta sem folha ────────
      //
      // 🔴 Este é o defeito que `ehAbaFicha` existe para impedir: sem a
      // allowlist, `?aba=xyz` não casaria com nenhuma `TabsContent` e as
      // quatro folhas ficariam escondidas ao mesmo tempo — ficha em branco,
      // sem erro nenhum no console. Mesmo desenho de `lerFoco` em `/admin`.
      await page.goto(`${base!}?aba=xyz`);

      // A régua sobreviveu ao valor inválido (a pasta continua sendo pasta).
      await expect(
        page.getByRole("tab", { name: ROTULO.preliminar }),
      ).toBeVisible({ timeout: 12_000 });

      // A folha que abriu é a do PADRÃO DA FASE, seja ela qual for. O teste
      // não prende a fase do cliente de QA (ela muda com o uso): prende que
      // ALGUMA folha abriu e que o valor cru não virou aba.
      let aberta: Aba | null = null;
      for (const id of ABAS) {
        if (await folhaVisivel(page, id)) {
          expect(
            aberta,
            `Duas folhas visíveis ao mesmo tempo (${aberta} e ${id}) — ` +
              "a régua da pasta quebrou.",
          ).toBeNull();
          aberta = id;
        }
      }
      expect(
        aberta,
        "`?aba=xyz` deixou a ficha SEM nenhuma folha visível. A allowlist de " +
          "`ehAbaFicha` é o que impede isso: valor fora da lista tem de cair " +
          "no padrão da fase, nunca sumir com o conteúdo.",
      ).not.toBeNull();

      // 🔴 E o valor cru não chega ao DOM (mesma régua do `?foco=` do admin).
      await expect(page.locator("body")).not.toContainText("aba=xyz");

      // ── (b) A escolha EXPLÍCITA vence ─────────────────────────────────
      await page.goto(`${base!}?aba=croqui`);
      await expect(aba(page, "croqui")).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(
        await folhaVisivel(page, "croqui"),
        "`?aba=croqui` não abriu a folha do croqui. Provado por " +
          "`offsetParent`, não por `hidden`: com `keepMounted` as quatro " +
          "folhas estão no DOM e três têm de estar fora do fluxo.",
      ).toBe(true);

      // E as outras três estão ESCONDIDAS de verdade.
      for (const id of ABAS.filter((a) => a !== "croqui")) {
        expect(
          await folhaVisivel(page, id),
          `A folha "${id}" continua visível com \`?aba=croqui\`. Quatro ` +
            "folhas empilhadas é a ficha de ~1.000 px que a fatia 4 " +
            "desmontou — e é rolagem sobre o vazio no ancestral.",
        ).toBe(false);
      }

      // ── (c) O PADRÃO NÃO NASCE NA URL ─────────────────────────────────
      //
      // 🔴 `/clientes/<id>` limpo continua limpo. Escrever `?aba=preliminar`
      // só porque a fase é "prospecção" CONGELARIA num link compartilhado
      // uma fase que muda — a pessoa abriria o link meses depois, já
      // contratado, e cairia na folha errada. Mesma regra do `?vis=` em
      // `abas-painel.tsx`.
      await page.goto(base!);
      await page.waitForLoadState("networkidle");
      expect(
        page.url(),
        "A ficha limpa escreveu `?aba=` sozinha na URL. O padrão por fase " +
          "é decidido na leitura, nunca gravado no endereço.",
      ).not.toContain("aba=");

      // Qual das quatro é o padrão desta ficha — descoberto AGORA, pela aba
      // que a URL limpa deixou ativa. Não se prende à fase do cliente de QA
      // (ela muda com o uso), e é o que permite a volta abaixo.
      let abaPadrao: Aba | null = null;
      for (const id of ABAS) {
        if (
          (await aba(page, id).getAttribute("aria-selected")) === "true"
        ) {
          abaPadrao = id;
          break;
        }
      }
      expect(abaPadrao, "Nenhuma aba ativa na ficha limpa.").not.toBeNull();

      // 🔴 E a volta: clicar de novo NA folha padrão tem de LIMPAR a chave,
      // não reescrevê-la. `irParaAba` faz `sp.delete("aba")` quando o destino
      // é o padrão — sem isso, um passeio pelas abas deixaria o endereço
      // sujo e o link compartilhado voltaria a congelar a fase.
      const outra: Aba = abaPadrao === "fechamento" ? "dados" : "fechamento";
      await aba(page, outra).click();
      await expect(page).toHaveURL(new RegExp(`aba=${outra}`));

      await aba(page, abaPadrao!).click();
      await expect(aba(page, abaPadrao!)).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(
        page.url(),
        "Voltar à folha padrão manteve `?aba=` na URL — o link voltaria a " +
          "congelar a fase.",
      ).not.toContain("aba=");

      await registrarTela(page, info, `ficha-abas-url-${papel}`);
      console_.semErros();
    });

    // ─────────────────────────────────────────────────────────────────────
    // 2 · Contador em TODA aba — "recolhido não pode ser invisível"
    // ─────────────────────────────────────────────────────────────────────
    test("2 · as 4 abas carregam contador no rótulo", async ({ page }, info) => {
      const base = await abrir(page);
      test.skip(!base, "Cliente de teste não alcançável nesta conta.");
      await page.goto(`${base!}?aba=dados`);

      /**
       * 🔴 A TRAVA CENTRAL DA FATIA 4. Aba inativa É conteúdo escondido —
       * defeito que este portal já pagou 4 vezes (onboarding com 77
       * preenchidos, aba Tutoriais, Inventário, aba Sessões): a informação
       * existe, a pessoa não vê, e ninguém descobre porque a suíte só olha a
       * aba ativa. O contador é o que diz o que há dentro sem abrir.
       *
       * 🔑 É TEXTO, nunca cor sozinha (WCAG 1.4.1) — por isso a asserção é
       * sobre `innerText` do rótulo, e não sobre classe ou atributo.
       */
      for (const id of ABAS) {
        const rotulo = aba(page, id);
        await expect(
          rotulo,
          `A aba "${id}" sumiu da régua — a folha ficou sem porta de entrada.`,
        ).toBeVisible();

        const texto = (await rotulo.innerText()).trim();

        if (id === "dados") {
          // 🔑 O ÚNICO caso em que uma aba pode ficar sem badge: "Dados
          // básicos" de um cliente sem razão social. `contadorDados` devolve
          // `""` de propósito — "quantos campos" não diria nada, e o único
          // fato que o rótulo precisa carregar é que há uma PJ ali dentro.
          // Então: ou tem "PJ", ou tem só o rótulo. As duas passam.
          expect(
            /PJ/i.test(texto) || /dados b(á|a)sicos/i.test(texto),
            `A aba "dados" perdeu o rótulo: "${texto}".`,
          ).toBe(true);
        } else {
          expect(
            texto,
            `A aba "${id}" está SEM contador ("${texto}"). Aba inativa é ` +
              "conteúdo escondido: sem o badge, a pessoa não sabe que há " +
              "problema não marcado, croqui ausente ou minuta esperando.",
          ).toMatch(CONTADOR[id]);
        }
      }

      await registrarTela(page, info, `ficha-abas-contadores-${papel}`);
    });

    // ─────────────────────────────────────────────────────────────────────
    // 3 · 🔴 Trocar de aba NÃO vai ao servidor
    // ─────────────────────────────────────────────────────────────────────
    test("3 · 🔴 quatro trocas de aba = ZERO ida ao servidor", async ({
      page,
    }) => {
      const base = await abrir(page);
      test.skip(!base, "Cliente de teste não alcançável nesta conta.");
      await page.goto(`${base!}?aba=dados`);
      await page.waitForLoadState("networkidle");

      /**
       * 🔴 POR QUE ISTO É O TESTE MAIS IMPORTANTE DESTE ARQUIVO.
       *
       * `ficha-abas.tsx` escreve `?aba=` por `history.replaceState`, não por
       * `router.replace`. Com `router.replace`, o App Router re-executaria o
       * Server Component — e a ficha carrega `getClienteById`,
       * `getMinutasDoCliente`, `getCroquisDoCliente`,
       * `getDecisoresPendentes`, `getEntrevistasDoCliente` e
       * `getMinutaContextoObrigatorio`. Seis consultas por clique de aba, na
       * tela mais aberta do produto.
       *
       * 🔑 E a armadilha irmã, conferida hook a hook pela fatia 4: **hook
       * com cara de local escondendo query**. Esta casa já teve um
       * `useUsuarioAtual()` numa folha que desmontava por aba, custando um
       * `SELECT` por clique, com "zero query" relatado e a suíte verde
       * (a rede estava mockada). Aqui a rede é REAL: se alguma folha, ou
       * algum componente que ela monta, passar a buscar algo próprio, este
       * contador acusa.
       *
       * 🔴 Se este teste ficar vermelho, é `replaceState` virando navegação
       * — **reporte, não afrouxe o filtro.**
       */
      const espiao = contarIdasAoServidor(page);

      const percurso: Aba[] = ["preliminar", "croqui", "fechamento", "dados"];
      for (const destino of percurso) {
        await aba(page, destino).click();
        await expect(aba(page, destino)).toHaveAttribute(
          "aria-selected",
          "true",
        );
        expect(
          await folhaVisivel(page, destino),
          `Clicar em "${destino}" não abriu a folha.`,
        ).toBe(true);
      }

      // Uma janela curta depois do último clique: o RSC payload não sai no
      // mesmo tick. Sem esta espera, o teste passaria por chegar cedo demais.
      await page.waitForTimeout(1_500);
      espiao.parar();

      expect(
        espiao.lista,
        "Trocar de aba foi ao SERVIDOR. `?aba=` tem de ser escrito por " +
          "`history.replaceState` (ver o cabeçalho de `ficha-abas.tsx`). " +
          "Requisições capturadas durante as 4 trocas:\n" +
          espiao.lista.map((l) => `  • ${l}`).join("\n"),
      ).toEqual([]);
    });

    // ─────────────────────────────────────────────────────────────────────
    // 4 · Alteração não salva atravessa a troca de folha — e a barra NOMEIA
    // ─────────────────────────────────────────────────────────────────────
    test("4 · alterar na aba 2 e ir para a 4: a barra nomeia a folha, e o reload descarta", async ({
      page,
    }, info) => {
      const base = await abrir(page);
      test.skip(!base, "Cliente de teste não alcançável nesta conta.");
      await page.goto(`${base!}?aba=preliminar`);

      /**
       * 🔴 DUAS COISAS SE PROVAM AQUI, E AS DUAS SÓ EM NAVEGADOR:
       *
       * (a) O estado SOBREVIVE à troca de folha. Todos os `useState` moram no
       *     `ClienteFicha`, acima das abas, justamente porque `TabsPanel`
       *     desmonta o painel inativo por padrão. Se alguém "simplificar"
       *     descendo o estado para a folha, o que a pessoa digitou morre na
       *     troca e o "Salvar ficha" grava o valor do servidor por cima —
       *     em silêncio, com o `tsc` limpo.
       *
       * (b) A barra NOMEIA a folha. Com quatro folhas, "você tem alterações
       *     não salvas nesta ficha" não diz ONDE: a pessoa altera o registro,
       *     vai ao Fechamento e teria de abrir as quatro para achar.
       *
       * ⚠️ NADA É SALVO. O texto vive em `useState`; `reload` descarta sem
       * ter tocado o servidor. Nenhum clique em "Salvar ficha" neste teste.
       */
      const registro = page.locator("#f-reg");
      await expect(registro).toBeVisible({ timeout: 12_000 });

      // 🔑 `#f-reg` nasce DESABILITADO enquanto `cliente.telefone` é nulo
      // ("Salve o telefone e este campo abre"). Sem telefone, este caso não
      // tem como ser exercitado — e pular com a razão escrita é melhor que
      // um verde vazio.
      const habilitado = await registro.isEnabled();
      test.skip(
        !habilitado,
        'O campo "Registro do contato" está desabilitado: o CLIENTE DE ' +
          "TESTE (QA) está sem telefone (`fichaNova`). Preencha o telefone " +
          "dele uma vez para destravar este caso.",
      );

      const original = await registro.inputValue();
      const marca = `${original}\nQA ${Date.now()}`;

      await registro.fill(marca);
      // Tira o foco: a comparação roda no render, mas um `blur` explícito
      // aproxima o teste do gesto real (a pessoa digita e clica em outra aba).
      await registro.blur();

      // ── A marca aparece NA ABA 2, antes de sair dela ───────────────────
      //
      // 🔴 Ponto + `sr-only`, nunca cor sozinha (WCAG 1.4.1). A asserção é
      // sobre o TEXTO acessível, que é o que sobrevive a grayscale.
      await expect(
        aba(page, "preliminar"),
        "A aba alterada não ganhou a marca de pendência. A barra fica no " +
          "rodapé e a régua no topo: sem a marca, quem rolou não vê nenhuma " +
          "das duas.",
      ).toContainText(/altera(ç|c)(õ|o)es n(ã|a)o salvas/i);

      // ── Vai para a folha 4 ─────────────────────────────────────────────
      await aba(page, "fechamento").click();
      await expect(aba(page, "fechamento")).toHaveAttribute(
        "aria-selected",
        "true",
      );

      // ── A barra NOMEIA a folha 2, estando a 4 aberta ───────────────────
      await expect(
        page.getByText(/alterações não salvas em Reunião preliminar/i).first(),
        "A barra não nomeia a folha. Com 4 folhas, 'alterações não salvas " +
          "nesta ficha' obriga a pessoa a abrir as quatro para achar o que " +
          "mudou — é o defeito que `frasePendenciaDaFicha` existe para " +
          "fechar.",
      ).toBeVisible({ timeout: 12_000 });

      // E a marca continua na aba 2, vista de fora dela.
      await expect(aba(page, "preliminar")).toContainText(
        /altera(ç|c)(õ|o)es n(ã|a)o salvas/i,
      );

      await registrarTela(page, info, `ficha-abas-pendencia-${papel}`);

      // ── 🔴 O RELOAD DESCARTA: NADA FOI GRAVADO ─────────────────────────
      //
      // A prova de que este teste não escreveu em produção. O estado era
      // local; recarregando, o valor volta a ser o do SERVIDOR.
      await page.reload();
      await page.goto(`${base!}?aba=preliminar`);
      await expect(
        page.locator("#f-reg"),
        "Depois do reload o campo NÃO voltou ao valor do servidor — algo " +
          "gravou. Este teste não pode escrever em produção.",
      ).toHaveValue(original);

      // E a barra volta a dizer que está tudo salvo.
      await expect(page.getByText(/tudo salvo/i).first()).toBeVisible({
        timeout: 12_000,
      });
    });

    // ─────────────────────────────────────────────────────────────────────
    // 5 · 🔴 A pendência PUXA a folha — e nada é gravado
    // ─────────────────────────────────────────────────────────────────────
    test("5 · 🔴 limpar o telefone e salvar da aba 4: puxa para dados, foca #f-tel, ZERO escrita", async ({
      page,
    }, info) => {
      const base = await abrir(page);
      test.skip(!base, "Cliente de teste não alcançável nesta conta.");

      /**
       * ════════════════════════════════════════════════════════════════
       * 🔴 POR QUE ESTE TESTE PODE CLICAR EM "SALVAR FICHA" EM PRODUÇÃO
       * ════════════════════════════════════════════════════════════════
       *
       * Conferido lendo `salvar()` em `cliente-ficha.tsx` — não presumido:
       *
       *   function salvar() {
       *     setTentouSalvar(true);
       *     setErroSalvar(null);
       *     if (faltaEssencial) {          // ← nome OU telefone vazio
       *       setErroSalvar(...);
       *       puxarParaCampo("dados", ...);
       *       return;                      // ← 🔴 RETORNA AQUI
       *     }
       *     ...
       *     startTransition(async () => {  // ← a action vive DAQUI para baixo
       *       const res = await atualizarCliente(...);
       *
       * O `return` da guarda acontece ANTES do `startTransition` que chama
       * `atualizarCliente`. Com o telefone vazio, **nenhuma action é
       * invocada** e nada chega ao banco.
       *
       * 🔑 E o teste NÃO acredita nessa leitura. Ele prova duas vezes, de
       * formas independentes:
       *   (1) conta os POSTs durante o clique → tem de ser 0;
       *   (2) recarrega e lê o telefone → tem de estar intacto.
       * "Eu li o código e ele retorna cedo" é exatamente o tipo de
       * afirmação que esta casa já viu falhar com a suíte verde.
       */

      // Guarda o telefone REAL para conferir depois (e para saber que havia um).
      await page.goto(`${base!}?aba=dados`);
      const tel = page.locator("#f-tel");
      await expect(tel).toBeVisible({ timeout: 12_000 });
      const telefoneOriginal = await tel.inputValue();
      test.skip(
        telefoneOriginal.trim() === "",
        "O CLIENTE DE TESTE (QA) já está sem telefone — este caso precisa de " +
          "um valor para limpar, e o teste não preenche telefone em produção.",
      );

      // Limpa o telefone (só no estado local) e vai para a folha 4.
      await tel.fill("");
      await aba(page, "fechamento").click();
      await expect(aba(page, "fechamento")).toHaveAttribute(
        "aria-selected",
        "true",
      );

      // A barra já avisa, nomeando a folha, ANTES de qualquer clique.
      await expect(
        page.getByText(/preencha o nome e o telefone em dados b(á|a)sicos/i).first(),
        "Com o telefone vazio a barra tem de dizer o que falta E onde. Um " +
          "botão que recusa sem dizer a folha é o defeito que a fatia 4 " +
          "existe para não criar.",
      ).toBeVisible({ timeout: 12_000 });

      // ── O clique, com o contador de escrita ligado ─────────────────────
      const escritas: string[] = [];
      const ouvinte = (r: import("@playwright/test").Request) => {
        // Server Action do Next é POST para a própria URL da página.
        if (r.method() === "POST") escritas.push(`${r.method()} ${r.url()}`);
      };
      page.on("request", ouvinte);

      await page.getByRole("button", { name: /^salvar ficha$/i }).click();

      // ── (a) A ficha PUXA a pessoa para a folha 1 ───────────────────────
      await expect(
        aba(page, "dados"),
        "Salvar com pendência não trouxe a pessoa para 'Dados básicos'. " +
          "Motivo numa folha e campo em outra é o botão morto que a barra " +
          "deixou de ser.",
      ).toHaveAttribute("aria-selected", "true", { timeout: 12_000 });
      await expect(page).toHaveURL(/aba=dados/);

      // ── (b) O FOCO cai no campo que barra ──────────────────────────────
      //
      // 🔑 `requestAnimationFrame` em `puxarParaCampo`: com `keepMounted` o
      // campo já está no DOM, mas focar antes do render da troca deixaria o
      // foco num nó com `hidden` — o navegador ignora e o cursor some. Só
      // navegador de verdade prova que o frame extra resolveu.
      await expect(
        page.locator("#f-tel"),
        "O foco não foi para `#f-tel`. Sem isso a pessoa cai numa folha de " +
          "7 campos sem saber qual deles é o problema.",
      ).toBeFocused({ timeout: 12_000 });

      // ── (c) O alerta, em PORTUGUÊS e sem jargão de banco ───────────────
      const alerta = page.locator('p[role="alert"]').filter({
        hasText: /preencha o nome e o telefone/i,
      });
      await expect(
        alerta.first(),
        "A recusa tem de ser um `role=\"alert\"` — ela interrompe, e não " +
          "some sozinha em 4 segundos como um toast.",
      ).toBeVisible({ timeout: 12_000 });

      const textoAlerta = (await alerta.first().textContent()) ?? "";
      expect(textoAlerta).toMatch(/dados b(á|a)sicos/i);
      // Quem lê é o parceiro: nenhum nome de constraint, tabela ou coluna.
      for (const jargao of [
        "chk_",
        "constraint",
        "etapa1_clientes",
        "violates",
        "23514",
        "null value",
      ]) {
        expect(
          textoAlerta.toLowerCase(),
          `O alerta vazou jargão de banco ("${jargao}") para o usuário.`,
        ).not.toContain(jargao.toLowerCase());
      }

      // Uma janela para um POST tardio aparecer, se houvesse.
      await page.waitForTimeout(1_500);
      page.off("request", ouvinte);

      // ── (d) 🔴 PROVA 1: nenhum POST saiu ───────────────────────────────
      expect(
        escritas,
        "Clicar em Salvar com o telefone vazio DISPAROU escrita. A guarda " +
          "`faltaEssencial` em `salvar()` tem de retornar ANTES do " +
          "`startTransition` que chama `atualizarCliente`. Requisições:\n" +
          escritas.map((e) => `  • ${e}`).join("\n"),
      ).toEqual([]);

      await registrarTela(page, info, `ficha-abas-pendencia-puxa-${papel}`);

      // ── (e) 🔴 PROVA 2: o telefone está intacto no servidor ────────────
      await page.goto(`${base!}?aba=dados`);
      await expect(
        page.locator("#f-tel"),
        "O telefone do cliente de teste MUDOU no servidor. A guarda deveria " +
          "ter recusado antes de qualquer action — isto é escrita em " +
          "produção, e o teste a provocou.",
      ).toHaveValue(telefoneOriginal, { timeout: 12_000 });
    });

    // ─────────────────────────────────────────────────────────────────────
    // 6a · Aba Croqui
    // ─────────────────────────────────────────────────────────────────────
    test("6a · Croqui: vazio diz 'Nenhum croqui' com o formulário à vista; com versões, 'Versão N de M'", async ({
      page,
    }, info) => {
      const base = await abrir(page);
      test.skip(!base, "Cliente de teste não alcançável nesta conta.");
      await page.goto(`${base!}?aba=croqui`);

      expect(await folhaVisivel(page, "croqui")).toBe(true);

      const vazio = page.getByText(/nenhum croqui enviado ainda/i);
      const temVazio = await vazio
        .first()
        .isVisible()
        .catch(() => false);

      if (temVazio) {
        /**
         * 🔴 ESTADO VAZIO COM SAÍDA. "Nenhum croqui" sem o formulário à
         * vista seria um beco: a pessoa lê que não há nada e não tem como
         * criar o primeiro. É a classe de defeito "a feature existe, a porta
         * de entrada some" — 3 casos nesta casa.
         */
        await expect(
          page.getByRole("button", { name: /escolher arquivo/i }),
          "A aba Croqui está vazia e NÃO oferece o envio. Estado vazio sem " +
            "saída é beco sem saída.",
        ).toBeVisible();

        // O contador do rótulo concorda com o corpo da folha.
        await expect(aba(page, "croqui")).toContainText(/nenhum croqui/i);
      } else {
        // Com croqui: "Versão N de M", derivado do índice na leitura.
        await expect(
          page.getByText(/vers(ã|a)o \d+ de \d+/i).first(),
          "Há croqui e a folha não diz 'Versão N de M'. É o que separa a " +
            "folha vigente das anteriores.",
        ).toBeVisible();

        // E o rótulo carrega a contagem.
        await expect(aba(page, "croqui")).toContainText(/\d+\s+vers(ã|õ)/i);

        // Com versões, o botão muda de rótulo — a porta continua existindo.
        await expect(
          page.getByRole("button", { name: /enviar nova vers(ã|a)o/i }),
        ).toBeVisible();
      }

      // ⚠️ NENHUM UPLOAD. O `<input type="file">` não recebe arquivo neste
      // arquivo inteiro: subir um PDF em produção deixaria objeto no Storage
      // e linha no banco, e nada disso sai com um reload.

      await registrarTela(page, info, `ficha-abas-croqui-${papel}`);
    });

    // ─────────────────────────────────────────────────────────────────────
    // 6b · Aba Fechamento + 🔴 A ROTA INLINE EM PRODUÇÃO
    // ─────────────────────────────────────────────────────────────────────
    test("6b · Fechamento: 'Pré-visualizar' ao lado de 'Baixar', o iframe SEM sandbox, e o visor nativo pintando o PDF", async ({
      page,
    }, info) => {
      const base = await abrir(page);
      test.skip(!base, "Cliente de teste não alcançável nesta conta.");
      await page.goto(`${base!}?aba=fechamento`);

      expect(await folhaVisivel(page, "fechamento")).toBe(true);

      // ── Há documento? (contrato anexado ou minuta) ─────────────────────
      const previsualizar = page.getByRole("button", {
        name: /pr(é|e)-visualizar/i,
      });
      const quantos = await previsualizar.count();

      /**
       * 🔴 `test.skip` COM A RAZÃO ESCRITA, NUNCA `test.fixme` SILENCIOSO.
       *
       * Este é o ÚNICO teste que prova a rota inline
       * (`/clientes/<id>/documento/<tipo>/<id>`) em produção. Sem documento
       * no cliente de QA, ele não tem o que exercitar — e um verde vazio
       * aqui significaria que a rota poderia estar devolvendo 404, 415, ou
       * um `Content-Type` errado, com a suíte inteira verde.
       */
      test.skip(
        quantos === 0,
        "🔴 A ROTA INLINE FICOU SEM PROVA NESTA RODADA. O CLIENTE DE TESTE " +
          "(QA) não tem contrato assinado nem minuta anexada, então não há " +
          'botão "Pré-visualizar" para clicar. Este é o ÚNICO teste que ' +
          "exercita `/clientes/<id>/documento/<tipo>/<id>` em produção " +
          "(200 + application/pdf + X-Frame-Options + CSP). Para cobrir: " +
          "anexe UMA minuta em PDF na ficha do cliente de QA e rode de novo.",
      );

      // ── "Pré-visualizar" convive com "Baixar" ──────────────────────────
      //
      // 🔑 A pré-visualização NÃO substitui o download: o iframe que recebe
      // 404/413/415 não expõe o corpo ao React (é outro documento), então a
      // pessoa precisa das duas saídas. Tirar "Baixar" deixaria quem caiu no
      // erro sem nada.
      await expect(
        page.getByRole("button", { name: /baixar/i }).first(),
        '"Pré-visualizar" apareceu e "Baixar" sumiu. O visor pode falhar ' +
          "(404/415) sem conseguir dizer por quê — o download é a saída.",
      ).toBeVisible();

      // ── O clique abre UM iframe, e ele NÃO pode ter `sandbox` ──────────
      //
      // 🔴 UM, não N. `VisorDocumento` nunca é montado no render da lista:
      // cada iframe vivo é um download de até 5 MB pela rota (`no-store`,
      // sem cache). Um por linha custaria N × 5 MB no simples abrir da aba.
      //
      // 🔴 E SEM `sandbox`. A versão anterior deste teste cobrava
      // `iframe[sandbox=""]` — e cobrava o DEFEITO. Medido em Chrome 154
      // (24/09/2026): com o atributo (inclusive `sandbox="allow-scripts"`) o
      // Chrome RECUSA carregar o próprio visor de PDF e o frame filho vira
      // `chrome-error://chromewebdata/` — a pré-visualização fica branca com
      // a suíte verde, porque "1 iframe no DOM" nunca provou que pintou. Sem
      // o atributo, o frame filho é
      // `chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html`.
      // O isolamento não sumiu, mudou de lugar: vem da RESPOSTA da rota
      // (`CSP: sandbox; frame-ancestors 'self'`, magic bytes + `nosniff`) e
      // da origem `chrome-extension://` em que o viewer roda.
      await previsualizar.first().click();

      const visor = page.locator("iframe");
      await expect(
        visor,
        "O clique em Pré-visualizar não abriu o `<iframe>` do visor.",
      ).toHaveCount(1, { timeout: 15_000 });

      await expect(
        visor,
        "🔴 O `<iframe>` do visor VOLTOU a ter o atributo `sandbox`. Com " +
          "ele, o Chrome bloqueia o visor de PDF (o frame filho vira " +
          "`chrome-error://chromewebdata/`) e a pré-visualização não pinta " +
          "nada. Medido em Chrome 154 — não reintroduzir sem medir de novo " +
          "em navegador REAL: o headless shell não tem viewer de PDF e não " +
          "reproduz o defeito. O isolamento vem da resposta da rota.",
      ).not.toHaveAttribute("sandbox", /[\s\S]*/);

      const src = await visor.getAttribute("src");
      expect(
        src,
        "O iframe nasceu sem `src`. O `src` só existe depois do clique — " +
          "mas depois do clique ele tem de existir.",
      ).toBeTruthy();
      expect(
        src!,
        "O `src` não aponta para a rota de documento deste cliente.",
      ).toMatch(/\/clientes\/[0-9a-f-]{36}\/documento\/(contrato|minuta|croqui)\//i);

      /**
       * ════════════════════════════════════════════════════════════════
       * 🔴 A PROVA DA ROTA — a resposta de verdade, em produção
       * ════════════════════════════════════════════════════════════════
       *
       * O iframe carregar não prova nada: um 404 em `text/plain` também
       * "carrega". O que se cobra são os fatos que fazem a rota ser segura e
       * útil ao mesmo tempo:
       *
       *   · **200** — o documento existe e a guarda deixou passar (a RLS
       *     decide; o interruptor `documento_inline_ativo` pode derrubar
       *     para 404 sem deploy, e aí este teste acusa);
       *   · **`application/pdf`** — vindo do MAGIC BYTE, não do metadado do
       *     Storage (que é declaração do cliente);
       *   · **`x-frame-options: SAMEORIGIN`** — antes a rota herdava o
       *     `DENY` do bloco geral do `next.config.ts` e NENHUM navegador
       *     emoldurava o documento: tela branca em toda máquina. `SAMEORIGIN`
       *     mantém a proteção contra clickjacking de terceiro E deixa a nossa
       *     própria ficha emoldurar;
       *   · **`content-security-policy: sandbox; frame-ancestors 'self'`** —
       *     a rede de segurança para o dia em que a detecção de tipo errar
       *     (PDF pode conter JavaScript), mais o par moderno do XFO.
       *
       * 🔑 `page.request` compartilha os cookies do contexto do navegador,
       * então a requisição vai AUTENTICADA, como a do iframe.
       */
      const resposta = await page.request.get(new URL(src!, page.url()).toString());

      expect(
        resposta.status(),
        `A rota inline devolveu ${resposta.status()} para um documento que a ` +
          "tela oferece. 404 aqui costuma ser o interruptor " +
          "`documento_inline_ativo` desligado, ou a RLS recusando.",
      ).toBe(200);

      const cabecalhos = resposta.headers();
      expect(
        cabecalhos["content-type"] ?? "",
        "O `Content-Type` não é `application/pdf`. Ele sai do MAGIC BYTE " +
          "(`detectarTipoPorMagicBytes`), não do metadado do Storage.",
      ).toContain("application/pdf");

      // ── XFO: asserção DURA ─────────────────────────────────────────────
      //
      // 🔑 O `X-Frame-Options` desta rota é escrito no `next.config.ts`
      // (`source: "/clientes/:clienteId/documento/:tipo/:id"`), que SUBSTITUI
      // por chave o header do bloco geral. Se alguém apagar aquela entrada, o
      // `DENY` volta e o visor morre em TODA máquina — por isso aqui é falha,
      // não aviso.
      expect(
        (cabecalhos["x-frame-options"] ?? "").toUpperCase(),
        "🔴 A rota perdeu o `X-Frame-Options: SAMEORIGIN`. Com o `DENY` do " +
          "bloco geral, nenhum navegador emoldura o documento e a " +
          "pré-visualização fica branca — foi exatamente este o defeito de " +
          "24/09/2026. A regra vive em `next.config.ts`, na entrada " +
          "`/clientes/:clienteId/documento/:tipo/:id`.",
      ).toBe("SAMEORIGIN");

      /**
       * ⚠️ A CSP É AVISO, NÃO FALHA — e o motivo está medido.
       *
       * Em produção o **LiteSpeed da Hostinger sobrescreve o
       * `Content-Security-Policy`** do Next: `/p/plantao` responde
       * `upgrade-insecure-requests` e o `frame-ancestors` do `next.config.ts`
       * não chega ao cliente (war-room de 09/09/2026, registrado no
       * `CLAUDE.md`). Cobrar a CSP como asserção dura deixaria este teste
       * VERMELHO por uma configuração de hPanel que não está no repo — e
       * vermelho que não se corrige por código ensina a ignorar vermelho.
       *
       * 🔑 O que NÃO é aviso: o `X-Frame-Options` acima. Ele passa pelo
       * LiteSpeed (conferido por curl em 24/09) e é o que de fato sustenta o
       * emolduramento — a trava dura fica nele, onde ela funciona.
       */
      const csp = cabecalhos["content-security-policy"] ?? "";
      const cspCompleta =
        csp.includes("sandbox") && csp.includes("frame-ancestors 'self'");
      if (!cspCompleta) {
        info.annotations.push({
          type: "aviso",
          description:
            "⚠️ A CSP da rota de documento não veio completa: esperava " +
            "`sandbox` + `frame-ancestors 'self'`, chegou " +
            `\`${csp || "(ausente)"}\`. Em produção o LiteSpeed da Hostinger ` +
            "sobrescreve o header do Next (mesmo sintoma de `/p/plantao`), " +
            "então isto é AVISO e não falha — a proteção efetiva está no " +
            "`X-Frame-Options`, que é asserção dura logo acima. Se este " +
            "valor vier de um ambiente SEM LiteSpeed, é defeito de verdade: " +
            "confira `next.config.ts`.",
        });
      }

      // Reforços que a rota promete e que não custam outra requisição.
      expect(cabecalhos["x-content-type-options"] ?? "").toContain("nosniff");
      expect(
        cabecalhos["cache-control"] ?? "",
        "Documento de terceiro não pode entrar em cache de disco nem de proxy.",
      ).toContain("no-store");

      /**
       * ════════════════════════════════════════════════════════════════
       * 🔴 A PROVA DA JUNÇÃO — o PDF PINTOU, não "existe um iframe"
       * ════════════════════════════════════════════════════════════════
       *
       * Achado do orquestrador (24/09/2026): **"1 iframe no DOM" não prova
       * que pintou.** Foi assim que o `sandbox=""` sobreviveu a uma suíte
       * verde — o elemento estava lá, com o `src` certo, e o conteúdo era
       * `chrome-error://chromewebdata/`.
       *
       * A junção se prova pelo FRAME FILHO:
       *   · visor nativo do Chrome ⇒ `chrome-extension://…/index.html`;
       *   · bloqueado ⇒ `chrome-error://chromewebdata/`;
       *   · navegador sem visor de PDF (o headless shell do Playwright, que
       *     ABORTA o request do PDF) ⇒ nenhum frame filho, ou `about:blank`.
       *
       * 🔑 O terceiro caso **PULA com a razão escrita**, nunca passa vazio:
       * o `chromium` dos projetos `desktop`/`celular` é o headless shell, que
       * não embarca o viewer. Passar vazio aqui seria repetir o defeito que
       * este bloco existe para pegar.
       */
      const urlDoFrameFilho = async (): Promise<string> => {
        // 1º caminho: a lista de frames da página. O viewer do Chrome às
        // vezes aparece aqui antes de `contentFrame()` resolver.
        const daLista = page
          .frames()
          .map((f) => f.url())
          .find((u) => u.startsWith("chrome-extension://"));
        if (daLista) return daLista;

        // 2º caminho: o frame do próprio elemento.
        const elemento = await visor.elementHandle();
        const filho = await elemento?.contentFrame();
        return filho?.url() ?? "";
      };

      let urlDoFrame = "";
      const limite = Date.now() + 15_000;
      while (Date.now() < limite) {
        urlDoFrame = await urlDoFrameFilho();
        if (
          urlDoFrame.startsWith("chrome-extension://") ||
          urlDoFrame.startsWith("chrome-error://")
        ) {
          break;
        }
        await page.waitForTimeout(500);
      }

      const semViewer =
        urlDoFrame === "" ||
        urlDoFrame === "about:blank" ||
        urlDoFrame.startsWith("chrome-error://");

      test.skip(
        semViewer,
        "⚠️ PROVA DO VISOR EXIGE CHROME REAL — e este navegador não é um. O " +
          "frame filho veio `" +
          (urlDoFrame || "(nenhum)") +
          "`. O `chromium` que os projetos `desktop`/`celular` usam é o " +
          "headless shell: ele NÃO embarca o visor de PDF e ABORTA o request, " +
          "então a junção não tem como ser observada aqui.\n" +
          "Para cobrir, com o Chrome instalado na máquina, UM comando:\n" +
          "    E2E_CHROME=1 npx playwright test e2e/ficha-abas.spec.ts " +
          "--project=chrome\n" +
          "O projeto `chrome` (channel chrome, `headless: false`) já está " +
          "declarado em `playwright.config.ts`, atrás da variável " +
          "`E2E_CHROME` — não é preciso editar o config à mão.\n" +
          "⚠️ Ele é GATEADO de propósito: `npm run e2e` é um " +
          "`playwright test` sem `--project`, então todo projeto " +
          "declarado roda — um `headless: false` fixo abriria janela em " +
          "toda execução.\n" +
          "🔑 O resto deste teste (200, `application/pdf`, `X-Frame-Options`, " +
          "ausência de `sandbox`, `src`) JÁ RODOU e passou. O que fica sem " +
          "prova é só a junção: que o PDF pinta de verdade.",
      );

      expect(
        urlDoFrame,
        "🔴 O `<iframe>` não carregou o visor de PDF do Chrome. Frame filho " +
          "em `chrome-error://` é o sintoma EXATO do `sandbox` de volta no " +
          "iframe, ou do `X-Frame-Options: DENY` herdado do bloco geral do " +
          "`next.config.ts`. A tela está BRANCA para o operador, com o " +
          "elemento presente no DOM e a suíte capaz de ficar verde sem esta " +
          "asserção.",
      ).toMatch(/^chrome-extension:\/\//);

      await registrarTela(page, info, `ficha-abas-visor-${papel}`);

      // Fecha o visor: deixar o iframe vivo carregaria o próximo teste com
      // um download de até 5 MB pendurado.
      await page.getByRole("button", { name: /^fechar$/i }).first().click();
      await expect(page.locator("iframe")).toHaveCount(0);
    });

    // ─────────────────────────────────────────────────────────────────────
    // 7 · A RÉGUA DA CASA, nas 4 folhas
    // ─────────────────────────────────────────────────────────────────────
    test("7 · as 4 folhas herdam a régua: contraste, 0 rolagem lateral, alvos ≥24px, console limpo", async ({
      page,
    }, info) => {
      const console_ = vigiarConsole(page);
      const base = await abrir(page);
      test.skip(!base, "Cliente de teste não alcançável nesta conta.");

      /**
       * 🔴 POR QUE AS QUATRO, E NÃO SÓ A QUE ABRE.
       *
       * A rolagem horizontal da ficha foi MEDIDA em 390 px e era de 145 px:
       * os quatro rótulos com badge somavam 535 px, o `Tabs` cresceu para
       * 535 (filho de `grid`, cuja `min-width` padrão é `auto`), o
       * `max-w-full` da `TabsList` virou "535 px" e quem rolava era o
       * `<body>`. Em 1366 não havia sintoma nenhum. Só a medição NO TAMANHO
       * ALVO pega isto — e cada folha tem conteúdo diferente, então cada uma
       * pode estourar por conta própria.
       *
       * ⚠️ `alvosDeClique` rola a página até o fim antes de medir: elemento
       * abaixo da dobra pode não ter layout estável, e um teste que acha o
       * defeito 1 vez em 3 ensina a ignorar o vermelho.
       */
      for (const id of ABAS) {
        await page.goto(`${base!}?aba=${id}`);
        await expect(aba(page, id)).toHaveAttribute("aria-selected", "true", {
          timeout: 12_000,
        });

        /**
         * 🔴 A FOLHA ABERTA TEM DE ESTAR À VISTA NA RÉGUA (achado do João,
         * 24/09, it. 2). Em 390/412 px a faixa de abas transborda (~607 px
         * para ~334 de janela) e rola por dentro; sem `rolarAbaAtivaParaDentro`
         * (`ficha-abas-estado.ts`, ligada pelo `useEffect` de `ficha-abas.tsx`)
         * a aba "Fechamento da Holding" nascia fora da janela e a pessoa não
         * via etiqueta nenhuma selecionada. Esta asserção é a única prova no
         * repositório dessa junção helper → ref → DOM: `boundingBox()` da aba
         * ativa contido no da `tablist` (1 px de tolerância). No `desktop` a
         * faixa não rola e isto prova o ramo `null` (nada se move).
         */
        await expect
          .poll(
            async () => {
              const faixa = await page.getByRole("tablist").first().boundingBox();
              const ativa = await aba(page, id).boundingBox();
              if (!faixa || !ativa) return "sem caixa";
              const dentro =
                ativa.x >= faixa.x - 1 &&
                ativa.x + ativa.width <= faixa.x + faixa.width + 1;
              return dentro
                ? "dentro"
                : `fora: aba ${Math.round(ativa.x)}..${Math.round(ativa.x + ativa.width)} × faixa ${Math.round(faixa.x)}..${Math.round(faixa.x + faixa.width)}`;
            },
            {
              message: `folha "${id}" (${papel}): a aba ativa tem de estar dentro da faixa — rolarAbaAtivaParaDentro não agiu`,
              timeout: 5_000,
            },
          )
          .toBe("dentro");

        await semRolagemHorizontal(page);
        await contrasteAprovado(page, `ficha · folha "${id}" (${papel})`);
        await alvosDeClique(page);
      }

      await registrarTela(page, info, `ficha-abas-regua-${papel}`);

      /**
       * 🔑 O console é lido DEPOIS das quatro folhas. Erro aqui costuma ser
       * hidratação — e hidratação quebrada numa aba inativa não aparece na
       * tela, só no console.
       */
      console_.semErros();
    });

    // ─────────────────────────────────────────────────────────────────────
    // 8 · ARIA: a pasta é uma pasta de verdade
    // ─────────────────────────────────────────────────────────────────────
    test("8 · as 4 abas completam o par tab ↔ tabpanel", async ({ page }) => {
      const base = await abrir(page);
      test.skip(!base, "Cliente de teste não alcançável nesta conta.");

      for (const id of ABAS) {
        await page.goto(`${base!}?aba=${id}`);
        const rotulo = aba(page, id);
        await expect(rotulo).toHaveAttribute("aria-selected", "true", {
          timeout: 12_000,
        });

        // 🔑 `aria-controls` apontando para um id que não existe é ARIA
        // quebrado — passa despercebido sem um teste que amarre os dois lados.
        const idPainel = await rotulo.getAttribute("aria-controls");
        expect(idPainel, `A aba "${id}" não declara \`aria-controls\`.`).toBeTruthy();

        const painel = page.locator(`#${CSS.escape(idPainel!)}`);
        await expect(painel).toHaveAttribute("role", "tabpanel");

        const idAba = await rotulo.getAttribute("id");
        await expect(painel).toHaveAttribute("aria-labelledby", idAba!);
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// O PARCEIRO — `/clientes/<id>`
// ═══════════════════════════════════════════════════════════════════════════
suiteDaFicha({
  papel: "parceiro",
  credencial: parceiro,
  abrir: async (page) => {
    await entrar(page, parceiro!, "/clientes");
    return abrirFichaDeTeste(page, "/clientes");
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// O ADMIN — `/admin/aluno/<alunoId>/clientes/<id>` (o ESPELHO)
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 O espelho não pode ficar para trás da tela do parceiro (pedido do
// Marcio, 23/09/2026). `espelho-admin.spec.ts` prova ESTATICAMENTE que as
// props batem — comparando os dois arquivos, sem navegador. Isso é forte
// contra "a página do admin esqueceu de passar `croquis`", e cego para tudo
// que só existe pintado: a régua das abas, o `hidden` das folhas, o contraste
// no DOM composto, a rolagem a 390 px.
//
// 🔑 COMO CHEGAR LÁ SEM `QA_ALUNO_ID`: `/admin/clientes` é a lista
// consolidada (todos os ambientes) e cada linha leva ao ambiente do parceiro
// pelo nome dele; de lá, `/admin/aluno/<id>/clientes` monta o MESMO
// `ClientesManager` do parceiro (com `basePath` prefixado), então a busca por
// nome e o link da ficha funcionam igual. Assim o teste não depende de um id
// guardado à mão, que envelheceria em silêncio.
suiteDaFicha({
  papel: "admin",
  credencial: admin,
  abrir: async (page) => {
    await entrar(page, admin!, "/admin/clientes");

    // Acha o CLIENTE DE TESTE na lista consolidada e entra no ambiente do
    // parceiro dono dele — a linha carrega o nome do cliente E o link do
    // parceiro, então a âncora continua sendo o nome do cliente de teste.
    await page.goto(`/admin/clientes?q=${encodeURIComponent(BUSCA)}`);
    const linha = page
      .getByRole("row")
      .filter({ hasText: CLIENTE_DE_TESTE })
      .first();
    const achou = await linha
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!achou) return null;

    const doAmbiente = linha.getByRole("link").first();
    const href = await doAmbiente.getAttribute("href");
    if (!href?.startsWith("/admin/aluno/")) return null;

    // Dentro do ambiente, a lista de clientes do parceiro — mesma tela, mesmo
    // helper, mesma dupla conferência do nome.
    return abrirFichaDeTeste(page, `${href}/clientes`);
  },
});
