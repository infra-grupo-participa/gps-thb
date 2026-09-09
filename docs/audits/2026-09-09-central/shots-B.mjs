// Onda B — fotografa as 8 telas da prévia de design em desktop e mobile,
// e reporta erro de console + overflow horizontal em cada combinação.
// Uso: node tmp/squad/shots-B.mjs [saida] [telas separadas por virgula]
import { createRequire } from "node:module";
const require = createRequire(
  "C:/Users/João/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/",
);
const { chromium } = require("playwright");
import { mkdirSync } from "node:fs";

const out = process.argv[2] ?? "tmp/squad/shots-design-B";
const base = "http://localhost:3455/p/previa-design";
const telas = (
  process.argv[3] ??
  "home,etapa1,clientes,ficha,admin,assist,chamados,plantao"
).split(",");
mkdirSync(out, { recursive: true });

const viewports = [
  { nome: "desktop", width: 1366, height: 900 },
  { nome: "mobile", width: 390, height: 844, isMobile: true, dsf: 2 },
];

const browser = await chromium.launch();
let problemas = 0;
for (const vp of viewports) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.isMobile ?? false,
    deviceScaleFactor: vp.dsf ?? 1,
    locale: "pt-BR",
  });
  const page = await ctx.newPage();
  const erros = [];
  page.on("console", (m) => {
    if (m.type() === "error") erros.push(m.text().slice(0, 160));
  });
  page.on("pageerror", (e) => erros.push("pageerror: " + e.message.slice(0, 160)));

  for (const t of telas) {
    erros.length = 0;
    const resp = await page.goto(`${base}?t=${t}`, {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}/${t}-${vp.nome}-viewport.png` });
    await page.screenshot({ path: `${out}/${t}-${vp.nome}-full.png`, fullPage: true });

    const medida = await page.evaluate((largura) => {
      const doc = document.documentElement;
      const estouram = [...document.querySelectorAll("body *")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.right > largura + 1;
        })
        .slice(0, 4)
        .map(
          (el) =>
            `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 50)}`,
        );
      return {
        scrollWidth: doc.scrollWidth,
        altura: doc.scrollHeight,
        estouram,
      };
    }, vp.width);

    const overflow = medida.scrollWidth > vp.width + 1;
    if (overflow || erros.length) problemas++;
    console.log(
      `${resp?.status()} ${vp.nome.padEnd(7)} ${t.padEnd(9)} altura=${String(medida.altura).padStart(5)} scrollW=${medida.scrollWidth}` +
        (overflow ? ` OVERFLOW -> ${medida.estouram.join(" | ")}` : "") +
        (erros.length ? ` ERROS: ${erros.join(" ;; ")}` : ""),
    );
  }
  await ctx.close();
}
await browser.close();
console.log(problemas === 0 ? "OK: 0 problema" : `PROBLEMAS: ${problemas}`);
