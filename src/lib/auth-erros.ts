/**
 * Erro de `getContextoSessao()` (`src/lib/auth.ts`) — "não deu para saber o
 * papel", nunca "não tem acesso".
 *
 * Por que este arquivo é separado de `auth.ts`: `auth.ts` não leva
 * `"use server"`, mas esta classe é importada por módulos que SÃO — e a regra
 * do repo (3 quedas registradas, ver CLAUDE.md "`"use server"` só exporta
 * função async") é que módulo de servidor só exporta função async. Um
 * `export class` dentro de `auth.ts` não quebraria `auth.ts` em si (ele não
 * leva a diretiva), mas colar tipo/classe ao lado de Server Action é o hábito
 * que causou as 3 quedas — arquivo à parte remove a tentação.
 */

/**
 * Lançada por `getContextoSessao()` quando a consulta a `perfis` ou a
 * `gps.membros` falha (erro de transporte/banco) — nunca quando a consulta
 * responde com 0 linhas. Ver o cabeçalho de `getContextoSessao` para a
 * distinção completa.
 */
export class SessaoIndeterminadaError extends Error {
  readonly escopo: "perfis" | "membros";

  constructor(escopo: "perfis" | "membros") {
    super(`Não foi possível resolver a sessão (escopo: ${escopo}).`);
    this.name = "SessaoIndeterminadaError";
    this.escopo = escopo;
  }
}

/** Type guard — usar em todo `catch` que precisa distinguir esta falha. */
export function ehSessaoIndeterminada(e: unknown): e is SessaoIndeterminadaError {
  return e instanceof SessaoIndeterminadaError;
}
