/**
 * Tipo de `resolverLoginPorEmail` (`src/app/admin/operadores/
 * resolver-email-actions.ts`), separado por conta da mesma regra do resto do
 * repo: módulo com `"use server"` no topo só pode exportar `async function`
 * — `export interface`/`export const`/`export type` passam no `tsc` e no
 * `next build`, e quebram em RUNTIME (já derrubou `/admin` em 10/09 e
 * `/admin/videos` em 11/09, ver `CLAUDE.md`).
 */
export interface LoginResolvidoResultado {
  ok: boolean;
  erro?: string;
  userId?: string;
  email?: string;
}
