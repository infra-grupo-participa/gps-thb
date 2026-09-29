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
 * Entrevista Prévia 3.0 — roteiro curto (até 15 perguntas) que termina
 * marcando a Reunião Preliminar.
 *
 * Regras do Marcio (23/09, revistas em 29/09) que estes testes guardam:
 *   • botão na ficha do cliente que leva à entrevista
 *   • no máximo 15 perguntas (caminho curto: 11), UMA por vez, com o
 *     progressbar "Pergunta X de Y" (Y recalculado pelas condições)
 *   • escolha única AVANÇA sozinha; múltipla tem o botão "Continuar"
 *   • nenhum campo de texto nas perguntas, salvo os nomes de quem decide
 *     junto; na validação, até 3 frases exatas do cliente (opcionais, ≤150)
 *   • validação "Deixa eu confirmar…" antes de concluir
 *   • na validação o parceiro ESCOLHE a Reunião Preliminar ("Marcar agora" ou
 *     "Não agendei agora"); concluir fica desabilitado até a escolha
 *   • "Marcar agora" leva a /clientes/<id>/entrevista/agendar?e=…; "Não agendei"
 *     volta à ficha com o aviso "Reunião Preliminar: não agendada"
 *   • entrevistas ILIMITADAS por cliente
 *
 * 🔴 ESCREVE EM PRODUÇÃO: a conclusão grava DISC e decisores na ficha de um
 * cliente real. Por isso o fluxo completo só roda no CLIENTE DE TESTE, e só
 * no desktop — as travas da suíte valem aqui igual.
 *
 * ── 🔴 EFEITO DE ESCRITA DECLARADO (23/09/2026) ────────────────────────────
 *
 * Dois testes ficam atrás de `QA_PERMITE_ESCRITA=1` (molde de
 * `QA_PERMITE_EMAIL=1` em `sessoes-fluxo.spec.ts`) e se pulam com a razão
 * escrita quando a variável não está ligada:
 *
 *   • "caminho longo": responde as 15 perguntas e PARA na validação. Grava só
 *     o RASCUNHO (`salvarProgressoEntrevista`), nunca conclui.
 *   • "caminho curto": responde as 11 e CONCLUI. A RPC
 *     `gps.entrevista_previa_concluir` **grava o perfil DISC e o relatório**
 *     na ficha do CLIENTE DE TESTE, sobrescrevendo o que estiver lá. O
 *     roteiro do teste marca "decide sozinho" de propósito: nenhum decisor "dj"
 *     ⇒ nada em `gps.cliente_decisores`, e nenhuma trava na Preliminar.
 *
 * **Não agenda nada**: o teste termina na tela "Marque a Reunião Preliminar",
 * sem clicar em horário. Não dispara e-mail.
 *
 * Os demais testes leem a tela (e só clicam "Anterior"/"Começar"); a rota
 * `/entrevista` cria ou retoma a linha em aberto, como sempre.
 *
 * 🔑 A entrevista em aberto pode vir RETOMADA (respostas de uma rodada
 * anterior). Por isso todo fluxo começa voltando ao início por "Anterior" e
 * REMARCA cada pergunta — o resultado não depende do que ficou no rascunho.
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

type Pagina = import("@playwright/test").Page;

/** Qualquer dos dois rótulos do botão de concluir (só um existe por vez). */
const BOTAO_CONFIRMOU = /^confirmou — concluir/i;
/** Sem escolha, ou "Não agendei agora". */
const BOTAO_CONCLUIR = /^confirmou — concluir$/i;
/** Só depois de "Marcar agora". */
const BOTAO_CONCLUIR_E_MARCAR = /^confirmou — concluir e marcar a reunião$/i;
const BOTAO_AJUSTAR = /^ajustar motivo, critério ou decisores$/i;
const TEXTO_ABERTURA = /são perguntas rápidas, uns 8 minutos, para a doutora chegar preparada/i;

/** Perguntas que aceitam texto: só os nomes de quem decide junto. */
const CAMPO_DE_TEXTO = 'input[type="text"], input:not([type]), textarea';

/**
 * A ficha → Ver perfil → "Iniciar/Nova entrevista" → formulário montado.
 * Devolve `false` (e o teste se pula) quando o cliente de teste não está na
 * lista desta conta.
 */
async function abrirEntrevista(page: Pagina): Promise<boolean> {
  await entrar(page, cred!, "/clientes");
  await page.goto("/clientes");
  const link = page.getByRole("link", { name: CLIENTE_TESTE }).first();
  const achou = await link
    .waitFor({ state: "visible", timeout: 12_000 })
    .then(() => true)
    .catch(() => false);
  if (!achou) return false;
  await link.click();
  await page.waitForURL(/\/clientes\/[0-9a-f-]+$/i, { timeout: 15_000 });
  await abrirPerfilDoCliente(page);
  await page
    .getByRole("dialog")
    .getByRole("link", { name: /iniciar entrevista|nova entrevista/i })
    .first()
    .click();
  await page.waitForURL(/\/entrevista$/, { timeout: 15_000 });
  return true;
}

/**
 * Atravessa a abertura ("Começar") se ela estiver na tela. Entrevista NOVA
 * abre nela; entrevista retomada cai direto numa pergunta ou na validação.
 * Devolve `true` se a abertura apareceu (o chamador decide o que afirmar).
 */
async function passarDaAbertura(page: Pagina): Promise<boolean> {
  const comecar = page.getByRole("button", { name: /^começar$/i });
  await expect(
    comecar
      .or(page.getByRole("progressbar"))
      .or(page.getByRole("button", { name: BOTAO_CONFIRMOU })),
    "O formulário não montou: nem abertura, nem pergunta, nem validação.",
  ).toBeVisible({ timeout: 12_000 });
  if (!(await comecar.isVisible())) return false;
  await expect(page.getByText(TEXTO_ABERTURA)).toBeVisible();
  await comecar.click();
  return true;
}

/** O título da tela atual (pergunta ou frase de validação). */
function titulo(page: Pagina) {
  return page.locator("main h2").first();
}

/** Volta por "Anterior" até a 1ª pergunta (Anterior desabilitado). */
async function voltarAoInicio(page: Pagina) {
  const anterior = page.getByRole("button", { name: /^anterior$/i });
  for (let i = 0; i < 20; i++) {
    if (await anterior.isDisabled()) return;
    const antes = (await titulo(page).textContent()) ?? "";
    await anterior.click();
    await expect(titulo(page)).not.toHaveText(antes);
  }
  throw new Error("Anterior nunca chegou à 1ª pergunta em 20 cliques.");
}

/**
 * O que cada pergunta do roteiro diz (enunciado) e o que se marca nela. Os
 * rótulos são os do catálogo `entrevista-previa-perguntas.ts`. O caminho é
 * decidido por 3 respostas: `bens`, `decide_sozinho` e `filhos_participam`.
 */
interface Roteiro {
  bens: string[];
  decide: string;
  filhos: string;
}

/** 11 perguntas: sem imóvel, sem empresa, sem filhos, decide sozinho. */
const CAMINHO_CURTO: Roteiro = {
  bens: ["Investimentos financeiros"],
  decide: "Decide sozinho",
  filhos: "Não tem filhos",
};

/** 15 perguntas: imóvel + empresa, decide a dois, filhos opinam. */
const CAMINHO_LONGO: Roteiro = {
  bens: ["Imóvel onde mora", "Empresa / participação em negócio"],
  decide: "Precisa ser a dois — decidem juntos",
  filhos: "Opinam, mas não decidem",
};

interface Passo {
  enunciado: RegExp;
  marcar: string[];
  /** Caixas de marcar (`bens`, `obs_comportamento`): tem "Continuar" e ✓. */
  multipla?: boolean;
}

function passos(r: Roteiro): Passo[] {
  return [
    { enunciado: /o que aconteceu, ou o que você começou a perceber/i, marcar: ["Tem um problema acontecendo agora"] },
    { enunciado: /já pesquisou, ouviu ou conversou/i, marcar: ["Nunca tratou do assunto"] },
    { enunciado: /o patrimônio está em quê/i, marcar: r.bens, multipla: true },
    { enunciado: /quantos imóveis/i, marcar: ["1 ou 2"] },
    { enunciado: /no seu nome mesmo, de pessoa física/i, marcar: ["Tudo em pessoa física"] },
    { enunciado: /alguma coisa formal para o dia em que você faltar/i, marcar: ["Nada"] },
    { enunciado: /decisão importante do patrimônio/i, marcar: [r.decide] },
    { enunciado: /seus filhos — entram nessa decisão/i, marcar: [r.filhos] },
    { enunciado: /na empresa: mudança de estrutura/i, marcar: ["Sócio da própria família"] },
    { enunciado: /quem decide junto precisa estar lá/i, marcar: ["Sim, todos conseguem participar"] },
    { enunciado: /o que precisa ter ficado claro/i, marcar: ["Saber exatamente o que fazer"] },
    { enunciado: /divisão entre seus filhos/i, marcar: ["Tranquila, todos se entendem"] },
    { enunciado: /preparar a conversa do seu jeito/i, marcar: ["Ver primeiro onde vai chegar"] },
    { enunciado: /como a pessoa respondeu/i, marcar: ["Direto, quis saber logo do que se trata"] },
    { enunciado: /marque o que percebeu/i, marcar: ["Mostrou entusiasmo", "Perguntou de preço"], multipla: true },
  ];
}

/**
 * Responde o roteiro desde a 1ª pergunta até a VALIDAÇÃO, afirmando em cada
 * passo o que a tela promete: "Pergunta N de Y" na posição certa, avanço
 * sozinho na escolha única, "Continuar" na múltipla. Devolve o `Y` da última
 * pergunta (o total do caminho).
 */
async function responderAteAValidacao(page: Pagina, roteiro: Roteiro): Promise<number> {
  const lista = passos(roteiro);
  const progresso = page.getByRole("progressbar");
  const continuar = page.getByRole("button", { name: /^continuar$/i });
  const confirmar = page.getByRole("button", { name: BOTAO_CONFIRMOU });
  let total = 0;

  for (let posicao = 1; posicao <= 15; posicao++) {
    const texto = (await titulo(page).textContent()) ?? "";
    const passo = lista.find((p) => p.enunciado.test(texto));
    if (!passo) throw new Error(`Pergunta ${posicao} fora do roteiro conhecido: "${texto}"`);

    await expect(
      progresso,
      `O progressbar não está em "Pergunta ${posicao} de Y" na pergunta "${texto}".`,
    ).toHaveAttribute("aria-label", new RegExp(`^Pergunta ${posicao} de \\d+$`));
    await expect(progresso).toHaveAttribute("aria-valuenow", String(posicao));
    total = Number(await progresso.getAttribute("aria-valuemax"));
    expect(total, "Y do progressbar acima do teto de 15.").toBeLessThanOrEqual(15);

    if (passo.multipla) {
      await expect(continuar, `"${texto}" é de marcar várias: falta o botão Continuar.`).toBeVisible();
      // Deixa marcadas EXATAMENTE as opções do roteiro (um rascunho retomado
      // pode ter sobras), lendo o texto sem o ✓ aria-hidden.
      const botoes = page.locator("main button[aria-pressed]");
      const n = await botoes.count();
      for (let i = 0; i < n; i++) {
        const b = botoes.nth(i);
        const t = ((await b.textContent()) ?? "").replace("✓", "").trim();
        const marcado = (await b.getAttribute("aria-pressed")) === "true";
        if (marcado !== passo.marcar.includes(t)) await b.click();
      }
      await continuar.click();
    } else {
      await page.getByRole("button", { name: passo.marcar[0], exact: true }).click();
      // Só a tela dos nomes de decisores tem campo de texto e "Continuar";
      // nas demais a escolha única avança sozinha.
      if (await continuar.isVisible()) await continuar.click();
    }

    // Avançou: a próxima pergunta OU a validação têm título diferente.
    await expect(
      titulo(page),
      `A tela não avançou depois de responder "${texto}".`,
    ).not.toHaveText(texto);
    if (await confirmar.isVisible()) return total;
  }
  throw new Error("Passou de 15 perguntas sem chegar à validação.");
}

test.describe("Entrevista Prévia 3.0", () => {
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

  test("o formulário abre no roteiro curto: 'Pergunta X de Y', sem pergunta aberta", async ({
    page,
  }, info) => {
    const console_ = vigiarConsole(page);
    test.skip(!(await abrirEntrevista(page)), "Cliente de teste não está na lista.");

    // Só cliques de leitura: atravessa a abertura e volta à 1ª pergunta.
    await passarDaAbertura(page);
    await voltarAoInicio(page);

    // Progresso: "Pergunta 1 de Y", com Y entre o caminho curto (11) e o
    // longo (15). O total é recalculado pelas respostas, então só a faixa é fixa.
    const progresso = page.getByRole("progressbar");
    await expect(progresso).toBeVisible({ timeout: 12_000 });
    await expect(progresso).toHaveAttribute("aria-label", /^Pergunta 1 de \d+$/);
    await expect(progresso).toHaveAttribute("aria-valuenow", "1");
    const total = Number(await progresso.getAttribute("aria-valuemax"));
    expect(
      total >= 11 && total <= 15,
      `O roteiro tem ${total} perguntas. A decisão de 29/09: entre 11 e 15.`,
    ).toBe(true);

    // Enunciado grande da 1ª pergunta, dica sob ele, instrução e tempo.
    await expect(titulo(page)).toContainText("O que aconteceu, ou o que você começou a perceber");
    await expect(page.getByText(/e por que justo agora/i)).toBeVisible();
    await expect(page.getByText(/marque o que mais se aproxima — não leia as opções/i)).toBeVisible();
    await expect(page.getByText(/min restantes/i)).toBeVisible();
    // Nada de DISC parcial nem selo "Não pergunte" na pergunta falada.
    await expect(page.getByText(/parcial/i)).toHaveCount(0);
    await expect(page.getByText("Não pergunte", { exact: true })).toHaveCount(0);

    // 🔴 NENHUM CAMPO DE TEXTO nas perguntas (os nomes de decisores só
    // aparecem na tela de presença, e as frases só na validação).
    await expect(
      page.locator("main").locator(CAMPO_DE_TEXTO),
      "Apareceu campo de texto na 1ª pergunta. As perguntas são fechadas: é " +
        "da resposta estruturada que saem o DISC e a contagem de decisores.",
    ).toHaveCount(0);

    // Opções são botões marcáveis; escolha única não tem "Continuar".
    await expect(page.locator("main button[aria-pressed]").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^continuar$/i })).toHaveCount(0);
    // Sem pergunta anterior na 1ª.
    await expect(page.getByRole("button", { name: /^anterior$/i })).toBeDisabled();

    await semRolagemHorizontal(page);
    await registrarTela(page, info, `entrevista-${test.info().project.name}.png`);
    console_.semErros();
  });

  test("contraste WCAG AA no formulário", async ({ page }) => {
    test.skip(!(await abrirEntrevista(page)), "Cliente de teste não está na lista.");
    await passarDaAbertura(page);
    await voltarAoInicio(page);
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
 * `router.push` do formulário (`entrevista-previa/formulario/index.tsx`) passaria
 * verde: as duas pontas continuariam de pé, e o caminho entre elas, morto.
 *
 * São DOIS lugares de produção, com custo de prova muito diferente:
 *
 *   (1) a LINHA na ficha — leitura pura, provável aqui;
 *   (2) o `router.push` do fim da entrevista para a rota de agendar (desde
 *       29/09 o parceiro não passa mais por uma tela de resultado): ver o
 *       cabeçalho dos dois últimos testes — NÃO é alcançável sem escrever.
 */
test.describe("Entrevista Prévia 3.0 · a ponte para a sessão", () => {
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
   * A PONTE DO FORMULÁRIO PARA A REUNIÃO PRELIMINAR (29/09/2026)
   * ═══════════════════════════════════════════════════════════════════════
   *
   * 🔴 OS QUATRO TESTES ABAIXO ESCREVEM EM PRODUÇÃO E NASCEM DESLIGADOS
   * (`QA_PERMITE_ESCRITA=1`). Desligados, PULAM com a razão — nunca passam
   * verdes fingindo ter olhado.
   *
   * Medido no código: a validação e o `router.push` para a rota de agendar só
   * existem depois de o parceiro responder as perguntas; não há rota nem
   * query string que pinte essas telas sem passar pelo formulário. O custo:
   *
   *   • CAMINHO LONGO e "concluir só habilita depois da escolha" — só
   *     RASCUNHO (`salvarProgressoEntrevista`). Param na validação.
   *   • CAMINHO CURTO ×2 ("Não agendei agora" e "Marcar agora") — CONCLUEM: a
   *     RPC `gps.entrevista_previa_concluir` grava DISC e relatório no CLIENTE
   *     DE TESTE. "Decide sozinho" ⇒ nenhum decisor `dj` ⇒ nada em
   *     `gps.cliente_decisores`. Não agenda, não dispara e-mail.
   */
  const RAZAO_ESCRITA =
    "Este teste responde a entrevista de verdade (grava rascunho e, no " +
    "caminho curto, CONCLUI: `gps.entrevista_previa_concluir` grava o DISC " +
    "e o relatório na ficha do CLIENTE DE TESTE). Rode com " +
    "QA_PERMITE_ESCRITA=1 quando isso for aceitável. Não dispara e-mail.";

  test("caminho longo: 15 perguntas, avanço sozinho e nomes de quem decide", async ({
    page,
  }, info) => {
    test.skip(test.info().project.name !== "desktop", "Fluxo de dado roda uma vez, no desktop.");
    test.skip(process.env.QA_PERMITE_ESCRITA !== "1", RAZAO_ESCRITA);
    test.setTimeout(120_000);

    test.skip(!(await abrirEntrevista(page)), "Cliente de teste não está na lista desta conta.");
    await passarDaAbertura(page);
    await voltarAoInicio(page);

    // 1ª pergunta: nenhum "Parcial", escolha única SEM "Continuar".
    await expect(
      page.getByText(/parcial/i),
      "A tela mostra DISC parcial no meio da conversa — removido em 29/09.",
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^continuar$/i })).toHaveCount(0);

    const total = await responderAteAValidacao(page, CAMINHO_LONGO);
    expect(total, "Imóvel + empresa + decide a dois + filhos opinam = 15 perguntas.").toBe(15);

    // Validação com 2 decisores "dj" (cônjuge e sócio) + filhos que só opinam.
    await expect(titulo(page)).toContainText("Deixa eu confirmar: você chegou até nós por");
    await expect(titulo(page)).toContainText("o cônjuge");
    await expect(titulo(page)).toContainText("o sócio");
    await expect(titulo(page)).toContainText("ouvindo os filhos");
    await expect(titulo(page)).toContainText("É isso?");
    await expect(titulo(page)).not.toContainText("undefined");
    await expect(page.getByRole("button", { name: BOTAO_CONFIRMOU })).toBeVisible();
    await expect(page.getByRole("button", { name: BOTAO_AJUSTAR })).toBeVisible();

    // "Anterior" da validação volta à ÚLTIMA pergunta (15 de 15), a de
    // observação, com o selo "Não pergunte" e SEM o texto de instrução falada.
    await page.getByRole("button", { name: /^anterior$/i }).click();
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-label", "Pergunta 15 de 15");
    await expect(page.getByText("Não pergunte", { exact: true })).toBeVisible();
    await expect(page.getByText(/não leia as opções/i)).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Jeito" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Pontos de atenção" })).toBeVisible();
    await registrarTela(page, info, "entrevista-15-de-15-nao-pergunte.png");

    // A tela "quem decide junto precisa estar lá" (10 de 15): um campo de
    // nome por decisor dj — cônjuge e sócio — e "Continuar" em vez de avanço.
    // De 15 para 10: 5 × Anterior (14 ritmo, 13 processamento, 12 conflito,
    // 11 critério, 10 presença).
    for (let i = 0; i < 5; i++) {
      const antes = (await titulo(page).textContent()) ?? "";
      await page.getByRole("button", { name: /^anterior$/i }).click();
      await expect(titulo(page)).not.toHaveText(antes);
    }
    await expect(titulo(page)).toContainText("quem decide junto precisa estar lá");
    await expect(
      page.locator("main").locator(CAMPO_DE_TEXTO),
      "A tela de presença deve ter UM campo de nome por decisor dj (cônjuge e sócio).",
    ).toHaveCount(2);
    await expect(page.getByRole("button", { name: /^continuar$/i })).toBeVisible();
    await registrarTela(page, info, "entrevista-presenca-nomes.png");
    // NÃO conclui: fica só o rascunho, e a entrevista segue em aberto.
  });

  /**
   * Abre a entrevista, volta ao início e responde o caminho CURTO até a
   * validação (sem concluir). Pula o teste se o parceiro não puder "Marcar
   * agora" — caso em que já existe Reunião Preliminar viva deste cliente e a
   * tela oferece "Já está marcada para…" no lugar (índice de sessão viva).
   */
  async function ateAValidacaoCurta(page: Pagina) {
    test.skip(!(await abrirEntrevista(page)), "Cliente de teste não está na lista desta conta.");
    await passarDaAbertura(page);
    await voltarAoInicio(page);
    const total = await responderAteAValidacao(page, CAMINHO_CURTO);
    expect(
      total,
      "Sem imóvel, sem empresa, sem filhos e decidindo sozinho o roteiro tem 11 perguntas.",
    ).toBe(11);
    test.skip(
      (await page.getByRole("button", { name: "Marcar agora", exact: true }).count()) === 0,
      "O cliente de teste já tem Reunião Preliminar marcada: a tela oferece " +
        "'Já está marcada para…' e não 'Marcar agora'. Cancele a sessão de QA em /sessoes.",
    );
  }

  test("validação: concluir só habilita depois de escolher a Reunião Preliminar", async ({
    page,
  }, info) => {
    test.skip(test.info().project.name !== "desktop", "Fluxo de dado roda uma vez, no desktop.");
    test.skip(process.env.QA_PERMITE_ESCRITA !== "1", RAZAO_ESCRITA);
    test.setTimeout(120_000);
    await ateAValidacaoCurta(page);

    const grupo = page.getByRole("group", { name: "Reunião Preliminar", exact: true });
    const marcarAgora = grupo.getByRole("button", { name: "Marcar agora", exact: true });
    const naoAgendei = grupo.getByRole("button", { name: "Não agendei agora", exact: true });
    await expect(marcarAgora).toHaveAttribute("aria-pressed", "false");
    await expect(naoAgendei).toHaveAttribute("aria-pressed", "false");

    // Antes da escolha: o botão diz só "concluir", está desabilitado e a tela
    // explica por quê.
    const concluir = page.getByRole("button", { name: BOTAO_CONCLUIR });
    await expect(concluir, "Sem escolha, o botão de concluir deve estar desabilitado.").toBeDisabled();
    await expect(page.getByText(/para concluir, diga acima se a reunião preliminar/i)).toBeVisible();
    await expect(page.getByRole("button", { name: BOTAO_CONCLUIR_E_MARCAR })).toHaveCount(0);
    await registrarTela(page, info, "entrevista-validacao-sem-escolha.png");

    // "Marcar agora": habilita e o rótulo passa a prometer a marcação.
    await marcarAgora.click();
    await expect(marcarAgora).toHaveAttribute("aria-pressed", "true");
    const concluirEMarcar = page.getByRole("button", { name: BOTAO_CONCLUIR_E_MARCAR });
    await expect(concluirEMarcar).toBeEnabled();
    await expect(page.getByRole("button", { name: BOTAO_CONCLUIR })).toHaveCount(0);

    // "Não agendei agora": continua habilitado, volta ao rótulo curto e mostra
    // os motivos opcionais em chips.
    await naoAgendei.click();
    await expect(naoAgendei).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: BOTAO_CONCLUIR })).toBeEnabled();
    const motivos = page.getByRole("group", { name: "Por que não agendou (opcional)" });
    await expect(motivos.getByRole("button")).toHaveCount(4);
    await expect(motivos.getByRole("button", { name: "Cliente vai ver a agenda", exact: true })).toBeVisible();
    // NÃO conclui: fica só o rascunho.
  });

  test("caminho curto: 'Não agendei agora' conclui e volta à ficha", async ({ page }, info) => {
    test.skip(test.info().project.name !== "desktop", "Fluxo de dado roda uma vez, no desktop.");
    test.skip(process.env.QA_PERMITE_ESCRITA !== "1", RAZAO_ESCRITA);
    test.setTimeout(120_000);
    await ateAValidacaoCurta(page);

    // A frase de validação, palavra por palavra (`montarValidacao`).
    await expect(titulo(page)).toHaveText(
      "Deixa eu confirmar: você chegou até nós por um problema que está " +
        "acontecendo agora. O que precisa ficar claro é exatamente o que " +
        "fazer. E a decisão envolve só você. É isso?",
    );
    await registrarTela(page, info, "entrevista-validacao.png");

    // "Ajustar": leva à pergunta e oferece o caminho de volta.
    await page.getByRole("button", { name: BOTAO_AJUSTAR }).click();
    await page.getByRole("button", { name: /^motivo$/i }).click();
    await expect(titulo(page)).toContainText("O que aconteceu, ou o que você começou a perceber");
    await page.getByRole("button", { name: /^voltar à confirmação$/i }).click();
    await expect(page.getByRole("button", { name: BOTAO_CONFIRMOU })).toBeVisible();

    // Até 3 frases exatas, opcionais, ≤150 caracteres.
    const campos = page.locator("main fieldset").locator(CAMPO_DE_TEXTO);
    await expect(campos, "São 3 campos de frase, nem mais nem menos.").toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      await expect(campos.nth(i)).toHaveAttribute("maxlength", "150");
    }
    await campos.nth(0).fill('"Quero que meus filhos não briguem" <b>QA</b>');
    await campos.nth(1).fill("Não quero depender de inventário demorado");
    // A 3ª fica vazia: opcional.

    // Escolha da Reunião Preliminar: "Não agendei agora" + um motivo (opcional).
    const grupo = page.getByRole("group", { name: "Reunião Preliminar", exact: true });
    await grupo.getByRole("button", { name: "Não agendei agora", exact: true }).click();
    const motivo = page
      .getByRole("group", { name: "Por que não agendou (opcional)" })
      .getByRole("button", { name: "Cliente vai ver a agenda", exact: true });
    await motivo.click();
    await expect(motivo).toHaveAttribute("aria-pressed", "true");

    const concluir = page.getByRole("button", { name: BOTAO_CONCLUIR });
    await expect(concluir).toBeEnabled();
    await concluir.click();

    // Volta à ficha (rota da entrevista → `/clientes/<id>`), com o aviso do
    // que ficou registrado. NÃO vai para /agendar.
    await page.waitForURL(/\/clientes\/[0-9a-f-]+$/i, { timeout: 20_000 });
    await expect(
      page.getByText("Entrevista salva. Reunião Preliminar: não agendada."),
      "Faltou o aviso do que ficou registrado sobre a Reunião Preliminar.",
    ).toBeVisible({ timeout: 12_000 });
    await expect(page).not.toHaveURL(/\/agendar/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Marque a Reunião Preliminar" }),
    ).toHaveCount(0);
    await registrarTela(page, info, "entrevista-nao-agendou-ficha.png");
  });

  /**
   * "Marcar agora" → /agendar. 🔴 Conclui uma entrevista de verdade, como o
   * teste anterior. Escolhi o CAMINHO CURTO (e não o longo) porque ele não tem
   * decisor "decide junto": o longo gravaria cônjuge e sócio em
   * `gps.cliente_decisores` do cliente de teste e passaria a travar a
   * Preliminar dele (a trava fica até alguém apagar). O longo continua
   * provando as 15 perguntas, só sem concluir.
   */
  test("caminho curto: 'Marcar agora' conclui e leva a 'Marque a Reunião Preliminar'", async ({
    page,
  }, info) => {
    test.skip(test.info().project.name !== "desktop", "Fluxo de dado roda uma vez, no desktop.");
    test.skip(process.env.QA_PERMITE_ESCRITA !== "1", RAZAO_ESCRITA);
    test.setTimeout(120_000);
    await ateAValidacaoCurta(page);

    const grupo = page.getByRole("group", { name: "Reunião Preliminar", exact: true });
    await grupo.getByRole("button", { name: "Marcar agora", exact: true }).click();
    const concluir = page.getByRole("button", { name: BOTAO_CONCLUIR_E_MARCAR });
    await expect(concluir).toBeEnabled();
    await concluir.click();

    // A ponte: rota de agendar do parceiro, com o `e` da entrevista concluída.
    await page.waitForURL(/\/clientes\/[0-9a-f-]+\/entrevista\/agendar\?e=[0-9a-f-]{36}$/i, {
      timeout: 20_000,
    });
    await expect(
      page.getByRole("heading", { level: 1, name: "Marque a Reunião Preliminar" }),
    ).toBeVisible({ timeout: 12_000 });
    await expect(
      page.getByRole("link", { name: /voltar para a ficha/i }).first(),
      "Todo estado da tela de agendar oferece 'Voltar para a ficha'.",
    ).toBeVisible();

    await semRolagemHorizontal(page);
    await registrarTela(page, info, "entrevista-agendar.png");
    // 🔴 Não clica em horário: agendar criaria sessão e e-mail reais.
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
test.describe("Entrevista Prévia 3.0 · modo assistência (admin)", () => {
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

    // A descrição do modo assistência diz que a equipe NÃO marca a Reunião
    // Preliminar: o horário se combina com o parceiro (decisão (d), 29/09).
    await expect(page.getByText(/perguntas rápidas \(até 15\), cerca de 8 minutos/i)).toBeVisible();
    await expect(page.getByText(/o horário se combina com o parceiro/i)).toBeVisible();

    // O formulário montou: reusa os helpers do describe do parceiro (atravessa
    // a abertura, se houver; progresso e 1ª pergunta como botões marcáveis).
    // Só clica em "Começar" — não responde nada.
    await passarDaAbertura(page);
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
