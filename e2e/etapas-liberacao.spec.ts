import { test, expect, type Page, type Locator } from "@playwright/test";
import { exigeAdmin, entrar, registrarTela } from "./apoio";

/**
 * Liberação de etapa POR ALUNO (30/09/2026): o painel individual do Resolver
 * e o lote do `/admin`. As duas portas gravam pela mesma action
 * (`definirLiberacaoEtapasEmLote` → `gps.admin_definir_liberacao_etapas_lote`).
 *
 * 🔴 O QUE ISTO GUARDA: gravar não é repintar. A action só revalida; quem faz
 * a tela mostrar o estado novo é o `router.refresh()` do componente. Sem ele o
 * admin lê "1 etapa alterada." ao lado de uma linha que ainda diz "Liberada
 * para todos" — e o próximo clique desfaz o que ele acabou de fazer. Aqui a
 * prova é o TEXTO do estado (a descrição acessível do `radiogroup`) mudar.
 *
 * ── 🔴 ESTE SPEC ESCREVE EM PRODUÇÃO ──
 *
 * Só em aluno de QA, e sempre de volta à regra geral:
 *
 *  1. Painel individual: o parceiro de QA (`QA_PARCEIRO_EMAIL`), achado pela
 *     busca do `/admin` com exatamente 1 resultado.
 *  2. Lote: dois alunos de QA declarados no `.env.qa` —
 *     `QA_LOTE_BUSCA` (termo que mostra SÓ os dois na lista) e
 *     `QA_LOTE_NOMES` (os dois nomes, separados por `;`). Âncora conferida
 *     DUAS vezes: exatamente 2 caixas na lista, e cada uma com o nome
 *     declarado. Sem as variáveis, o teste de lote se PULA — nunca escolhe
 *     parceiro real por ordem da lista.
 *  3. Pré-condição: a etapa tocada precisa estar SEM exceção para o aluno.
 *     Com exceção, o teste se pula: sobrescrever uma exceção que a equipe pôs
 *     de propósito apagaria o motivo dela.
 *  4. `finally` devolve à regra geral mesmo se a asserção falhar.
 *
 * Efeito externo: a RPC grava `etapa_liberacao_aluno`, `acessos_log` e um
 * evento no Diário do aluno. Nenhum e-mail no caminho do código lido.
 *
 * ⚠️ Execução interrompida à força (Ctrl+C)? Conferir:
 *     select aluno_id, etapa, liberada, motivo, em
 *       from gps.etapa_liberacao_aluno where motivo like 'E2E%';
 *     -- qualquer linha = exceção de teste que ficou. Voltar à regra geral
 *     -- pelo Resolver do aluno.
 */

const cred = exigeAdmin();
const emailParceiroQa = process.env.QA_PARCEIRO_EMAIL ?? "";
const buscaLote = (process.env.QA_LOTE_BUSCA ?? "").trim();
const nomesLote = (process.env.QA_LOTE_NOMES ?? "")
  .split(";")
  .map((n) => n.trim())
  .filter(Boolean);

const MOTIVO = "E2E QA — teste automatizado, desfeito no mesmo teste";
const MOTIVO_VOLTA = "E2E QA — volta à regra geral";

const doisDigitos = (n: number) => String(n).padStart(2, "0");

/** A lista de parceiros do `/admin`, com a busca preenchida. */
async function listaComBusca(page: Page, termo: string) {
  await page.goto("/admin?aba=ativos");
  const busca = page.getByRole("searchbox", {
    name: "Buscar parceiro por nome ou e-mail",
  });
  await expect(busca).toBeVisible({ timeout: 15_000 });
  await busca.fill(termo);
  return busca;
}

/** O `alunoId` que o link "Abrir o ambiente de …" do card carrega. */
async function alunoIdDoLink(link: Locator): Promise<string> {
  const href = (await link.getAttribute("href")) ?? "";
  const m = href.match(/^\/admin\/aluno\/([^/?#]+)$/);
  expect(m, `href inesperado no card: "${href}"`).not.toBeNull();
  return m![1];
}

/** O painel "Liberar ou travar etapas" do Resolver do aluno. */
async function abrirPainel(page: Page, alunoId: string) {
  await page.goto(`/admin/aluno/${alunoId}/resolver`);
  const titulo = page.getByRole("heading", { name: "Liberar ou travar etapas" });
  await expect(titulo).toBeVisible({ timeout: 20_000 });
  await titulo.scrollIntoViewIfNeeded();
  return titulo.locator("xpath=..");
}

function grupoDaEtapa(escopo: Locator | Page, etapa: number) {
  return escopo.getByRole("radiogroup", {
    name: new RegExp(`^${doisDigitos(etapa)} — `),
  });
}

/**
 * Grava uma escolha no painel individual. Travar/voltar passam pela
 * confirmação ("Salvar mudanças"); liberar grava direto.
 */
async function gravarNoPainel(
  painel: Locator,
  page: Page,
  etapa: number,
  opcao: "Seguir regra geral" | "Liberar" | "Travar",
  motivo: string,
) {
  const grupo = grupoDaEtapa(painel, etapa);
  await grupo.getByRole("radio", { name: opcao, exact: true }).check();
  await painel.getByLabel(/^Motivo \(fica no histórico do parceiro\)/).fill(motivo);
  await painel.getByRole("button", { name: "Salvar", exact: true }).click();
  if (opcao !== "Liberar") {
    await page.getByRole("button", { name: "Salvar mudanças", exact: true }).click();
  }
  await expect(painel.getByText("1 etapa alterada.", { exact: true })).toBeVisible({
    timeout: 20_000,
  });
}

/** Rede de segurança do `finally`: volta à regra geral, sem lançar. */
async function voltarARegraGeral(page: Page, alunoId: string, etapa: number) {
  try {
    const painel = await abrirPainel(page, alunoId);
    const regra = grupoDaEtapa(painel, etapa).getByRole("radio", {
      name: "Seguir regra geral",
      exact: true,
    });
    if (await regra.isChecked()) return;
    await gravarNoPainel(painel, page, etapa, "Seguir regra geral", MOTIVO_VOLTA);
  } catch (e) {
    console.error(
      `🔴 NÃO consegui devolver a etapa ${etapa} do aluno ${alunoId} à regra ` +
        `geral. PRODUÇÃO — corrigir à mão no Resolver. ${String(e)}`,
    );
  }
}

test.describe("Admin · etapas por aluno — painel do Resolver", () => {
  test.skip(!cred, "Sem QA_ADMIN_EMAIL/SENHA no .env.qa.");
  test.skip(!emailParceiroQa, "Sem QA_PARCEIRO_EMAIL no .env.qa.");

  test("travar a etapa 1 do parceiro de QA mostra a exceção; voltar à regra geral devolve o padrão", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "desktop", "Escreve em produção: roda uma vez só.");
    test.setTimeout(150_000);

    await entrar(page, cred!, "/admin?aba=ativos");

    // Âncora: o e-mail do parceiro de QA casa com UM card só.
    await listaComBusca(page, emailParceiroQa);
    const links = page.getByRole("link", { name: /^Abrir o ambiente de / });
    await expect(links).toHaveCount(1, { timeout: 15_000 });
    const alunoId = await alunoIdDoLink(links.first());

    const painel = await abrirPainel(page, alunoId);
    const grupo = grupoDaEtapa(painel, 1);
    await expect(grupo).toBeVisible();

    const semExcecao = await grupo
      .getByRole("radio", { name: "Seguir regra geral", exact: true })
      .isChecked();
    test.skip(
      !semExcecao,
      "A etapa 1 do parceiro de QA já tem exceção. Não sobrescrevo exceção " +
        "posta pela equipe — volte-a à regra geral no Resolver e rode de novo.",
    );
    // Travar só muda algo se a regra geral LIBERA a etapa (a RPC pula
    // "sem exceção e pedido = global"). Travada para todos, o teste mediria
    // "Nada mudou." e não provaria o caminho.
    await expect(grupo).toHaveAccessibleDescription("Liberada para todos");

    let trocada = false;
    try {
      trocada = true;
      await gravarNoPainel(painel, page, 1, "Travar", MOTIVO);
      // 🔴 A prova de repintura: o texto do estado, não o aviso.
      await expect(grupo).toHaveAccessibleDescription(
        "Exceção: travada para este aluno",
        { timeout: 20_000 },
      );
      await expect(
        grupo.getByRole("radio", { name: "Travar", exact: true }),
      ).toBeChecked();
      await registrarTela(page, info, "etapa1-travada.png");

      await gravarNoPainel(painel, page, 1, "Seguir regra geral", MOTIVO_VOLTA);
      await expect(grupo).toHaveAccessibleDescription("Liberada para todos", {
        timeout: 20_000,
      });
      await expect(
        grupo.getByRole("radio", { name: "Seguir regra geral", exact: true }),
      ).toBeChecked();
      trocada = false;
    } finally {
      if (trocada) await voltarARegraGeral(page, alunoId, 1);
    }
  });
});

test.describe("Admin · etapas em lote — /admin?lote=etapas", () => {
  test.skip(!cred, "Sem QA_ADMIN_EMAIL/SENHA no .env.qa.");
  test.skip(
    !buscaLote || nomesLote.length !== 2,
    "Sem QA_LOTE_BUSCA e QA_LOTE_NOMES (2 nomes, separados por ';') no .env.qa. " +
      "O lote só roda sobre 2 alunos de QA declarados — nunca sobre parceiro real.",
  );

  test("liberar a etapa 3 para 2 alunos de QA devolve a contagem; voltar à regra geral confirma", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "desktop", "Escreve em produção: roda uma vez só.");
    test.setTimeout(240_000);

    await entrar(page, cred!, "/admin?aba=ativos");
    await page.goto("/admin?aba=ativos");

    // Porta de entrada: o botão da lista liga o modo, e a URL passa a dizer.
    const ligar = page.getByRole("button", { name: "Liberar etapas em lote" });
    await expect(ligar).toBeVisible({ timeout: 15_000 });
    await ligar.click();
    await expect(
      page.getByRole("button", { name: "Fechar lote de etapas" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(/[?&]lote=etapas\b/);

    const busca = page.getByRole("searchbox", {
      name: "Buscar parceiro por nome ou e-mail",
    });
    await busca.fill(buscaLote);

    // 🔴 Âncora dupla: exatamente 2 caixas, e cada uma com o nome declarado.
    const caixas = page.getByRole("checkbox", {
      name: /^Selecionar .+ para liberar etapas$/,
    });
    await expect(caixas).toHaveCount(2, { timeout: 15_000 });
    const ids: string[] = [];
    for (const nome of nomesLote) {
      await expect(
        page.getByRole("checkbox", {
          name: `Selecionar ${nome} para liberar etapas`,
          exact: true,
        }),
      ).toBeVisible();
      ids.push(
        await alunoIdDoLink(
          page.getByRole("link", { name: `Abrir o ambiente de ${nome}`, exact: true }),
        ),
      );
    }

    // Pré-condição, aluno a aluno: etapa 3 sem exceção e travada para todos
    // (liberada para todos, a RPC conta "já estava assim" e nada é provado).
    for (const id of ids) {
      const painel = await abrirPainel(page, id);
      const grupo = grupoDaEtapa(painel, 3);
      const semExcecao = await grupo
        .getByRole("radio", { name: "Seguir regra geral", exact: true })
        .isChecked();
      test.skip(
        !semExcecao,
        `A etapa 3 do aluno ${id} já tem exceção. Não sobrescrevo exceção ` +
          `posta pela equipe.`,
      );
      await expect(grupo).toHaveAccessibleDescription("Travada para todos");
    }

    let liberou = false;
    try {
      await page.goto(
        `/admin?aba=ativos&lote=etapas&q=${encodeURIComponent(buscaLote)}`,
      );
      await expect(caixas).toHaveCount(2, { timeout: 15_000 });
      for (const nome of nomesLote) {
        await page
          .getByRole("checkbox", {
            name: `Selecionar ${nome} para liberar etapas`,
            exact: true,
          })
          .check();
      }
      await expect(
        page.getByText("2 parceiros selecionados", { exact: true }),
      ).toBeVisible();

      const etapa3 = grupoDaEtapa(page, 3);
      await etapa3.getByRole("radio", { name: "Liberar", exact: true }).check();
      await page
        .getByLabel(/^Motivo \(fica no histórico de cada parceiro\)/)
        .fill(MOTIVO);
      await page
        .getByRole("button", { name: "Liberar etapas para os selecionados" })
        .click();

      liberou = true;
      await page
        .getByRole("button", { name: "Liberar para 2 pessoas", exact: true })
        .click();

      // O retorno do lote: 2 pares (aluno, etapa), os 2 alterados.
      await expect(
        page.getByText("2 alterações, 0 já estavam assim.", { exact: true }),
      ).toBeVisible({ timeout: 20_000 });
      await registrarTela(page, info, "lote-etapa3-liberada.png");

      // Desfazer: o lote só LIBERA (não há "voltar à regra geral" nele), então
      // a volta passa pelo painel individual de cada aluno — a mesma action.
      for (const id of ids) {
        const painel = await abrirPainel(page, id);
        const grupo = grupoDaEtapa(painel, 3);
        await expect(grupo).toHaveAccessibleDescription(
          "Exceção: liberada para este aluno",
        );
        await gravarNoPainel(painel, page, 3, "Seguir regra geral", MOTIVO_VOLTA);
        await expect(grupo).toHaveAccessibleDescription("Travada para todos", {
          timeout: 20_000,
        });
      }
      liberou = false;
    } finally {
      if (liberou) for (const id of ids) await voltarARegraGeral(page, id, 3);
    }
  });
});
