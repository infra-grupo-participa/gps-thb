import Link from "next/link";
import { Lock, ArrowRight } from "lucide-react";
import type { Etapa } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { IconeChip } from "@/components/ui/kpi-card";
import { cn } from "@/lib/utils";

/**
 * Visão geral das 6 etapas. Etapas liberadas são clicáveis; as bloqueadas
 * aparecem como "Em breve" (ou clicáveis para preview, no modo admin).
 */
export function EtapasOverview({
  etapas,
  basePath,
  pctPorEtapa = {},
  allowLockedPreview = false,
  dense = false,
}: {
  etapas: Etapa[];
  /** "" para aluno; "/admin/aluno/<id>" para admin. */
  basePath: string;
  pctPorEtapa?: Record<number, number>;
  allowLockedPreview?: boolean;
  /** Layout compacto (2 colunas) para caber dentro de uma coluna de conteúdo. */
  dense?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid gap-4",
        dense ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3",
      )}
    >
      {etapas.map((etapa) => {
        const liberada = etapa.liberada;
        const clicavel = liberada || allowLockedPreview;
        const href = `${basePath}/etapa/${etapa.id}`;
        const pct = pctPorEtapa[etapa.id];

        const conteudo = (
          // VIS3: a etapa bloqueada NÃO recebe mais `opacity-70` no card
          // inteiro — isso derrubava junto o contraste do título, do badge e
          // da descrição. Agora o estado é dito por FORMA (borda tracejada,
          // fundo apagado, chip neutro), que não custa contraste nenhum, e
          // todo o texto continua legível.
          <Card
            className={cn(
              "h-full transition",
              clicavel
                ? "hover:border-primary/50 hover:shadow-sm"
                : "border-dashed bg-muted/20",
            )}
          >
            <CardContent className="flex h-full flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <IconeChip
                  destaque={liberada}
                  // O número da etapa é conteúdo: não aparece em nenhum outro
                  // lugar do card, então não pode ser `aria-hidden`.
                  decorativo={false}
                  className={cn(
                    "text-sm font-semibold",
                    !liberada && "bg-muted text-muted-foreground",
                  )}
                >
                  {etapa.ordem}
                </IconeChip>
                {liberada ? (
                  <Badge variant="secondary">Disponível</Badge>
                ) : (
                  <Badge variant="outline" className="gap-1">
                    <Lock className="size-3" /> Em breve
                  </Badge>
                )}
              </div>

              {/* Sem `opacity-*` nenhuma aqui, de propósito: `muted-foreground`
                  sobre o card já está em 4,83:1, e qualquer opacidade o
                  derruba para ~3,3:1 — reprova AA. O estado bloqueado é dito
                  pela borda tracejada, pelo fundo, pelo chip apagado, pelo
                  badge "Em breve" e pela linha de expectativa abaixo. */}
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

              {clicavel ? (
                <div className="flex items-center gap-1 text-xs font-medium text-accent-foreground">
                  Abrir <ArrowRight className="size-3" />
                </div>
              ) : (
                // Microcopy de expectativa VERDADEIRA: `gps.etapas` não tem
                // campo de previsão, então não existe data a prometer. Ocupa
                // o mesmo lugar do "Abrir →" para os cards ficarem alinhados.
                <p className="text-xs text-muted-foreground">
                  Libera conforme sua turma avança
                </p>
              )}
            </CardContent>
          </Card>
        );

        return clicavel ? (
          <Link key={etapa.id} href={href} className="block">
            {conteudo}
          </Link>
        ) : (
          // Não é clicável e não recebe foco: `aria-disabled` diz ao leitor de
          // tela o que a borda tracejada diz ao olho.
          <div key={etapa.id} aria-disabled="true">
            {conteudo}
          </div>
        );
      })}
    </div>
  );
}
