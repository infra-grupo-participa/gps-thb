/**
 * Listagem de tutoriais do aluno (feature "Aba de Tutoriais", 15/09/2026).
 * Server Component: os tutoriais chegam prontos do servidor (já publicados,
 * já com `minhaReacao`); a única parte client é o card individual e o
 * feedback.
 *
 * Agrupado por SEÇÃO, na ordem de `SECOES_TUTORIAL` (não alfabética, não por
 * `ordem`) — é a ordem que o Marcio decidiu para a leitura da tela. Dentro
 * da seção, por `ordem`. Seção sem nenhum tutorial não aparece; a lista
 * inteira vazia mostra estado vazio com instrução (nunca some com a tela).
 */

import { GraduationCap } from "lucide-react";
import type { TutorialDoAluno } from "@/lib/types";
import { SECOES_TUTORIAL } from "@/lib/tutoriais-tipos";
import { EmptyState } from "@/components/ui/empty-state";
import { TutorialCard } from "@/components/tutoriais/tutorial-card";

export function TutoriaisLista({
  tutoriais,
  somenteLeitura = false,
}: {
  tutoriais: TutorialDoAluno[];
  /** `true` no espelho de assistência — o voto é do aluno, não do admin. */
  somenteLeitura?: boolean;
}) {
  if (tutoriais.length === 0) {
    return (
      <EmptyState
        icone={<GraduationCap aria-hidden />}
        titulo="Nenhum tutorial publicado ainda."
        descricao="Assim que a equipe publicar um tutorial, ele aparece aqui, organizado por assunto."
      />
    );
  }

  const porSecao = new Map<string, TutorialDoAluno[]>();
  for (const t of tutoriais) {
    if (!porSecao.has(t.secao)) porSecao.set(t.secao, []);
    porSecao.get(t.secao)!.push(t);
  }
  for (const itens of porSecao.values()) {
    itens.sort((a, b) => a.ordem - b.ordem);
  }

  const grupos = SECOES_TUTORIAL.filter((s) => porSecao.has(s.id)).map((s) => ({
    ...s,
    itens: porSecao.get(s.id)!,
  }));

  return (
    <div className="grid gap-8">
      {grupos.map((grupo) => (
        <section key={grupo.id} aria-labelledby={`secao-${grupo.id}`}>
          <h2 id={`secao-${grupo.id}`} className="mb-3 text-sm font-semibold text-foreground">
            {grupo.rotulo}
          </h2>
          <div className="grid gap-3">
            {grupo.itens.map((tutorial) => (
              <TutorialCard key={tutorial.id} tutorial={tutorial} somenteLeitura={somenteLeitura} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
