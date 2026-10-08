// CHECK (...) com SELECT dentro: o Postgres recusa (0A000) só ao aplicar.
// `with check (...)` de policy aceita subquery — fica de fora. Comentário SQL é ignorado.
export default function checar({ arquivos, ler }) {
  const achados = [];
  for (const arq of arquivos) {
    if (!/supabase\/migrations\/.*\.sql$/.test(arq)) continue;
    const bruto = ler(arq);
    if (bruto == null) continue;
    const texto = semComentario(bruto);
    const re = /\bcheck\s*\(/gi;
    let m;
    while ((m = re.exec(texto))) {
      if (/\bwith\s*$/i.test(texto.slice(Math.max(0, m.index - 12), m.index))) continue;
      let prof = 0, i = m.index + m[0].length - 1, fim = -1;
      for (; i < texto.length; i++) {
        if (texto[i] === "(") prof++;
        else if (texto[i] === ")" && --prof === 0) { fim = i; break; }
      }
      const corpo = texto.slice(m.index, fim < 0 ? texto.length : fim);
      if (/\bselect\b/i.test(corpo)) {
        const linha = texto.slice(0, m.index).split("\n").length;
        achados.push({ arquivo: arq, linha, msg: "CHECK com subquery — encapsular em função IMMUTABLE" });
      }
    }
  }
  return achados;
}

// Troca comentário por espaço, mantendo as quebras de linha (o número da linha não muda).
function semComentario(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "))
    .replace(/--[^\n]*/g, (c) => " ".repeat(c.length));
}
