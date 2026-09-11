"use client";

/**
 * Os 5 cards da aba Parceiros — a jornada do aluno no programa.
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
import type { AlunoGps } from "@/lib/data/alunos";
import { submetricasDaClasse } from "./submetricas";
import {
  CLASSES,
  ROTULO_CLASSE,
  AJUDA_CLASSE,
  type ClasseAluno,
} from "./estado-na-url";

export function CardsDeClasse({
  contagem,
  alunos,
  aoEscolher,
}: {
  /** Quantos alunos em cada classe. Vem do servidor, já agregado. */
  contagem: Record<ClasseAluno, number>;
  /** O lote carregado — as submétricas saem daqui, sem consulta nova. */
  alunos: AlunoGps[];
  aoEscolher: (c: ClasseAluno) => void;
}) {
  const total = CLASSES.reduce((s, c) => s + (contagem[c] ?? 0), 0);

  return (
    <div className="grid gap-2">
      {CLASSES.map((c) => {
        const n = contagem[c] ?? 0;
        const vazio = n === 0;
        const subs = submetricasDaClasse(
          c,
          alunos.filter((a) => a.classe === c),
        );
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
            aria-label={`${ROTULO_CLASSE[c]}: ${n} ${n === 1 ? "parceiro" : "parceiros"}`}
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

              {/* 🔑 As submétricas respondem "quantos já chegaram até aqui?",
                  não "como o card se divide?" — elas NÃO SOMAM o total e o
                  mesmo aluno aparece em várias (quem agendou também listou
                  os 30). Sem isso, a equipe leria os números como fatias. */}
              {subs.length > 0 ? (
                <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {subs.map((sm) => (
                    <span
                      key={sm.rotulo}
                      title={sm.ajuda}
                      className="inline-flex items-baseline gap-1 corpo-sm"
                    >
                      <span className="font-semibold tabular-nums text-accent-foreground">
                        {sm.valor}
                      </span>
                      <span className="text-muted-foreground">{sm.rotulo}</span>
                    </span>
                  ))}
                </span>
              ) : null}
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
        {total} {total === 1 ? "parceiro" : "parceiros"} no programa. A fase é
        calculada pelo que cada um já registrou — ninguém marca à mão.
      </p>
    </div>
  );
}
