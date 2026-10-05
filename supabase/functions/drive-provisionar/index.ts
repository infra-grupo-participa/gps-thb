// Edge Function drive-provisionar: processa a fila gps.drive_tarefas (pasta do
// parceiro e pasta do cliente no Google Drive da conta joao@advmais.com).
// Autenticação só pelo header x-drive-segredo (env DRIVE_SEGREDO = segredo
// `gps_drive_segredo` do Vault). Deploy com --no-verify-jwt: quem chama é o
// cron/pg_net, nunca o navegador. Toda a lógica está em ./provisionar.ts.
//
// A global `Deno`/`EdgeRuntime` é lida por cast para o arquivo passar também no
// `tsc` do Next (o tsconfig da raiz inclui `**/*.ts`).

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore TS5097 — import com extensão .ts é o padrão do Deno
import { atender } from "./provisionar.ts";

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
