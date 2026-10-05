// Edge Function drive-atividade: feed de mudanças do Google Drive (changes.list)
// aplicado no banco por página. Mesma autenticação da drive-provisionar: só o
// header x-drive-segredo (env DRIVE_SEGREDO). Deploy com --no-verify-jwt: quem
// chama é o cron/pg_net. Toda a lógica está em ./atividade.ts.

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore TS5097 — import com extensão .ts é o padrão do Deno
import { atender } from "./atividade.ts";

type DenoMin = {
  env: { get(k: string): string | undefined };
  serve(h: (req: Request) => Response | Promise<Response>): unknown;
};
type EdgeRuntimeMin = { waitUntil(p: Promise<unknown>): void };

const G = globalThis as unknown as { Deno: DenoMin; EdgeRuntime?: EdgeRuntimeMin };
const D = G.Deno;

D.serve((req) =>
  atender(req, {
    env: (k) => D.env.get(k),
    fetch: (...a) => fetch(...a),
    emSegundoPlano: G.EdgeRuntime ? (p) => G.EdgeRuntime?.waitUntil(p) : undefined,
  }),
);
