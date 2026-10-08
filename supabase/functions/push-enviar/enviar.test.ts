// deno test supabase/functions/push-enviar/
// Sem rede: PostgREST e push service são o fetch falso abaixo.
// Sem import remoto (roda offline e passa no tsc do Next).

import {
  atender,
  b64url,
  carregarVapid,
  chaveServidorDe,
  cifrar,
  type Deps,
  deB64url,
  endpointPermitido,
  jwtVapid,
  lerPedido,
  montarPayload,
  type Preparado,
  type PreparadoAviso,
  RS,
  tagDe,
  urlInterna,
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore TS5097 — import com extensão .ts é o padrão do Deno
} from "./enviar.ts";

type DenoTest = { test(nome: string, fn: () => void | Promise<void>): void };
const D = (globalThis as unknown as { Deno: DenoTest }).Deno;

function ok(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}
function igual<T>(a: T, b: T, msg = ""): void {
  const x = JSON.stringify(a);
  const y = JSON.stringify(b);
  if (x !== y) throw new Error(`${msg}\n  obtido:   ${x}\n  esperado: ${y}`);
}

const SEGREDO = "s".repeat(40);
const SB = "https://projeto.supabase.co";
const MENSAGEM = "0f8e2a7c-1b3d-4e5f-9a6b-7c8d9e0f1a2b";

// ---------------------------------------------------------------- mundo falso

type Chamada = { url: string; init?: RequestInit };

async function inscricaoFalsa(endpoint: string) {
  const par = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const p256dh = new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { endpoint, p256dh: b64url(p256dh), auth: b64url(auth) };
}

async function chavesVapid() {
  const par = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey));
  const jwk = await crypto.subtle.exportKey("jwk", par.privateKey);
  return { publica: b64url(pub), privada: String(jwk.d), verificar: par.publicKey };
}

async function montar(opc: {
  preparado: Preparado | PreparadoAviso | null;
  statusPush?: (endpoint: string) => number | "rede";
}) {
  const v = await chavesVapid();
  const chamadas: Chamada[] = [];
  const resultados: { p_endpoint: string; p_status: number }[] = [];
  const env: Record<string, string> = {
    SUPABASE_URL: SB,
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    PUSH_SEGREDO: SEGREDO,
    VAPID_PUBLICA: v.publica,
    VAPID_PRIVADA: v.privada,
    VAPID_SUBJECT: "mailto:equipe@exemplo.com",
  };
  const fetchFalso = (async (entrada: string | URL | Request, init?: RequestInit) => {
    await Promise.resolve(); // assíncrono como o fetch real
    const url = String(entrada);
    chamadas.push({ url, init });
    if (url === `${SB}/rest/v1/rpc/push_preparar` || url === `${SB}/rest/v1/rpc/push_preparar_aviso`) {
      return new Response(opc.preparado === null ? "null" : JSON.stringify(opc.preparado), { status: 200 });
    }
    if (url === `${SB}/rest/v1/rpc/push_resultado`) {
      resultados.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 204 });
    }
    const s = opc.statusPush ? opc.statusPush(url) : 201;
    if (s === "rede") throw new TypeError("falha de rede");
    return new Response("", { status: s });
  }) as typeof fetch;
  const deps: Deps = { env: (k) => env[k], fetch: fetchFalso, agora: () => 1_700_000_000_000 };
  return { deps, chamadas, resultados, vapid: v };
}

function pedido(corpo: unknown, segredo: string | null = SEGREDO): Request {
  const h = new Headers({ "Content-Type": "application/json" });
  if (segredo !== null) h.set("x-push-segredo", segredo);
  return new Request("https://edge/push-enviar", {
    method: "POST",
    headers: h,
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
}

// ---------------------------------------------------------------- entrada

D.test("segredo errado → 401, sem tocar no banco", async () => {
  const m = await montar({ preparado: null });
  const r = await atender(pedido({ mensagem_id: MENSAGEM }, "x".repeat(40)), m.deps);
  igual(r.status, 401);
  igual(m.chamadas.length, 0, "nenhum fetch");
});

D.test("segredo ausente → 401", async () => {
  const m = await montar({ preparado: null });
  const r = await atender(pedido({ mensagem_id: MENSAGEM }, null), m.deps);
  igual(r.status, 401);
  igual(m.chamadas.length, 0);
});

D.test("uuid inválido → 400 (string, ausente, JSON quebrado)", async () => {
  const m = await montar({ preparado: null });
  for (const corpo of [{ mensagem_id: "abc" }, {}, { mensagem_id: 42 }, "{nao json", { mensagem_id: `${MENSAGEM}x` }]) {
    const r = await atender(pedido(corpo), m.deps);
    igual(r.status, 400, `corpo ${JSON.stringify(corpo)}`);
  }
  igual(m.chamadas.length, 0);
});

D.test("preparar devolve null → 204", async () => {
  const m = await montar({ preparado: null });
  const r = await atender(pedido({ mensagem_id: MENSAGEM }), m.deps);
  igual(r.status, 204);
  igual(m.chamadas.length, 1);
  igual(JSON.parse(String(m.chamadas[0].init?.body)), { p_mensagem_id: MENSAGEM });
  const h = new Headers(m.chamadas[0].init?.headers);
  igual(h.get("Content-Profile"), "gps");
  igual(h.get("Authorization"), "Bearer service-role");
});

D.test("410, 201 e falha de rede → push_resultado com 410, 201 e 0; contagem certa", async () => {
  const inscricoes = [
    await inscricaoFalsa("https://fcm.googleapis.com/fcm/send/aaa"),
    await inscricaoFalsa("https://updates.push.services.mozilla.com/wpush/v2/bbb"),
    await inscricaoFalsa("https://fcm.googleapis.com/fcm/send/ccc"),
  ];
  const m = await montar({
    preparado: { titulo: "Chamado", corpo: "Nova resposta", url: "/chamados/1", chamado_id: "c1", inscricoes },
    statusPush: (u) => (u.endsWith("aaa") ? 410 : u.endsWith("ccc") ? "rede" : 201),
  });
  const r = await atender(pedido({ mensagem_id: MENSAGEM }), m.deps);
  igual(r.status, 200);
  igual(await r.json(), { enviados: 1, falhas: 2 });
  const porEndpoint = Object.fromEntries(m.resultados.map((x) => [x.p_endpoint, x.p_status]));
  igual(porEndpoint[inscricoes[0].endpoint], 410, "410 repassado");
  igual(porEndpoint[inscricoes[1].endpoint], 201);
  igual(porEndpoint[inscricoes[2].endpoint], 0, "rede = 0");

  const envio = m.chamadas.find((c) => c.url === inscricoes[1].endpoint)!;
  const h = new Headers(envio.init?.headers);
  igual(h.get("Content-Encoding"), "aes128gcm");
  igual(h.get("TTL"), "3600");
  igual(h.get("Urgency"), "high");
  ok(h.get("Authorization")?.startsWith("vapid t="), "Authorization vapid");
  ok(h.get("Authorization")?.endsWith(`, k=${m.vapid.publica}`), "k = chave pública");
  ok(envio.init?.signal instanceof AbortSignal, "envio com AbortSignal (timeout)");
});

D.test("endpoint http (não https) não é chamado e vira 0", async () => {
  const insc = await inscricaoFalsa("http://interno.local/push");
  const m = await montar({
    preparado: { titulo: "t", corpo: "c", url: "/", chamado_id: "c1", inscricoes: [insc] },
  });
  const r = await atender(pedido({ mensagem_id: MENSAGEM }), m.deps);
  igual(await r.json(), { enviados: 0, falhas: 1 });
  ok(!m.chamadas.some((c) => c.url === insc.endpoint), "não chamou o http");
  igual(m.resultados[0].p_status, 0);
});

D.test("VAPID ausente → 503 sem chamar preparar", async () => {
  const m = await montar({ preparado: null });
  const env = m.deps.env;
  const r = await atender(pedido({ mensagem_id: MENSAGEM }), {
    ...m.deps,
    env: (k) => (k === "VAPID_PRIVADA" ? undefined : env(k)),
  });
  igual(r.status, 503);
  igual(m.chamadas.length, 0);
});

// ---------------------------------------------------------------- cifragem

// RFC 8291, Apêndice A (vetor oficial).
const RFC = {
  texto: "When I grow up, I want to be a watermelon",
  asPrivada: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  asPublica: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  uaPublica: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  saida:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

D.test("cifrar reproduz o vetor do RFC 8291 byte a byte", async () => {
  const servidor = await chaveServidorDe(deB64url(RFC.asPrivada), deB64url(RFC.asPublica));
  const saida = await cifrar(new TextEncoder().encode(RFC.texto), deB64url(RFC.uaPublica), deB64url(RFC.auth), {
    salt: deB64url(RFC.salt),
    servidor,
  });
  igual(b64url(saida), RFC.saida);
});

D.test("cabeçalho aes128gcm: salt(16) ‖ rs=4096 ‖ idlen=65 ‖ chave efêmera; tamanho = 86 + texto + 1 + 16", async () => {
  const insc = await inscricaoFalsa("https://x");
  const texto = new TextEncoder().encode('{"titulo":"a"}');
  const saida = await cifrar(texto, deB64url(insc.p256dh), deB64url(insc.auth));
  igual(new DataView(saida.buffer).getUint32(16), RS, "rs");
  igual(saida[20], 65, "idlen");
  igual(saida[21], 4, "chave pública não comprimida");
  igual(saida.length, 86 + texto.length + 1 + 16, "tamanho");
});

D.test("JWT VAPID: ES256 verificável, aud = origem do endpoint, exp ≤ 24 h", async () => {
  const v = await chavesVapid();
  const vapid = await carregarVapid(v.publica, v.privada, "mailto:equipe@exemplo.com");
  const agora = 1_700_000_000_000;
  const jwt = await jwtVapid(vapid, "https://fcm.googleapis.com/fcm/send/abc?x=1", agora);
  const [c, p, s] = jwt.split(".");
  igual(JSON.parse(new TextDecoder().decode(deB64url(c))), { typ: "JWT", alg: "ES256" });
  const claims = JSON.parse(new TextDecoder().decode(deB64url(p)));
  igual(claims.aud, "https://fcm.googleapis.com");
  igual(claims.sub, "mailto:equipe@exemplo.com");
  ok(claims.exp > agora / 1000 && claims.exp <= agora / 1000 + 86400, "exp");
  const valida = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    v.verificar,
    deB64url(s),
    new TextEncoder().encode(`${c}.${p}`),
  );
  ok(valida, "assinatura ES256 confere com a chave pública");
});

// ---------------------------------------------------------------- SSRF

D.test("host fora da allowlist (ou porta, credencial, sufixo falso) não faz fetch e vira 0", async () => {
  const proibidos = [
    "https://interno.local/push",
    "https://169.254.169.254/latest",
    "https://fcm.googleapis.com:8443/fcm/send/a",
    "https://u:p@fcm.googleapis.com/fcm/send/a",
    "https://fcm.googleapis.com.evil.com/a",
    "https://evilnotify.windows.com/a",
    "https://.notify.windows.com/a",
  ];
  const inscricoes = await Promise.all(proibidos.map(inscricaoFalsa));
  const m = await montar({ preparado: { titulo: "t", corpo: "c", url: "/", chamado_id: "c1", inscricoes } });
  const r = await atender(pedido({ mensagem_id: MENSAGEM }), m.deps);
  igual(await r.json(), { enviados: 0, falhas: proibidos.length });
  const fora = m.chamadas.filter((c) => !c.url.startsWith(SB));
  igual(fora.length, 0, "nenhum fetch fora do PostgREST");
  igual(m.resultados.map((x) => x.p_status), proibidos.map(() => 0));
  ok(endpointPermitido("https://wns2-bl2p.notify.windows.com/w/?token=x"), "WNS aceito");
  ok(endpointPermitido("https://web.push.apple.com/abc"), "Apple aceito");
});

D.test("302 não é seguido: redirect manual e status 302 registrado como falha", async () => {
  const insc = await inscricaoFalsa("https://web.push.apple.com/abc");
  const m = await montar({
    preparado: { titulo: "t", corpo: "c", url: "/", chamado_id: "c1", inscricoes: [insc] },
    statusPush: () => 302,
  });
  const r = await atender(pedido({ mensagem_id: MENSAGEM }), m.deps);
  igual(await r.json(), { enviados: 0, falhas: 1 });
  const envios = m.chamadas.filter((c) => !c.url.startsWith(SB));
  igual(envios.length, 1, "uma chamada só, nenhuma ao destino do redirect");
  igual(envios[0].init?.redirect, "manual");
  igual(m.resultados[0].p_status, 302);
});

// ---------------------------------------------------------------- avisos (…379)

const AVISO: PreparadoAviso = {
  aviso_id: 42,
  tipo: "minuta_anexada",
  entidade_id: "3c4d5e6f-0a1b-4c2d-8e3f-9a0b1c2d3e4f",
  titulo: "Minuta nova",
  corpo: "Nova minuta para revisão. Abra o GPS.",
  url: "/admin/aluno/1/clientes/2",
  inscricoes: [],
};

D.test("aviso_id → chama push_preparar_aviso com p_aviso_id (e não push_preparar)", async () => {
  const insc = await inscricaoFalsa("https://fcm.googleapis.com/fcm/send/zzz");
  const m = await montar({ preparado: { ...AVISO, inscricoes: [insc] } });
  const r = await atender(pedido({ aviso_id: 42 }), m.deps);
  igual(r.status, 200);
  igual(await r.json(), { enviados: 1, falhas: 0 });
  igual(m.chamadas[0].url, `${SB}/rest/v1/rpc/push_preparar_aviso`);
  igual(JSON.parse(String(m.chamadas[0].init?.body)), { p_aviso_id: 42 });
  ok(!m.chamadas.some((c) => c.url === `${SB}/rest/v1/rpc/push_preparar`), "não chamou o legado");
  igual(m.resultados, [{ p_endpoint: insc.endpoint, p_status: 201 }]);
});

D.test("aviso_id: preparar null → 204", async () => {
  const m = await montar({ preparado: null });
  const r = await atender(pedido({ aviso_id: 7 }), m.deps);
  igual(r.status, 204);
  igual(m.chamadas.length, 1);
});

D.test("aviso_id inválido, ambíguo ou corpo não-objeto → 400 sem tocar no banco", async () => {
  const m = await montar({ preparado: null });
  const ruins: unknown[] = [
    { aviso_id: 0 },
    { aviso_id: -1 },
    { aviso_id: 1.5 },
    { aviso_id: "42" },
    { aviso_id: null },
    { aviso_id: Number.MAX_SAFE_INTEGER + 2 },
    { aviso_id: 1, mensagem_id: MENSAGEM },
    [1],
    "null",
    "42",
  ];
  for (const corpo of ruins) {
    const r = await atender(pedido(corpo), m.deps);
    igual(r.status, 400, `corpo ${JSON.stringify(corpo)}`);
  }
  igual(m.chamadas.length, 0);
});

D.test("lerPedido mantém o legado mensagem_id", async () => {
  const p = await lerPedido(pedido({ mensagem_id: MENSAGEM }));
  igual(p, { mensagemId: MENSAGEM });
});

D.test("tag: aviso-<tipo>-<entidade>; sem entidade usa o id; chamado segue chamado-<id>", () => {
  igual(tagDe(AVISO), `aviso-minuta_anexada-${AVISO.entidade_id}`);
  igual(tagDe({ ...AVISO, entidade_id: null }), "aviso-minuta_anexada-n42");
  igual(tagDe({ ...AVISO, tipo: "Ru<i>m ", entidade_id: "a/b..c" }), "aviso-ruim-abc");
  igual(tagDe({ titulo: "t", corpo: "c", url: "/", chamado_id: "c1", inscricoes: [] }), "chamado-c1");
});

D.test("url do payload: só caminho dentro de /admin; resto vira /admin", () => {
  for (const ok_ of ["/admin", "/admin/chamados/abc-1", "/admin/aluno/1/clientes/2"]) igual(urlInterna(ok_), ok_);
  for (const ruim of [
    "//evil.com",
    "/admin//evil.com",
    "https://evil.com/admin",
    "/admin/../x",
    "/admin/a?x=1",
    "/admin\\evil",
    "javascript:alert(1)",
    "/adminx",
    "",
    null,
  ]) {
    igual(urlInterna(ruim), "/admin", `url ${String(ruim)}`);
  }
});

D.test("payload do aviso: título/corpo do catálogo, url e tag", () => {
  const b = montarPayload(AVISO);
  const j = JSON.parse(new TextDecoder().decode(b));
  igual(j, {
    titulo: "Minuta nova",
    corpo: "Nova minuta para revisão. Abra o GPS.",
    url: "/admin/aluno/1/clientes/2",
    tag: `aviso-minuta_anexada-${AVISO.entidade_id}`,
  });
});
