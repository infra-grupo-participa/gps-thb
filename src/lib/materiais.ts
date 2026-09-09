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

/**
 * Lista todos os materiais (aulas e modelos) do programa, por etapa/tarefa.
 *
 * O corte de etapa bloqueada acontece AQUI, no servidor (pentest de 09/09/2026):
 * `MateriaisView` é client component, então tudo que ela recebe vai no payload
 * inicial da página — esconder o link só na renderização deixava a URL da aula
 * de uma etapa trancada no view-source. Com `etapasLiberadas`, o material de
 * etapa não liberada é listado (o aluno vê que existe) mas SEM `url`.
 * `incluirBloqueados: true` é para admin/prévia, que podem abrir tudo.
 */
export function listarMateriais(opts?: {
  etapasLiberadas?: Record<number, boolean>;
  incluirBloqueados?: boolean;
}): Material[] {
  const todos = listarTodosOsMateriais();
  if (!opts?.etapasLiberadas || opts.incluirBloqueados) return todos;
  const liberadas = opts.etapasLiberadas;
  return todos.map((m) => (liberadas[m.etapa] ? m : { ...m, url: undefined }));
}

function listarTodosOsMateriais(): Material[] {
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
