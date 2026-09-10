import { createRequire } from "node:module";
import { readdirSync, existsSync } from "node:fs";
const cacheRoot = "C:/Users/João/AppData/Local/npm-cache/_npx/";
let pw = null;
for (const d of readdirSync(cacheRoot)) { const p = `${cacheRoot}${d}/node_modules/playwright/`; if (existsSync(p)) { pw = createRequire(`${cacheRoot}${d}/node_modules/`)("playwright"); break; } }
const { chromium } = pw;
const base = "http://localhost:3991";
const OUT = "C:/Users/João/AppData/Local/Temp/claude/C--Users-Jo-o/3ef57506-2186-4d0a-899b-b3ac361413c5/scratchpad/shots-ciclo1";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const erros = [];
page.on("console", (m) => { if (m.type() === "error") erros.push(`[console] ${page.url()} :: ${m.text().slice(0,160)}`); });
page.on("pageerror", (e) => erros.push(`[pageerror] ${page.url()} :: ${e.message}`));
const casos = [
  ["/login?motivo=inatividade", "inatividade"],
  ["/login?motivo=<script>alert(1)</script>", "script"],
  ["/esqueci-senha?erro=link", "expirou"],
  ["/esqueci-senha?erro=<b>x</b>", "<b>"],
  ["/cadastro", "CPF"],
  ["/auth/redefinir", "8 caracteres"],
];
for (const w of [1366, 390]) {
  await page.setViewportSize({ width: w, height: w === 390 ? 844 : 900 });
  for (const [r, chave] of casos) {
    const antes = erros.length;
    await page.goto(`${base}${r}`, { waitUntil: "networkidle", timeout: 60000 });
    const status = await page.locator('[role="status"]').allInnerTexts();
    const html = await page.content();
    const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    await page.screenshot({ path: `${OUT}/pub-${w}-${r.replace(/[^a-z0-9]+/gi, "_").slice(0, 40)}.png`, fullPage: true });
    console.log(`${w} ${r.slice(0,45).padEnd(46)} status=${JSON.stringify(status)} contém"${chave}"=${html.includes(chave)} overflow=${ov.sw > ov.cw ? "SIM" : "não"} erros=${erros.length - antes}`);
  }
}
// redirects sem sessão (fetch manual, sem seguir)
for (const r of ["/auth/confirm?code=invalido&next=//evil.com", "/auth/confirm?token_hash=x&type=recovery&next=/%2fevil.com", "/auth/confirm", "/clientes", "/login?redirect=//evil.com"]) {
  const res = await page.request.fetch(`${base}${r}`, { maxRedirects: 0 });
  console.log(`GET ${r.padEnd(60)} → ${res.status()} ${res.headers()["location"] ?? ""}`);
}
console.log("\nERROS:", erros.length ? "\n" + erros.join("\n") : "nenhum");
await browser.close();
