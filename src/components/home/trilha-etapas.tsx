import Link from "next/link";
import { Check, ChevronRight, Lock } from "lucide-react";
import type { Etapa } from "@/lib/types";
import type { OverridesLiberacao } from "@/lib/etapas";
import { cn } from "@/lib/utils";

type Estado = "concluida" | "atual" | "disponivel" | "em_breve" | "travada";

/**
 * "Seu caminho" da home: as 6 etapas numa trilha compacta. Horizontal no
 * desktop (6 colunas), lista vertical no celular — um DOM só.
 *
 * Substituiu, na home, os 6 cards grandes do `EtapasOverview` (que segue no
 * espelho do admin, com a prévia de etapa travada). Aqui cada etapa é número,
 * nome e estado; a etapa liberada abre a etapa.
 *
 * Estado, nesta ordem: concluída (100%) · atual (a do próximo passo) ·
 * disponível · em breve. `overrides` só muda o RÓTULO ("Travada pela equipe",
 * "Liberada para você") e o motivo escrito pela equipe aparece embaixo da
 * trilha — a liberação já chega resolvida em `etapas`.
 */
export function TrilhaEtapas({
  etapas,
  pctPorEtapa,
  overrides,
  etapaAtualId,
}: {
  etapas: Etapa[];
  pctPorEtapa: Record<number, number>;
  overrides: OverridesLiberacao;
  /** A etapa do próximo passo (ou a liberada mais avançada). */
  etapaAtualId: number | null;
}) {
  const ordenadas = [...etapas].sort((a, b) => a.ordem - b.ordem);
  const motivos = ordenadas
    .map((e) => ({ e, o: overrides[e.id] }))
    .filter(({ o }) => o?.motivo);

  return (
    <div>
      <ol className="grid gap-2 lg:grid-cols-6 lg:gap-3">
        {ordenadas.map((etapa) => {
          const pct = etapa.liberada ? (pctPorEtapa[etapa.id] ?? 0) : null;
          const override = overrides[etapa.id];
          const estado: Estado = !etapa.liberada
            ? override?.liberada === false
              ? "travada"
              : "em_breve"
            : pct === 100
              ? "concluida"
              : etapa.id === etapaAtualId
                ? "atual"
                : "disponivel";
          const rotulo =
            estado === "concluida"
              ? "Concluída"
              : estado === "atual"
                ? `Você está aqui · ${pct}%`
                : estado === "disponivel"
                  ? `${override?.liberada === true ? "Liberada para você" : "Disponível"} · ${pct}%`
                  : estado === "travada"
                    ? "Travada pela equipe"
                    : "Em breve";
          const liberada = etapa.liberada;

          const corpo = (
            <>
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full font-heading text-base font-semibold",
                  estado === "concluida" && "bg-sucesso text-sucesso-foreground",
                  estado === "atual" && "bg-marca-solida text-white",
                  estado === "disponivel" && "bg-accent text-accent-foreground",
                  (estado === "em_breve" || estado === "travada") &&
                    "bg-neutro text-neutro-foreground",
                )}
              >
                {estado === "concluida" ? (
                  <Check aria-hidden className="size-5" />
                ) : estado === "em_breve" || estado === "travada" ? (
                  <Lock aria-hidden className="size-4" />
                ) : (
                  etapa.ordem
                )}
                <span className="sr-only">Etapa {etapa.ordem}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base leading-snug font-semibold text-balance">
                  {etapa.nome}
                </span>
                <span
                  className={cn(
                    "block text-base text-muted-foreground",
                    estado === "atual" && "font-medium text-accent-foreground",
                  )}
                >
                  {rotulo}
                </span>
              </span>
              {liberada ? (
                <ChevronRight
                  aria-hidden
                  className="size-5 shrink-0 text-muted-foreground lg:hidden"
                />
              ) : null}
            </>
          );

          const classe = cn(
            "flex h-full items-center gap-3 rounded-xl border px-4 py-3 lg:flex-col lg:items-start",
            liberada ? "bg-card" : "border-dashed bg-superficie-afundada",
            estado === "atual" && "border-primary/50",
          );

          return (
            <li key={etapa.id} className="min-w-0">
              {liberada ? (
                <Link
                  href={`/etapa/${etapa.id}`}
                  aria-current={estado === "atual" ? "step" : undefined}
                  className={cn(
                    classe,
                    "foco-visivel transition-colors hover:border-borda-forte",
                  )}
                >
                  {corpo}
                </Link>
              ) : (
                <div aria-disabled="true" className={classe}>
                  {corpo}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {motivos.length > 0 ? (
        <ul className="mt-3 grid gap-1 text-base text-muted-foreground">
          {motivos.map(({ e, o }) => (
            <li key={e.id}>
              Etapa {String(e.ordem).padStart(2, "0")}: {o!.motivo}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
