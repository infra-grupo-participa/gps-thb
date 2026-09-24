import { test, expect } from "@playwright/test";
import {
  exigeLogin,
  exigeAdmin,
  entrar,
  semRolagemHorizontal,
  contrasteAprovado,
  alvosDeClique,
  vigiarConsole,
  registrarTela,
} from "./apoio";

/**
 * Entrevista Prévia 2.0 — o formulário guiado que gera o DISC sozinho.
 *
 * Regras do Marcio (23/09) que estes testes guardam:
 *   • botão na ficha do cliente que leva à entrevista
 *   • 20-30 perguntas, TODAS fechadas (nenhum campo de texto livre)
 *   • o DISC é gerado no fim, sem ninguém informar nem anexar
 *   • mais de um decisor ⇒ a Reunião Preliminar exige todos presentes
 *   • entrevistas ILIMITADAS por cliente
 *
 * 🔴 ESCREVE EM PRODUÇÃO: a conclusão grava DISC e decisores na ficha de um
 * cliente real. Por isso o fluxo completo só roda no CLIENTE DE TESTE, e só
 * no desktop — as travas da suíte valem aqui igual.
 *
 * ── 🔴 EFEITO DE ESCRITA DECLARADO (23/09/2026) ────────────────────────────
 *
 * O último describe deste arquivo ("a ponte para a sessão") tem UM teste que
 * conclui uma entrevista de verdade: a RPC `gps.entrevista_previa_concluir`
 * **grava o perfil DISC e o relatório** na ficha do CLIENTE DE TESTE,
 * sobrescrevendo o que estiver lá. Ele fica atrás de `QA_PERMITE_ESCRITA=1`,
 * no molde de `QA_PERMITE_EMAIL=1` em `sessoes-fluxo.spec.ts`, e se pula com
 * a razão escrita quando a variável não está ligada.
 *
 * **Não dispara e-mail** — conferido no código, não presumido:
 * `concluirEntrevistaPrevia` chama a RPC e dois `revalidatePath`, e a RPC não
 * usa `net.http_post` nem enfileira aviso. Os outros testes deste arquivo não
 * concluem nada: leem a tela e descartam o que digitam.
 */

const cred = exigeLogin();

/** A ficha do cliente de teste. Os outros testes não escrevem nada. */
const CLIENTE_TESTE = /CLIENTE DE TESTE/i;

/**
 * 🔴 A FICHA VIROU 4 ABAS EM 24/09 (fatia 4) — e a Entrevista mora na 2ª.
 *
 * "Perfil DISC", o botão "Ver perfil", a linha "Próximo passo · Entrevista
 * feita" e o convite para `/sessoes` vivem todos em `ficha-aba-preliminar.tsx`
 * — a folha **"Reunião preliminar"**, que é a aba 2.
 *
 * Com `keepMounted`, as quatro folhas ficam no DOM e as inativas levam
 * `hidden`: quem abrir a ficha numa fase cujo padrão é outra folha (
 * `contratado` abre em "Fechamento") encontraria o botão presente no DOM e
 * INVISÍVEL. O teste falharia por mudança de layout, não por defeito — e
 * pior, a mensagem de erro falaria de "porta de entrada sumida", mandando
 * procurar um defeito que não existe.
 *
 * A correção é navegar até a folha antes de procurar. Nenhuma asserção foi
 * afrouxada: o que se prova continua sendo que a porta de entrada existe e é
 * alcançável — agora a partir da folha em que ela de fato mora.
 */
async function irParaFolhaPreliminar(page: import("@playwright/test").Page) {
  const base = page.url().split("?")[0];
  await page.goto(`${base}?aba=preliminar`);
  await expect(
    page.getByRole("tab", { name: /reuni(ã|a)o preliminar/i }),
    "A ficha não tem a folha 'Reunião preliminar'. A pasta de 4 abas " +
      "(fatia 4, 24/09/2026) é onde a Entrevista Prévia passou a morar — sem " +
      "essa aba, a feature inteira ficou sem porta de entrada.",
  ).toHaveAttribute("aria-selected", "true", { timeout: 12_000 });
}

/**
 * 🔴 A ENTREVISTA MUDOU DE LUGAR EM 23/09 — e a régua mudou junto.
 *
 * O painel da Entrevista Prévia (com o link "Iniciar/Nova entrevista") saiu da
 * `Secao "Registro e perfil"` e passou a morar dentro do diálogo que o botão
 * **"Ver perfil"** abre, junto com o Select do DISC e os 3 campos de texto.
 *
 * Quem move o DOM conserta a régua: os dois testes abaixo clicavam direto no
 * link e quebrariam. Este helper é o caminho novo — e, ao exigir que o botão
 * exista antes de o link aparecer, ele PROVA a porta de entrada em vez de
 * supor que ela está lá.
 *
 * 🔑 Desde 24/09 ele começa indo para a folha 2 (ver acima): o botão "Ver
 * perfil" é conteúdo de aba, e aba inativa é conteúdo escondido.
 */
async function abrirPerfilDoCliente(page: import("@playwright/test").Page) {
  await irParaFolhaPreliminar(page);
  const verPerfil = page.getByRole("button", { name: /ver perfil/i }).first();
  await expect(
    verPerfil,
    "A ficha não oferece o botão 'Ver perfil'. Sem ele a Entrevista Prévia, " +
      "o DISC e os 3 campos do perfil ficam SEM porta de entrada — feature " +
      "que existe e ninguém alcança.",
  ).toBeVisible({ timeout: 12_000 });
  await verPerfil.click();
  // O diálogo é o novo lar do painel. Esperar por ele (e não pelo link direto)
  // separa "o pop-up não abriu" de "o pop-up abriu sem a entrevista dentro".
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 12_000 });
}

test.describe("Entrevista Prévia 2.0", () => {
  test.skip(!cred, "Sem QA_PARCEIRO_EMAIL/SENHA no .env.qa.");

  test("a ficha do cliente oferece a Entrevista Prévia", async ({ page }, info) => {
    await entrar(page, cred!, "/clientes");
    await page.goto("/clientes");

    const link = page.getByRole("link", { name: CLIENTE_TESTE }).first();
    const achou = await link
      .waitFor({ state: "visible", timeout: 12_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!achou, "Cliente de teste não está na lista desta conta.");

    await link.click();
    await page.waitForURL(/\/clientes\/[0-9a-f-]+$/i, { timeout: 15_000 });

    // 🔴 A FICHA MOSTRA O RESULTADO, NÃO O FORMULÁRIO.
    //
    // Era `getByText(/entrevista prévia/i)` sobre a ficha inteira. Esse
    // assert continuava VERDE com a feature escondida: bastava a palavra
    // sobrar em qualquer canto (um título, uma frase de ajuda, um comentário
    // renderizado) para o teste aprovar uma tela em que ninguém alcança a
    // entrevista. Teste verde sobre feature inalcançável é pior que teste
    // ausente — ele garante que a regressão passa despercebida.
    //
    // Agora a régua é a LINHA DENSA que o Marcio pediu: rótulo + valor.
    //
    // 🔑 A linha mora na folha 2 desde 24/09 — ir até ela é o que separa
    // "a linha sumiu" de "a linha está numa aba fechada".
    await irParaFolhaPreliminar(page);
    await expect(
      page.getByText(/perfil disc/i).first(),
      "A ficha não mostra a linha 'Perfil DISC'. É ela que carrega o " +
        "resultado (a letra ou '— não definido') e o botão que abre o resto.",
    ).toBeVisible({ timeout: 12_000 });

    // 🔴 A PORTA DE ENTRADA. Com o pop-up, o link da entrevista só existe
    // depois deste clique — se o botão sumir, a feature inteira (entrevista,
    // DISC e os 3 campos) fica inalcançável com a suíte verde.
    await abrirPerfilDoCliente(page);

    // E dentro do diálogo, o pedido literal do Marcio (23/09): "tem que ter
    // na aba do cliente um botão pra iniciar a entrevista prévia".
    const dialogo = page.getByRole("dialog");
    await expect(
      dialogo.getByText(/entrevista prévia/i).first(),
      "O diálogo 'Ver perfil' abriu SEM o painel da Entrevista Prévia.",
    ).toBeVisible({ timeout: 12_000 });

    await expect(
      dialogo.getByRole("link", { name: /iniciar entrevista|nova entrevista/i }).first(),
    ).toBeVisible();

    // 🔑 OS 3 CAMPOS DO DISC VIERAM JUNTO. Eles moravam na ficha; se a
    // mudança de casa tivesse perdido algum, o parceiro deixaria de
    // registrar o perfil sem nenhum erro na tela.
    for (const rotulo of [/consciência/i, /gatilhos/i, /relacionamento/i]) {
      await expect(
        dialogo.getByLabel(rotulo),
        `O campo ${rotulo} sumiu do diálogo do perfil.`,
      ).toBeVisible();
    }

    await registrarTela(page, info, "ficha-com-entrevista.png");
  });

  test("fechar o pop-up no Esc NÃO perde o que foi digitado", async ({ page }) => {
    // 🔴 A TRAVA DE ESTADO, medida no navegador que pinta.
    //
    // Os 4 campos do DISC são `useState` do `ClienteFicha`, não do diálogo —
    // é o que faz o "Salvar ficha" e o aviso "alterações não salvas"
    // continuarem enxergando o que se digita dentro do pop-up. Se alguém
    // "simplificar" criando cópia local no `DiscDialogo`, o texto some no Esc
    // e o salvar grava o valor antigo. Nada disso aparece no `tsc`.
    await entrar(page, cred!, "/clientes");
    await page.goto("/clientes");

    const link = page.getByRole("link", { name: CLIENTE_TESTE }).first();
    test.skip(
      !(await link.waitFor({ state: "visible", timeout: 12_000 }).then(() => true).catch(() => false)),
      "Cliente de teste não está na lista.",
    );
    await link.click();
    await page.waitForURL(/\/clientes\/[0-9a-f-]+$/i, { timeout: 15_000 });

    await abrirPerfilDoCliente(page);

    const marca = `QA ${Date.now()}`;
    const campo = page.getByRole("dialog").getByLabel(/gatilhos/i);
    await campo.fill(marca);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 12_000 });

    // (a) O foco volta ao botão que abriu — quem usa teclado não recomeça do
    //     topo de uma ficha de ~1.000 px.
    await expect(
      page.getByRole("button", { name: /ver perfil/i }).first(),
      "O foco não voltou ao botão 'Ver perfil' depois do Esc.",
    ).toBeFocused();

    // (b) A barra sticky continua acusando pendência: o estado sobreviveu ao
    //     fechamento, senão ela diria "Tudo salvo" e o parceiro sairia da
    //     tela achando que não havia nada a gravar.
    await expect(
      page.getByText(/alterações não salvas/i).first(),
      "A barra não acusa alteração depois do Esc — sinal de que o texto " +
        "digitado no diálogo NÃO chegou ao estado da ficha (cópia local?).",
    ).toBeVisible({ timeout: 12_000 });

    // (c) Reabrir traz o texto de volta, caractere a caractere.
    await abrirPerfilDoCliente(page);
    await expect(
      page.getByRole("dialog").getByLabel(/gatilhos/i),
      "O texto digitado sumiu ao reabrir o diálogo.",
    ).toHaveValue(marca);

    // 🔑 NÃO SALVA. Este teste roda contra PRODUÇÃO: gravar `QA <timestamp>`
    // no DISC de um cliente deixaria lixo na ficha. Sair da página descarta
    // o estado local, que é exatamente o que queremos.
    await page.keyboard.press("Escape");
  });

  test("o formulário abre, mostra o progresso e NÃO tem pergunta aberta", async ({
    page,
  }, info) => {
    const console_ = vigiarConsole(page);
    await entrar(page, cred!, "/clientes");
    await page.goto("/clientes");

    const link = page.getByRole("link", { name: CLIENTE_TESTE }).first();
    test.skip(
      !(await link.waitFor({ state: "visible", timeout: 12_000 }).then(() => true).catch(() => false)),
      "Cliente de teste não está na lista.",
    );
    await link.click();
    await page.waitForURL(/\/clientes\/[0-9a-f-]+$/i, { timeout: 15_000 });
    // 🔴 O link mora no pop-up desde 23/09 — clicar direto aqui falharia.
    await abrirPerfilDoCliente(page);
    await page
      .getByRole("dialog")
      .getByRole("link", { name: /iniciar entrevista|nova entrevista/i })
      .first()
      .click();
    await page.waitForURL(/\/entrevista$/, { timeout: 15_000 });

    // Progresso visível: o parceiro precisa saber quanto falta para
    // administrar o tempo da conversa.
    const progresso = page.getByRole("progressbar");
    await expect(progresso).toBeVisible({ timeout: 12_000 });

    const total = Number(await progresso.getAttribute("aria-valuemax"));
    expect(
      total >= 20 && total <= 30,
      `O roteiro tem ${total} perguntas. O pedido foi "algo em torno de 20/30".`,
    ).toBe(true);

    // 🔴 NENHUMA PERGUNTA ABERTA — a regra que governa a feature inteira.
    // Um campo de texto aqui quebraria o cálculo do DISC e a contagem de
    // decisores, que dependem de resposta estruturada.
    await expect(
      page.locator('input[type="text"], input:not([type]), textarea'),
      "Apareceu campo de texto livre no meio das perguntas. A regra é " +
        "'nao tem pergunta aberta' — é da resposta fechada que saem o DISC " +
        "e a contagem de decisores.",
    ).toHaveCount(0);

    // As opções são botões grandes, marcáveis.
    await expect(page.locator("button[aria-pressed]").first()).toBeVisible();

    await semRolagemHorizontal(page);
    await registrarTela(page, info, `entrevista-${test.info().project.name}.png`);
    console_.semErros();
  });

  test("contraste WCAG AA no formulário", async ({ page }) => {
    await entrar(page, cred!, "/clientes");
    await page.goto("/clientes");
    const link = page.getByRole("link", { name: CLIENTE_TESTE }).first();
    test.skip(
      !(await link.waitFor({ state: "visible", timeout: 12_000 }).then(() => true).catch(() => false)),
      "Cliente de teste não está na lista.",
    );
    await link.click();
    await page.waitForURL(/\/clientes\/[0-9a-f-]+$/i, { timeout: 15_000 });
    // 🔴 Mesma mudança de 23/09: o link só existe depois de "Ver perfil".
    await abrirPerfilDoCliente(page);
    await page
      .getByRole("dialog")
      .getByRole("link", { name: /iniciar entrevista|nova entrevista/i })
      .first()
      .click();
    await page.waitForURL(/\/entrevista$/, { timeout: 15_000 });
    await page.getByRole("progressbar").waitFor({ state: "visible", timeout: 12_000 });

    await contrasteAprovado(page, "a Entrevista Prévia");
    await alvosDeClique(page);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A PONTE "TERMINOU A ENTREVISTA → VAI MARCAR A SESSÃO" (23/09/2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pedido do Marcio, palavras dele: "a gente tem que prosseguir depois da
 * entrevista prévia para lá [a sessão]. **Esse é o buraco na parte do
 * sistema.** A gente precisa ter algo que guie a pessoa para lá".
 *
 * 🔴 POR QUE ESTE BLOCO EXISTE: a suíte provava a ponta "ficha → Ver perfil →
 * diálogo → link → /entrevista" e provava `/sessoes` isolada
 * (`sessoes-parceiro.spec.ts`). **Ninguém provava o ENCONTRO das duas.** Uma
 * regressão em `!admin && temEntrevistaConcluida` (`cliente-ficha.tsx`) ou no
 * `router.push("/sessoes")` (`entrevista-previa/formulario.tsx`) passaria
 * verde: as duas pontas continuariam de pé, e o caminho entre elas, morto.
 *
 * São DOIS lugares de produção, com custo de prova muito diferente:
 *
 *   (1) a LINHA na ficha — leitura pura, provável aqui;
 *   (2) o BOTÃO na tela de resultado da entrevista — ver o cabeçalho do
 *       segundo teste: ele NÃO é alcançável sem escrever em produção.
 */
test.describe("Entrevista Prévia 2.0 · a ponte para a sessão", () => {
  test.skip(!cred, "Sem QA_PARCEIRO_EMAIL/SENHA no .env.qa.");

  test("a ficha guia da entrevista concluída para /sessoes", async ({ page }, info) => {
    await entrar(page, cred!, "/clientes");
    await page.goto("/clientes");

    const link = page.getByRole("link", { name: CLIENTE_TESTE }).first();
    test.skip(
      !(await link.waitFor({ state: "visible", timeout: 12_000 }).then(() => true).catch(() => false)),
      "Cliente de teste não está na lista desta conta.",
    );
    await link.click();
    await page.waitForURL(/\/clientes\/[0-9a-f-]+$/i, { timeout: 15_000 });

    // 🔴 O GATE DO TESTE É O ESTADO DO DADO, E ELE É DITO EM VOZ ALTA.
    //
    // A linha só existe quando `temEntrevistaConcluida` é true. Se o cliente
    // de QA ainda não tem entrevista concluída, o teste NÃO pode passar verde
    // — verde vazio é exatamente o defeito que esta rodada veio corrigir.
    // Pular COM A RAZÃO ESCRITA deixa o buraco visível no relatório, em vez
    // de fingir cobertura.
    //
    // 🔑 Não concluo uma entrevista aqui para criar a condição: concluir
    // chama `entrevista_previa_concluir`, que GRAVA o perfil DISC na ficha de
    // um cliente real. Ver o cabeçalho do teste seguinte.
    //
    // 🔴 24/09: a linha "Próximo passo" mora na folha 2. Sem navegar até ela,
    // este teste PULARIA sempre ("não tem entrevista concluída") mesmo com o
    // dado presente — o pior dos dois mundos: nem verde falso, nem cobertura,
    // e um skip mentindo sobre o motivo no relatório.
    await irParaFolhaPreliminar(page);
    const marcaDaEntrevista = page.getByText(/entrevista feita/i).first();
    const temEntrevista = await marcaDaEntrevista
      .waitFor({ state: "visible", timeout: 12_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(
      !temEntrevista,
      "O cliente de QA não tem entrevista concluída — a linha 'Próximo passo · " +
        "Entrevista feita' só nasce com `temEntrevistaConcluida`. Para cobrir " +
        "esta asserção, conclua UMA entrevista no CLIENTE DE TESTE (isso grava " +
        "o DISC dele) e rode de novo.",
    );

    // (a) O convite existe e é alcançável — é o "algo que guie a pessoa".
    const convite = page
      .getByRole("link", { name: /marque a sessão com a equipe jurídica/i })
      .first();
    await expect(
      convite,
      "A ficha diz 'Entrevista feita' e NÃO oferece o caminho para marcar a " +
        "sessão. É o buraco que o Marcio nomeou: o parceiro termina a " +
        "entrevista e o sistema não diz o que fazer com ela.",
    ).toBeVisible({ timeout: 12_000 });

    // (b) 🔴 É UM <a href="/sessoes">, NÃO um div com onClick.
    //
    // A régua não é estética: link de verdade abre em nova aba, aparece na
    // barra de status, funciona com teclado e sobrevive a JS quebrado. Trocar
    // por `onClick` passaria no `tsc`, ficaria idêntico na tela e mataria as
    // quatro coisas em silêncio.
    await expect(convite).toHaveAttribute("href", "/sessoes");

    // (c) E o clique CHEGA lá. Ter o href certo não prova que a navegação
    //     acontece: um overlay por cima, um `preventDefault` herdado ou um
    //     redirect de guarda derrubariam o destino com o DOM impecável.
    await convite.click();
    await page.waitForURL(/\/sessoes/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/sessoes/);

    await registrarTela(page, info, "ponte-ficha-para-sessoes.png");
  });

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * ASSERÇÃO 2 — o BOTÃO na tela de resultado da entrevista
   * ═══════════════════════════════════════════════════════════════════════
   *
   * 🔴 ESTE TESTE ESCREVE EM PRODUÇÃO, E POR ISSO NASCE DESLIGADO.
   *
   * Medido no código antes de escrever, não suposto: a tela de resultado
   * (`formulario.tsx`, bloco `if (resultado)`) é renderizada a partir do
   * estado `resultado`, que **só** é preenchido dentro de `concluir()`, com o
   * retorno de `concluirEntrevistaPrevia` → RPC
   * `gps.entrevista_previa_concluir`. Não há rota, query string, prop nem
   * estado inicial que pinte essa tela sem passar por ali:
   * `/clientes/[clienteId]/entrevista` sempre monta o formulário na primeira
   * pergunta não respondida.
   *
   * Ou seja: **não dá para provar o botão sem concluir uma entrevista de
   * verdade**, e concluir tem efeito de dado — a RPC captura o perfil DISC e
   * o relatório no cliente real (`gps.etapa1_clientes`). Não é lixo que sai
   * com um delete: é sobrescrever o perfil de uma pessoa.
   *
   * O que este teste NÃO faz (conferido no código, não presumido): não
   * dispara e-mail. `concluirEntrevistaPrevia` chama a RPC e dois
   * `revalidatePath`; a RPC não usa `net.http_post` nem enfileira aviso. O
   * efeito externo do spec de sessões (7 e-mails reais à Dra. Cristiane em
   * 22/09) **não se repete aqui** — o que existe é escrita de dado, que é
   * menos grave e ainda assim não se faz sem autorização.
   *
   * Por isso a trava é `QA_PERMITE_ESCRITA=1`, no molde de
   * `QA_PERMITE_EMAIL=1` em `sessoes-fluxo.spec.ts`. Desligado, o teste PULA
   * com a razão na tela — nunca passa verde fingindo ter olhado.
   */
  test("a tela de resultado leva a /sessoes pelo botão", async ({ page }, info) => {
    test.skip(
      test.info().project.name !== "desktop",
      "Fluxo de dado roda uma vez só, no desktop — duas execuções concluiriam " +
        "duas entrevistas no mesmo cliente.",
    );
    test.skip(
      process.env.QA_PERMITE_ESCRITA !== "1",
      "Este teste CONCLUI uma entrevista de verdade: a RPC " +
        "`gps.entrevista_previa_concluir` grava o perfil DISC e o relatório na " +
        "ficha do CLIENTE DE TESTE. Não há como renderizar a tela de resultado " +
        "sem isso (o estado `resultado` só nasce da conclusão). Rode com " +
        "QA_PERMITE_ESCRITA=1 quando sobrescrever o DISC do cliente de QA for " +
        "aceitável. Não dispara e-mail.",
    );

    await entrar(page, cred!, "/clientes");
    await page.goto("/clientes");

    const link = page.getByRole("link", { name: CLIENTE_TESTE }).first();
    test.skip(
      !(await link.waitFor({ state: "visible", timeout: 12_000 }).then(() => true).catch(() => false)),
      "Cliente de teste não está na lista desta conta.",
    );
    await link.click();
    await page.waitForURL(/\/clientes\/[0-9a-f-]+$/i, { timeout: 15_000 });

    await abrirPerfilDoCliente(page);
    await page
      .getByRole("dialog")
      .getByRole("link", { name: /iniciar entrevista|nova entrevista/i })
      .first()
      .click();
    await page.waitForURL(/\/entrevista$/, { timeout: 15_000 });

    const progresso = page.getByRole("progressbar");
    await expect(progresso).toBeVisible({ timeout: 12_000 });
    const total = Number(await progresso.getAttribute("aria-valuemax"));

    // Responde a PRIMEIRA opção de cada pergunta. O conteúdo da resposta não é
    // o que este teste afirma — ele afirma a PONTE. O DISC que sair daqui é o
    // custo declarado no gate acima. O teto `total + 5` evita laço infinito se
    // a tela parar de avançar; a asserção seguinte é quem julga.
    for (let i = 0; i < total + 5; i++) {
      const opcao = page.locator("button[aria-pressed]").first();
      if (!(await opcao.isVisible().catch(() => false))) break;
      await opcao.click();
      await page.waitForTimeout(250);
    }

    // Pode cair na tela de nomes dos decisores antes do fim: ela tem campo de
    // texto e um botão de avançar. Seguir sem nomear é permitido (os nomes não
    // entram em cálculo nenhum).
    const concluir = page.getByRole("button", { name: /concluir|finalizar/i }).first();
    if (await concluir.isVisible().catch(() => false)) {
      await concluir.click();
    }

    // A prova: o botão da ponte, na tela de resultado.
    const botao = page.getByRole("button", {
      name: /marcar a sessão com a equipe jurídica/i,
    });
    await expect(
      botao,
      "A entrevista foi concluída e a tela de resultado NÃO oferece o botão " +
        "para marcar a sessão. É o buraco do sistema reaberto no ponto exato " +
        "em que o parceiro acabou de mapear os decisores.",
    ).toBeVisible({ timeout: 20_000 });

    await registrarTela(page, info, "ponte-resultado-para-sessoes.png");

    // E leva a /sessoes. É `router.push`, não `<a href>` — só o clique prova.
    await botao.click();
    await page.waitForURL(/\/sessoes/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/sessoes/);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O BECO DO ADMIN (24/09/2026) — o espelho tinha de linkar para a rota DELE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 🔴 POR QUE ESTE BLOCO EXISTE: até hoje o painel da ficha no espelho do admin
 * (`/admin/aluno/[alunoId]/clientes/[clienteId]`) linkava para
 * `/clientes/[clienteId]/entrevista` — a rota do PARCEIRO, que faz
 * `redirect("/admin")` para `papel === "admin"`. O admin clicava em "Nova
 * entrevista"/"Iniciar entrevista" e caía de volta no próprio painel, sem
 * erro nenhum na tela. A correção deu ao admin a rota própria
 * `/admin/aluno/[alunoId]/clientes/[clienteId]/entrevista` (prop
 * `hrefEntrevista`, `admin/aluno/.../[clienteId]/page.tsx:158`).
 *
 * 🔑 CAMINHO PARA O ESPELHO SEM `QA_ALUNO_ID`: o mesmo de
 * `ficha-abas.spec.ts:1264-1308` — `/admin/clientes?q=<nome>` (lista
 * consolidada) → link do parceiro dono do CLIENTE DE TESTE →
 * `/admin/aluno/<id>/clientes` (mesmo `ClientesManager`, com `basePath`) →
 * ficha do cliente pelo nome.
 *
 * 🔴 Sem responder nem concluir: a conclusão grava DISC no CLIENTE DE TESTE
 * (já coberto, do lado do parceiro, pelo describe acima). Aqui só se prova
 * que a rota do admin abre e monta — a escrita mínima é a mesma de
 * `iniciarEntrevistaPrevia` (RPC `entrevista_previa_iniciar`, cria/retoma a
 * linha em aberto), que o describe "a ponte para a sessão" já aceita sem
 * gate de `QA_PERMITE_ESCRITA` nos testes de "o formulário abre" e "contraste
 * WCAG AA" — mesmo custo, mesma trava (a régua não muda por ser admin).
 */
test.describe("Entrevista Prévia 2.0 · modo assistência (admin)", () => {
  const admin = exigeAdmin();
  test.skip(!admin, "Sem QA_ADMIN_EMAIL/SENHA no .env.qa.");

  const BUSCA_ADMIN = "CLIENTE DE TESTE";
  const CLIENTE_DE_TESTE_ADMIN = /CLIENTE DE TESTE \(QA\)/i;

  /**
   * Vai da lista consolidada até a ficha do CLIENTE DE TESTE no espelho do
   * admin. Devolve `null` quando o cliente não está acessível desta conta —
   * o teste se pula com a razão, em vez de falhar por dado ausente.
   */
  async function abrirFichaEspelhoAdmin(page: import("@playwright/test").Page) {
    await entrar(page, admin!, "/admin/clientes");
    await page.goto(`/admin/clientes?q=${encodeURIComponent(BUSCA_ADMIN)}`);

    const linha = page
      .getByRole("row")
      .filter({ hasText: CLIENTE_DE_TESTE_ADMIN })
      .first();
    const achouLinha = await linha
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!achouLinha) return false;

    const doAmbiente = linha.getByRole("link").first();
    const href = await doAmbiente.getAttribute("href");
    if (!href?.startsWith("/admin/aluno/")) return false;

    await page.goto(`${href}/clientes`);
    const linkCliente = page
      .getByRole("link", { name: CLIENTE_DE_TESTE_ADMIN })
      .first();
    const achouCliente = await linkCliente
      .waitFor({ state: "visible", timeout: 12_000 })
      .then(() => true)
      .catch(() => false);
    if (!achouCliente) return false;

    await linkCliente.click();
    await page.waitForURL(/\/admin\/aluno\/[^/]+\/clientes\/[0-9a-f-]+$/i, {
      timeout: 15_000,
    });
    return true;
  }

  test("o espelho do admin linka para a rota DELE, não para a do parceiro", async ({
    page,
  }, info) => {
    const achou = await abrirFichaEspelhoAdmin(page);
    test.skip(!achou, "Cliente de teste não acessível por esta conta admin.");

    // 🔴 A PROVA DO BECO: o painel da entrevista mora dentro da ficha do
    // espelho (mesmo componente `PainelEntrevistaPrevia` da ficha do
    // parceiro) — sem diálogo "Ver perfil" no meio, ao contrário do fluxo do
    // parceiro em `ficha-abas.spec.ts`.
    const link = page
      .getByRole("link", { name: /iniciar entrevista|nova entrevista/i })
      .first();
    await expect(
      link,
      "O espelho do admin não oferece o link da Entrevista Prévia — sem ele " +
        "o admin não alcança nem o beco corrigido nem o formulário.",
    ).toBeVisible({ timeout: 12_000 });

    const href = await link.getAttribute("href");
    expect(
      href,
      "O link da entrevista no espelho do admin tem de apontar para a rota " +
        "PRÓPRIA do admin (`/admin/aluno/<id>/clientes/<id>/entrevista`), " +
        "nunca para `/clientes/<id>/entrevista` — essa é a rota do parceiro, " +
        "que faz `redirect(\"/admin\")` para quem está logado como admin. É " +
        "exatamente o beco que foi corrigido hoje.",
    ).toMatch(/^\/admin\/aluno\/[^/]+\/clientes\/[^/]+\/entrevista$/);
    expect(href, "O href não pode virar a rota do parceiro.").not.toMatch(
      /^\/clientes\//,
    );

    await registrarTela(page, info, "admin-espelho-com-entrevista.png");
  });

  test("clicar no link ABRE o formulário da entrevista, sem cair em /admin", async ({
    page,
  }, info) => {
    const console_ = vigiarConsole(page);
    const achou = await abrirFichaEspelhoAdmin(page);
    test.skip(!achou, "Cliente de teste não acessível por esta conta admin.");

    await page
      .getByRole("link", { name: /iniciar entrevista|nova entrevista/i })
      .first()
      .click();

    // 🔴 A prova de que o clique NÃO caiu no `redirect("/admin")` do beco
    // antigo: a URL final continua na rota do admin, casando a MESMA regex
    // do href — nunca virou `/admin` puro.
    await page.waitForURL(
      /\/admin\/aluno\/[^/]+\/clientes\/[^/]+\/entrevista$/i,
      { timeout: 15_000 },
    );
    await expect(page).toHaveURL(
      /\/admin\/aluno\/[^/]+\/clientes\/[^/]+\/entrevista$/i,
    );

    await expect(
      page.getByRole("heading", { name: /entrevista prévia/i }),
      "A rota abriu, mas sem o heading 'Entrevista Prévia' — pode ter caído " +
        "na tela de erro da RPC (`abertura.erro`) em vez do formulário.",
    ).toBeVisible({ timeout: 12_000 });

    // O formulário montou: reusa os mesmos seletores do describe do parceiro
    // (progresso ou a 1ª pergunta como botões marcáveis). Não responde nada.
    const progresso = page.getByRole("progressbar");
    await expect(
      progresso,
      "O heading apareceu mas o indicador de progresso não montou — o " +
        "formulário (`FormularioEntrevistaPrevia`) pode não ter recebido as " +
        "props certas para `conduzidoPor=\"admin\"`.",
    ).toBeVisible({ timeout: 12_000 });

    await expect(page.locator("button[aria-pressed]").first()).toBeVisible();

    await semRolagemHorizontal(page);
    await registrarTela(page, info, `admin-entrevista-formulario-${test.info().project.name}.png`);
    console_.semErros();

    // 🔴 NÃO responde nada e NÃO conclui. `iniciar` (RPC
    // `entrevista_previa_iniciar`) já criou ou retomou a linha em aberto —
    // escrita mínima idêntica à que os testes "o formulário abre..." e
    // "contraste WCAG AA" do describe do parceiro fazem sem gate de escrita.
    // Concluir gravaria DISC no CLIENTE DE TESTE; isso já está coberto (do
    // lado do parceiro) no describe "a ponte para a sessão", atrás de
    // `QA_PERMITE_ESCRITA=1`. Duplicar aqui dobraria o custo sem provar nada
    // novo sobre o beco do admin.
  });
});
