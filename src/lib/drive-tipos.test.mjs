// Integração Google Drive (…347): funções puras do cliente do Drive e da tela.
// Rodar: node --test src/lib/drive-tipos.test.mjs
//
// `node --test`, não vitest (o repo não tem runner de unidade). Os módulos não
// importam `@/`, então o Node carrega direto (type stripping do Node 24).
import { test } from "node:test";
import assert from "node:assert/strict";

const g = await import("../../supabase/functions/_shared/gdrive.ts");
const t = await import("./drive-tipos.ts");

// ── nome de pasta ─────────────────────────────────────────────────────────
test("nome da pasta do parceiro segue o padrão da equipe", () => {
  assert.equal(g.nomePastaParceiro("Maria Souza"), "Maria Souza — Implementação Assistida");
  assert.equal(g.nomePastaParceiro("  Maria\n\tSouza  "), "Maria Souza — Implementação Assistida");
  assert.equal(g.nomePastaParceiro(null), "Parceiro — Implementação Assistida");
  assert.equal(g.nomePastaParceiro("   "), "Parceiro — Implementação Assistida");
});

test("nome de pasta tira controle e bidi, e corta por code point", () => {
  assert.equal(g.limparNome("a‮b\u0000c"), "a b c");
  const longo = "é".repeat(130);
  assert.equal(Array.from(g.nomePastaCliente(longo)).length, 120);
  assert.equal(g.nomePastaCliente(""), "Cliente sem nome");
});

// ── normalização (achar subpasta por nome) ────────────────────────────────
test("normalização acha '1) DOCUMENTOS ' com espaço no fim e caixa diferente", () => {
  assert.equal(g.normalizarNome("1) DOCUMENTOS "), g.normalizarNome("1) DOCUMENTOS"));
  assert.equal(g.normalizarNome("1)  documentos"), "1) DOCUMENTOS");
  assert.equal(g.normalizarNome("5) CLIENTES "), "5) CLIENTES");
  assert.notEqual(g.normalizarNome("5) CLIENTE"), g.normalizarNome("5) CLIENTES"));
  // NFC: "é" composto e decomposto são o mesmo nome
  assert.equal(g.normalizarNome("Imóveis"), g.normalizarNome("Imóveis"));
});

test("id do Drive sai de qualquer formato de link", () => {
  const id = "1CRSsOfNm_PO944c3K05Nx0aI2oXehG7N";
  assert.equal(g.extrairIdDoDrive(`https://drive.google.com/drive/folders/${id}`), id);
  assert.equal(g.extrairIdDoDrive(`https://drive.google.com/drive/folders/${id}?usp=sharing`), id);
  assert.equal(g.extrairIdDoDrive(`https://drive.google.com/drive/u/0/folders/${id}`), id);
  assert.equal(g.extrairIdDoDrive(`https://drive.google.com/open?id=${id}`), id);
  assert.equal(g.extrairIdDoDrive(`https://docs.google.com/document/d/${id}/edit`), id);
  assert.equal(g.extrairIdDoDrive("https://drive.google.com/drive/my-drive"), null);
  assert.equal(g.extrairIdDoDrive(null), null);
});

test("consulta q escapa aspas e barra", () => {
  assert.equal(g.escaparQ("d'Ávila\\x"), "d\\'Ávila\\\\x");
});

// ── classificação de erro ─────────────────────────────────────────────────
test("classificação de erro do Google", () => {
  assert.equal(g.classificarErro(404, "notFound", "get").tipo, "nao_encontrado");
  assert.equal(g.classificarErro(401, "authError", "list").tipo, "credencial");
  assert.equal(g.classificarErro(403, "accessNotConfigured", "list").tipo, "credencial");
  assert.equal(g.classificarErro(403, "insufficientPermissions", "list").tipo, "credencial");
  assert.equal(g.classificarErro(429, "", "create").tipo, "transitorio");
  assert.equal(g.classificarErro(503, "backendError", "create").tipo, "transitorio");
  assert.equal(g.classificarErro(403, "userRateLimitExceeded", "create").tipo, "transitorio");
  assert.equal(g.classificarErro(403, "rateLimitExceeded", "create").tipo, "transitorio");
  assert.equal(g.classificarErro(403, "cannotCopyFile", "copy").tipo, "outro");
  assert.equal(g.classificarErro(400, "invalid", "create").tipo, "outro");
  // a mensagem nunca carrega corpo: só onde, status e razão
  assert.equal(g.classificarErro(429, "rateLimitExceeded", "copy").message, "copy: 429 rateLimitExceeded");
});

test("rate limit é o único 403 que repete", () => {
  assert.equal(g.ehRateLimit(g.classificarErro(403, "rateLimitExceeded", "x")), true);
  assert.equal(g.ehRateLimit(g.classificarErro(429, "", "x")), true);
  assert.equal(g.ehRateLimit(g.classificarErro(503, "", "x")), false);
  assert.equal(g.ehRateLimit(g.classificarErro(403, "forbidden", "x")), false);
});

test("permissão já existente não reenvia convite", () => {
  const perms = [{ id: "1", type: "user", role: "reader", emailAddress: "Ana@Exemplo.com" }];
  assert.equal(g.jaTemAcesso(perms, "ana@exemplo.com", "reader"), true);
  assert.equal(g.jaTemAcesso(perms, "ana@exemplo.com", "writer"), false);
  assert.equal(g.jaTemAcesso([{ id: "2", type: "user", role: "owner", emailAddress: "a@b.co" }], "a@b.co", "writer"), true);
  assert.equal(g.jaTemAcesso([{ id: "3", type: "anyone", role: "writer" }], "a@b.co", "reader"), false);
});

// ── cliente do Drive com fetch falso: retry, ritmo, paginação ─────────────
function falso(respostas) {
  const chamadas = [];
  const fetchFalso = async (url, init) => {
    chamadas.push({ url: String(url), metodo: init?.method ?? "GET" });
    if (String(url).startsWith("https://oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
    }
    const r = respostas.shift();
    if (!r) throw new Error("resposta não prevista: " + url);
    return new Response(JSON.stringify(r.corpo ?? {}), { status: r.status ?? 200 });
  };
  return { chamadas, fetchFalso };
}

function cliente(respostas, extra = {}) {
  const { chamadas, fetchFalso } = falso(respostas);
  let relogio = 0;
  const esperas = [];
  const drive = g.criarGdrive({
    clientId: "c", clientSecret: "s", refreshToken: "r",
    fetch: fetchFalso,
    agora: () => relogio,
    dormir: async (ms) => { esperas.push(ms); relogio += ms; },
    ...extra,
  });
  return { drive, chamadas, esperas };
}

const PASTA = "1AAAAAAAAAAAAAAAAAAAAAAAAA";

test("listarFilhos segue TODOS os nextPageToken", async () => {
  const { drive, chamadas } = cliente([
    { corpo: { files: [{ id: "a1", name: "A" }], nextPageToken: "p2" } },
    { corpo: { files: [{ id: "a2", name: "B" }], nextPageToken: "p3" } },
    { corpo: { files: [{ id: "a3", name: "C" }] } },
  ]);
  const r = await drive.listarFilhos(PASTA);
  assert.deepEqual(r.map((f) => f.id), ["a1", "a2", "a3"]);
  const listas = chamadas.filter((c) => c.url.includes("/drive/v3/files?"));
  assert.equal(listas.length, 3);
  assert.ok(listas[2].url.includes("pageToken=p3"));
});

test("escrita repete em 429 e em 403 rateLimitExceeded, com recuo", async () => {
  const { drive, esperas } = cliente([
    { status: 429, corpo: { error: { errors: [{ reason: "rateLimitExceeded" }] } } },
    { status: 403, corpo: { error: { errors: [{ reason: "userRateLimitExceeded" }] } } },
    { corpo: { id: "nova", name: "X", mimeType: g.MIME_PASTA } },
  ], { recuoBaseMs: 1000, intervaloEscritaMs: 0 });
  const f = await drive.criarPasta(PASTA, "X", "p:1");
  assert.equal(f.id, "nova");
  assert.equal(esperas.length, 2);
  assert.ok(esperas[0] >= 1000 && esperas[0] < 1250);
  assert.ok(esperas[1] >= 2000 && esperas[1] < 2250);
});

test("escrita NÃO repete em 5xx (pode ter sido executada): sobe transitório", async () => {
  const { drive } = cliente([{ status: 503, corpo: {} }], { intervaloEscritaMs: 0 });
  await assert.rejects(drive.criarPasta(PASTA, "X", "p:1"), (e) => e.tipo === "transitorio" && e.status === 503);
});

test("leitura repete em 5xx", async () => {
  const { drive } = cliente([{ status: 500 }, { corpo: { files: [] } }], { recuoBaseMs: 10 });
  assert.deepEqual(await drive.listarFilhos(PASTA), []);
});

test("no máximo ~3 escritas por segundo", async () => {
  const { drive, esperas } = cliente([
    { corpo: { id: "1" } }, { corpo: { id: "2" } }, { corpo: { id: "3" } },
  ]);
  await drive.criarPasta(PASTA, "a", "g1");
  await drive.criarPasta(PASTA, "b", "g2");
  await drive.criarPasta(PASTA, "c", "g3");
  assert.deepEqual(esperas, [340, 340]);
});

test("compartilhar com 400 vira compartilhamento_recusado (e-mail não Google)", async () => {
  const { drive } = cliente([{ status: 400, corpo: { error: { errors: [{ reason: "invalidSharingRequest" }] } } }], { intervaloEscritaMs: 0 });
  await assert.rejects(drive.compartilhar(PASTA, "x@y.com", "reader"), (e) => e.tipo === "compartilhamento_recusado");
});

test("credencial ausente falha como credencial, sem chamar o Google", async () => {
  const drive = g.criarGdrive({ clientId: "", clientSecret: "", refreshToken: "", fetch: async () => { throw new Error("não devia chamar"); } });
  await assert.rejects(drive.listarFilhos(PASTA), (e) => e.tipo === "credencial");
});

test("id inválido nunca vira chamada", async () => {
  const { drive, chamadas } = cliente([]);
  await assert.rejects(drive.listarFilhos("x' or '1'='1"));
  assert.equal(chamadas.length, 0);
});

// ── estado da tela ────────────────────────────────────────────────────────
test("estado da tela a partir da última tarefa", () => {
  assert.equal(t.situacaoDaLinha(null).situacao, "nenhuma");
  assert.equal(t.situacaoDaLinha({ url: null }).situacao, "nenhuma");
  assert.equal(t.situacaoDaLinha({ url: "https://drive.google.com/drive/folders/x" }).situacao, "pronta");
  assert.equal(t.situacaoDaLinha({ estado: "pendente" }).situacao, "criando");
  assert.equal(t.situacaoDaLinha({ estado: "rodando", url: "https://drive.google.com/x" }).situacao, "criando");
  const e = t.situacaoDaLinha({ estado: "erro", erro: "Este cliente já tem uma pasta ligada." });
  assert.equal(e.situacao, "erro");
  assert.equal(e.erro, "Este cliente já tem uma pasta ligada.");
  assert.equal(t.situacaoDaLinha({ estado: "erro" }).erro, "Não deu para criar a pasta. Tente de novo.");
  assert.equal(t.situacaoDaLinha({ estado: "feito", url: "https://drive.google.com/x" }).situacao, "pronta");
});

test("avisos: só os conhecidos, sem repetir", () => {
  assert.deepEqual(t.lerAvisos("email_nao_google,sem_login,email_nao_google,xyz"), ["email_nao_google", "sem_login"]);
  assert.deepEqual(t.lerAvisos(null), []);
  for (const a of ["email_nao_google", "sem_login", "documentos_ausente", "ja_tinha_pasta"]) assert.ok(t.TEXTO_AVISO[a]);
  assert.deepEqual(t.lerAvisos("ja_tinha_pasta,sem_login,ja_tinha_pasta"), ["ja_tinha_pasta", "sem_login"]);
  assert.deepEqual(t.situacaoDaLinha({ estado: "feito", aviso: "ja_tinha_pasta", url: "https://drive.google.com/x" }).avisos, ["ja_tinha_pasta"]);
});

// ── …348: tipo, organizada, revogacao_pendente, desligado ─────────────────
test("tipo da tarefa propaga (compartilhar × provisionar_parceiro)", () => {
  assert.equal(t.situacaoDaLinha({ estado: "pendente", tipo: "compartilhar" }).tipo, "compartilhar");
  assert.equal(t.situacaoDaLinha({ estado: "rodando", tipo: "provisionar_parceiro" }).tipo, "provisionar_parceiro");
  assert.equal(t.situacaoDaLinha({ tipo: "xyz" }).tipo, null);
  assert.equal(t.situacaoDaLinha(null).tipo, null);
});

test("desligado: {ativo:false} vira parceiro nenhuma, não organizado, sem revogação", () => {
  const e = t.estadoDoRetorno({ ativo: false }, true);
  assert.equal(e.ativo, false);
  assert.equal(e.parceiro.situacao, "nenhuma");
  assert.equal(e.parceiro.organizada, false);
  assert.equal(e.parceiro.revogacaoPendente, null);
  assert.equal(e.parceiro.tipo, null);
  assert.equal(e.cliente?.situacao, "nenhuma");
  assert.equal(t.estadoDoRetorno(null, false).cliente, null);
});

test("ligado: organizada e revogacao_pendente (só admin recebe)", () => {
  const admin = t.estadoDoRetorno({ ativo: true, parceiro: { estado: "feito", tipo: "compartilhar", url: "https://drive.google.com/x", organizada: true, revogacao_pendente: true }, cliente: null }, false);
  assert.equal(admin.parceiro.organizada, true);
  assert.equal(admin.parceiro.revogacaoPendente, true);
  assert.equal(admin.parceiro.tipo, "compartilhar");
  assert.equal(admin.parceiro.situacao, "pronta");
  const parceiro = t.estadoDoRetorno({ ativo: true, parceiro: { organizada: false, url: null } }, false);
  assert.equal(parceiro.parceiro.organizada, false);
  assert.equal(parceiro.parceiro.revogacaoPendente, null);
  assert.equal(t.estadoDoRetorno({ ativo: true, parceiro: { organizada: "true" } }, false).parceiro.organizada, false);
});
