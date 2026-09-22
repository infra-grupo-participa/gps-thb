import { expect, type Page, type TestInfo } from "@playwright/test";

/**
 * Ferramentas da suíte E2E — o que vale para QUALQUER tela do GPS.
 *
 * A ideia: cada feature nova escreve o seu fluxo, mas reusa daqui as
 * verificações que a casa já aprendeu a cobrar. Assim a régua sobe uma vez
 * e vale para todas.
 */

/** Falta credencial? O teste se pula com aviso, em vez de falhar. */
export function exigeLogin(): { email: string; senha: string } | null {
  const email = process.env.QA_PARCEIRO_EMAIL;
  const senha = process.env.QA_PARCEIRO_SENHA;
  return email && senha ? { email, senha } : null;
}

export function exigeAdmin(): { email: string; senha: string } | null {
  const email = process.env.QA_ADMIN_EMAIL;
  const senha = process.env.QA_ADMIN_SENHA;
  return email && senha ? { email, senha } : null;
}

/**
 * Entra no portal pela TELA DE LOGIN, como uma pessoa entraria.
 *
 * 🔑 Não injeta cookie nem token: se o login quebrar, o teste tem de quebrar
 * junto. Autenticar por atalho esconde justamente a tela pela qual todo mundo
 * passa todo dia.
 */
export async function entrar(
  page: Page,
  cred: { email: string; senha: string },
  destino = "/",
) {
  await page.goto(`/login?redirect=${encodeURIComponent(destino)}`);
  await page.getByLabel(/e-?mail/i).fill(cred.email);
  await page.getByLabel(/senha/i).first().fill(cred.senha);
  await page.getByRole("button", { name: /entrar|acessar/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), {
    timeout: 20_000,
  });
  await passarDoPortalDeEntrada(page);
}

/**
 * 🔑 Entrar não é o mesmo que estar pronto para usar o sistema.
 *
 * Quem recebe senha da equipe (as 3 RPCs de senha gravam
 * `user_metadata.gps_senha_temp_em`) cai no portal do onboarding, que é um
 * diálogo MODAL: o overlay cobre a página inteira e nenhum clique chega ao
 * header. Descoberto pela primeira rodada desta suíte, em que o teste da aba
 * "Sessões" falhou não por ausência da aba — ela estava lá, com href certo —
 * mas porque o overlay interceptava o clique.
 *
 * **Não é defeito do produto: é o produto funcionando.** É o que todo parceiro
 * novo vê. Por isso o helper ATRAVESSA o portal em vez de desligá-lo por
 * atalho — desligar esconderia justamente a primeira tela de quem entra.
 *
 * Fecha por Esc (o portal permite adiar o tour); o passo 0 de senha é
 * obrigatório e não se fecha, então nesse caso o teste PRECISA parar e dizer o
 * que fazer, em vez de adivinhar uma senha nova e derrubar a credencial de QA.
 */
export async function passarDoPortalDeEntrada(page: Page) {
  const overlay = page.locator('[data-slot="dialog-overlay"]');
  if (!(await overlay.first().isVisible().catch(() => false))) return;

  const pedeSenha = await page
    .getByRole("button", { name: /salvar a senha/i })
    .isVisible()
    .catch(() => false);

  if (pedeSenha) {
    throw new Error(
      "A conta de QA entrou com SENHA TEMPORÁRIA e o portal exige trocá-la " +
        "(passo 0 do onboarding) antes de liberar o sistema. Isso é o produto " +
        "funcionando, não um defeito.\n" +
        "Para destravar: entre uma vez no navegador com essa conta, defina a " +
        "senha definitiva, e atualize QA_PARCEIRO_SENHA/QA_ADMIN_SENHA no .env.qa.\n" +
        "A suíte não faz isso sozinha de propósito — trocar a senha por script " +
        "invalidaria a credencial guardada e derrubaria as próximas rodadas.",
    );
  }

  // Tour normal (sem senha pendente): dá para adiar.
  await page.keyboard.press("Escape");
  await overlay.first().waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
}

/**
 * 🔴 NENHUMA rolagem horizontal. É o defeito que mais aparece em 390px e o
 * que o `tsc` nunca vê: um `min-width` largo, uma tabela sem `overflow-x`,
 * um texto que não quebra.
 */
export async function semRolagemHorizontal(page: Page) {
  // 🔑 Medir DEPOIS de a página assentar.
  //
  // Medido em 22/09 na /sessoes a 412px: o primeiro frame tem scrollWidth 416
  // (4px de estouro) e ele some em ~200ms, antes da hidratação terminar. Medir
  // no instante do `goto` transformaria um flash de layout em falha vermelha
  // todo dia, e teste que falha por tempo em vez de por defeito é abandonado
  // em uma semana — o custo real é a suíte perder autoridade.
  //
  // O que esta função cobra é o estado ESTÁVEL, que é o que a pessoa usa.
  await page
    .waitForFunction(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      undefined,
      { timeout: 3_000 },
    )
    .catch(() => {
      // Continua e deixa a asserção abaixo reprovar com o número medido —
      // um estouro que NÃO some é exatamente o defeito que se quer pegar.
    });

  const estouro = await page.evaluate(() => {
    const d = document.documentElement;
    return { rola: d.scrollWidth, cabe: d.clientWidth };
  });
  expect(
    estouro.rola,
    `A página rola ${estouro.rola - estouro.cabe}px na horizontal ` +
      `(conteúdo ${estouro.rola}px numa viewport de ${estouro.cabe}px). ` +
      `Só tabela, diagrama e bloco de código podem passar, e cada um dentro ` +
      `do próprio contêiner com overflow-x.`,
  ).toBeLessThanOrEqual(estouro.cabe + 1);
}

/** Converte qualquer cor CSS para luminância relativa (WCAG). */
function luminancia(rgb: [number, number, number]) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function razaoDeContraste(
  frente: [number, number, number],
  fundo: [number, number, number],
) {
  const a = luminancia(frente);
  const b = luminancia(fundo);
  const [claro, escuro] = a > b ? [a, b] : [b, a];
  return (claro + 0.05) / (escuro + 0.05);
}

/**
 * 🔴 Contraste medido NO DOM PINTADO, com o fundo COMPOSTO.
 *
 * Por que não basta auditar tokens: esta casa já achou um caso (22/09) em que
 * o par só existia enquanto uma animação rodava — 6,68:1 que nenhuma auditoria
 * de paleta pegaria. A cor que importa é a que o olho recebe.
 *
 * Regra aplicada: 4,5:1 para texto normal, 3:1 para texto grande (≥24px, ou
 * ≥18.66px em negrito), conforme WCAG 1.4.3.
 */
export async function contrasteAprovado(page: Page, titulo = "a página") {
  const falhas = await page.evaluate(() => {
    function paraRgb(cor: string): [number, number, number] | null {
      const m = cor.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(",").map((x) => parseFloat(x));
      return [p[0], p[1], p[2]];
    }
    function fundoComposto(el: Element): [number, number, number] {
      let n: Element | null = el;
      while (n) {
        const cs = getComputedStyle(n);
        const rgb = paraRgb(cs.backgroundColor);
        const alfa = parseFloat(cs.backgroundColor.match(/rgba?\(([^)]+)\)/)?.[1].split(",")[3] ?? "1");
        if (rgb && alfa > 0.5) return rgb;
        n = n.parentElement;
      }
      return [255, 255, 255];
    }
    function lum(rgb: number[]) {
      const [r, g, b] = rgb.map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    const ruins: { texto: string; razao: number; exigido: number }[] = [];
    const todos = document.querySelectorAll<HTMLElement>("body *");
    for (const el of todos) {
      const texto = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent?.trim() ?? "")
        .join(" ")
        .trim();
      if (!texto) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.opacity === "0") continue;
      const frente = paraRgb(cs.color);
      if (!frente) continue;
      const fundo = fundoComposto(el);
      const a = lum(frente), b = lum(fundo);
      const [cl, es] = a > b ? [a, b] : [b, a];
      const razao = (cl + 0.05) / (es + 0.05);
      const px = parseFloat(cs.fontSize);
      const peso = parseInt(cs.fontWeight) || 400;
      const grande = px >= 24 || (px >= 18.66 && peso >= 700);
      const exigido = grande ? 3 : 4.5;
      if (razao < exigido - 0.01) {
        ruins.push({ texto: texto.slice(0, 60), razao: +razao.toFixed(2), exigido });
      }
    }
    return ruins;
  });

  expect(
    falhas,
    `Contraste reprovado em ${titulo} (WCAG 1.4.3), medido no DOM pintado:\n` +
      falhas.map((f) => `  • "${f.texto}" → ${f.razao}:1 (exige ${f.exigido}:1)`).join("\n"),
  ).toEqual([]);
}

/**
 * Todo elemento clicável precisa de alvo tocável. 24×24 CSS px é o mínimo do
 * WCAG 2.2 (2.5.8); abaixo disso, no celular, a pessoa erra o clique.
 */
export async function alvosDeClique(page: Page, minimo = 24) {
  // 🔑 Rola até o fim ANTES de medir. Medido em 22/09: o link "← Voltar ao
  // início" (117×17px, reprovado) só era detectado em 1 de 3 execuções,
  // porque elementos abaixo da dobra podem não ter layout estável até a
  // página rolar. Teste que acha o defeito 1 em 3 vezes é pior que teste
  // nenhum: ensina a ignorar o vermelho.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);

  const pequenos = await page.evaluate((min) => {
    const ruins: { rotulo: string; l: number; a: number }[] = [];
    document.querySelectorAll<HTMLElement>("a[href], button, [role=button], input, select, textarea")
      .forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;       // escondido
        if (getComputedStyle(el).display === "contents") return;

        // 🔑 Skip link ("Pular para o conteúdo"): fica 1×1px de propósito até
        // receber foco pelo teclado, e AÍ cresce. Medi-lo em repouso reprova
        // um padrão de acessibilidade correto — o alvo real é o que existe no
        // estado focado, que é o único em que ele é alcançável.
        // Regra: elemento que só aparece com foco é medido com foco, ou não é
        // medido. Aqui, não é.
        const escondidoAteFoco =
          el.matches(":not(:focus)") &&
          (r.width <= 2 || r.height <= 2) &&
          /sr-only|skip|pular/i.test(el.className + " " + (el.textContent ?? ""));
        if (escondidoAteFoco) return;
        if (r.height < min || r.width < min) {
          ruins.push({
            rotulo: (el.textContent?.trim() || el.getAttribute("aria-label") || el.tagName).slice(0, 40),
            l: Math.round(r.width),
            a: Math.round(r.height),
          });
        }
      });
    return ruins;
  }, minimo);

  expect(
    pequenos,
    `Alvo de clique menor que ${minimo}×${minimo}px (WCAG 2.5.8):\n` +
      pequenos.map((p) => `  • "${p.rotulo}" → ${p.l}×${p.a}px`).join("\n"),
  ).toEqual([]);
}

/** O console não pode cuspir erro: erro lá costuma ser hidratação ou fetch morto. */
export function vigiarConsole(page: Page) {
  const erros: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") erros.push(m.text());
  });
  page.on("pageerror", (e) => erros.push(String(e)));
  return {
    semErros(ignorar: RegExp[] = []) {
      const relevantes = erros.filter((e) => !ignorar.some((r) => r.test(e)));
      expect(relevantes, `Erros no console:\n${relevantes.join("\n")}`).toEqual([]);
    },
  };
}

/** Guarda uma imagem da tela no relatório — para você OLHAR, não só ler. */
export async function registrarTela(page: Page, info: TestInfo, nome: string) {
  const img = await page.screenshot({ fullPage: true });
  await info.attach(nome, { body: img, contentType: "image/png" });
}
