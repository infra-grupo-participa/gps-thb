// Toda função SECURITY DEFINER NOVA precisa de revoke de public/anon no mesmo arquivo.
// `create or replace` de função que já existia em migration anterior mantém o ACL — fica de fora.
const CRIA = /create\s+(?:or\s+replace\s+)?function\s+([\w."]+)\s*\(/gi;

export default function checar({ arquivos, todos, ler }) {
  const achados = [];
  const migracoes = todos.filter((a) => /supabase\/migrations\/[^/]+\.sql$/.test(a)).sort();
  let anteriores = null; // nome da função → 1º arquivo que a cria (lido só se precisar)
  for (const arq of arquivos) {
    if (!/supabase\/migrations\/.*\.sql$/.test(arq)) continue;
    const texto = ler(arq);
    if (texto == null || !/security\s+definer/i.test(texto)) continue;
    const revokes = [...texto.matchAll(/revoke\b[^;]*?on\s+function\s+([\w."]+)[^;]*?from\s+([^;]+);/gi)]
      .filter((r) => /\b(public|anon)\b/i.test(r[2]))
      .map((r) => nome(r[1]));
    const revokeGeral = /revoke\b[^;]*?on\s+all\s+functions[^;]*?from\s+[^;]*\b(public|anon)\b/i.test(texto);
    for (const c of texto.matchAll(CRIA)) {
      const stmt = declaracao(texto, c.index);
      if (!/security\s+definer/i.test(stmt)) continue;
      if (revokeGeral || revokes.includes(nome(c[1]))) continue;
      anteriores ??= mapaDeCriacao(migracoes, ler);
      const primeiro = anteriores.get(nome(c[1]));
      if (primeiro && primeiro < arq) continue;
      const linha = texto.slice(0, c.index).split("\n").length;
      achados.push({ arquivo: arq, linha, msg: `${c[1]} é SECURITY DEFINER sem revoke … from public/anon neste arquivo` });
    }
  }
  return achados;
}

function nome(n) {
  return n.replace(/"/g, "").toLowerCase().split(".").pop();
}

// Texto da declaração sem o corpo $tag$…$tag$ (para não confundir com "security definer" citado no corpo).
function declaracao(texto, inicio) {
  const abre = /\$(\w*)\$/g;
  abre.lastIndex = inicio;
  const a = abre.exec(texto);
  if (!a) return texto.slice(inicio, texto.indexOf(";", inicio) + 1 || texto.length);
  const fecha = texto.indexOf(a[0], a.index + a[0].length);
  const depois = fecha < 0 ? texto.length : fecha + a[0].length;
  const fim = texto.indexOf(";", depois);
  return texto.slice(inicio, a.index) + texto.slice(depois, fim < 0 ? texto.length : fim);
}

function mapaDeCriacao(migracoes, ler) {
  const mapa = new Map();
  for (const a of migracoes) {
    for (const c of (ler(a) || "").matchAll(CRIA)) {
      const n = nome(c[1]);
      if (!mapa.has(n)) mapa.set(n, a);
    }
  }
  return mapa;
}
