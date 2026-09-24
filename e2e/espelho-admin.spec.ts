import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * O ESPELHO DO ADMIN NÃO PODE FICAR PARA TRÁS DA TELA DO PARCEIRO.
 *
 * 🔴 POR QUE ESTE ARQUIVO EXISTE (pedido do Marcio, 23/09/2026)
 *
 * "a feature não está sendo replicada na visualização espelhada do admin
 *  quando ele acessa a aba do cliente. Preciso que essa visualização espelhada
 *  seja sempre atualizada."
 *
 * A ficha do cliente existe em DUAS páginas que montam o MESMO componente:
 *
 *   src/app/clientes/[clienteId]/page.tsx                        (parceiro)
 *   src/app/admin/aluno/[alunoId]/clientes/[clienteId]/page.tsx  (equipe)
 *
 * Nada no build liga as duas. Quem escreve uma feature na ficha toca a
 * primeira, o `tsc` passa, o build passa, e a segunda fica defasada em
 * silêncio — foi exatamente o que aconteceu com o painel da Entrevista Prévia
 * (o admin via "a entrevista é conduzida pelo parceiro" no lugar do
 * resultado) e, achado por este teste, com `outroFavoritoNome`.
 *
 * ⚠️ ESTE TESTE É ESTÁTICO DE PROPÓSITO — lê os dois ARQUIVOS, não abre
 * navegador, não faz login e NÃO ESCREVE EM PRODUÇÃO (ver `e2e/LEIA-ME.md`:
 * a suíte roda contra o site publicado, com 2 contas reais). Ele roda em
 * qualquer máquina, sem `QA_ENV_FILE`, e por isso nunca se pula sozinho.
 *
 * 🔑 Comparar PROP, não texto. `getByText(/entrevista prévia/i)` continuaria
 * verde com a tela quebrada: metade do conteúdo da ficha mora dentro de
 * `<details>` fechado e de `Dialog`, e string presente no DOM não prova
 * conteúdo alcançável. A prop é o contrato entre a página e o componente — se
 * ela chega nas duas, o componente decide o resto com a MESMA informação.
 */

const RAIZ = join(__dirname, "..");
const PARCEIRO = "src/app/clientes/[clienteId]/page.tsx";
const EQUIPE = "src/app/admin/aluno/[alunoId]/clientes/[clienteId]/page.tsx";

/**
 * As props que a tela do parceiro passa e o espelho NÃO precisa passar, com o
 * motivo de cada uma. Toda exceção é nomeada: lista vazia por default, e
 * acrescentar item aqui é decisão consciente, não descuido.
 */
const EXCECOES: Record<string, string> = {
  // A linha "Próximo passo · marque a sessão" leva a `/sessoes`, rota que só
  // existe para o parceiro (`nav.ts` filtra por `basePath === ""`; não há
  // `admin/aluno/[id]/sessoes/page.tsx`). Passar isto ao admin = link 404.
  // Decisão do Marcio, 23/09/2026.
  temEntrevistaConcluida:
    "leva a /sessoes, rota inexistente no modo assistência (404)",
};

/**
 * As props passadas a `<ClienteFicha ... />` — SÓ as do próprio elemento.
 *
 * 🔴 A primeira versão deste teste tinha FALSO VERDE (achado pela auditoria de
 * 23/09/2026, provado por mutação): ela cortava o bloco no primeiro `/>` depois
 * de `<ClienteFicha`, e esse `/>` é o do `<PainelEntrevistaPrevia />` que vive
 * DENTRO da prop `painelEntrevista`. Duas consequências, as duas ruins:
 *
 *   · as props do painel interno (`clienteId`, `temDisc`, `decisores`,
 *     `entrevistas`) entravam contadas como props da ficha — comparação
 *     inflada, com nomes que não são o contrato que se quer proteger;
 *   · qualquer prop escrita DEPOIS de `painelEntrevista` ficava invisível ao
 *     teste. Apagá-la do espelho não falhava nada.
 *
 * Agora o bloco termina no `>` que fecha a PRÓPRIA tag `<ClienteFicha`,
 * contando profundidade de elementos aninhados, e só as props de nível 0
 * entram.
 */
function propsDaFicha(caminhoRelativo: string): Set<string> {
  const bruto = readFileSync(join(RAIZ, caminhoRelativo), "utf8");
  // 🔴 Comentário JSX (`{/* ... */}`) fora ANTES de qualquer varredura: sem
  // isto, cada palavra do comentário vira "prop" e a comparação explode com
  // 84 nomes inventados (visto ao corrigir este teste).
  const fonte = bruto
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  const abertura = fonte.indexOf("<ClienteFicha");
  expect(
    abertura,
    `\`<ClienteFicha\` não encontrado em ${caminhoRelativo}.`,
  ).toBeGreaterThan(-1);

  // A partir de `<ClienteFicha`, cada prop de NÍVEL 0 é `nome=` ou `nome` no
  // fim da linha (booleana). Tudo dentro de `{...}` é valor — inclusive o
  // `<PainelEntrevistaPrevia />`, cujo `/>` fechava o bloco cedo demais na
  // primeira versão deste teste (falso verde provado por mutação).
  const props = new Set<string>();
  let chaves = 0;
  let fechou = false;
  let linhaAtual = "";

  for (let i = abertura + "<ClienteFicha".length; i < fonte.length; i++) {
    const c = fonte[i];

    if (chaves === 0 && (c === ">" || (c === "/" && fonte[i + 1] === ">"))) {
      fechou = true;
      break;
    }
    if (c === "{") {
      chaves++;
      continue;
    }
    if (c === "}") {
      chaves--;
      continue;
    }
    if (chaves > 0) continue;

    if (c === "\n") {
      const m = linhaAtual.match(/^\s*([a-zA-Z][a-zA-Z0-9]*)\s*$/);
      if (m) props.add(m[1]);
      linhaAtual = "";
      continue;
    }
    if (c === "=") {
      const m = linhaAtual.match(/([a-zA-Z][a-zA-Z0-9]*)\s*$/);
      if (m) props.add(m[1]);
      linhaAtual = "";
      continue;
    }
    linhaAtual += c;
  }

  expect(fechou, `\`<ClienteFicha\` sem fechamento em ${caminhoRelativo}.`).toBe(
    true,
  );
  return props;
}

test.describe("espelho do admin @estatico", () => {
  test("a ficha do admin recebe as mesmas props da ficha do parceiro", () => {
    const doParceiro = propsDaFicha(PARCEIRO);
    const daEquipe = propsDaFicha(EQUIPE);

    // Sanidade: se a extração devolver quase nada, o formato do arquivo mudou
    // e o teste estaria passando por vacuidade — o pior tipo de verde.
    expect(
      doParceiro.size,
      "extração de props falhou na ficha do parceiro (formato do JSX mudou?)",
    ).toBeGreaterThan(5);

    const faltando = [...doParceiro]
      .filter((p) => !daEquipe.has(p))
      .filter((p) => !(p in EXCECOES));

    expect(
      faltando,
      faltando.length
        ? [
            "A ficha do ADMIN ficou para trás da ficha do PARCEIRO.",
            `Props que só o parceiro recebe: ${faltando.join(", ")}`,
            "",
            `Passe-as em ${EQUIPE},`,
            "ou, se a omissão for deliberada, declare o motivo em EXCECOES neste arquivo.",
            "Pedido do Marcio (23/09/2026): o espelho tem de refletir a tela do parceiro.",
          ].join("\n")
        : undefined,
    ).toEqual([]);
  });

  test("as exceções declaradas continuam existindo na ficha do parceiro", () => {
    const doParceiro = propsDaFicha(PARCEIRO);
    // Exceção para prop que não existe mais é comentário morto: ela deixaria
    // de proteger nada e esconderia uma defasagem futura de mesmo nome.
    for (const [prop, motivo] of Object.entries(EXCECOES)) {
      expect(
        doParceiro.has(prop),
        `EXCECOES declara "${prop}" (${motivo}), mas a ficha do parceiro não passa mais essa prop. Remova a exceção.`,
      ).toBe(true);
    }
  });

  test("as duas fichas carregam os mesmos dados do servidor", () => {
    const fonteParceiro = readFileSync(join(RAIZ, PARCEIRO), "utf8");
    const fonteEquipe = readFileSync(join(RAIZ, EQUIPE), "utf8");

    // As funções de leitura ligadas à FICHA do cliente. Deixa de fora o que é
    // legitimamente diferente entre as telas (sessão, navegação, ambiente).
    const DA_FICHA = [
      "getClienteById",
      "getMinutasDoCliente",
      "getCroquisDoCliente",
      "getDecisoresPendentes",
      "getEntrevistasDoCliente",
      "getMinutaContextoObrigatorio",
      "getClienteEquipe",
    ];

    // 🔴 Fora de comentário (auditoria 23/09/2026): `includes("getX(")` casava
    // chamada comentada, então apagar a consulta do espelho e deixar o `//`
    // mantinha o teste verde. Tira linha de `//` e bloco `/* */` antes.
    const semComentario = (t: string) =>
      t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const limpoParceiro = semComentario(fonteParceiro);
    const limpoEquipe = semComentario(fonteEquipe);

    const faltando = DA_FICHA.filter(
      (fn) => limpoParceiro.includes(`${fn}(`) && !limpoEquipe.includes(`${fn}(`),
    );

    expect(
      faltando,
      faltando.length
        ? [
            "A ficha do ADMIN não carrega dado que a do PARCEIRO carrega.",
            `Consultas ausentes no espelho: ${faltando.join(", ")}`,
            "",
            "Acrescente-as ao Promise.all que já existe na página do admin —",
            "nunca em cascata: é a tela mais aberta do produto.",
          ].join("\n")
        : undefined,
    ).toEqual([]);
  });
});
