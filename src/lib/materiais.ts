// Acervo: agrega as aulas (tutoriais) e modelos de todas as etapas.

import { CONTEUDO_ETAPAS } from "@/lib/etapas";

export type TipoMaterial = "aula" | "modelo";

export interface Material {
  etapa: number;
  tarefaNum: number;
  tarefaTitulo: string;
  tipo: TipoMaterial;
  titulo: string;
  url?: string;
}

/** Lista todos os materiais (aulas e modelos) do programa, por etapa/tarefa. */
export function listarMateriais(): Material[] {
  const out: Material[] = [];
  for (const [etapaStr, conteudo] of Object.entries(CONTEUDO_ETAPAS)) {
    const etapa = Number(etapaStr);
    for (const t of conteudo.tarefas) {
      if (t.tutorialUrl) {
        out.push({
          etapa,
          tarefaNum: t.num,
          tarefaTitulo: t.titulo,
          tipo: "aula",
          titulo: t.titulo,
          url: t.tutorialUrl,
        });
      }
      if (t.modelo) {
        out.push({
          etapa,
          tarefaNum: t.num,
          tarefaTitulo: t.titulo,
          tipo: "modelo",
          titulo: t.modelo.nome,
          url: t.modelo.url,
        });
      }
    }
  }
  return out;
}
