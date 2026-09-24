import { test, expect } from "@playwright/test";
import {
  exigeAdmin,
  entrar,
  semRolagemHorizontal,
  contrasteAprovado,
  alvosDeClique,
  vigiarConsole,
  registrarTela,
} from "./apoio";

/**
 * `/admin/sessoes` — a tela da EQUIPE (doutoras e admins).
 *
 * 🔴 O teste mais importante deste arquivo é o do RESUMO. O pentest de 22/09
 * achou que "Registrar/editar resumo" abria o formulário VAZIO mesmo quando a
 * sessão já tinha resumo — e `sessao_resumo_editar` SOBRESCREVE. Quem clicasse
 * numa sessão já resumida apagava o texto anterior sem nunca tê-lo visto, e o
 * texto é IRRECUPERÁVEL: a trilha guarda o tamanho, nunca o conteúdo (LGPD).
 *
 * Um teste de unidade não pegaria isso: a RPC de leitura existia e passava
 * 3/3 no banco. O defeito era ela NÃO SER CHAMADA pela tela. Só abrir o
 * formulário no navegador revela.
 */

const cred = exigeAdmin();

test.describe("Equipe · /admin/sessoes", () => {
  test.skip(
    !cred,
    "Sem QA_ADMIN_EMAIL/SENHA — defina-os em .env.qa (aponte QA_ENV_FILE).",
  );

  test.beforeEach(async ({ page }) => {
    await entrar(page, cred!, "/admin/sessoes");
  });

  test("a tela carrega com as duas seções, sem erro de console", async ({ page }, info) => {
    const console_ = vigiarConsole(page);
    await page.goto("/admin/sessoes");

    await expect(
      page.getByRole("heading", { name: /sess(õ|o)es com a equipe/i }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: /próximas sess(õ|o)es/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /histórico/i })).toBeVisible();

    await semRolagemHorizontal(page);
    await registrarTela(page, info, `admin-sessoes-${test.info().project.name}.png`);
    console_.semErros();
  });

  test("🔴 ACHADO ALTO: 'Registrar/editar resumo' abre COM o texto já gravado", async ({
    page,
  }, info) => {
    await page.goto("/admin/sessoes");

    const botao = page.getByRole("button", { name: /registrar\/editar resumo/i }).first();
    const existe = await botao
      .waitFor({ state: "visible", timeout: 8_000 })
      .then(() => true)
      .catch(() => false);

    // 🔑 Este teste NÃO se pula em silêncio.
    //
    // É o que guarda o achado ALTO de 22/09, e um teste pulado não guarda
    // nada — fica verde para sempre enquanto a regressão volta. Se não há
    // sessão concluída, o teste DIZ o que fazer, em vez de sumir do relatório.
    //
    // Como produzir o alvo: `sessoes-fluxo.spec.ts` marca uma sessão, e
    // "Concluir sessão" aparece quando o horário já começou. A suíte não
    // adianta o relógio do servidor (não deve), então rode este arquivo
    // depois que houver ao menos uma sessão concluída na conta de QA.
    expect(
      existe,
      "Nenhuma sessão concluída na conta de QA, então o teste que protege o " +
        "achado ALTO (o resumo abrindo VAZIO e sobrescrevendo texto que " +
        "ninguém leu) NÃO foi exercitado.\n\n" +
        "Para destravar: conclua uma sessão de teste em /admin/sessoes " +
        "(o botão 'Concluir sessão' aparece a partir do horário de início) e " +
        "rode de novo. Deixar este teste pulado devolve a feature ao estado " +
        "em que o defeito passou despercebido.",
    ).toBe(true);

    await botao.click();

    const caixa = page.locator("textarea").first();
    await expect(caixa).toBeVisible();
    const textoAoAbrir = await caixa.inputValue();

    await registrarTela(page, info, "resumo-ao-abrir.png");

    // 🔑 A PROVA é o CICLO, não o estado inicial.
    //
    // Abrir e encontrar a caixa vazia não prova defeito: a sessão pode nunca
    // ter tido resumo. E abrir com texto não prova que está correto. O que
    // distingue os dois mundos é escrever → salvar → REABRIR: se a tela
    // busca o texto gravado, ele volta; se não busca, volta vazio e o próximo
    // "Salvar" apaga o que estava lá. Por isso o teste exercita o ciclo
    // inteiro em vez de afirmar algo sobre o primeiro `inputValue()`.
    const marca = `QA ${Date.now()} — resumo de teste da suíte E2E, texto suficientemente longo.`;
    await caixa.fill(marca);
    await page.getByRole("button", { name: /salvar resumo/i }).click();

    await expect(page.getByRole("button", { name: /registrar\/editar resumo/i }).first())
      .toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /registrar\/editar resumo/i }).first().click();

    const caixaDeNovo = page.locator("textarea").first();
    await expect(caixaDeNovo).toBeVisible();
    await expect(
      caixaDeNovo,
      "Reabrir o formulário NÃO trouxe o texto recém-salvo. É exatamente o " +
        "achado ALTO de 22/09: o próximo clique em 'Salvar' apagaria um resumo " +
        "que ninguém leu, e o texto antigo é irrecuperável (a trilha guarda só o tamanho).",
    ).toHaveValue(marca);

    // Não deixa lixo: devolve o texto que estava antes.
    await caixaDeNovo.fill(textoAoAbrir || marca);
    if (textoAoAbrir) {
      await page.getByRole("button", { name: /salvar resumo/i }).click();
    } else {
      await page.getByRole("button", { name: /voltar/i }).click();
    }
  });

  test("o resumo recusa texto curto demais, com frase em português", async ({ page }) => {
    await page.goto("/admin/sessoes");

    // ESPERAR, não `isVisible()` cru: ele responde no instante e o teste se
    // pula (ou falha) enquanto a página ainda monta. Mesmo defeito que já
    // apareceu 3× nesta suíte — aqui ele fazia o teste alternar entre
    // "pulado" e "falha" conforme a ordem de execução.
    const botao = page.getByRole("button", { name: /registrar\/editar resumo/i }).first();
    const temAlvo = await botao
      .waitFor({ state: "visible", timeout: 12_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!temAlvo, "Nenhuma sessão concluída na conta de QA.");

    await botao.click();
    const caixa = page.locator("textarea").first();
    await expect(caixa).toBeVisible();
    await caixa.fill("curto");
    await page.getByRole("button", { name: /salvar resumo/i }).click();

    const aviso = page.getByRole("alert").first();
    await expect(aviso).toBeVisible();
    await expect(
      aviso,
      "O aviso de texto curto tem de estar em português e dizer o mínimo — " +
        "código de banco cru na tela não diz nada a quem usa.",
    ).toContainText(/caracteres/i);

    await page.getByRole("button", { name: /voltar/i }).click();
  });

  test("o briefing abre sob demanda e traz o DISC do cliente", async ({ page }, info) => {
    await page.goto("/admin/sessoes");

    const abrir = page.getByRole("button", { name: /briefing/i }).first();
    const temAlvo = await abrir
      .waitFor({ state: "visible", timeout: 12_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!temAlvo, "Nenhuma sessão com briefing na conta de QA.");

    await abrir.click();
    const painel = page.locator("#conteudo").last();
    await expect(painel).toContainText(/perfil disc/i);

    // 🔴 O ESCOPO É A REGIÃO DO DISC, não o painel inteiro.
    //
    // Até 24/09 este teste lia `painel.innerText()` e aceitava
    // /consciência|gatilho|relacionamento/ em QUALQUER lugar do painel. Nesse
    // dia o briefing ganhou as 7 partes do Script de Fechamento, que também
    // exibem uma linha chamada "gatilho" (por parte, vinda de
    // `PARTES_SCRIPT[n].gatilho[letra]`).
    //
    // ⚠️ MEDIDO em 24/09, antes de apertar: das 28 linhas de gatilho de
    // `script-reuniao.ts`, ZERO contém a palavra "gatilho" ou qualquer termo
    // da regex — o mesmo vale para os rótulos curtos e os rótulos de opção.
    // Ou seja, HOJE o teste ainda falharia corretamente. O aperto é
    // preventivo, e a razão é que a garantia era ACIDENTAL: ela dependia da
    // redação de 28 frases de condução que existem para ser reescritas
    // (`script-reuniao.ts` diz, no próprio cabeçalho, que é mapa estático
    // feito para mudar quando o script mudar). Uma frase futura com
    // "o gatilho dessa letra é…" tornaria este teste verde com o bloco DISC
    // vazio — o defeito de 22/09 ("ainda não informado" para 127 clientes que
    // tinham a letra) voltando sem ninguém ver.
    //
    // `getByRole("region", { name: /perfil disc/i })` amarra no
    // `aria-labelledby` de `BlocoDisc` (`briefing.tsx`), e o rótulo literal
    // "Perfil DISC" é contrato entre os dois arquivos.
    const blocoDisc = painel.getByRole("region", { name: /perfil disc/i }).first();
    await expect(
      blocoDisc,
      "O bloco do DISC tem de ser uma região rotulada 'Perfil DISC' — " +
        "sem isso o teste não sabe distinguir o DISC das 7 partes do script.",
    ).toBeVisible();

    // O DISC é lido AO VIVO, não do snapshot congelado: se estiver em branco,
    // a tela tem de dizer que não foi informado — nunca mostrar nada.
    //
    // ⚠️ Nada aqui depende das 7 partes do script: cliente de QA sem
    // Entrevista Prévia concluída as mostra com "não cobriu esta parte", e
    // isso é estado VÁLIDO, não falha deste teste.
    const texto = await blocoDisc.innerText();
    const dizAlgoSobreDisc =
      /perfil disc/i.test(texto) &&
      (/ainda não informado/i.test(texto) || /consciência|gatilho|relacionamento/i.test(texto));
    expect(
      dizAlgoSobreDisc,
      "O bloco do DISC apareceu sem conteúdo e sem dizer que não foi preenchido.",
    ).toBe(true);

    // ── A FEATURE DESTA FATIA: as 7 partes do script ────────────────────────
    //
    // 🔴 Até 24/09 este teste editava o bloco do DISC e NÃO AFIRMAVA NADA
    // sobre o briefing pelas 7 partes. A junção que importa — RPC real →
    // `SessaoBriefing` → `montarParte` → tela — ficava sem prova: bastava
    // `PartesDoScript` não renderizar (erro no `useId`, `montadas` vazio,
    // regressão no contrato de `entrevista_previa_ao_vivo`) para a suíte
    // seguir verde com a doutora abrindo um briefing sem script nenhum.
    //
    // As asserções abaixo rodam SOBRE O MESMO painel já aberto: não há
    // segunda leitura, e portanto nenhuma linha extra de trilha LGPD.

    // (a) O cabeçalho do bloco — rótulo literal, contrato com `briefing.tsx`.
    await expect(
      painel.getByText(/script da reuni(ã|a)o preliminar/i).first(),
      "O briefing abriu sem o bloco do Script da Reunião Preliminar — a " +
        "feature das 7 partes não chegou à tela.",
    ).toBeVisible();

    // (b) AS 7 SEÇÕES, uma a uma, pelo nome acessível.
    //
    // `ParteSecao` desenha `<section aria-labelledby>` + `<h4>{numero} ·
    // {titulo}</h4>` — `<section>` COM nome acessível mapeia para
    // `role="region"`, então o nome é exatamente "01 · Abertura" (o `·` é o
    // caractere literal do JSX). Provado em navegador antes de escrever:
    // 8 regions no painel = as 7 do script + a do DISC.
    //
    // 🔑 Uma a uma, e não `toHaveCount(7)`: contagem diz "são sete", não
    // "são ESTAS sete, nesta ordem". Parte trocada de título ou sumida no
    // meio passaria pela contagem e é justamente o que quebra a condução.
    const nomesDasPartes = [
      /01 · Abertura/i,
      /02 · História real/i,
      /03 · Diagnóstico/i,
      /04 · Solução/i,
      /05 · Virada/i,
      /06 · Oferta binária/i,
      /07 · Encerramento/i,
    ];
    for (const nome of nomesDasPartes) {
      await expect(
        painel.getByRole("region", { name: nome }),
        `A parte ${String(nome)} do script não apareceu como região rotulada ` +
          "no briefing. Os títulos são contrato entre `script-reuniao.ts` " +
          "(`PARTES_SCRIPT[].titulo`) e `briefing.tsx`.",
      ).toBeVisible();
    }

    // (c) Parte 05 (Virada): os dois caminhos, título apenas.
    //
    // Vêm de `PARTES_SCRIPT[4].variantes` e aparecem MESMO SEM ENTREVISTA —
    // são estrutura do script, não dado do cliente. Por isso dá para exigir
    // os dois sem depender do estado da conta de QA.
    const virada = painel.getByRole("region", { name: /05 · Virada/i });
    await expect(
      virada,
      "A Parte 05 tem de oferecer os DOIS caminhos; a tela não escolhe por " +
        "quem conduz a reunião.",
    ).toContainText("Sessão de Viabilidade");
    await expect(virada).toContainText("Croqui Estrutural");

    // (d) O cabeçalho e as 7 partes têm de contar A MESMA HISTÓRIA.
    //
    // ⚠️ Os DOIS estados são válidos e o teste NÃO pode depender de qual
    // deles a conta de QA está vivendo: o cliente favoritado pode ou não ter
    // Entrevista Prévia concluída, e isso muda com o uso real do produto. O
    // que este bloco cobra é COERÊNCIA entre o que o cabeçalho afirma e o que
    // as partes mostram — cada estado com a sua obrigação, nunca um `OR`.
    //
    // 🔴 A VERSÃO ANTERIOR DESTA ASSERÇÃO ERA VÁCUA, e a prova está medida:
    // ela era `dizQueNaoHouve || (painel.locator("section dl dd").count() > 0)`,
    // e o segundo termo é SEMPRE verdadeiro. `section dl dd` casa o `<dl>` de
    // topo do briefing (Cliente/Telefone/Fase/…), porque `Secao`
    // (`src/components/ui/secao.tsx:49`) envolve o painel inteiro num
    // `<section>` e `Campo` emite `<dd>` mesmo quando o valor é "—"; casa
    // também o `<dl>` do `BlocoDisc`, que é `<section role="region">`. Ou
    // seja, a expressão inteira era `true` por construção: o cenário "a RPC
    // devolveu entrevista não-nula, `montarParte` não resolveu nada, o
    // cabeçalho diz 'Montado com a Entrevista Prévia de …' e as 7 partes
    // dizem 'não cobriu'" passava VERDE. Medido em navegador com o markup
    // copiado do JSX, antes de apertar: a versão vácua aprovou os 3 cenários,
    // inclusive o que tem de falhar; a versão abaixo aprova 2 e reprova o 3º.
    //
    // 🔑 O ESCOPO DA CONTAGEM SÃO AS 7 REGIÕES, não o painel. O nome
    // acessível de `ParteSecao` é `<h4>{numero} · {titulo}</h4>` com o número
    // em 2 dígitos — daí `/^0[1-7] · /`, que exclui o `BlocoDisc` ("Perfil
    // DISC") e o `<section>` sem nome acessível da `Secao` externa (sem nome
    // ele não expõe `role="region"`).
    const textoPainel = await painel.innerText();
    const dizQueNaoHouve = /entrevista pr(é|e)via ainda n(ã|a)o conclu(í|i)da/i.test(
      textoPainel,
    );
    const dizQueMontou = /montado com a entrevista pr(é|e)via/i.test(textoPainel);

    // Exatamente UM dos dois. Nenhum = a tela ficou muda sobre de onde (ou
    // se) o script foi montado; os dois = duas verdades na mesma tela.
    expect(
      dizQueNaoHouve !== dizQueMontou,
      "O cabeçalho do Script tem de dizer UMA das duas coisas: 'Montado com a " +
        "Entrevista Prévia de …' ou 'Entrevista Prévia ainda não concluída'. " +
        `Disse montou=${dizQueMontou} e não-concluída=${dizQueNaoHouve}.`,
    ).toBe(true);

    const regioesDasPartes = painel.getByRole("region", { name: /^0[1-7] · / });
    await expect(
      regioesDasPartes,
      "As 7 partes do script têm de ser regiões rotuladas 'NN · Título' — sem " +
        "isso a contagem de respostas abaixo não sabe distinguir o que é " +
        "resposta do cliente do que é o cabeçalho do briefing.",
    ).toHaveCount(7);

    const ddNasPartes = await regioesDasPartes.locator("dl dd").count();

    if (dizQueMontou) {
      // Houve entrevista: pelo menos UMA parte tem de trazer resposta. Se
      // nenhuma traz, ou `montarParte` não resolveu nada, ou o contrato de
      // `entrevista_previa_ao_vivo.respostas` regrediu — e a doutora abre um
      // briefing que afirma ter sido montado com uma entrevista que não
      // aparece em lugar nenhum.
      expect(
        ddNasPartes,
        "O cabeçalho diz 'Montado com a Entrevista Prévia', mas NENHUMA das 7 " +
          "partes trouxe resposta do cliente. A tela está afirmando uma " +
          "entrevista que ela não exibe.",
      ).toBeGreaterThan(0);
    } else {
      // Não houve entrevista: as 7 dizem "não cobriu" e nenhuma traz resposta.
      // `montadas` sai de `respostas: null`, então o caminho é o mesmo nas 7 —
      // 6 de 7 seria descompasso real, não estado válido.
      await expect(
        painel.getByText(/a entrevista n(ã|a)o cobriu esta parte/i),
        "Sem Entrevista Prévia concluída, as 7 partes têm de dizer que a " +
          "entrevista não cobriu — 'montarParte' recebe `respostas: null` e " +
          "devolve cobertura 'nenhuma' em todas.",
      ).toHaveCount(7);
      expect(
        ddNasPartes,
        "O cabeçalho diz que a Entrevista Prévia não foi concluída, mas " +
          "alguma das 7 partes trouxe resposta do cliente. As duas afirmações " +
          "não podem coexistir.",
      ).toBe(0);
    }

    // (e) A esteira LEGADA saiu (24/09): `entrevista.observacoes` vinha da
    // Etapa 01 (0 registros em produção) e, ao lado da Entrevista Prévia,
    // criava DUAS verdades sobre "a entrevista" na mesma tela.
    expect(
      /observa(ç|c)(õ|o)es da entrevista/i.test(textoPainel),
      "'Observações da entrevista' voltou ao briefing — é a esteira legada da " +
        "Etapa 01, que saiu em 24/09 para não haver duas verdades sobre a " +
        "entrevista na mesma tela.",
    ).toBe(false);

    // (f) NENHUM VALOR EM REAIS no painel do briefing.
    //
    // Regra de NEGÓCIO, não de estilo: a Parte 05 (Virada) do script proíbe
    // citar preço do produto, e `script-reuniao.ts` diz no cabeçalho que
    // nenhum valor entra ali. Um "R$" que vaze para esta tela põe a doutora
    // para falar número na hora errada da conversa.
    expect(
      textoPainel,
      "Apareceu valor em reais no briefing. A Parte 05 do script proíbe citar " +
        "preço, e o briefing é o que a doutora lê enquanto conduz.",
    ).not.toContain("R$");

    await registrarTela(page, info, "briefing.png");
  });

  test("contraste WCAG AA medido no DOM pintado", async ({ page }) => {
    await page.goto("/admin/sessoes");
    await contrasteAprovado(page, "/admin/sessoes");
  });

  test("todo alvo de clique tem tamanho tocável", async ({ page }) => {
    await page.goto("/admin/sessoes");
    await alvosDeClique(page);
  });
});
