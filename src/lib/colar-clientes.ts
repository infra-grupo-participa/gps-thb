/**
 * "Colar lista" de clientes (Onda 1.2 do polimento pelo Digisac, 02/10/2026).
 *
 * Reclamação literal dos parceiros: *"só consegui cadastrar um"*. O diálogo
 * "Novo cliente" cadastra um por vez e leva para a ficha; quem tem os 30 numa
 * planilha ou no bloco de notas desistia no terceiro.
 *
 * Função PURA, sem React e sem import nenhum — de propósito: o teste roda com
 * `node --test` direto sobre este arquivo (Node 24 remove os tipos sozinho), e
 * qualquer `import` com `@/` quebraria essa execução.
 *
 * Formatos aceitos, uma pessoa por linha:
 *   · `Nome`
 *   · `Nome - telefone` · `Nome – telefone` (hífen/travessão COM espaço)
 *   · `Nome; telefone` · `Nome, telefone`
 *   · `Nome<TAB>telefone` (colado de planilha; colunas extras são ignoradas)
 *   · `Nome telefone` (só espaço, quando o fim da linha é claramente telefone)
 *
 * 🔑 O separador só divide quando o LADO DIREITO tem cara de telefone. É o que
 * impede "Maria-José" ou "Souza, Ana" de virarem nome + telefone quebrados.
 * Tab e `;` são separadores fortes (ninguém escreve nome com eles): o que vier
 * depois deles e não for telefone vira motivo de recusa, não parte do nome.
 */

/** Teto por envio — o mesmo da action `cadastrarClientesEmLote`. */
export const TETO_LOTE = 50;

export interface LinhaColada {
  /** Número da linha no texto colado (1 = primeira), para o parceiro achar. */
  linha: number;
  nome: string;
  /** Telefone formatado `(11) 99999-8888`, ou `null` se não veio. */
  telefone: string | null;
  valida: boolean;
  /** Por que não entra (só quando `valida === false`). */
  motivo?: string;
}

export interface ResultadoColagem {
  /** Todas as linhas não vazias, na ordem colada (válidas e inválidas). */
  linhas: LinhaColada[];
  /** O que vai para a action — já cortado no teto. */
  paraEnviar: { nome: string; telefone?: string }[];
  /** Quantas linhas válidas ficaram de fora só por passar do teto. */
  acimaDoTeto: number;
}

const MAX_NOME = 200;

function digitos(v: string): string {
  return v.replace(/\D/g, "");
}

/** Tira o DDI 55 quando o número veio com ele (12 ou 13 dígitos). */
function semDdi(d: string): string {
  return (d.length === 12 || d.length === 13) && d.startsWith("55")
    ? d.slice(2)
    : d;
}

/** Cara de telefone: só dígitos, espaço, `+ ( ) . -`, e ao menos 8 dígitos. */
function pareceTelefone(v: string): boolean {
  return /^\+?[\d\s().-]+$/.test(v) && digitos(v).length >= 8;
}

/** `(11) 99999-8888` / `(11) 3333-4444` — o mesmo formato da ficha. */
function formatarTelefone(d: string): string {
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  const corte = resto.length === 9 ? 5 : 4;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}

/** Separa a linha em [nome, resto-ou-null]. `forte` = tab ou `;`. */
function separar(linha: string): { nome: string; resto: string | null; forte: boolean } {
  // 1 · Tab (planilha): 1ª célula não vazia é o nome, a 2ª é o telefone.
  if (linha.includes("\t")) {
    const celulas = linha.split("\t").map((c) => c.trim());
    const nome = celulas.find((c) => c !== "") ?? "";
    const depois = celulas.slice(celulas.indexOf(nome) + 1).filter((c) => c !== "");
    return { nome, resto: depois[0] ?? null, forte: true };
  }
  // 2 · Ponto e vírgula.
  const pv = linha.indexOf(";");
  if (pv >= 0) {
    return {
      nome: linha.slice(0, pv).trim(),
      resto: linha.slice(pv + 1).trim() || null,
      forte: true,
    };
  }
  // 3 · Vírgula ou hífen/travessão COM espaço — só se a direita for telefone.
  //     A ÚLTIMA ocorrência, para "Ana - Souza - 11 99999-8888" funcionar.
  const fraco = /^(.*)(?:,|\s[-–—])\s*(.+)$/.exec(linha);
  if (fraco && pareceTelefone(fraco[2].trim())) {
    return { nome: fraco[1].trim(), resto: fraco[2].trim(), forte: false };
  }
  // 4 · Só espaço, com o fim da linha sendo telefone de 10+ dígitos.
  const espaco = /^(.*?[^\d\s().+-])\s+(\+?[\d\s().-]+)$/.exec(linha);
  if (espaco && digitos(espaco[2]).length >= 10) {
    return { nome: espaco[1].trim(), resto: espaco[2].trim(), forte: false };
  }
  return { nome: linha.trim(), resto: null, forte: false };
}

function avaliar(numero: number, bruta: string): LinhaColada {
  const { nome, resto } = separar(bruta);

  // Só telefone na linha (sem nome antes).
  if (pareceTelefone(nome) || !/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(nome)) {
    return {
      linha: numero,
      nome: "",
      telefone: null,
      valida: false,
      motivo: pareceTelefone(bruta.trim()) || pareceTelefone(nome)
        ? "Só tem telefone — falta o nome."
        : "Falta o nome.",
    };
  }
  if (nome.length > MAX_NOME) {
    return {
      linha: numero,
      nome: nome.slice(0, 40) + "…",
      telefone: null,
      valida: false,
      motivo: `Nome longo demais (máximo ${MAX_NOME} letras).`,
    };
  }
  if (resto === null) {
    return { linha: numero, nome, telefone: null, valida: true };
  }
  if (!pareceTelefone(resto)) {
    return {
      linha: numero,
      nome,
      telefone: null,
      valida: false,
      motivo: `"${resto.slice(0, 30)}" não parece telefone.`,
    };
  }
  const d = semDdi(digitos(resto));
  if (d.length !== 10 && d.length !== 11) {
    return {
      linha: numero,
      nome,
      telefone: null,
      valida: false,
      motivo: "Telefone incompleto — use DDD + número (10 ou 11 dígitos).",
    };
  }
  return { linha: numero, nome, telefone: formatarTelefone(d), valida: true };
}

/** Linha de cabeçalho de planilha ("Nome", "Nome | Telefone"…). */
function ehCabecalho(bruta: string): boolean {
  const primeira = bruta.split(/[\t;,]/)[0].trim().toLowerCase();
  return primeira === "nome" || primeira === "nome completo";
}

export function analisarListaColada(texto: string): ResultadoColagem {
  const linhas: LinhaColada[] = [];
  const vistos = new Set<string>();
  let validas = 0;
  let acimaDoTeto = 0;
  let primeiraNaoVazia = true;

  (texto ?? "").split(/\r?\n/).forEach((bruta, i) => {
    if (bruta.trim() === "") return; // linha vazia: some, sem virar recusa
    if (primeiraNaoVazia) {
      primeiraNaoVazia = false;
      if (ehCabecalho(bruta)) return;
    }
    const l = avaliar(i + 1, bruta);
    if (l.valida) {
      const chave = `${l.nome.toLocaleLowerCase("pt-BR").replace(/\s+/g, " ")}|${l.telefone ?? ""}`;
      if (vistos.has(chave)) {
        l.valida = false;
        l.motivo = "Repetido nesta lista.";
      } else {
        vistos.add(chave);
        validas += 1;
        if (validas > TETO_LOTE) {
          l.valida = false;
          l.motivo = `Passa do limite de ${TETO_LOTE} por vez — cole de novo depois.`;
          acimaDoTeto += 1;
        }
      }
    }
    linhas.push(l);
  });

  const paraEnviar = linhas
    .filter((l) => l.valida)
    .map((l) => (l.telefone ? { nome: l.nome, telefone: l.telefone } : { nome: l.nome }));

  return { linhas, paraEnviar, acimaDoTeto };
}
