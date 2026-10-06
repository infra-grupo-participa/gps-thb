/**
 * Catálogo da AGENDA na lista de clientes do admin (…355, João 06/10/2026).
 *
 * Módulo PURO (sem Supabase, sem `next/headers`): é importado por
 * `estado-na-url.ts`, que vai para o bundle do cliente via `index.tsx`
 * (`"use client"`). Por isso o catálogo não mora em
 * `src/lib/data/clientes-admin.ts`, que importa o cliente de servidor — lá os
 * tipos são só reexportados (`export type`).
 *
 * A REGRA (qual sessão/data, qual estado, qual etapa) mora no banco, em
 * `gps.cliente_agenda_resumo()`. Aqui só o vocabulário.
 */

/**
 * Estado normalizado de uma reunião (`*_estado` de `gps.admin_clientes_lista`):
 * agendada = marcada no futuro · pendente = marcada, já passou, não registrada
 * como feita · realizada · faltou. `null` (fora do tipo) = nada.
 */
export type EstadoReuniao = "agendada" | "pendente" | "realizada" | "faltou";

/**
 * Etapa da agenda = a reunião MAIS AVANÇADA do cliente, marcada ou feita:
 * execucao > croqui > preliminar > entrevista > sem. Catálogo fechado — o
 * mesmo de `p_agenda` (fora dele a RPC devolve 22023). Ordem = ordem dos tiles.
 */
export const ETAPAS_AGENDA = ["sem", "entrevista", "preliminar", "croqui", "execucao"] as const;
export type EtapaAgenda = (typeof ETAPAS_AGENDA)[number];

const ESTADOS_REUNIAO = new Set<string>(["agendada", "pendente", "realizada", "faltou"]);
const ETAPAS_AGENDA_SET = new Set<string>(ETAPAS_AGENDA);

export function ehEtapaAgenda(v: unknown): v is EtapaAgenda {
  return typeof v === "string" && ETAPAS_AGENDA_SET.has(v);
}

/** Valor cru da RPC → estado do catálogo; qualquer outra coisa vira `null`. */
export function estadoReuniao(v: unknown): EstadoReuniao | null {
  return typeof v === "string" && ESTADOS_REUNIAO.has(v) ? (v as EstadoReuniao) : null;
}
