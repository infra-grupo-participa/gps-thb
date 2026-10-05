// Sonda SÓ DE LEITURA do feed de mudanças do Google Drive (changes.*).
// Serve para medir, antes de ligar a edge `drive-atividade`, o que o feed
// realmente entrega: quantas mudanças, quantas trazem `lastModifyingUser`,
// quantas são de pastas que o sistema já conhece.
//
// Credencial: variáveis de ambiente GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET,
// GDRIVE_REFRESH_TOKEN. NUNCA são impressas (nem o access token, nem o corpo
// de resposta de erro). Nenhuma escrita: só GET em changes.* e o POST de
// renovação do token OAuth.
//
// Uso:
//   node scripts/drive-sonda.mjs                       só pega e imprime se há token novo
//   node scripts/drive-sonda.mjs <pageToken>           lê a partir do token
//   node scripts/drive-sonda.mjs <pageToken> ids.txt   + conta as de pastas conhecidas
//     (ids.txt = um file_id de pasta por linha, ex.: select file_id from gps.drive_pastas)
//
// Saída: só contagens. O token impresso é um cursor opaco (não é credencial).
import fs from "node:fs";

const API = "https://www.googleapis.com/drive/v3";
const MAX_PAGINAS = 50;

const falha = (m) => {
  console.error("✘", m);
  process.exit(1);
};

const { GDRIVE_CLIENT_ID: id, GDRIVE_CLIENT_SECRET: segredo, GDRIVE_REFRESH_TOKEN: refresh } = process.env;
if (!id || !segredo || !refresh) falha("Defina GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET e GDRIVE_REFRESH_TOKEN no ambiente.");

const [, , pageTokenArg, arquivoIds] = process.argv;

async function accessToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: segredo, refresh_token: refresh, grant_type: "refresh_token" }),
  });
  if (!res.ok) falha(`token OAuth recusado (HTTP ${res.status}).`);
  const j = await res.json();
  if (typeof j.access_token !== "string") falha("resposta do OAuth sem access_token.");
  return j.access_token;
}

async function get(t, caminho, params) {
  const res = await fetch(`${API}${caminho}?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${t}` } });
  if (!res.ok) falha(`GET ${caminho} → HTTP ${res.status}`);
  return res.json();
}

const conhecidas = new Set();
if (arquivoIds) {
  for (const l of fs.readFileSync(arquivoIds, "utf8").split(/\r?\n/)) if (l.trim()) conhecidas.add(l.trim());
}

const t = await accessToken();
const inicial = await get(t, "/changes/startPageToken", { supportsAllDrives: "true" });
console.log(`startPageToken (para a próxima rodada): ${inicial.startPageToken}`);

if (!pageTokenArg) {
  console.log("Sem pageToken por argumento: nada lido. Rode de novo com o token de uma sondagem anterior.");
  process.exit(0);
}

const c = { paginas: 0, mudancas: 0, removidas: 0, comFile: 0, comUsuario: 0, pastas: 0, naLixeira: 0, emPastaConhecida: 0, proprioEhPastaConhecida: 0 };
let token = pageTokenArg;
let novoToken = null;
for (let i = 0; i < MAX_PAGINAS && token; i++) {
  const p = await get(t, "/changes", {
    pageToken: token,
    includeRemoved: "true",
    restrictToMyDrive: "false",
    pageSize: "1000",
    includeItemsFromAllDrives: "true",
    supportsAllDrives: "true",
    fields: "nextPageToken,newStartPageToken,changes(fileId,removed,file(id,name,mimeType,parents,trashed,modifiedTime,lastModifyingUser(displayName)))",
  });
  c.paginas++;
  for (const m of p.changes ?? []) {
    c.mudancas++;
    if (m.removed) c.removidas++;
    const f = m.file;
    if (!f) continue;
    c.comFile++;
    if (f.lastModifyingUser?.displayName) c.comUsuario++;
    if (f.mimeType === "application/vnd.google-apps.folder") c.pastas++;
    if (f.trashed) c.naLixeira++;
    if ((f.parents ?? []).some((x) => conhecidas.has(x))) c.emPastaConhecida++;
    if (conhecidas.has(f.id)) c.proprioEhPastaConhecida++;
  }
  token = p.nextPageToken ?? null;
  novoToken = p.newStartPageToken ?? novoToken;
}

console.log(`páginas lidas: ${c.paginas}${token ? " (parou no limite; há mais)" : ""}`);
console.log(`mudanças: ${c.mudancas} (removidas: ${c.removidas}, com arquivo: ${c.comFile})`);
console.log(`com lastModifyingUser: ${c.comUsuario} de ${c.comFile}`);
console.log(`pastas: ${c.pastas} · na lixeira: ${c.naLixeira}`);
if (conhecidas.size) {
  console.log(`pastas conhecidas informadas: ${conhecidas.size}`);
  console.log(`mudanças dentro de pasta conhecida: ${c.emPastaConhecida} · da própria pasta conhecida: ${c.proprioEhPastaConhecida}`);
}
if (novoToken) console.log(`newStartPageToken: ${novoToken}`);
