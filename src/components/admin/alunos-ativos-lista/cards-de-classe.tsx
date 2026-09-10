"use client";

/**
 * Os 5 cards da aba Alunos — a jornada do aluno no programa.
 *
 * Desenho do Marcio (10/09/2026): cinco blocos EMPILHADOS, um por linha, com
 * o nome à esquerda e o número à direita. Clicar num card abre a lista
 * daquela classe; de lá se entra no ambiente do aluno.
 *
 * 🔑 A ordem é a da JORNADA, não a de tamanho: Inicial → Captação/Fechamento
 * → Execução → Orientação → Finalizados. Ordenar por quantidade faria os
 * cards trocarem de lugar conforme os alunos avançam, e a tela deixaria de
 * ser um mapa.
 *
 * 🔴 Card vazio CONTINUA aparecendo, apagado e sem clique. Três das cinco
 * classes nascem em zero (ninguém tem honorários declarados, ninguém chegou
 * à Etapa 06). Esconder o que está vazio faria a jornada parecer ter duas
 * etapas — e o admin não veria para onde o aluno caminha.
 */

import { ChevronRight } from "lucide-react";
import {
  CLASSES,
  ROTULO_CLASSE,
  AJUDA_CLASSE,
  type ClasseAluno,
} from "./estado-na-url";

export function CardsDeClasse({
  contagem,
  aoEscolher,
}: {
  /** Quantos alunos em cada classe. Vem do servidor, já agregado. */
  contagem: Record<ClasseAluno, number>;
  aoEscolher: (c: ClasseAluno) => void;
}) {
  const total = CLASSES.reduce((s, c) => s + (contagem[c] ?? 0), 0);

  return (
    <div className="grid gap-2">
      {CLASSES.map((c) => {
        const n = contagem[c] ?? 0;
        const vazio = n === 0;
        return (
          <button
            key={c}
            type="button"
            onClick={() => aoEscolher(c)}
            disabled={vazio}
            className={
              "group flex items-center justify-between gap-4 rounded-xl border p-4 text-left transition " +
              (vazio
                ? "cursor-default border-dashed border-borda-fina bg-superficie-afundada/40"
                : "border-borda-fina bg-card hover:border-marca-acao hover:bg-primary/[0.04] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring")
            }
            aria-label={`${ROTULO_CLASSE[c]}: ${n} ${n === 1 ? "aluno" : "alunos"}`}
          >
            <span className="min-w-0">
              <span
                className={
                  "block font-heading titulo-h2 " +
                  (vazio ? "text-muted-foreground" : "")
                }
              >
                {ROTULO_CLASSE[c]}
              </span>
              <span className="mt-0.5 block corpo-sm text-muted-foreground">
                {AJUDA_CLASSE[c]}
              </span>
            </span>

            <span className="flex shrink-0 items-center gap-2">
              <span
                className={
                  "numero tabular-nums " +
                  (vazio ? "text-muted-foreground" : "text-accent-foreground")
                }
              >
                {n}
              </span>
              {vazio ? null : (
                <ChevronRight
                  aria-hidden
                  className="size-5 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-accent-foreground"
                />
              )}
            </span>
          </button>
        );
      })}

      <p className="mt-1 corpo-sm text-muted-foreground">
        {total} {total === 1 ? "aluno" : "alunos"} no programa. A fase é
        calculada pelo que cada um já registrou — ninguém marca à mão.
      </p>
    </div>
  );
}
