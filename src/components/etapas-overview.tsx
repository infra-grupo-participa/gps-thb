import Link from "next/link";
import type { Etapa } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

/**
 * Visão geral das 6 etapas. Etapas liberadas são clicáveis; as bloqueadas
 * aparecem como "Em breve" (ou clicáveis para preview, no modo admin).
 */
export function EtapasOverview({
  etapas,
  basePath,
  pctPorEtapa = {},
  allowLockedPreview = false,
}: {
  etapas: Etapa[];
  /** "" para aluno; "/admin/aluno/<id>" para admin. */
  basePath: string;
  pctPorEtapa?: Record<number, number>;
  allowLockedPreview?: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {etapas.map((etapa) => {
        const liberada = etapa.liberada;
        const clicavel = liberada || allowLockedPreview;
        const href = `${basePath}/etapa/${etapa.id}`;
        const pct = pctPorEtapa[etapa.id];

        const conteudo = (
          <Card
            className={
              "h-full transition " +
              (clicavel
                ? "hover:border-primary/50 hover:shadow-sm"
                : "opacity-70")
            }
          >
            <CardContent className="flex h-full flex-col gap-3 pt-6">
              <div className="flex items-start justify-between gap-2">
                <div
                  className={
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold " +
                    (liberada
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground")
                  }
                >
                  {etapa.ordem}
                </div>
                {liberada ? (
                  <Badge variant="secondary">Disponível</Badge>
                ) : (
                  <Badge variant="outline">Em breve</Badge>
                )}
              </div>

              <div className="flex-1">
                <h3 className="text-sm font-semibold leading-tight">
                  {etapa.nome}
                </h3>
                {etapa.descricao ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {etapa.descricao}
                  </p>
                ) : null}
              </div>

              {liberada && pct != null ? (
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Progresso</span>
                    <span>{pct}%</span>
                  </div>
                  <Progress value={pct} />
                </div>
              ) : null}
            </CardContent>
          </Card>
        );

        return clicavel ? (
          <Link key={etapa.id} href={href} className="block">
            {conteudo}
          </Link>
        ) : (
          <div key={etapa.id}>{conteudo}</div>
        );
      })}
    </div>
  );
}
