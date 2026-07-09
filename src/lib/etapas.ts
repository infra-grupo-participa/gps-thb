// Registro do conteúdo (tarefas) de cada etapa do GPS.

import {
  TAREFAS_ETAPA1,
  calcularMetricasEtapa1,
  type TarefaDef,
} from "@/lib/etapa1";
import { TAREFAS_ETAPA2, META_ETAPA2 } from "@/lib/etapa2";
import { TAREFAS_ETAPA3 } from "@/lib/etapa3";
import { TAREFAS_ETAPA4 } from "@/lib/etapa4";
import { TAREFAS_ETAPA5 } from "@/lib/etapa5";
import { TAREFAS_ETAPA6 } from "@/lib/etapa6";
import type { ClienteEtapa1, Etapa, ProgressoTarefa } from "@/lib/types";

export interface ConteudoEtapa {
  tarefas: TarefaDef[];
  meta?: string;
}

export const CONTEUDO_ETAPAS: Record<number, ConteudoEtapa> = {
  1: { tarefas: TAREFAS_ETAPA1 },
  2: { tarefas: TAREFAS_ETAPA2, meta: META_ETAPA2 },
  3: { tarefas: TAREFAS_ETAPA3 },
  4: { tarefas: TAREFAS_ETAPA4 },
  5: { tarefas: TAREFAS_ETAPA5 },
  6: { tarefas: TAREFAS_ETAPA6 },
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

export interface ProximoPasso {
  etapa: number;
  etapaNome: string;
  tarefaNum: number;
  codigo: string;
  titulo: string;
}

/**
 * A próxima tarefa pendente do aluno: primeira não concluída na etapa liberada
 * mais avançada em que ainda há pendência. Retorna null quando está tudo em dia.
 */
export function proximoPasso(
  etapas: Etapa[],
  clientes: ClienteEtapa1[],
  progressoTodas: ProgressoTarefa[],
): ProximoPasso | null {
  const liberadas = [...etapas]
    .filter((e) => e.liberada)
    .sort((a, b) => a.ordem - b.ordem);

  for (const et of liberadas) {
    const conteudo = CONTEUDO_ETAPAS[et.id];
    if (!conteudo) continue;

    const progE = progressoTodas.filter((p) => p.etapa === et.id);
    let estaConcluida: (num: number) => boolean;
    if (et.id === 1) {
      const manual: Record<number, boolean> = {};
      for (const p of progE) manual[p.tarefa] = p.concluida;
      estaConcluida = calcularMetricasEtapa1(clientes, manual).tarefaConcluida;
    } else {
      const feitas = new Set(
        progE.filter((p) => p.concluida).map((p) => p.tarefa),
      );
      estaConcluida = (num) => feitas.has(num);
    }

    const pend = conteudo.tarefas.find((t) => !estaConcluida(t.num));
    if (pend) {
      return {
        etapa: et.id,
        etapaNome: et.nome,
        tarefaNum: pend.num,
        codigo: pend.codigo ?? String(pend.num),
        titulo: pend.titulo,
      };
    }
  }

  return null;
}

/** Progresso (%) de todas as etapas cadastradas, para o mapa do Início. */
export function pctPorEtapa(
  clientes: ClienteEtapa1[],
  progressoTodas: ProgressoTarefa[],
): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [etapaStr, conteudo] of Object.entries(CONTEUDO_ETAPAS)) {
    const etapa = Number(etapaStr);
    const progressoEtapa = progressoTodas.filter((p) => p.etapa === etapa);
    if (etapa === 1) {
      const manual: Record<number, boolean> = {};
      for (const p of progressoEtapa) manual[p.tarefa] = p.concluida;
      out[etapa] = calcularMetricasEtapa1(clientes, manual).pct;
    } else {
      out[etapa] = pctEtapaManual(conteudo.tarefas, progressoEtapa);
    }
  }
  return out;
}
