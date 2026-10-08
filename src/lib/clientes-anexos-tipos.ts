/**
 * Catálogo dos ANEXOS (minuta e croqui em PDF) na lista de clientes do admin
 * (…378, 08/10/2026).
 *
 * Módulo PURO (sem Supabase, sem `next/headers`) — mesmo motivo de
 * `clientes-agenda-tipos.ts`: pode ir para o bundle do cliente via
 * `estado-na-url.ts`. `src/lib/data/clientes-admin.ts` só reexporta os tipos.
 *
 * A REGRA (versão mais recente por cliente; pendente = enviada ou em_analise)
 * mora no banco, em `gps.admin_clientes_lista(p_anexo)` e
 * `gps.admin_clientes_anexos_kpis()`. Aqui só o vocabulário — e o teste
 * `clientes-anexos-tipos.test.mjs` confere estas listas contra o TEXTO da
 * migração, porque `tsc` e `build` não leem SQL.
 */

/** Status de uma versão (minuta ou croqui) — o CHECK das duas tabelas. */
export const STATUS_ANEXO = ["enviada", "em_analise", "revisada"] as const;
export type StatusAnexo = (typeof STATUS_ANEXO)[number];

/**
 * Filtro `?anexo=` da lista = `p_anexo` da RPC. Catálogo FECHADO: fora dele a
 * RPC devolve 22023. `*_pendente` = a versão mais recente está `enviada` OU
 * `em_analise`.
 */
export const FILTROS_ANEXO = [
  "minuta_pendente",
  "croqui_pendente",
  "minuta_revisada",
  "croqui_revisado",
] as const;
export type FiltroAnexo = (typeof FILTROS_ANEXO)[number];

/** Linhas de `gps.admin_clientes_anexos_kpis()`, nesta ordem (6, sempre). */
export const TIPOS_ANEXO = ["minuta", "croqui"] as const;
export type TipoAnexo = (typeof TIPOS_ANEXO)[number];

/**
 * 🔑 `pendente` CONTÉM `em_analise` (é o mesmo recorte de `*_pendente` no
 * filtro — o tile e a lista filtrada têm de bater). As três linhas de um tipo
 * NÃO somam a base: pendente + revisada = clientes com aquele anexo.
 */
export const SITUACOES_ANEXO = ["pendente", "em_analise", "revisada"] as const;
export type SituacaoAnexo = (typeof SITUACOES_ANEXO)[number];

const STATUS_SET = new Set<string>(STATUS_ANEXO);
const FILTROS_SET = new Set<string>(FILTROS_ANEXO);
const TIPOS_SET = new Set<string>(TIPOS_ANEXO);
const SITUACOES_SET = new Set<string>(SITUACOES_ANEXO);

export function ehFiltroAnexo(v: unknown): v is FiltroAnexo {
  return typeof v === "string" && FILTROS_SET.has(v);
}

export function ehTipoAnexo(v: unknown): v is TipoAnexo {
  return typeof v === "string" && TIPOS_SET.has(v);
}

export function ehSituacaoAnexo(v: unknown): v is SituacaoAnexo {
  return typeof v === "string" && SITUACOES_SET.has(v);
}

/** Valor cru da RPC → status do catálogo; qualquer outra coisa (inclusive
 * `null` = cliente sem aquele anexo) vira `null`. */
export function statusAnexo(v: unknown): StatusAnexo | null {
  return typeof v === "string" && STATUS_SET.has(v) ? (v as StatusAnexo) : null;
}
