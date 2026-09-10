"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import type { ClienteEtapa1 } from "@/lib/types";
import { formatarData } from "@/lib/datas";
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
          {/* Dois estados, duas frases: a escolha do ALUNO (reversível) e o
              acompanhamento que a EQUIPE assumiu (§B.5) — o segundo tem data e
              tranca a troca. Uma frase só para os dois esconderia justamente o
              que mudou para quem está lendo. */}
          <div className="corpo font-semibold text-sucesso-foreground">
            {cliente.acompanhamento_confirmado_em
              ? `A equipe está acompanhando ${cliente.nome || "este cliente"}`
              : `A equipe vai acompanhar ${cliente.nome || "este cliente"}`}
          </div>
          <p className="corpo-sm text-sucesso-foreground">
            {cliente.acompanhamento_confirmado_em ? (
              <>
                Acompanhamento assumido pela equipe em{" "}
                {formatarData(cliente.acompanhamento_confirmado_em)}. A troca do
                cliente passa pela equipe — abra a ficha para ver como. Os passos
                4 a 8 da Etapa 01 seguem liberados.
              </>
            ) : (
              <>
                Cliente confirmado para o apoio da equipe. Os próximos passos da
                Etapa 01 (do passo 4 em diante) estão liberados.
              </>
            )}
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
