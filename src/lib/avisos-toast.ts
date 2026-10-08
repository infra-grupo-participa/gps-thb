// Lógica PURA do sino da equipe: rótulo do contador e agrupamento do pop-up.
// Sem `@/`, sem React, sem relógio próprio (o `agora` entra por parâmetro):
// roda em `node --test src/lib/avisos-toast.test.mjs`.

import type { AvisoItem } from "./avisos-tipos";

/** No máximo 1 pop-up a cada 10 s; o que chegar no meio espera e agrupa. */
export const TOAST_INTERVALO_MS = 10_000;
/** Quanto o pop-up fica na tela. */
export const TOAST_DURACAO_MS = 6_000;

/** "99+" quando o banco devolve o teto (100). `0` → `null` (sem selo). */
export function rotuloContador(n: number): string | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  return n >= 100 ? "99+" : String(Math.floor(n));
}

/**
 * Itens que merecem pop-up: chegaram DEPOIS do último id já visto, são de
 * tipo `toast=true` e não estão lidos. `ultimoVisto === null` = ainda não
 * houve leitura de base — nada vira pop-up (evita despejar o histórico).
 */
export function novosParaToast(
  itens: readonly Pick<AvisoItem, "id" | "toast" | "lido">[],
  ultimoVisto: number | null,
): number[] {
  if (ultimoVisto === null) return [];
  return itens
    .filter((i) => i.id > ultimoVisto && i.toast && !i.lido)
    .map((i) => i.id)
    .sort((a, b) => a - b);
}

export type ItemToast = Pick<AvisoItem, "id" | "rotulo" | "resumo" | "url">;

export interface FilaToast {
  pendentes: ItemToast[];
  /** Instante (ms) do último pop-up mostrado; `null` = nenhum ainda. */
  ultimoEm: number | null;
}

export const FILA_VAZIA: FilaToast = { pendentes: [], ultimoEm: null };

export interface PlanoToast {
  titulo: string;
  descricao: string | null;
  /** `null` = pop-up agrupado: o clique abre o sino em vez de navegar. */
  url: string | null;
  ids: number[];
}

/** Junta itens novos à fila sem repetir id. */
export function enfileirar(fila: FilaToast, itens: readonly ItemToast[]): FilaToast {
  const ja = new Set(fila.pendentes.map((i) => i.id));
  const novos = itens.filter((i) => !ja.has(i.id));
  if (novos.length === 0) return fila;
  return { ...fila, pendentes: [...fila.pendentes, ...novos] };
}

/**
 * Decide o que fazer agora com a fila.
 * - fila vazia → nada;
 * - aba oculta → descarta (pop-up nunca aparece com a aba oculta, e o que
 *   chegou escondido não vira pop-up atrasado: fica só no contador);
 * - dentro dos 10 s do último → espera `esperarMs`;
 * - senão → mostra 1 pop-up (1 item = o próprio; N = "N atualizações novas").
 */
export function decidirToast(
  fila: FilaToast,
  agora: number,
  visivel: boolean,
): { plano: PlanoToast | null; fila: FilaToast; esperarMs: number | null } {
  if (fila.pendentes.length === 0) return { plano: null, fila, esperarMs: null };
  if (!visivel) return { plano: null, fila: { ...fila, pendentes: [] }, esperarMs: null };
  if (fila.ultimoEm !== null) {
    const falta = fila.ultimoEm + TOAST_INTERVALO_MS - agora;
    if (falta > 0) return { plano: null, fila, esperarMs: falta };
  }
  const ids = fila.pendentes.map((i) => i.id);
  const n = fila.pendentes.length;
  const plano: PlanoToast =
    n === 1
      ? {
          titulo: fila.pendentes[0].rotulo,
          descricao: fila.pendentes[0].resumo,
          url: fila.pendentes[0].url,
          ids,
        }
      : { titulo: `${n} atualizações novas`, descricao: null, url: null, ids };
  return { plano, fila: { pendentes: [], ultimoEm: agora }, esperarMs: null };
}

/** Anúncio de outra aba/janela querendo mostrar o mesmo aviso. */
export interface ReivindicacaoAlheia {
  aba: string;
  /** `true` = a outra aba anunciou antes de esta anunciar: ela ganha. */
  antesDaMinha: boolean;
}

/**
 * Disputa do pop-up entre abas do mesmo admin: ganho o id se ninguém o
 * anunciou antes de mim e, entre anúncios simultâneos, o meu id de aba é o
 * menor. Toda aba aplica a mesma regra e chega ao mesmo vencedor.
 */
export function idsQueGanhei(
  meus: readonly number[],
  minhaAba: string,
  alheias: ReadonlyMap<number, readonly ReivindicacaoAlheia[]>,
): number[] {
  return meus.filter((id) =>
    (alheias.get(id) ?? []).every((r) => !r.antesDaMinha && minhaAba < r.aba),
  );
}
