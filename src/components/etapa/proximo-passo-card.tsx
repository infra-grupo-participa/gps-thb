import Link from "next/link";
import { PlayCircle, ArrowRight } from "lucide-react";
import type { ProximoPasso } from "@/lib/etapas";

/** Atalho "continue de onde parou" — leva à etapa da próxima tarefa pendente. */
export function ProximoPassoCard({
  passo,
  basePath,
}: {
  passo: ProximoPasso;
  basePath: string;
}) {
  return (
    <Link
      href={`${basePath}/etapa/${passo.etapa}`}
      className="group flex items-center gap-4 rounded-xl border border-primary/30 bg-primary/5 px-5 py-4 transition hover:border-primary/60 hover:bg-primary/10"
    >
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
        <PlayCircle className="size-6" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold uppercase tracking-wide text-primary">
          Continue de onde parou
        </div>
        <div className="truncate font-medium">
          {passo.codigo}. {passo.titulo}
        </div>
        <div className="truncate text-sm text-muted-foreground">
          Etapa {String(passo.etapa).padStart(2, "0")} — {passo.etapaNome}
        </div>
      </div>
      <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
        Continuar
        <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
