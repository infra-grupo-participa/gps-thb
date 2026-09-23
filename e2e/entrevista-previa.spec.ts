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
 */
async function abrirPerfilDoCliente(page: import("@playwright/test").Page) {
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
