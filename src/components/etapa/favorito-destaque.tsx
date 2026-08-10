import Link from "next/link";
import { Star, MessageCircle, ArrowRight } from "lucide-react";
import type { ClienteEtapa1 } from "@/lib/types";
import { STATUS_CLIENTE } from "@/lib/etapa1";
import { mascaraTelefone } from "@/lib/masks";
import { linkWhatsapp } from "@/lib/whatsapp";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function FavoritoDestaque({
  cliente,
  basePath,
}: {
  cliente: ClienteEtapa1;
  basePath: string;
}) {
  const status = STATUS_CLIENTE.find((s) => s.id === cliente.status);
  const wpp = linkWhatsapp(cliente.telefone);

  return (
    <Card className="border-primary/40 bg-primary/5 shadow-sm">
      <CardContent className="pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Star className="size-5 fill-primary" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-primary">
                Cliente acompanhado pela equipe
              </div>
              <div className="text-lg font-semibold">
                {cliente.nome || "Sem nome"}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {status ? (
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-xs font-medium " + status.cor
                    }
                  >
                    {status.rotulo}
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
                        className="text-green-600 hover:text-green-700"
                      >
                        <MessageCircle className="size-4" />
                      </a>
                    ) : null}
                  </span>
                ) : null}
                {cliente.perda_inercia != null ? (
                  <span className="tabular-nums">
                    Perda: {brl.format(cliente.perda_inercia)}
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
