// Peso de JS por rota AUTENTICADA — que não dá para medir pelo HTML (o
// servidor redireciona para /login). Lê o `page_client-reference-manifest.js`
// de cada rota, junta os chunks de TODOS os clientModules e soma gzip.
// É aproximação (superset do que o browser baixa), mas o MESMO método antes e
// depois, então a diferença é comparável.
// Uso: node tmp/squad/mede-manifest.mjs [rotulo]
import { gzipSync } from "node:zlib";
import { readFileSync, existsSync } from "node:fs";

const rotulo = process.argv[2] ?? "";
const rotas = [
  "",
  "admin",
  "admin/aluno/[alunoId]",
  "perfil",
  "pasta",
  "chamados",
  "chamados/[chamadoId]",
  "clientes",
  "etapa/[etapa]",
];

const kb = (n) => (n / 1024).toFixed(0);
const tam = new Map();
function bytes(rel) {
  if (tam.has(rel)) return tam.get(rel);
  const p = `.next/${rel}`;
  const v = existsSync(p)
    ? { raw: readFileSync(p).length, gz: gzipSync(readFileSync(p), { level: 9 }).length }
    : { raw: 0, gz: 0 };
  tam.set(rel, v);
  return v;
}

console.log(`\n## Rotas autenticadas (manifest) ${rotulo}`);
console.log("| rota | chunks | gzip KB | SDK Supabase? |");
console.log("|---|---:|---:|---|");

for (const r of rotas) {
  const f = `.next/server/app/${r ? r + "/" : ""}page_client-reference-manifest.js`;
  if (!existsSync(f)) {
    console.log(`| /${r} | — | — | manifest ausente |`);
    continue;
  }
  const txt = readFileSync(f, "utf8");
  const chunks = new Set(
    [...txt.matchAll(/static\/chunks\/[A-Za-z0-9_.\/-]*\.js/g)].map((m) => m[0]),
  );
  let gz = 0;
  for (const c of chunks) gz += bytes(c).gz;
  // O chunk que carrega o SDK do Supabase (AuthClient/GoTrue/Realtime).
  const sdk = [...chunks].filter((c) => {
    const p = `.next/${c}`;
    return existsSync(p) && readFileSync(p, "utf8").includes("AuthClient");
  });
  console.log(
    `| /${r} | ${chunks.size} | **${kb(gz)}** | ${sdk.length ? sdk.map((s) => s.split("/").pop()).join(" ") : "não"} |`,
  );
}
