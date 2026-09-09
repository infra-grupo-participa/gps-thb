/**
 * Declarações compartilhadas pelos arquivos de `plantao-calendario/`.
 * Sem React e sem `"use client"`: só um tipo e uma string de classe.
 */

import type { SlotAdmin } from "@/lib/plantao-tipos";

/** `<select>` nativo com o visual do `Input` do shadcn (não há Select nativo aqui). */
export const CLASSE_SELECT =
  "border-input bg-background focus-visible:ring-ring/50 h-9 rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50";

export type ModoDialog = "lista" | "novo" | { editando: SlotAdmin };
