/**
 * Padroniza a caixa de um nome de pessoa ou empresa para exibição.
 *
 * Só mexe em nome digitado TODO em maiúsculas ou TODO em minúsculas — é aí
 * que mora o "MARIA DA SILVA" que deixa a tela gritando. Nome com caixa mista
 * foi escolha de quem digitou ("Maria McDonald", "João DeLuca") e sai como
 * veio, só com os espaços arrumados.
 *
 * Regras (as mesmas do UPDATE de 03/10/2026 no banco):
 * - partículas (de, da, do, das, dos, e) em minúsculas, menos no início;
 * - cada parte de hífen e apóstrofo começa maiúscula: "D'Ávila", "Ana-Clara";
 * - romanos (II, III, IV…), siglas sem vogal ("CPF", "THB") e as de `SIGLAS` em maiúsculas;
 * - sufixo de empresa: "Ltda"; "ME", "EPP", "EIRELI" e "S/A" em maiúsculas;
 * - UF no fim, depois de hífen ou barra: "Uberlândia-MG", "Salvador - BA".
 *
 * 🔑 Pura e sem dependência: roda no servidor, no cliente e no script de
 * correção do banco — uma regra só, nos três lugares.
 */
export function formatarNome(nome: string | null | undefined): string | null {
  if (nome == null) return null;
  const limpo = nome
    .replace(/\s+/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim();
  if (!limpo) return null;

  const maiusculo = limpo.toLocaleUpperCase("pt-BR");
  const minusculo = limpo.toLocaleLowerCase("pt-BR");
  // Sem letra nenhuma (só número/símbolo) ou caixa mista: não é nosso.
  if (maiusculo === minusculo) return limpo;
  if (limpo !== maiusculo && limpo !== minusculo) return limpo;

  const palavras = minusculo.split(" ");
  return palavras
    .map((palavra, i) => formatarPalavra(palavra, i, palavras))
    .join(" ");
}

const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "e"]);
const ROMANO = /^(ii|iii|iv|vi|vii|viii|ix|xi|xii)$/;
const SUFIXO_EMPRESA = new Set(["me", "epp", "eireli"]);
// Siglas com vogal que a regra "sem vogal" não pega. "PVA" é rótulo de
// origem do cliente (03/10/2026: virou "Pva" e foi devolvido à mão).
const SIGLAS = new Set(["pva"]);
const TITULOS = new Set(["jr", "sr", "dr", "sra", "dra"]);
const VOGAL = /[aeiouyáàâãéêíóôõúü]/;
const UF =
  /^(ac|al|am|ap|ba|ce|df|es|go|ma|mg|ms|mt|pa|pb|pe|pi|pr|rj|rn|ro|rr|rs|sc|se|sp|to)$/;

function formatarPalavra(palavra: string, indice: number, palavras: string[]) {
  const total = palavras.length;
  const ultima = indice === total - 1;
  if (ultima && indice > 0 && UF.test(palavra) && /^[-/]$/.test(palavras[indice - 1])) {
    return palavra.toLocaleUpperCase("pt-BR");
  }
  if (indice > 0 && PARTICULAS.has(palavra)) return palavra;

  // Pontuação em volta não conta para reconhecer a palavra: "(ltda)", "jr.".
  const nucleo = palavra.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
  if (nucleo === "s/a" || palavra === "s/a" || palavra === "s.a.") {
    return palavra.toLocaleUpperCase("pt-BR");
  }
  if (ROMANO.test(nucleo) || SIGLAS.has(nucleo)) return palavra.toLocaleUpperCase("pt-BR");
  if (indice === total - 1 && indice > 0 && SUFIXO_EMPRESA.has(nucleo)) {
    return palavra.toLocaleUpperCase("pt-BR");
  }
  if (
    nucleo.length >= 2 &&
    !VOGAL.test(nucleo) &&
    !TITULOS.has(nucleo) &&
    /^\p{L}+$/u.test(nucleo)
  ) {
    return palavra.toLocaleUpperCase("pt-BR");
  }

  // Maiúscula no começo de cada parte separada por hífen ou apóstrofo.
  const formatada = palavra.replace(
    /(^|[-'’(/])(\p{L})/gu,
    (_, antes: string, letra: string) =>
      antes + letra.toLocaleUpperCase("pt-BR"),
  );
  const uf = /[-/](\p{L}{2})$/u.exec(palavra);
  if (ultima && uf && UF.test(uf[1])) {
    return formatada.slice(0, -2) + uf[1].toLocaleUpperCase("pt-BR");
  }
  return formatada;
}

/**
 * Recusa nome abreviado no cadastro de cliente: "M. Silva", "Denise F.".
 * Devolve a frase de erro, ou `null` quando o nome serve.
 *
 * 🔴 Só a INICIAL é recusada — no primeiro ou no último nome. Inicial no meio
 * ("João P. Silva") passa, e nome de uma palavra só ("Fernanda") também:
 * 271 das 1.880 fichas são assim (03/10/2026) e são prospecção, não erro.
 * Pedaço com número ("Posto 2R", "B3", "Apt 64") é apelido/código, não nome,
 * e fica fora da conta.
 */
export function erroDeNomeAbreviado(nome: string): string | null {
  const palavras = nome
    .trim()
    .split(/\s+/)
    .filter((p) => /\p{L}/u.test(p) && !/\d/.test(p))
    .map((p) => p.replace(/[^\p{L}]/gu, ""))
    .filter((p, i) => i === 0 || !PARTICULAS.has(p.toLocaleLowerCase("pt-BR")));
  if (palavras.length === 0) return null;
  const primeira = palavras[0];
  const ultima = palavras[palavras.length - 1];
  if (primeira.length < 2 || ultima.length < 2) {
    return "Escreva o nome do cliente por extenso — só a inicial não vale.";
  }
  return null;
}
