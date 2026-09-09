"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import type { ClienteEtapa1 } from "@/lib/types";
import { buttonVariants } from "@/components/ui/button";

/** Banner do cliente escolhido para o acompanhamento da equipe. */
export function ConfirmacaoEquipe({
  cliente,
  etapa1Href,
}: {
  cliente: ClienteEtapa1;
  etapa1Href: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
        <div>
          <div className="text-sm font-semibold text-emerald-800">
            A equipe vai acompanhar {cliente.nome || "este cliente"}
          </div>
          <p className="text-xs text-emerald-700/80">
            Cliente confirmado para o apoio da equipe. Os próximos passos da
            Etapa 01 (do passo 4 em diante) estão liberados.
          </p>
        </div>
      </div>
      <Link
        href={etapa1Href}
        className={buttonVariants({ size: "sm" }) + " shrink-0"}
      >
        Continuar na Etapa 01 <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}
