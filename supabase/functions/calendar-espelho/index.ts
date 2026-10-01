// Edge Function calendar-espelho: sessões EP/RP do GPS → agenda Google IMPLEMENTAÇÃO.
// Autenticação só pelo header x-espelho-segredo (env ESPELHO_SEGREDO). Deploy
// com --no-verify-jwt: quem chama é o cron (pg_net), não um usuário.
// Toda a lógica está em ./espelho.ts (testada em ./espelho.test.ts).
//
// A global `Deno` é lida por cast para o arquivo passar também no `tsc` do Next
// (o tsconfig da raiz inclui `**/*.ts`).

// Deno exige a extensão .ts; o tsc do Next (tsconfig da raiz inclui **/*.ts)
// recusa com TS5097. O ignore vale só para esta linha.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore TS5097 — import com extensão .ts é o padrão do Deno
import { atender } from "./espelho.ts";

type DenoMin = {
  env: { get(k: string): string | undefined };
  serve(h: (req: Request) => Response | Promise<Response>): unknown;
};
const D = (globalThis as unknown as { Deno: DenoMin }).Deno;

D.serve((req) => atender(req, { env: (k) => D.env.get(k), fetch: (...a) => fetch(...a) }));
