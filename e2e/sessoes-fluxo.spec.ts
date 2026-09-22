import { test, expect, type Page } from "@playwright/test";
import { exigeLogin, exigeAdmin, entrar, registrarTela } from "./apoio";

/**
 * O FLUXO INTEIRO, ponta a ponta, nas duas contas.
 *
 * Os outros dois specs olham cada tela parada. Este exercita o que liga uma na
 * outra — que é onde esta feature nasceu com defeito: **três dos defeitos de
 * 22/09 apareceram ENTRE fatias, não dentro delas** (o DISC congelado, a
 * doutora sem reler o resumo, os campos sem allowlist). Tela isolada passava
 * em todos os três.
 *
 * 🔑 Este spec CRIA e DESFAZ o próprio dado. É o que tira o teste do resumo do
 * estado "pulado": sem sessão marcada não há o que concluir, e sem conclusão
 * não há resumo para reabrir. Teste que se pula não protege nada.
 *
 * ⚠️ Roda contra o ambiente publicado, com as contas de QA dedicadas. Ele
 * cancela o que marcou, mas se cair no meio pode deixar uma sessão marcada na
 * conta de teste — nunca em ambiente de parceiro real.
 */

const parceiro = exigeLogin();
const admin = exigeAdmin();

/** Marca o primeiro horário livre. Devolve o rótulo do que foi marcado. */
async function marcarPrimeiroHorario(page: Page): Promise<string | null> {
  await page.goto("/sessoes");

  // 🔑 ESPERAR a grade montar. `isVisible()` responde NO INSTANTE — sem espera
  // ele devolve false enquanto a página ainda está renderizando, e o teste se
  // pula sozinho achando que não há horário. Foi o que aconteceu na primeira
  // rodada deste spec: a grade tinha 64 botões e o teste relatou "nada a
  // marcar". Pulo silencioso é pior que falha: a suíte fica verde sem ter
  // exercitado nada.
  const botao = page.getByRole("button", { name: /^escolher \d{1,2}:\d{2}/i }).first();
  const apareceu = await botao
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (!apareceu) return null;

  const rotulo = (await botao.innerText()).trim();
  await botao.click();

  // Confirmação, se houver: a tela pode pedir certeza antes de assumir.
  const confirmar = page.getByRole("button", { name: /confirmar|marcar|sim/i }).first();
  if (await confirmar.isVisible().catch(() => false)) await confirmar.click();

  await page.waitForTimeout(3_000);
  return rotulo;
}

/**
 * Cancela pela EQUIPE, que é quem sempre pode.
 *
 * 🔑 O parceiro NEM SEMPRE consegue cancelar, e isso é regra de negócio, não
 * defeito: *"o prazo para cancelar sozinho terminou (é até 24 horas antes)"*.
 * A primeira versão deste spec cancelava pelo parceiro e falhou justamente
 * porque o horário livre mais próximo era para o dia seguinte — dentro da
 * janela travada. O teste acusava o produto de um erro que o produto não
 * cometeu.
 *
 * Cancelar pela equipe também é o que garante que a suíte não deixe sessão de
 * teste na agenda real de uma doutora.
 */
/**
 * 🔴 SÓ CANCELA SESSÃO DO CLIENTE DE TESTE. Nunca a de um parceiro real.
 *
 * `/admin/sessoes` é a agenda INTEIRA da equipe: a conta de QA é admin e
 * enxerga os compromissos de todos os parceiros com as doutoras. A primeira
 * versão deste helper cancelava "o primeiro botão Cancelar da lista", em laço
 * — e em 22/09 a lista tinha uma sessão real ("Graça · Cristiane · Agendada")
 * ao lado das de teste. Não foi cancelada por acaso de ordenação, não por
 * desenho.
 *
 * Cancelar ali não é um estrago de banco de teste: a RPC **manda e-mail ao
 * parceiro com o motivo**, e o motivo desta suíte diz "suíte E2E de QA". Uma
 * pessoa real receberia o aviso de que a reunião dela foi desmarcada por um
 * robô.
 *
 * Por isso a âncora é o NOME DO CLIENTE DE TESTE, conferido na própria linha
 * antes de clicar. Sem correspondência, o helper não toca em nada.
 */
const CLIENTE_DE_TESTE = /CLIENTE DE TESTE \(QA\)/i;

async function cancelarPelaEquipe(page: Page, motivo: string) {
  // Laço porque pode haver mais de uma sessão de teste pendente; teto de 10
  // para não girar para sempre se algo travar.
  for (let i = 0; i < 10; i++) {
    await page.goto("/admin/sessoes");
    await page.waitForTimeout(1_500);

    // A linha tem de ser do cliente de teste E ter botão de cancelar (só
    // sessão "agendada" tem). `filter` amarra as duas coisas na MESMA linha —
    // procurar o botão solto voltaria a pegar a sessão de qualquer um.
    const linhaDeTeste = page
      .locator("li, article, div")
      .filter({ hasText: CLIENTE_DE_TESTE })
      .filter({ has: page.getByRole("button", { name: /^cancelar$/i }) })
      .last();

    if (!(await linhaDeTeste.isVisible().catch(() => false))) return; // nada de teste pendente

    const botao = linhaDeTeste.getByRole("button", { name: /^cancelar$/i }).first();
    if (!(await botao.isVisible().catch(() => false))) return;

    await botao.click();
    // 🔴 SEGUNDA TRAVA, no diálogo já aberto: ele mostra a descrição da
    // sessão ("dia, hora — cliente"). Se o nome do cliente de teste não
    // estiver ali, é sessão de outra pessoa: sai sem confirmar. Uma trava só
    // é uma trava; duas é o que se usa quando o erro manda e-mail para um
    // parceiro real dizendo que a reunião dele foi desmarcada.
    const dialogo = page.getByRole("dialog").last();
    const textoDialogo = await dialogo.innerText().catch(() => "");
    if (!CLIENTE_DE_TESTE.test(textoDialogo)) {
      await page.getByRole("button", { name: /^voltar$/i }).last().click().catch(() => {});
      return;
    }

    const campo = page.locator("textarea").last();
    // O motivo é obrigatório no banco e o ALUNO o vê — por isso diz, em
    // português, que foi a suíte, e não deixa o parceiro achar que a equipe
    // desmarcou sem explicação.
    if (await campo.isVisible().catch(() => false)) await campo.fill(motivo);

    // 🔴 `^cancelar sessão$` ancorado: sem as âncoras o seletor casa também
    // com o TÍTULO do diálogo ("Cancelar a sessão") e o clique não confirma.
    await page.getByRole("button", { name: /^cancelar sess(ã|a)o$/i }).last().click();
    await page.waitForTimeout(3_500);
  }
}

test.describe("Fluxo ponta a ponta · parceiro marca → equipe vê", () => {
  test.skip(
    !parceiro || !admin,
    "Precisa das DUAS contas (QA_PARCEIRO_* e QA_ADMIN_*) no .env.qa.",
  );
  test("o parceiro marca, a equipe enxerga a mesma sessão, e o cancelamento desfaz", async ({
    browser,
  }, info) => {
    // Só no desktop: é fluxo de DADO, não de geometria. Rodar nos dois
    // projetos marcaria duas sessões disputando o mesmo bloco, e a trava
    // `sessao_slot_unico` derrubaria a segunda — falha que parece do produto
    // e é do teste.
    test.skip(
      test.info().project.name !== "desktop",
      "Fluxo de dado roda uma vez só, no desktop.",
    );

    const ctxParceiro = await browser.newContext({ locale: "pt-BR" });
    const ctxAdmin = await browser.newContext({ locale: "pt-BR" });
    const pgParceiro = await ctxParceiro.newPage();
    const pgAdmin = await ctxAdmin.newPage();

    const MOTIVO =
      "Sessão criada pela suíte E2E de QA. Não é cliente real; cancelamento automático.";

    try {
      await entrar(pgParceiro, parceiro!, "/sessoes");
      await entrar(pgAdmin, admin!, "/admin/sessoes");
      await cancelarPelaEquipe(pgAdmin, MOTIVO); // começa limpo

      const marcado = await marcarPrimeiroHorario(pgParceiro);
      test.skip(!marcado, "A grade não ofereceu nenhum horário — nada a marcar.");

      // 1) O parceiro vê a própria sessão.
      const textoParceiro = await pgParceiro.locator("#conteudo").last().innerText();
      expect(
        /sua sess|cancelar|marcada|confirmada/i.test(textoParceiro),
        `Marquei "${marcado}" e a tela do parceiro não mostra a sessão.\n\n` +
          textoParceiro.slice(0, 600),
      ).toBe(true);
      await registrarTela(pgParceiro, info, "fluxo-1-parceiro-marcou.png");

      // 2) 🔴 A EQUIPE VÊ A MESMA SESSÃO. É a costura entre as fatias: se a
      // doutora não enxerga o que o parceiro marcou, o sistema prometeu uma
      // reunião que ninguém assumiu — exatamente o que levou à remoção do
      // agendamento antigo em 10/08.
      await pgAdmin.goto("/admin/sessoes");
      await pgAdmin.waitForTimeout(2_000);
      const textoAdmin = await pgAdmin.locator("#conteudo").last().innerText();

      // A prova amarra HORA + CLIENTE DE TESTE na parte "Próximas": só a hora
      // casaria com a sessão de outro parceiro no mesmo horário e daria um
      // verde falso — a tela pareceria certa sem ter mostrado o que o teste
      // acabou de marcar.
      const hora = marcado!.match(/\d{1,2}:\d{2}/)?.[0] ?? "";
      const proximasAdmin = textoAdmin.split(/Histórico/i)[0] ?? "";
      expect(
        proximasAdmin.includes(hora) && CLIENTE_DE_TESTE.test(proximasAdmin),
        `O parceiro marcou ${hora} para o cliente de teste e a tela da EQUIPE ` +
          `não mostra essa sessão. A doutora não saberia que tem compromisso.` +
          `\n\n${textoAdmin.slice(0, 700)}`,
      ).toBe(true);
      await registrarTela(pgAdmin, info, "fluxo-2-equipe-ve.png");

      // 3) Cancelar SAI de "Próximas" e ENTRA no "Histórico" com o motivo.
      // Não basta sumir da primeira lista: some do lugar errado e a equipe
      // perde o registro de que houve um cancelamento e por quê.
      await cancelarPelaEquipe(pgAdmin, MOTIVO);
      await pgAdmin.goto("/admin/sessoes");
      await pgAdmin.waitForTimeout(2_500);
      const depois = await pgAdmin.locator("#conteudo").last().innerText();

      // 🔑 A asserção olha SÓ o cliente de teste dentro de "Próximas".
      //
      // Não pode exigir a lista vazia: `/admin/sessoes` é a agenda inteira da
      // equipe e costuma ter sessões de parceiros reais — em 22/09 havia uma
      // ("Graça · Cristiane"), e exigir vazio reprovaria o produto por um
      // compromisso legítimo de outra pessoa. O que este teste afirma é o que
      // ele próprio causou: a sessão que ELE marcou não ficou pendurada.
      const proximas = depois.split(/Histórico/i)[0] ?? "";
      expect(
        !CLIENTE_DE_TESTE.test(proximas),
        `Cancelei a sessão de teste e ela continua em "Próximas sessões" — a ` +
          `doutora ficaria com uma reunião de teste na agenda.\n\n${depois.slice(0, 600)}`,
      ).toBe(true);
      expect(
        /cancelad/i.test(depois),
        "A sessão cancelada não aparece como 'Cancelada' no histórico. " +
          "Cancelamento que some sem deixar rastro apaga o porquê.",
      ).toBe(true);
      await registrarTela(pgAdmin, info, "fluxo-3-cancelada.png");
    } finally {
      // Não deixa dado de teste na agenda real de uma doutora, mesmo se algo
      // falhar no meio.
      await cancelarPelaEquipe(pgAdmin, MOTIVO).catch(() => {});
      await ctxParceiro.close();
      await ctxAdmin.close();
    }
  });
});
