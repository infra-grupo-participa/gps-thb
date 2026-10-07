// Passe de acesso único GPS → Gerador de Minutas (migração …358).
// `index.ts` só liga isto ao Deno.serve; o teste (`assinar.test.ts`) chama
// `atender()` com fetch e env falsos.
//
// Contrato com o banco (JWT do PRÓPRIO usuário, nunca service_role):
//   gps.gerador_sso_dados() → { sub, email, nome, desde }   (42501 = não pode)
//
// Token: JWT ES256 (ECDSA P-256 + SHA-256), 60 s, assinado com a chave
// PRIVADA do env GERADOR_SSO_PRIVADA (PKCS8 DER em base64 padrão). O gerador
// confere com a chave pública fixa no código dele. WebCrypto devolve a
// assinatura ECDSA já em r||s (64 bytes) — o formato que o JWS exige.
// Sem import remoto: roda offline no `deno test` e passa no tsc do Next.
//
// 🔴 Nunca logar token, e-mail, nome nem o JWT do usuário.

export const SCHEMA = "gps";
export const RPC_DADOS = "gerador_sso_dados";
export const VALIDADE_SEG = 60;
export const ISS = "gps";
export const AUD = "gmthb";
const TIMEOUT_RPC_MS = 8000;

export type Dados = { sub: string; email: string; nome: string | null; desde: number };

export type Deps = {
  env: (k: string) => string | undefined;
  fetch: typeof fetch;
  /** Segundos desde a época (injetável no teste). */
  agora?: () => number;
};

const ENC = new TextEncoder();

export function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deB64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64.replace(/\s+/g, ""));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let cache: { b64: string; chave: CryptoKey } | null = null;

/** PKCS8 DER (base64 padrão) → CryptoKey ECDSA P-256 só para assinar. */
export async function importarPrivada(b64: string): Promise<CryptoKey> {
  if (cache && cache.b64 === b64) return cache.chave;
  const chave = await crypto.subtle.importKey(
    "pkcs8",
    deB64(b64),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  cache = { b64, chave };
  return chave;
}

/** Monta e assina o JWT ES256. */
export async function assinarEs256(
  payload: Record<string, unknown>,
  chave: CryptoKey,
): Promise<string> {
  const header = b64url(ENC.encode(JSON.stringify({ alg: "ES256", typ: "JWT" })));
  const corpo = b64url(ENC.encode(JSON.stringify(payload)));
  const entrada = `${header}.${corpo}`;
  const ass = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, chave, ENC.encode(entrada)),
  );
  return `${entrada}.${b64url(ass)}`;
}

function json(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function dadosValidos(d: unknown): d is Dados {
  if (!d || typeof d !== "object") return false;
  const x = d as Record<string, unknown>;
  return (
    typeof x.sub === "string" && x.sub !== "" &&
    typeof x.email === "string" && x.email !== "" &&
    (x.nome === null || x.nome === undefined || typeof x.nome === "string") &&
    typeof x.desde === "number" && Number.isFinite(x.desde)
  );
}

export async function atender(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== "POST") return json(405, { erro: "Método não permitido." });

  const url = deps.env("SUPABASE_URL");
  const anon = deps.env("SUPABASE_ANON_KEY");
  const privada = deps.env("GERADOR_SSO_PRIVADA");
  if (!url || !anon || !privada) {
    console.error("gerador-sso: env ausente");
    return json(503, { erro: "Gerador indisponível." });
  }

  const auth = req.headers.get("Authorization") ?? "";
  if (!/^Bearer \S+$/.test(auth)) return json(401, { erro: "Sem permissão." });

  let chave: CryptoKey;
  try {
    chave = await importarPrivada(privada);
  } catch {
    console.error("gerador-sso: GERADOR_SSO_PRIVADA inválida");
    return json(503, { erro: "Gerador indisponível." });
  }

  let res: Response;
  try {
    res = await deps.fetch(`${url}/rest/v1/rpc/${RPC_DADOS}`, {
      method: "POST",
      headers: {
        apikey: anon,
        Authorization: auth,
        "Content-Type": "application/json",
        "Content-Profile": SCHEMA,
        "Accept-Profile": SCHEMA,
      },
      body: "{}",
      signal: AbortSignal.timeout(TIMEOUT_RPC_MS),
    });
  } catch {
    console.error("gerador-sso: rpc sem resposta");
    return json(502, { erro: "Gerador indisponível." });
  }

  const corpo: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const e = (corpo ?? {}) as { code?: string; message?: string };
    if (e.code === "42501") {
      return json(403, { erro: typeof e.message === "string" ? e.message : "Sem permissão." });
    }
    if (e.code === "P0001") return json(503, { erro: "Gerador indisponível." });
    console.error(`gerador-sso: rpc ${res.status} ${e.code ?? ""}`);
    return json(502, { erro: "Gerador indisponível." });
  }
  if (!dadosValidos(corpo)) {
    console.error("gerador-sso: rpc fora do contrato");
    return json(502, { erro: "Gerador indisponível." });
  }

  const iat = Math.floor((deps.agora ?? (() => Date.now() / 1000))());
  const token = await assinarEs256(
    {
      iss: ISS,
      aud: AUD,
      sub: corpo.sub,
      email: corpo.email,
      nome: corpo.nome ?? null,
      desde: corpo.desde,
      iat,
      exp: iat + VALIDADE_SEG,
      jti: crypto.randomUUID(),
    },
    chave,
  );
  return json(200, { token });
}
