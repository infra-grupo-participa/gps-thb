// Cálculo da ênfase visual das tarefas de uma etapa.
//
// Regra automática: a tarefa atual (primeira não concluída) fica em destaque,
// as já concluídas ficam normais e as futuras ficam esmaecidas — conforme o
// aluno avança, a próxima tarefa ganha destaque. O admin pode sobrepor a ênfase
// de tarefas específicas de um aluno (gps.tarefa_enfase).

import type { ModoEnfase } from "@/lib/types";

export type Enfase = "realce" | "normal" | "esmaecer";

export function calcularEnfases(
  tarefas: { num: number }[],
  estaConcluida: (num: number) => boolean,
  overrides: Record<number, ModoEnfase>,
): Record<number, Enfase> {
  const out: Record<number, Enfase> = {};
  const idxAtual = tarefas.findIndex((t) => !estaConcluida(t.num));

  tarefas.forEach((t, i) => {
    let e: Enfase;
    if (estaConcluida(t.num)) e = "normal";
    else if (idxAtual !== -1 && i === idxAtual) e = "realce";
    else e = "esmaecer";

    const ov = overrides[t.num];
    if (ov) e = ov;

    out[t.num] = e;
  });

  return out;
}
