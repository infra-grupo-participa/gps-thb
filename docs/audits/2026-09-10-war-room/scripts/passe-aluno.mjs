import { createRequire } from "node:module";
import { readdirSync, existsSync } from "node:fs";
const cacheRoot = "C:/Users/João/AppData/Local/npm-cache/_npx/";
let pw = null;
for (const d of readdirSync(cacheRoot)) {
  const p = `${cacheRoot}${d}/node_modules/playwright/`;
  if (existsSync(p)) { pw = createRequire(`${cacheRoot}${d}/node_modules/`)("playwright"); break; }
}
const { chromium } = pw;
const base = "http://localhost:3991";
const OUT = "C:/Users/João/AppData/Local/Temp/claude/C--Users-Jo-o/3ef57506-2186-4d0a-899b-b3ac361413c5/scratchpad/shots-ciclo1";
const EMAIL = "onboarding.teste@programa.timeholdingbrasil.com.br";
const SENHA_ATUAL = process.argv[2] ?? "SENHA_ATUAL_AQUI";
const SENHA_NOVA = process.argv[3] ?? "SENHA_NOVA_AQUI";
const TROCAR = process.argv[4] !== "nao";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
const erros = [];
page.on("console", (m) => { if (m.type() === "error") erros.push(`[console] ${page.url()} :: ${m.text()}`); });
page.on("pageerror", (e) => erros.push(`[pageerror] ${page.url()} :: ${e.message}`));
page.on("response", (r) => { if (r.status() >= 500) erros.push(`[http ${r.status()}] ${r.url()}`); });

const barra = async () => { const l = page.locator('[role="dialog"] p:has-text("Passo ")').first(); return (await l.count()) ? (await l.innerText()).replace(/\s+/g, " ") : "—"; };
const dialogo = () => page.locator('[role="dialog"]');

// 1) login
await page.goto(`${base}/login`, { waitUntil: "networkidle" });
await page.fill('input[name="email"], input[type="email"]', EMAIL);
await page.fill('input[name="senha"], input[name="password"], input[type="password"]', SENHA_ATUAL);
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 }), page.click('button[type="submit"]')]);
console.log("pós-login URL:", page.url());
await dialogo().waitFor({ timeout: 30000 });
console.log("passo 0 título:", (await dialogo().locator("h2").first().innerText()));
console.log("passo 0 barra :", await barra());
console.log("passo 0 inputs:", await dialogo().locator("input").count());
await page.screenshot({ path: `${OUT}/01-passo0-1366.png` });

if (TROCAR) {
  const inputs = dialogo().locator("input");
  await inputs.nth(0).fill(SENHA_NOVA);
  await inputs.nth(1).fill(SENHA_NOVA);
  const btn = dialogo().getByRole("button", { name: /Continuar|Salvar|Trocar|Definir|Criar/ }).last();
  console.log("botão do passo 0:", await btn.innerText());
  await btn.click();
  await page.waitForTimeout(2500);
  console.log("após troca barra :", await barra());
  console.log("após troca título:", (await dialogo().locator("h2").first().innerText()).replace(/\s+/g, " "));
  const al = page.locator('[role="dialog"] [role="alert"]');
  if (await al.count()) console.log("alerta no diálogo:", await al.first().innerText());
  await page.screenshot({ path: `${OUT}/02-apos-troca-1366.png` });
  // recarrega a página inteira: o gate refaz a leitura → o passo 0 deve ter sumido e a barra é a "real"
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  console.log("após F5 barra    :", await barra());
}

// 2) loop de /login?redirect=
for (const q of ["/login?redirect=/login", "/login?redirect=//evil.com", "/login?redirect=/%2f/evil.com", "/login?redirect=/clientes"]) {
  try {
    const r = await page.goto(`${base}${q}`, { waitUntil: "domcontentloaded", timeout: 20000 });
    console.log(`GET ${q} → final ${page.url()} (${r?.status()})`);
  } catch (e) {
    console.log(`GET ${q} → ERRO ${e.message.split("\n")[0]}`);
  }
}

// 3) telas
async function fecharDialogo() {
  if (await dialogo().count()) {
    const f = dialogo().getByRole("button", { name: /Fechar|Depois|Pular|Agora não/ }).first();
    if (await f.count()) { await f.click().catch(() => {}); } else { await page.keyboard.press("Escape"); }
    await page.waitForTimeout(400);
  }
}
const rotas = ["/", "/clientes", "/etapa/1", "/materiais", "/financeiro", "/chamados", "/perfil"];
for (const w of [1366, 390]) {
  await page.setViewportSize({ width: w, height: w === 390 ? 844 : 900 });
  for (const r of rotas) {
    const antes = erros.length;
    await page.goto(`${base}${r}`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(500);
    const temDialogo = await dialogo().count();
    await fecharDialogo();
    const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bw: document.body.scrollWidth }));
    const h1 = await page.locator("h1").first().innerText().catch(() => "—");
    await page.screenshot({ path: `${OUT}/${w}-${r.replace(/\//g, "_") || "home"}.png`, fullPage: true });
    console.log(`${w} ${r.padEnd(12)} h1="${h1.replace(/\s+/g, " ").slice(0, 40)}" dialogo=${temDialogo} overflow=${ov.sw > ov.cw ? `SIM ${ov.sw}>${ov.cw}` : "não"} errosNovos=${erros.length - antes}`);
  }
}
console.log("\nERROS:", erros.length ? "\n" + erros.join("\n") : "nenhum");
await browser.close();
