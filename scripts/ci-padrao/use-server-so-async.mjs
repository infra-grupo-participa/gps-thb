// "use server" só pode exportar função async (o resto quebra em runtime).
const DIRETIVA = /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*\s*["']use server["']/;
const PROIBIDO = [
  [/^export\s+(?:declare\s+)?(const|let|var|class|enum)\b/, (m) => `export ${m[1]}`],
  [/^export\s+(type|interface)\b/, (m) => `export ${m[1]}`],
  [/^export\s+function\b/, () => "export function sem async"],
  [/^export\s+default\s+(?!async\b)/, () => "export default que não é função async"],
  [/^export\s*(?:type\s*)?\{/, () => "re-export { … }"],
  [/^export\s*\*/, () => "export *"],
];

export default function checar({ arquivos, ler }) {
  const achados = [];
  for (const arq of arquivos) {
    if (!/\.(ts|tsx|js|jsx|mjs)$/.test(arq)) continue;
    const texto = ler(arq);
    if (texto == null || !DIRETIVA.test(texto)) continue;
    texto.split(/\r?\n/).forEach((linha, i) => {
      for (const [re, rotulo] of PROIBIDO) {
        const m = linha.match(re);
        if (m) {
          achados.push({ arquivo: arq, linha: i + 1, msg: `${rotulo(m)} em arquivo "use server" — mover para outro módulo` });
          break;
        }
      }
    });
  }
  return achados;
}
