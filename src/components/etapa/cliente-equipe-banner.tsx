import Link from "next/link";
import { Star, ArrowRight } from "lucide-react";
import type { ClienteEtapa1 } from "@/lib/types";

/**
 * Destaca, no topo das etapas 2–6, qual é o cliente acompanhado pela equipe
 * (a etapa toda gira em torno dele), com atalho para a ficha.
 */
export function ClienteEquipeBanner({
  cliente,
  basePath,
}: {
  cliente: ClienteEtapa1 | null;
  basePath: string;
}) {
  if (!cliente) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed bg-muted/40 px-4 py-2.5 text-sm">
        <Star className="size-4 text-muted-foreground" />
        <span className="text-muted-foreground">
          Nenhum cliente marcado como acompanhado pela equipe.
        </span>
        <Link
          href={`${basePath}/clientes`}
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          Marcar em Clientes <ArrowRight className="size-3" />
        </Link>
      </div>
    );
  }

  return (
    <Link
      href={`${basePath}/clientes/${cliente.id}`}
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm transition hover:bg-primary/10"
    >
      <span className="flex items-center gap-2">
        <Star className="size-4 fill-primary text-primary" />
        <span className="text-muted-foreground">Cliente acompanhado:</span>
        <span className="font-medium">{cliente.nome || "Sem nome"}</span>
      </span>
      <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
        Abrir ficha <ArrowRight className="size-3" />
      </span>
    </Link>
  );
}
