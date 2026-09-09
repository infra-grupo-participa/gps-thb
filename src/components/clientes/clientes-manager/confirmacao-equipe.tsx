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
    // Verde do TOKEN semântico, não `emerald-*` cru: esta tela mostrava três
    // linguagens de cor ao mesmo tempo (banner emerald, barra laranja de meta,
    // chips de filtro) e nenhuma vinha do mesmo lugar.
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sucesso-foreground/25 bg-sucesso px-4 py-3">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-sucesso-foreground" />
        <div>
          <div className="corpo font-semibold text-sucesso-foreground">
            A equipe vai acompanhar {cliente.nome || "este cliente"}
          </div>
          <p className="corpo-sm text-sucesso-foreground">
            Cliente confirmado para o apoio da equipe. Os próximos passos da
            Etapa 01 (do passo 4 em diante) estão liberados.
          </p>
        </div>
      </div>
      <Link
        href={etapa1Href}
        // `outline`, não sólido: o laranja cheio é reservado a UMA ação por
        // tela e nesta o primário é "Adicionar" cliente. Dois botões laranja
        // lado a lado não dizem qual é a ação da página.
        className={buttonVariants({ variant: "outline", size: "sm" }) + " shrink-0 bg-card"}
      >
        Continuar na Etapa 01 <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}
