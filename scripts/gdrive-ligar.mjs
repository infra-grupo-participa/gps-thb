// Liga a credencial do Google DRIVE da edge `drive-provisionar` sem imprimir
// nenhum segredo. Molde do gcal-ligar.mjs (Calendar, 05/10/2026).
//
// MESMO cliente OAuth do Calendar (projeto Google 496133943558, app Interno,
// conta joao@advmais.com), refresh token NOVO com escopo drive, em secrets
// SEPARADOS: GDRIVE_CLIENT_ID / GDRIVE_CLIENT_SECRET / GDRIVE_REFRESH_TOKEN.
// O token do Calendar (GCAL_*) não é tocado e continua valendo.
//
// Pré-requisitos (João):
//   1. API do Google Drive ATIVADA no projeto 496133943558:
//      https://console.cloud.google.com/apis/library/drive.googleapis.com?project=496133943558
//   2. JSON do cliente OAuth do Calendar ("App para computador") em
//      ~/Downloads/client_secret_*.json. O de 05/10 foi apagado pelo
//      gcal-ligar: no Console, Credenciais → o cliente → "Adicionar segredo"
//      (o segredo antigo continua ativo) → baixar o JSON.
//   3. Token pessoal do Supabase em ~/.supabase/access-token (uma linha, sbp_...).
//
// Uso:  node scripts/gdrive-ligar.mjs
// Faz:  OAuth loopback + PKCE (abre o navegador; João entra como joao@ e clica
//       Permitir) → prova que lê a pasta "Implementação Assistida — Pastas dos
//       Alunos" e a matriz → grava GDRIVE_* e DRIVE_SEGREDO na edge (Management
//       API) → o mesmo DRIVE_SEGREDO no Vault (gps_drive_segredo) → apaga o JSON.
// NÃO liga o interruptor (gps.config.drive_provisionar_ativo) nem faz deploy.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { exec } from "node:child_process";

const REF = "mbvybujpkwuorhtdzcde";
const SCOPE = "https://www.googleapis.com/auth/drive";
const RAIZ = "1CRSsOfNm_PO944c3K05Nx0aI2oXehG7N";
const MATRIZ = "1T-EiOQWQgu_qXK8rtbr7BzByNW_jzm3L";
const API = `https://api.supabase.com/v1/projects/${REF}`;
const DRIVE = "https://www.googleapis.com/drive/v3";

const ok = (m) => console.log("✔", m);
const aviso = (m) => console.log("⚠", m);
const falha = (m) => {
  console.error("✘", m);
  process.exit(1);
};

// 1. Cliente OAuth (o mesmo do Calendar)
const dl = path.join(os.homedir(), "Downloads");
const jsons = fs
  .readdirSync(dl)
  .filter((f) => /^client_secret_.*\.json$/.test(f))
  .map((f) => path.join(dl, f))
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
if (!jsons.length) falha("nenhum client_secret_*.json em Downloads (ver pré-requisito 2)");
const bruto = JSON.parse(fs.readFileSync(jsons[0], "utf8"));
const c = bruto.installed ?? bruto.web;
if (!c?.client_id || !c?.client_secret) falha("JSON sem client_id/client_secret");
ok(`cliente OAuth lido (${bruto.installed ? "app para computador" : "web"})`);

// 2. Token do Supabase
const tokArq = path.join(os.homedir(), ".supabase", "access-token");
if (!fs.existsSync(tokArq)) falha(`falta ${tokArq} (ver pré-requisito 3)`);
const SB = fs.readFileSync(tokArq, "utf8").trim();
const sb = (p, init = {}) =>
  fetch(API + p, {
    ...init,
    headers: { Authorization: `Bearer ${SB}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(30000),
  });
const r0 = await sb("");
if (r0.status !== 200) falha(`token do Supabase recusado (${r0.status})`);
ok("token do Supabase aceito");

// 2b. É o MESMO cliente do Calendar? A API devolve só o hash do valor gravado.
try {
  const rs = await sb("/secrets");
  const lista = rs.ok ? await rs.json() : [];
  const gcal = lista.find?.((s) => s.name === "GCAL_CLIENT_ID")?.value;
  const meu = crypto.createHash("sha256").update(c.client_id).digest("hex");
  if (!gcal) aviso("GCAL_CLIENT_ID não encontrado nos secrets — não deu para conferir se é o mesmo cliente");
  else if (String(gcal).toLowerCase() === meu) ok("é o mesmo cliente OAuth do Calendar");
  else aviso("não deu para confirmar que é o mesmo cliente do Calendar (hash diferente ou formato desconhecido) — siga só se o JSON é do projeto 496133943558");
} catch {
  aviso("não deu para conferir o cliente contra GCAL_CLIENT_ID");
}

// 3. OAuth loopback com PKCE
const verifier = crypto.randomBytes(48).toString("base64url");
const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
const state = crypto.randomBytes(16).toString("hex");
const { code, redirect } = await new Promise((resolve, reject) => {
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, "http://127.0.0.1");
    if (u.pathname !== "/") {
      res.end();
      return;
    }
    const okState = u.searchParams.get("state") === state;
    const cod = u.searchParams.get("code");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(okState && cod ? "<h2>Pronto. Pode fechar esta aba.</h2>" : "<h2>Falhou. Volte ao terminal.</h2>");
    const porta = srv.address()?.port;
    srv.close();
    if (okState && cod) resolve({ code: cod, redirect: `http://127.0.0.1:${porta}` });
    else reject(new Error(u.searchParams.get("error") ?? "state inválido"));
  });
  srv.listen(0, "127.0.0.1", () => {
    const port = srv.address().port;
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    Object.entries({
      client_id: c.client_id,
      redirect_uri: `http://127.0.0.1:${port}`,
      response_type: "code",
      scope: SCOPE,
      access_type: "offline",
      prompt: "consent",
      login_hint: "joao@advmais.com",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).forEach(([k, v]) => url.searchParams.set(k, v));
    console.log("→ Abrindo o navegador. Entre como joao@advmais.com e clique em Permitir.");
    exec(`start "" "${url.toString()}"`);
  });
  setTimeout(() => {
    srv.close();
    reject(new Error("tempo esgotado (5 min)"));
  }, 300000);
}).catch((e) => falha(`OAuth: ${e.message}`));

const tr = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    code,
    client_id: c.client_id,
    client_secret: c.client_secret,
    redirect_uri: redirect,
    grant_type: "authorization_code",
    code_verifier: verifier,
  }),
});
const tj = await tr.json();
if (!tj.refresh_token) falha(`Google não devolveu refresh token (${tr.status} ${tj.error ?? ""})`);
if (!String(tj.scope ?? "").split(" ").includes(SCOPE)) falha("o token não veio com o escopo drive (o João desmarcou a caixa?)");
ok("refresh token obtido, escopo drive");

// 4. Prova: a credencial ESCREVE na pasta dos alunos e LÊ a matriz
const g = (p) => fetch(`${DRIVE}${p}`, { headers: { Authorization: `Bearer ${tj.access_token}` } });
const rr = await g(`/files/${RAIZ}?fields=id,name,capabilities(canAddChildren)&supportsAllDrives=true`);
if (rr.status === 403) {
  const motivo = (await rr.json().catch(() => null))?.error?.errors?.[0]?.reason ?? "";
  if (/accessNotConfigured|SERVICE_DISABLED/.test(motivo)) {
    falha("API do Google Drive desligada no projeto 496133943558 (ver pré-requisito 1) e rode de novo");
  }
  falha(`a pasta dos alunos recusou a credencial (403 ${motivo})`);
}
if (rr.status !== 200) falha(`a pasta dos alunos recusou a credencial (${rr.status})`);
const raiz = await rr.json();
if (!raiz?.capabilities?.canAddChildren) falha("a conta enxerga a pasta dos alunos mas NÃO pode criar dentro dela (entrou com a conta certa?)");
ok("credencial cria dentro de \"Implementação Assistida — Pastas dos Alunos\"");

let pastas = 0;
let arquivos = 0;
let atalhos = 0;
const fila = [MATRIZ];
while (fila.length) {
  const pai = fila.shift();
  let pageToken = "";
  do {
    const q = encodeURIComponent(`'${pai}' in parents and trashed = false`);
    const rl = await g(`/files?q=${q}&fields=nextPageToken,files(id,mimeType)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true${pageToken ? `&pageToken=${pageToken}` : ""}`);
    if (rl.status !== 200) falha(`a matriz recusou a credencial (${rl.status})`);
    const j = await rl.json();
    for (const f of j.files ?? []) {
      if (f.mimeType === "application/vnd.google-apps.folder") {
        pastas++;
        fila.push(f.id);
      } else if (f.mimeType === "application/vnd.google-apps.shortcut") atalhos++;
      else arquivos++;
    }
    pageToken = j.nextPageToken ?? "";
  } while (pageToken);
}
ok(`matriz legível: ${pastas} subpastas, ${arquivos} arquivos, ${atalhos} atalho(s) (esperado em 05/10: 25 + 54, 1 atalho)`);

// 5. Segredos da edge
const S = crypto.randomBytes(32).toString("hex");
const rs = await sb("/secrets", {
  method: "POST",
  body: JSON.stringify([
    { name: "GDRIVE_CLIENT_ID", value: c.client_id },
    { name: "GDRIVE_CLIENT_SECRET", value: c.client_secret },
    { name: "GDRIVE_REFRESH_TOKEN", value: tj.refresh_token },
    { name: "DRIVE_SEGREDO", value: S },
  ]),
});
if (rs.status >= 300) falha(`gravar segredos da edge (${rs.status})`);
ok("segredos da edge gravados (GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN, DRIVE_SEGREDO)");

// 6. Mesmo segredo no Vault (hex puro: sem aspas a escapar)
const q = `do $$ declare v uuid; begin
  select id into v from vault.secrets where name = 'gps_drive_segredo';
  if v is null then perform vault.create_secret('${S}', 'gps_drive_segredo', 'GPS drive-provisionar: header x-drive-segredo');
  else perform vault.update_secret(v, '${S}'); end if; end $$;
  select count(*)::int n from vault.decrypted_secrets where name='gps_drive_segredo' and length(decrypted_secret)=64;`;
const rq = await sb("/database/query", { method: "POST", body: JSON.stringify({ query: q }) });
const qj = await rq.json().catch(() => null);
if (rq.status >= 300 || qj?.[0]?.n !== 1) falha(`gravar segredo no Vault (${rq.status})`);
ok("segredo gravado no Vault (gps_drive_segredo)");

// 7. O JSON baixado não precisa mais existir
for (const f of jsons) {
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  if ((j.installed ?? j.web)?.client_id === c.client_id) fs.unlinkSync(f);
}
ok("JSON(s) do cliente OAuth apagado(s) de Downloads (a cópia vive só nos segredos da edge)");

console.log("\nCredencial do Drive ligada. Faltam: deploy da edge e ligar o interruptor (ver o relatório).");
