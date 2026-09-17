/**
 * Estado da tela `/admin/clientes` lido de `searchParams`, no Server
 * Component — allowlist fechada, mesmo padrão de
 * `alunos-ativos-lista/estado-na-url.ts`.
 *
 * 🔑 Diferença de propósito: aquele hook vive no CLIENTE (`useSearchParams`,
 * escreve com 300 ms de atraso) porque a lista de alunos é filtrada em
 * MEMÓRIA sobre um lote já carregado. Aqui a lista é de 1.223 linhas — quem
 * pagina e filtra é o BANCO (`gps.admin_clientes_lista`), então o estado
 * precisa estar pronto ANTES da consulta, no servidor. Não há como um hook de
 * cliente chegar a tempo da primeira renderização.
 *
 * 🔴 Valor fora da allowlist é DESCARTADO, nunca quebra a tela — mesma regra:
 * um parâmetro estranho na URL vira o padrão, nunca um erro 500 nem uma
 * consulta com filtro inválido.
 */

import type { FaseCliente, GrauRelacao } from "@/lib/types";
import { FASES_CLIENTE, GRAUS_RELACAO_UI } from "@/lib/etapa1";

const FASES_SET = new Set<string>(FASES_CLIENTE.map((f) => f.id));
const GRAUS_SET = new Set<string>(GRAUS_RELACAO_UI.map((g) => g.id));

/** Quantas linhas por página — decisão do Marcio (14/09/2026). */
export const ITENS_POR_PAGINA = 100;

/** Teto do termo de busca — mesmo valor de `alunos-ativos-lista`. */
const MAX_TERMO = 80;

/** Teto de páginas aceito na URL — página absurda vira a última válida. */
const MAX_PAGINA = 1000;

/** Chip de reunião preliminar (item 5 do backlog, 17/09/2026) — catálogo
 * fechado, mesma convenção de `grau: "_nulo"`. `null` = todos (sem filtro). */
export type FiltroReuniao = "marcada" | "vencida" | "sem" | null;

const REUNIAO_SET = new Set<string>(["marcada", "vencida", "sem"]);

export interface EstadoClientesUrl {
  fase: FaseCliente | null;
  /** `"_nulo"` = sem grau informado (mesma convenção da RPC). */
  grau: GrauRelacao | "_nulo" | null;
  busca: string;
  /** 1-based — o que a URL mostra (`?pag=2`), não o `offset` da RPC. */
  pagina: number;
  reuniao: FiltroReuniao;
}

/** Lê `searchParams` já resolvido (`await searchParams`) do App Router. */
export function lerEstadoClientesUrl(sp: {
  fase?: string;
  grau?: string;
  q?: string;
  pag?: string;
  reuniao?: string;
}): EstadoClientesUrl {
  const fase = FASES_SET.has(sp.fase ?? "") ? (sp.fase as FaseCliente) : null;
  const grau =
    sp.grau === "_nulo" || GRAUS_SET.has(sp.grau ?? "")
      ? (sp.grau as GrauRelacao | "_nulo")
      : null;
  const busca = (sp.q ?? "").slice(0, MAX_TERMO);
  const paginaCrua = Math.trunc(Number(sp.pag)) || 1;
  const pagina = Math.min(Math.max(paginaCrua, 1), MAX_PAGINA);
  const reuniao = REUNIAO_SET.has(sp.reuniao ?? "")
    ? (sp.reuniao as FiltroReuniao)
    : null;
  return { fase, grau, busca, pagina, reuniao };
}

/** `pagina` (1-based) → `offset` da RPC. */
export function offsetDaPagina(pagina: number): number {
  return (pagina - 1) * ITENS_POR_PAGINA;
}

/**
 * Monta o `href` de `/admin/clientes` preservando o restante do estado —
 * usado pelos chips de filtro, pela busca e pela paginação, e também pelos
 * KPIs do dashboard que já chegam com `?fase=` ou `?grau=` prontos.
 */
export function hrefClientes(
  estado: Partial<EstadoClientesUrl>,
  base: EstadoClientesUrl,
): string {
  const novo: EstadoClientesUrl = { ...base, ...estado };
  const sp = new URLSearchParams();
  if (novo.fase) sp.set("fase", novo.fase);
  if (novo.grau) sp.set("grau", novo.grau);
  if (novo.busca.trim()) sp.set("q", novo.busca.trim());
  if (novo.reuniao) sp.set("reuniao", novo.reuniao);
  if (novo.pagina > 1) sp.set("pag", String(novo.pagina));
  const q = sp.toString();
  return q ? `/admin/clientes?${q}` : "/admin/clientes";
}
