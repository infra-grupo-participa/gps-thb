// Mede o peso de JS por rota pública: baixa o HTML, extrai os <script src>
// de /_next/static, baixa cada chunk e soma bytes brutos + gzip.
// Uso: node tmp/squad/mede-bundle.mjs http://localhost:3987 [rotulo]
import { gzipSync } from "node:zlib";

const base = (process.argv[2] ?? "http://localhost:3987").replace(/\/+$/, "");
const rotulo = process.argv[3] ?? "";
const rotas = ["/login", "/cadastro", "/esqueci-senha", "/p/plantao"];

const kb = (n) => (n / 1024).toFixed(0);
const cache = new Map();

async function bytes(url) {
  if (cache.has(url)) return cache.get(url);
  // Identity: queremos o tamanho bruto do arquivo, e gzipamos aqui com nível
  // fixo para que ANTES e DEPOIS sejam comparáveis.
  const r = await fetch(url, { headers: { "accept-encoding": "identity" } });
  const buf = Buffer.from(await r.arrayBuffer());
  const v = { raw: buf.length, gz: gzipSync(buf, { level: 9 }).length };
  cache.set(url, v);
  return v;
}

console.log(`\n## Bundle ${rotulo} — ${base}`);
console.log("| rota | chunks | bruto KB | gzip KB |");
console.log("|---|---:|---:|---:|");

const detalhe = {};
for (const rota of rotas) {
  const html = await (await fetch(base + rota)).text();
  const srcs = [...new Set([...html.matchAll(/\/_next\/static\/[A-Za-z0-9_.\/-]*\.js/g)].map((m) => m[0]))];
  let raw = 0;
  let gz = 0;
  const lista = [];
  for (const s of srcs) {
    const v = await bytes(base + s);
    raw += v.raw;
    gz += v.gz;
    lista.push({ s, ...v });
  }
  detalhe[rota] = lista.sort((a, b) => b.gz - a.gz);
  console.log(`| \`${rota}\` | ${srcs.length} | ${kb(raw)} | **${kb(gz)}** |`);
}

console.log("\n### Maiores chunks por rota (gzip KB)");
for (const [rota, lista] of Object.entries(detalhe)) {
  console.log(`\n**${rota}**`);
  for (const c of lista.slice(0, 6)) {
    console.log(`  ${kb(c.gz).padStart(4)} KB  ${c.s}`);
  }
}
