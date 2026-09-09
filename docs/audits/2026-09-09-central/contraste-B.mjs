// Varredura de contraste WCAG 1.4.3 nas 8 telas da prévia, desktop e mobile.
// Mede no DOM (cor computada + fundo efetivo do ancestral), não estima.
// Uso: node tmp/squad/contraste-B.mjs
import { createRequire } from "node:module";
const require = createRequire(
  "C:/Users/João/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/",
);
const { chromium } = require("playwright");

const base = "http://localhost:3455/p/previa-design";
const telas = [
  "home",
  "etapa1",
  "clientes",
  "ficha",
  "admin",
  "assist",
  "chamados",
  "plantao",
];

const MEDIDOR = (todos) => {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const lum = ([r, g, b]) =>
    0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const rgb = (str) => {
    const m = str.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { c: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 };
  };
  const mistura = (frente, fundo, a) =>
    frente.map((v, i) => v * a + fundo[i] * (1 - a));

  /** Fundo efetivo: sobe a árvore compondo camadas semitransparentes. */
  const fundoDe = (el) => {
    const camadas = [];
    let no = el;
    while (no) {
      const bg = rgb(getComputedStyle(no).backgroundColor);
      if (bg && bg.a > 0) {
        camadas.push(bg);
        if (bg.a === 1) break;
      }
      no = no.parentElement;
    }
    let cor = [255, 255, 255];
    for (let i = camadas.length - 1; i >= 0; i--) {
      cor = mistura(camadas[i].c, cor, camadas[i].a);
    }
    return cor;
  };

  const falhas = [];
  const vistos = new Set();
  for (const el of document.querySelectorAll("body *")) {
    // Só o nó que carrega texto próprio.
    const texto = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(" ")
      .trim();
    if (!texto) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.opacity === "0") continue;
    // `sr-only` é para leitor de tela, não para o olho.
    if (r.width <= 1 && r.height <= 1) continue;

    const cor = rgb(cs.color);
    if (!cor) continue;
    const fundo = fundoDe(el);
    const frente = cor.a < 1 ? mistura(cor.c, fundo, cor.a) : cor.c;
    const l1 = lum(frente);
    const l2 = lum(fundo);
    const razao =
      (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

    const px = parseFloat(cs.fontSize);
    const peso = parseInt(cs.fontWeight, 10) || 400;
    const grande = px >= 24 || (px >= 18.66 && peso >= 700);
    const minimo = grande ? 3 : 4.5;
    if (todos || razao + 0.005 < minimo) {
      const chave = `${cs.color}|${fundo.map(Math.round)}|${px}|${texto.slice(0, 30)}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      falhas.push({
        texto: texto.slice(0, 46),
        cor: cs.color,
        fundo: `rgb(${fundo.map((v) => Math.round(v)).join(",")})`,
        px,
        peso,
        razao: Number(razao.toFixed(2)),
        minimo,
        onde: `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`,
      });
    }
  }
  return falhas;
};

const browser = await chromium.launch();
let total = 0;
for (const vp of [
  { nome: "desktop", width: 1366, height: 900 },
  { nome: "mobile", width: 390, height: 844 },
]) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    locale: "pt-BR",
  });
  const page = await ctx.newPage();
  for (const t of telas) {
    await page.goto(`${base}?t=${t}`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(400);
    const falhas = await page.evaluate(MEDIDOR, Boolean(process.env.TODOS));
    total += falhas.length;
    if (falhas.length) {
      console.log(`\n### ${vp.nome} / ${t} — ${falhas.length} falha(s)`);
      for (const f of falhas)
        console.log(
          `  ${f.razao}:1 (min ${f.minimo}) ${f.px}px/${f.peso} "${f.texto}" ${f.cor} sobre ${f.fundo} — ${f.onde}`,
        );
    }
  }
  await ctx.close();
}
await browser.close();
console.log(`\nTOTAL DE FALHAS DE CONTRASTE: ${total}`);
