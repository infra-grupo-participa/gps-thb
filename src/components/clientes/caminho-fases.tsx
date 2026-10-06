"use client";

/**
 * O MARCADOR de fase do caminho (① ② ③ ④) — um lugar só para o círculo
 * numerado que a folha "Trajetória" (`ficha-trajetoria.tsx`) e o mini-caminho
 * do topo da ficha (`ficha-cabecalho.tsx`) desenham. Saiu de
 * `ficha-trajetoria.tsx` em 05/10/2026 quando o topo passou a mostrar o
 * caminho: duas cópias das classes divergiriam no primeiro ajuste de cor.
 *
 *   · `atual`  — preenchido na cor de ação;
 *   · `passou` — anel de 2 px na cor de ação;
 *   · `futura` — anel fino neutro, número esmaecido.
 *
 * 🔴 O estado NUNCA é só a cor: quem usa o marcador diz o estado em texto
 * (`sr-only` na folha, rótulo acessível no topo). O marcador é `aria-hidden`.
 */

import { cn } from "@/lib/utils";

export type EstadoFase = "passou" | "atual" | "futura";

/** Estado da fase `i` com a fase atual na posição `atual`. */
export function estadoDaFase(i: number, atual: number): EstadoFase {
  return i < atual ? "passou" : i === atual ? "atual" : "futura";
}

export function MarcadorFase({
  numero,
  estado,
  pequeno = false,
}: {
  numero: number;
  estado: EstadoFase;
  /** `true` = 24 px (topo da ficha); padrão 28 px (folha Trajetória). */
  pequeno?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold tabular-nums",
        pequeno ? "size-6 text-xs" : "size-7 text-sm",
        estado === "atual" && "bg-marca-acao text-primary-foreground",
        estado === "passou" && "border-2 border-marca-acao bg-card text-foreground",
        estado === "futura" &&
          "border border-borda-forte bg-card text-muted-foreground",
      )}
    >
      {numero}
    </span>
  );
}
