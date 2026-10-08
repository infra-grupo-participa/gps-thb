#!/usr/bin/env node
// Gerado pela skill ci-padrao — NÃO editar aqui: editar a skill e rodar `ci.py aplicar`.
// Roda as regras do Grupo Participa sobre os arquivos que mudaram (ou --todos).
//   node scripts/ci-padrao/rodar.mjs            → muda desde CI_BASE (ou HEAD~1)
//   node scripts/ci-padrao/rodar.mjs --todos    → repo inteiro (auditoria)
//   node scripts/ci-padrao/rodar.mjs --base origin/main
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const git = (...a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 64 << 20 }).trim();
const RAIZ = git("rev-parse", "--show-toplevel");
const NO_CI = !!process.env.GITHUB_ACTIONS;
const QUEBRA = /\r?\n/;

const args = process.argv.slice(2);
const todosFlag = args.includes("--todos");
const iBase = args.indexOf("--base");
let base = iBase >= 0 ? args[iBase + 1] : process.env.CI_BASE || "";

const todos = git("ls-files").split(QUEBRA).filter(Boolean);
let arquivos;
if (todosFlag) {
  arquivos = todos;
} else {
  if (!base || /^0+$/.test(base)) base = "HEAD~1";
  try {
    git("rev-parse", "--verify", `${base}^{commit}`);
    arquivos = git("diff", "--name-only", "--diff-filter=ACMR", base, "HEAD").split(QUEBRA).filter(Boolean);
  } catch {
    console.log(`base ${base} indisponível — checando o repo inteiro`);
    arquivos = todos;
  }
}

const cache = new Map();
const ler = (rel) => {
  if (!cache.has(rel)) {
    const p = join(RAIZ, rel);
    cache.set(rel, existsSync(p) ? readFileSync(p, "utf8") : null);
  }
  return cache.get(rel);
};

// Exceção pontual: `ci-padrao:ignorar` na linha do achado ou na de cima (com o motivo ao lado).
const ignorado = (a) => {
  const linhas = (ler(a.arquivo) || "").split(QUEBRA);
  return [linhas[a.linha - 1], linhas[a.linha - 2]].some((l) => l && l.includes("ci-padrao:ignorar"));
};

const catalogo = JSON.parse(readFileSync(join(AQUI, "regras.json"), "utf8"));
const config = existsSync(join(RAIZ, ".ci-padrao.json")) ? JSON.parse(ler(".ci-padrao.json")) : {};
const desligadas = new Set(config.desligar || []);
const rebaixadas = new Set(config.so_aviso || []);

let erros = 0, avisos = 0;
for (const regra of catalogo.regras) {
  if (desligadas.has(regra.id)) continue;
  const mod = await import(pathToFileURL(join(AQUI, `${regra.id}.mjs`)).href);
  const achados = (mod.default({ arquivos, todos, raiz: RAIZ, ler }) || []).filter((a) => !ignorado(a));
  const nivel = rebaixadas.has(regra.id) ? "aviso" : regra.nivel;
  for (const a of achados) {
    const msg = `[${regra.id}] ${a.msg}`;
    if (NO_CI) console.log(`::${nivel === "erro" ? "error" : "warning"} file=${a.arquivo},line=${a.linha}::${msg}`);
    console.log(`${nivel === "erro" ? "✖" : "⚠"} ${a.arquivo}:${a.linha}  ${msg}`);
    nivel === "erro" ? erros++ : avisos++;
  }
  if (achados.length) console.log(`   por quê: ${regra.porque}`);
}

console.log(`\nci-padrao v${catalogo.versao}: ${arquivos.length} arquivo(s), ${erros} erro(s), ${avisos} aviso(s)`);
process.exit(erros ? 1 : 0);
