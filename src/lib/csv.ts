/**
 * Gera CSV que o Excel abre com duplo clique, sem biblioteca.
 *
 * Pedido do Marcio (14/09/2026): exportar a lista de parceiros. A alternativa
 * óbvia — uma lib de XLSX no navegador — pesa 400–900 KB e entraria no bundle
 * de `/admin`, a rota mais usada do sistema, para atender um clique raro.
 * CSV bem-feito abre no Excel igual, e custa **zero KB**.
 *
 * As três armadilhas que fazem um CSV "não abrir direito", todas tratadas:
 *
 * 1. 🔴 **BOM UTF-8 obrigatório** (`﻿` no início). Sem ele o Excel no
 *    Windows lê como Latin-1 e "João" vira "JoÃ£o". Já custou caro no grupo
 *    em 2026 — mas ao contrário: um CSV **destinado ao Clint** foi reprovado
 *    inteiro POR TER BOM. A regra é o destino: Excel exige, importador de
 *    sistema costuma recusar. Este arquivo é para o Excel.
 *
 * 2. 🔴 **Separador `;`, não `,`**. O Excel em português usa a vírgula como
 *    separador decimal e ignora o `,` como separador de coluna — o arquivo
 *    abre com tudo numa célula só.
 *
 * 3. 🔴 **Telefone e documento com aspas sempre.** `5511999998888` sem aspas
 *    vira notação científica (`5,512E+12`) e o zero à esquerda some. Aspas
 *    forçadas em toda célula de texto resolvem — e o Excel remove na leitura.
 *
 * Injeção de fórmula: célula que começa com `=`, `+`, `-` ou `@` é executada
 * pelo Excel ao abrir. Prefixo `'` neutraliza sem alterar o que se lê.
 */

/** Uma coluna: cabeçalho e como extrair o valor da linha. */
export interface ColunaCsv<T> {
  cabecalho: string;
  valor: (linha: T) => string | number | null | undefined;
}

/** Escapa uma célula: aspas duplicadas, aspas sempre, fórmula neutralizada. */
function celula(v: string | number | null | undefined): string {
  if (v == null) return '""';
  const txt = String(v);
  // 🔴 `=SOMA(...)` numa célula é executado pelo Excel ao abrir o arquivo.
  // O apóstrofo à frente faz o Excel tratar como texto, e ele não aparece.
  const seguro = /^[=+\-@\t\r]/.test(txt) ? `'${txt}` : txt;
  return `"${seguro.replace(/"/g, '""')}"`;
}

/**
 * Monta o conteúdo do arquivo. Devolve string pronta para virar Blob.
 *
 * `\r\n` (CRLF) e não `\n`: é o que o Excel espera, e o que evita a última
 * linha ser engolida em algumas versões.
 */
export function montarCsv<T>(linhas: T[], colunas: ColunaCsv<T>[]): string {
  const cabecalho = colunas.map((c) => celula(c.cabecalho)).join(";");
  const corpo = linhas.map((l) =>
    colunas.map((c) => celula(c.valor(l))).join(";"),
  );
  return "﻿" + [cabecalho, ...corpo].join("\r\n") + "\r\n";
}

/**
 * Nome de arquivo com a data, sem caractere que o Windows recusa
 * (`\ / : * ? " < > |`). Ex.: `parceiros-2026-09-14.csv`.
 */
export function nomeDoArquivo(prefixo: string, extensao = "csv"): string {
  const d = new Date();
  const iso = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
  const limpo = prefixo.replace(/[\\/:*?"<>|]/g, "-");
  return `${limpo}-${iso}.${extensao}`;
}
