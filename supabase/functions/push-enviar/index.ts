// Edge Function push-enviar: Web Push de uma mensagem de chamado para as
// inscrições que `gps.push_preparar` devolver.
//
// DEPLOY: `supabase functions deploy push-enviar --no-verify-jwt`.
// Quem chama é o banco (pg_net), nunca o navegador: sem JWT de usuário. A
// autenticação é só o header x-push-segredo (env PUSH_SEGREDO, ≥ 32 chars),
// comparado em tempo constante. Envs: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// PUSH_SEGREDO, VAPID_PUBLICA, VAPID_PRIVADA (base64url, P-256), VAPID_SUBJECT
// (mailto:). Toda a lógica está em ./enviar.ts.
//
// A global `Deno` é lida por cast para o arquivo passar também no `tsc` do
// Next (o tsconfig da raiz inclui `**/*.ts`).

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore TS5097 — import com extensão .ts é o padrão do Deno
import { atender } from "./enviar.ts";

type DenoMin = {
  env: { get(k: string): string | undefined };
  serve(h: (req: Request) => Response | Promise<Response>): unknown;
};

const D = (globalThis as unknown as { Deno: DenoMin }).Deno;

D.serve((req) =>
  atender(req, {
    env: (k) => D.env.get(k),
    fetch: (...a) => fetch(...a),
  }),
);
