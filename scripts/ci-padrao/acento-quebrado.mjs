// UTF-8 relido como cp1252: "Ã§", "Ã£", "Ã©", "Â " e o caractere de substituição.
const TEXTO = /\.(ts|tsx|js|jsx|mjs|cjs|sql|md|json|html|css|php|py|yml|yaml)$/;
const QUEBRADO = /Ã[\u0080-¿]|Â[ -¿]|�/;

export default function checar({ arquivos, ler }) {
  const achados = [];
  for (const arq of arquivos) {
    if (!TEXTO.test(arq) || arq.includes("scripts/ci-padrao/")) continue;
    const texto = ler(arq);
    if (texto == null) continue;
    texto.split(/\r?\n/).forEach((linha, i) => {
      const m = linha.match(QUEBRADO);
      if (m) achados.push({ arquivo: arq, linha: i + 1, msg: `acento quebrado ("${m[0]}") — regravar o arquivo em UTF-8` });
    });
  }
  return achados;
}
