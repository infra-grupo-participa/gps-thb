// Edge Function drive-minutas: blindagem das pastas de minutas dos alunos.
// Mesma autenticação da drive-provisionar (só o header x-drive-segredo, env
// DRIVE_SEGREDO; deploy com --no-verify-jwt: quem chama é o admin via pg_net).
// Toda a lógica está em ./minutas.ts.

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore TS5097 — import com extensão .ts é o padrão do Deno
import { atender } from "./minutas.ts";

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
