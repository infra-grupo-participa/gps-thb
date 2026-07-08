// Registro do conteúdo (tarefas) de cada etapa do GPS.

import { TAREFAS_ETAPA1, type TarefaDef } from "@/lib/etapa1";
import { TAREFAS_ETAPA2, META_ETAPA2 } from "@/lib/etapa2";
import { TAREFAS_ETAPA3 } from "@/lib/etapa3";
import type { ProgressoTarefa } from "@/lib/types";

export interface ConteudoEtapa {
  tarefas: TarefaDef[];
  meta?: string;
}

export const CONTEUDO_ETAPAS: Record<number, ConteudoEtapa> = {
  1: { tarefas: TAREFAS_ETAPA1 },
  2: { tarefas: TAREFAS_ETAPA2, meta: META_ETAPA2 },
  3: { tarefas: TAREFAS_ETAPA3 },
};

export function conteudoEtapa(n: number): ConteudoEtapa | null {
  return CONTEUDO_ETAPAS[n] ?? null;
}

/** Progresso (%) de uma etapa cujas tarefas são todas manuais (etapas >= 2). */
export function pctEtapaManual(
  tarefas: TarefaDef[],
  progresso: ProgressoTarefa[],
): number {
  if (tarefas.length === 0) return 0;
  const feitas = new Set(
    progresso.filter((p) => p.concluida).map((p) => p.tarefa),
  );
  const concluidas = tarefas.filter((t) => feitas.has(t.num)).length;
  return Math.round((concluidas / tarefas.length) * 100);
}
