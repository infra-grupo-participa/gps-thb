// deno test supabase/functions/gerador-sso/
// Sem rede: o PostgREST é o fetch falso abaixo. Par de chaves gerado no teste.
// Sem import remoto (roda offline e passa no tsc do Next).

import {
  atender,
  b64url,
  type Deps,
  VALIDADE_SEG,
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore TS5097 — import com extensão .ts é o padrão do Deno
} from "./assinar.ts";

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

const SB = "https://projeto.supabase.co";
const ANON = "anon-key";
const JWT_USUARIO = "Bearer eyJ.usuario.jwt";
const DADOS = { sub: "0f8e2a7c-1b3d-4e5f-9a6b-7c8d9e0f1a2b", email: "fulana@x.com", nome: "Fulana Ção", desde: 1758000000 };

function deB64url(s: string): Uint8Array<ArrayBuffer> {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(b.length));
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}
function parte(token: string, i: number): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(deB64url(token.split(".")[i])));
}

async function par(): Promise<{ privadaB64: string; publica: CryptoKey }> {
  const p = (await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", p.privateKey));
  let s = "";
  for (const b of der) s += String.fromCharCode(b);
  return { privadaB64: btoa(s), publica: p.publicKey };
}

type Chamada = { url: string; init?: RequestInit };

function mundo(
  privadaB64: string | undefined,
  resposta: { status: number; corpo: unknown },
): { deps: Deps; chamadas: Chamada[] } {
  const chamadas: Chamada[] = [];
  const env: Record<string, string | undefined> = {
    SUPABASE_URL: SB,
    SUPABASE_ANON_KEY: ANON,
    GERADOR_SSO_PRIVADA: privadaB64,
  };
  const deps: Deps = {
    env: (k) => env[k],
    fetch: ((url: string, init?: RequestInit) => {
      chamadas.push({ url: String(url), init });
      return Promise.resolve(
        new Response(JSON.stringify(resposta.corpo), { status: resposta.status }),
      );
    }) as typeof fetch,
    agora: () => 1_800_000_000,
  };
  return { deps, chamadas };
}

const post = () =>
  new Request("https://edge/gerador-sso", { method: "POST", headers: { Authorization: JWT_USUARIO } });

D.test("assina ES256 e a assinatura confere com a chave pública", async () => {
  const { privadaB64, publica } = await par();
  const { deps, chamadas } = mundo(privadaB64, { status: 200, corpo: DADOS });
  const res = await atender(post(), deps);
  igual(res.status, 200, "status");
  igual(res.headers.get("Cache-Control"), "no-store", "cache");
  const { token } = (await res.json()) as { token: string };
  const [h, p, s] = token.split(".");
  ok(/^[A-Za-z0-9_-]+$/.test(h + p + s), "base64url sem padding");
  const assinatura = deB64url(s);
  igual(assinatura.length, 64, "r||s");
  const valido = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publica,
    assinatura,
    new TextEncoder().encode(`${h}.${p}`),
  );
  ok(valido, "assinatura inválida");

  // RPC chamada com o JWT do PRÓPRIO usuário, no schema gps.
  igual(chamadas.length, 1);
  igual(chamadas[0].url, `${SB}/rest/v1/rpc/gerador_sso_dados`);
  const hd = chamadas[0].init?.headers as Record<string, string>;
  igual(hd.Authorization, JWT_USUARIO, "Authorization repassado");
  igual(hd.apikey, ANON);
  igual(hd["Content-Profile"], "gps");
});

D.test("header alg ES256 e payload com exp - iat = 60", async () => {
  const { privadaB64 } = await par();
  const { deps } = mundo(privadaB64, { status: 200, corpo: DADOS });
  const { token } = (await (await atender(post(), deps)).json()) as { token: string };
  igual(parte(token, 0), { alg: "ES256", typ: "JWT" }, "header");
  const pl = parte(token, 1);
  igual(pl.iss, "gps");
  igual(pl.aud, "gmthb");
  igual(pl.sub, DADOS.sub);
  igual(pl.email, DADOS.email);
  igual(pl.nome, DADOS.nome);
  igual(pl.iat, 1_800_000_000);
  igual((pl.exp as number) - (pl.iat as number), VALIDADE_SEG);
  igual(VALIDADE_SEG, 60);
  ok(/^[0-9a-f-]{36}$/.test(String(pl.jti)), "jti uuid");
});

D.test("jti muda a cada token", async () => {
  const { privadaB64 } = await par();
  const { deps } = mundo(privadaB64, { status: 200, corpo: DADOS });
  const a = (await (await atender(post(), deps)).json()) as { token: string };
  const b = (await (await atender(post(), deps)).json()) as { token: string };
  ok(parte(a.token, 1).jti !== parte(b.token, 1).jti, "jti repetido");
});

D.test("sem GERADOR_SSO_PRIVADA → 503 e não chama o banco", async () => {
  const { deps, chamadas } = mundo(undefined, { status: 200, corpo: DADOS });
  const res = await atender(post(), deps);
  igual(res.status, 503);
  igual(chamadas.length, 0);
});

D.test("chave inválida → 503", async () => {
  const { deps } = mundo(btoa("lixo"), { status: 200, corpo: DADOS });
  igual((await atender(post(), deps)).status, 503);
});

D.test("42501 do banco → 403 com a frase", async () => {
  const { privadaB64 } = await par();
  const { deps } = mundo(privadaB64, {
    status: 403,
    corpo: { code: "42501", message: "Use o login do gerador." },
  });
  const res = await atender(post(), deps);
  igual(res.status, 403);
  igual(await res.json(), { erro: "Use o login do gerador." });
});

D.test("P0001 (desligado) → 503; outro erro → 502", async () => {
  const { privadaB64 } = await par();
  const a = mundo(privadaB64, { status: 400, corpo: { code: "P0001", message: "x" } });
  igual((await atender(post(), a.deps)).status, 503);
  const b = mundo(privadaB64, { status: 500, corpo: { code: "XX000" } });
  igual((await atender(post(), b.deps)).status, 502);
});

D.test("retorno fora do contrato → 502 sem token", async () => {
  const { privadaB64 } = await par();
  const { deps } = mundo(privadaB64, { status: 200, corpo: { sub: "", email: 1 } });
  igual((await atender(post(), deps)).status, 502);
});

D.test("GET → 405; sem Authorization → 401", async () => {
  const { privadaB64 } = await par();
  const { deps } = mundo(privadaB64, { status: 200, corpo: DADOS });
  igual((await atender(new Request("https://edge/x"), deps)).status, 405);
  igual(
    (await atender(new Request("https://edge/x", { method: "POST" }), deps)).status,
    401,
  );
});

D.test("b64url sem padding nem + /", () => {
  igual(b64url(new Uint8Array([251, 255, 254])), "-__-");
});
