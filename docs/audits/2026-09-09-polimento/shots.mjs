// Fotografa páginas do GPS (produção ou local) em desktop e mobile.
// Uso: node tmp/squad/shots.mjs [baseUrl] [saida]
import { createRequire } from "node:module";
const require = createRequire("C:/Users/João/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/");
const { chromium } = require("playwright");
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "https://programa.timeholdingbrasil.com.br";
const out = process.argv[3] ?? "tmp/squad/shots";
mkdirSync(out, { recursive: true });

const paginas = ["/login", "/esqueci-senha", "/p/plantao", "/cadastro"];
const viewports = [
  { nome: "desktop", width: 1366, height: 900 },
  { nome: "mobile", width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
];

const browser = await chromium.launch();
for (const vp of viewports) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile ?? false, deviceScaleFactor: vp.deviceScaleFactor ?? 1, locale: "pt-BR" });
  const page = await ctx.newPage();
  for (const p of paginas) {
    const url = base + p;
    try {
      const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
      await page.waitForTimeout(800);
      const nome = `${out}/${vp.nome}${p.replace(/\//g, "_") || "_home"}.png`;
      await page.screenshot({ path: nome, fullPage: true });
      console.log(`${resp?.status()} ${vp.nome} ${p} -> ${nome}`);
    } catch (e) {
      console.log(`ERRO ${vp.nome} ${p}: ${e.message.split("\n")[0]}`);
    }
  }
  await ctx.close();
}
await browser.close();
