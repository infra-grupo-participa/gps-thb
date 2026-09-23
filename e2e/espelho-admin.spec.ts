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

/** As props passadas a `<ClienteFicha ... />` no arquivo. */
function propsDaFicha(caminhoRelativo: string): Set<string> {
  const fonte = readFileSync(join(RAIZ, caminhoRelativo), "utf8");
  const abertura = fonte.indexOf("<ClienteFicha");
  expect(
    abertura,
    `\`<ClienteFicha\` não encontrado em ${caminhoRelativo} — o teste precisa ser atualizado junto com a refatoração.`,
  ).toBeGreaterThan(-1);

  // Do `<ClienteFicha` até o `/>` que fecha a tag.
  const fim = fonte.indexOf("/>", abertura);
  expect(
    fim,
    `\`<ClienteFicha\` sem fechamento \`/>\` em ${caminhoRelativo}.`,
  ).toBeGreaterThan(abertura);

  const bloco = fonte.slice(abertura, fim);
  const props = new Set<string>();
  // `nome={...}` e `nome` (booleana, como `admin`).
  for (const m of bloco.matchAll(/^\s+([a-zA-Z][a-zA-Z0-9]*)(?==|\s*$)/gm)) {
    props.add(m[1]);
  }
  props.delete("ClienteFicha");
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
      "getDecisoresPendentes",
      "getEntrevistasDoCliente",
      "getMinutaContextoObrigatorio",
      "getClienteEquipe",
    ];

    const faltando = DA_FICHA.filter(
      (fn) => fonteParceiro.includes(`${fn}(`) && !fonteEquipe.includes(`${fn}(`),
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
