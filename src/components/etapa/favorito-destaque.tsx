import Link from "next/link";
import { Star, MessageCircle, ArrowRight } from "lucide-react";
import type { ClienteEtapa1 } from "@/lib/types";
import { FASES_CLIENTE } from "@/lib/etapa1";
import { formatarData } from "@/lib/datas";
import { mascaraTelefone } from "@/lib/masks";
import { brl } from "@/lib/moeda";
import { linkWhatsapp } from "@/lib/whatsapp";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export function FavoritoDestaque({
  cliente,
  basePath,
}: {
  cliente: ClienteEtapa1;
  basePath: string;
}) {
  const fase = FASES_CLIENTE.find((f) => f.id === cliente.fase);
  const wpp = linkWhatsapp(cliente.telefone);

  return (
    <Card className="border-primary/40 bg-primary/5 shadow-sm">
      <CardContent>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Star className="size-5 fill-primary" />
            </div>
            <div>
              <div className="rotulo text-accent-foreground">
                Cliente acompanhado pela equipe
              </div>
              <div className="text-lg font-semibold">
                {cliente.nome || "Sem nome"}
              </div>
              {/* A equipe ASSUMIU o acompanhamento (migração ...203) — não é a
                  mesma coisa que o aluno ter escolhido a estrela. Card só
                  informativo: o que fazer a respeito mora na ficha. */}
              {cliente.acompanhamento_confirmado_em ? (
                <p className="mt-1 corpo-sm font-medium text-sucesso-foreground">
                  A equipe está acompanhando este cliente desde{" "}
                  {formatarData(cliente.acompanhamento_confirmado_em)}.
                </p>
              ) : null}
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {fase ? (
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-xs font-medium " + fase.cor
                    }
                    title={fase.ajuda}
                  >
                    {fase.rotulo}
                  </span>
                ) : null}
                {cliente.telefone ? (
                  <span className="inline-flex items-center gap-1">
                    {mascaraTelefone(cliente.telefone)}
                    {wpp ? (
                      <a
                        href={wpp}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Abrir no WhatsApp"
                        className="foco-visivel rounded-sm text-sucesso-foreground hover:opacity-80"
                      >
                        <MessageCircle className="size-4" />
                      </a>
                    ) : null}
                  </span>
                ) : null}
                {/* "Perda: R$ ..." (perda pela inércia) REMOVIDA por decisão
                    do Marcio (10/09/2026) — o conceito saiu do sistema. */}
                {/* Honorários só quando existem. `null` NÃO vira R$ 0,00:
                    dizer "R$ 0,00" a quem ainda não registrou nada é afirmar
                    um faturamento que o portal não conhece. */}
                {cliente.valor_honorarios != null ? (
                  <span
                    className="tabular-nums"
                    title={
                      cliente.fase === "contratado"
                        ? "Honorários contratados — contam na meta do ambiente"
                        : "Honorários registrados — não contam na meta fora de Contratado"
                    }
                  >
                    Honorários: {brl(cliente.valor_honorarios)}
                    {cliente.fase === "contratado" ? null : " (fora da meta)"}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <Link
            href={`${basePath}/clientes/${cliente.id}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Abrir ficha <ArrowRight className="size-4" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
