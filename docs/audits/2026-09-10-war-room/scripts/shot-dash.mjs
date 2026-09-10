import { createRequire } from "node:module";
import { readdirSync, existsSync } from "node:fs";
const cacheRoot = "C:/Users/João/AppData/Local/npm-cache/_npx/";
let pw = null;
for (const d of readdirSync(cacheRoot)) {
  const p = `${cacheRoot}${d}/node_modules/playwright/`;
  if (existsSync(p)) { pw = createRequire(`${cacheRoot}${d}/node_modules/`)("playwright"); break; }
}
const { chromium } = pw;
const url = process.argv[2] ?? "http://localhost:3997/p/previa-dash";
const tag = process.argv[3] ?? "atual";
const b = await chromium.launch();
for (const [w, h] of [[1366, 900], [390, 844]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  const erros = [];
  p.on("console", (m) => { if (m.type() === "error") erros.push(m.text()); });
  await p.goto(url, { waitUntil: "networkidle" });
  await p.waitForTimeout(500);
  await p.screenshot({ path: `C:/Users/João/projetos/gps-thb/tmp/squad/dash/${tag}-${w}.png`, fullPage: true });
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  console.log(`${w}px overflow=${overflow} erros=${erros.length} ${erros.slice(0,2).join(" | ")}`);
  await p.close();
}
await b.close();
