// Web Push dos chamados do GPS. `index.ts` só liga isto ao Deno.serve; o teste
// (`enviar.test.ts`) chama `atender()` com fetch e env falsos.
//
// Contrato com o banco (SÓ service_role):
//   gps.push_preparar(p_mensagem_id)       → jsonb | null
//     { titulo, corpo, url, chamado_id, inscricoes: [{endpoint, p256dh, auth}] }
//   gps.push_resultado(p_endpoint, p_status) — status HTTP do push service;
//     0 = timeout / erro de rede / endpoint recusado aqui.
//
// Cifragem: RFC 8291 (aes128gcm, RFC 8188, um registro só). Assinatura: VAPID
// RFC 8292 (JWT ES256). Tudo com WebCrypto, sem import remoto: roda offline no
// `deno test` e passa no tsc do Next (o tsconfig da raiz inclui **/*.ts).
//
// 🔴 Nunca logar endpoint, chave da inscrição nem payload: só contagens.

export const SCHEMA = "gps";
export const HEADER_SEGREDO = "x-push-segredo";
export const RPC_PREPARAR = "push_preparar";
export const RPC_RESULTADO = "push_resultado";
export const SEGREDO_MINIMO = 32;
export const TIMEOUT_ENVIO_MS = 5000;
export const TTL_SEGUNDOS = 3600;
/** Tamanho do registro (RFC 8188). Um registro só: texto ≤ RS − 16 (tag) − 1 (delimitador). */
export const RS = 4096;
export const LIMITE_TEXTO = RS - 16 - 1;
/** Validade do JWT VAPID (RFC 8292: no máximo 24 h). */
const VALIDADE_JWT_SEG = 12 * 3600;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Inscricao = { endpoint: string; p256dh: string; auth: string };
export type Preparado = {
  titulo: string;
  corpo: string;
  url: string;
  chamado_id: string;
  inscricoes: Inscricao[];
};

export type Deps = {
  env: (chave: string) => string | undefined;
  fetch: typeof fetch;
  /** Relógio em ms (teste fixa). */
  agora?: () => number;
};

// ------------------------------------------------------------- bytes

type Bytes = Uint8Array<ArrayBuffer>;
const enc = new TextEncoder();

function txt(s: string): Bytes {
  const b = enc.encode(s);
  const out = new Uint8Array(b.length);
  out.set(b);
  return out;
}

export function concat(...partes: (Uint8Array | number[])[]): Bytes {
  let n = 0;
  for (const p of partes) n += p.length;
  const out = new Uint8Array(n);
  let i = 0;
  for (const p of partes) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}

export function b64url(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function deB64url(s: string): Bytes {
  const t = s.trim().replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t + "=".repeat((4 - (t.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(chave: Bytes, dados: Bytes): Promise<Bytes> {
  const k = await crypto.subtle.importKey("raw", chave, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, dados));
}

/** JWK de chave privada P-256 a partir do `d` (32 bytes) e do ponto público não comprimido (65 bytes). */
function jwkPrivada(d: Uint8Array, publica: Uint8Array): JsonWebKey {
  if (d.length !== 32) throw new Error("chave privada P-256 deve ter 32 bytes");
  if (publica.length !== 65 || publica[0] !== 4) throw new Error("chave pública P-256 deve ter 65 bytes (0x04…)");
  return {
    kty: "EC",
    crv: "P-256",
    d: b64url(d),
    x: b64url(publica.slice(1, 33)),
    y: b64url(publica.slice(33, 65)),
    ext: true,
  };
}

// ------------------------------------------------------- RFC 8291

/** Par efêmero do servidor (as_*). Injetável para o teste com o vetor do RFC. */
export type ChaveServidor = { privada: CryptoKey; publica: Bytes };

export async function chaveServidorDe(d: Uint8Array, publica: Uint8Array): Promise<ChaveServidor> {
  const privada = await crypto.subtle.importKey(
    "jwk",
    jwkPrivada(d, publica),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
  return { privada, publica: concat(publica) };
}

async function chaveEfemera(): Promise<ChaveServidor> {
  const par = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const publica = new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey));
  return { privada: par.privateKey, publica };
}

/**
 * Cifra `texto` para a inscrição (p256dh = ua_public 65 bytes, auth = 16 bytes).
 * Saída: salt(16) ‖ rs(4) ‖ idlen(1)=65 ‖ as_public(65) ‖ AES-GCM(texto ‖ 0x02).
 */
export async function cifrar(
  texto: Uint8Array,
  p256dh: Uint8Array,
  auth: Uint8Array,
  opc: { salt?: Uint8Array; servidor?: ChaveServidor } = {},
): Promise<Bytes> {
  if (p256dh.length !== 65 || p256dh[0] !== 4) throw new Error("p256dh inválido");
  if (auth.length !== 16) throw new Error("auth inválido");
  if (texto.length > LIMITE_TEXTO) throw new Error("payload acima de um registro");
  const servidor = opc.servidor ?? (await chaveEfemera());
  const salt = concat(opc.salt ?? crypto.getRandomValues(new Uint8Array(16)));
  if (salt.length !== 16) throw new Error("salt deve ter 16 bytes");
  const uaPub = concat(p256dh);

  const chaveUa = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: chaveUa }, servidor.privada, 256),
  );
  // HKDF-SHA256 com um bloco só (saídas ≤ 32 bytes): Extract = HMAC(salt, ikm); Expand = HMAC(prk, info ‖ 0x01).
  const prkChave = await hmac(concat(auth), ecdh);
  const ikm = await hmac(prkChave, concat(txt("WebPush: info\0"), uaPub, servidor.publica, [1]));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(txt("Content-Encoding: aes128gcm\0"), [1]))).slice(0, 16);
  const nonce = (await hmac(prk, concat(txt("Content-Encoding: nonce\0"), [1]))).slice(0, 12);

  const chaveAes = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const cifrado = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, chaveAes, concat(texto, [2])),
  );

  const cab = new Uint8Array(21);
  cab.set(salt, 0);
  new DataView(cab.buffer).setUint32(16, RS);
  cab[20] = servidor.publica.length;
  return concat(cab, servidor.publica, cifrado);
}

// ------------------------------------------------------- RFC 8292

export type Vapid = { publica: Bytes; publicaB64: string; assinar: CryptoKey; subject: string };

export async function carregarVapid(publicaB64: string, privadaB64: string, subject: string): Promise<Vapid> {
  if (!/^mailto:[^@\s]+@[^@\s]+$/.test(subject) && !/^https:\/\//.test(subject)) {
    throw new Error("VAPID_SUBJECT deve ser mailto: ou https:");
  }
  const publica = deB64url(publicaB64);
  const assinar = await crypto.subtle.importKey(
    "jwk",
    jwkPrivada(deB64url(privadaB64), publica),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  return { publica, publicaB64: b64url(publica), assinar, subject };
}

/** JWT ES256 (assinatura r‖s de 64 bytes, que é o formato do WebCrypto). */
export async function jwtVapid(v: Vapid, endpoint: string, agoraMs: number): Promise<string> {
  const cab = b64url(txt(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const corpo = b64url(
    txt(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(agoraMs / 1000) + VALIDADE_JWT_SEG,
        sub: v.subject,
      }),
    ),
  );
  const assinatura = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, v.assinar, txt(`${cab}.${corpo}`)),
  );
  return `${cab}.${corpo}.${b64url(assinatura)}`;
}

// ------------------------------------------------------------- envio

/** Payload do service worker. Corta o corpo até caber num registro. */
export function montarPayload(p: Preparado): Bytes {
  const base = {
    titulo: String(p.titulo ?? ""),
    corpo: String(p.corpo ?? ""),
    url: String(p.url ?? ""),
    tag: `chamado-${p.chamado_id}`,
  };
  let b = txt(JSON.stringify(base));
  while (b.length > LIMITE_TEXTO && base.corpo.length > 0) {
    base.corpo = Array.from(base.corpo).slice(0, -Math.max(1, Math.ceil((b.length - LIMITE_TEXTO) / 3))).join("") + "…";
    if (base.corpo === "…") base.corpo = "";
    b = txt(JSON.stringify(base));
  }
  if (b.length > LIMITE_TEXTO) throw new Error("payload acima de um registro");
  return b;
}

/** Hosts dos push services dos navegadores. Fora disto a edge não chama (SSRF). */
export const HOSTS_PUSH = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"];
export const SUFIXO_WINDOWS = ".notify.windows.com";

/** https, porta padrão, sem credenciais, host na allowlist. */
export function endpointPermitido(endpoint: string): boolean {
  let u: URL;
  try {
    u = new URL(endpoint);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.port !== "" || u.username !== "" || u.password !== "") return false;
  const h = u.hostname.toLowerCase();
  return HOSTS_PUSH.includes(h) || (h.endsWith(SUFIXO_WINDOWS) && h.length > SUFIXO_WINDOWS.length);
}

/** Status HTTP do push service; 0 = timeout, rede ou endpoint recusado. Nunca rejeita. */
export async function enviarUm(
  deps: Deps,
  v: Vapid,
  insc: Inscricao,
  texto: Uint8Array,
  jwtPorOrigem: Map<string, Promise<string>>,
): Promise<number> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_ENVIO_MS);
  try {
    if (!endpointPermitido(insc.endpoint)) return 0;
    const u = new URL(insc.endpoint);
    let jwt = jwtPorOrigem.get(u.origin);
    if (!jwt) {
      jwt = jwtVapid(v, insc.endpoint, (deps.agora ?? Date.now)());
      jwtPorOrigem.set(u.origin, jwt);
    }
    const corpo = await cifrar(texto, deB64url(insc.p256dh), deB64url(insc.auth));
    const res = await deps.fetch(insc.endpoint, {
      method: "POST",
      headers: {
        Authorization: `vapid t=${await jwt}, k=${v.publicaB64}`,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(TTL_SEGUNDOS),
        Urgency: "high",
      },
      body: corpo,
      signal: ctrl.signal,
      // Redirect nunca é seguido (SSRF): 3xx vira status real, que conta como falha.
      redirect: "manual",
    });
    try {
      await res.body?.cancel();
    } catch {
      // corpo já consumido/fechado
    }
    return res.status;
  } catch {
    return 0;
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------- banco

export type Rpc = <T>(nome: string, args: Record<string, unknown>) => Promise<T>;

export function rest(deps: Deps): Rpc {
  const url = (deps.env("SUPABASE_URL") ?? "").replace(/\/+$/, "");
  const chave = deps.env("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !chave) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausente");
  return async function rpc<T>(nome: string, args: Record<string, unknown>): Promise<T> {
    const res = await deps.fetch(`${url}/rest/v1/rpc/${nome}`, {
      method: "POST",
      headers: {
        apikey: chave,
        Authorization: `Bearer ${chave}`,
        "Content-Type": "application/json",
        "Content-Profile": SCHEMA,
        "Accept-Profile": SCHEMA,
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      let codigo = "";
      try {
        codigo = String((await res.json())?.code ?? "");
      } catch {
        // corpo não-JSON
      }
      throw new Error(`rpc ${nome}: ${res.status} ${codigo}`.trim());
    }
    const t = await res.text();
    return (t ? JSON.parse(t) : null) as T;
  };
}

// -------------------------------------------------------------- entrada

export async function segredoConfere(recebido: string, esperado: string): Promise<boolean> {
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", txt(recebido)),
    crypto.subtle.digest("SHA-256", txt(esperado)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let dif = 0;
  for (let i = 0; i < x.length; i++) dif |= x[i] ^ y[i];
  return dif === 0;
}

function json(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function atender(req: Request, deps: Deps): Promise<Response> {
  // Chamado só pelo banco (pg_net): POST, sem CORS, sem JWT de usuário.
  if (req.method !== "POST") return json(405, { erro: "método não permitido" });

  const esperado = deps.env("PUSH_SEGREDO") ?? "";
  if (esperado.length < SEGREDO_MINIMO) return json(503, { erro: "não configurado" });
  const recebido = req.headers.get(HEADER_SEGREDO) ?? "";
  if (!(await segredoConfere(recebido, esperado))) return json(401, { erro: "não autorizado" });

  let mensagemId = "";
  try {
    const c = await req.json();
    mensagemId = typeof c?.mensagem_id === "string" ? c.mensagem_id : "";
  } catch {
    // corpo não-JSON
  }
  if (!UUID.test(mensagemId)) return json(400, { erro: "mensagem_id inválido" });

  let vapid: Vapid;
  try {
    vapid = await carregarVapid(
      deps.env("VAPID_PUBLICA") ?? "",
      deps.env("VAPID_PRIVADA") ?? "",
      deps.env("VAPID_SUBJECT") ?? "",
    );
  } catch {
    console.error("push-enviar: VAPID ausente ou inválida");
    return json(503, { erro: "não configurado" });
  }

  try {
    const rpc = rest(deps);
    const p = await rpc<Preparado | null>(RPC_PREPARAR, { p_mensagem_id: mensagemId });
    if (!p) return new Response(null, { status: 204 });

    const inscricoes = Array.isArray(p.inscricoes) ? p.inscricoes : [];
    const texto = montarPayload(p);
    const jwts = new Map<string, Promise<string>>();

    const envios = await Promise.allSettled(inscricoes.map((i) => enviarUm(deps, vapid, i, texto, jwts)));
    const status = envios.map((r) => (r.status === "fulfilled" ? r.value : 0));

    const registros = await Promise.allSettled(
      inscricoes.map((i, k) => rpc(RPC_RESULTADO, { p_endpoint: i.endpoint, p_status: status[k] })),
    );
    const enviados = status.filter((s) => s >= 200 && s < 300).length;
    const falhas = status.length - enviados;
    const semRegistro = registros.filter((r) => r.status === "rejected").length;
    console.log(`push-enviar: inscricoes=${status.length} enviados=${enviados} falhas=${falhas} resultado_nao_gravado=${semRegistro}`);
    return json(200, { enviados, falhas });
  } catch (e) {
    // Mensagens daqui são nossas (nome da RPC + status); nunca endpoint nem payload.
    console.error("push-enviar:", e instanceof Error ? e.message : "erro");
    return json(500, { erro: "falha interna" });
  }
}
