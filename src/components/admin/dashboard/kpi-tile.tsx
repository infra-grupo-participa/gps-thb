import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Um tile da **faixa de KPIs** do topo da Visão geral — o macro do programa
 * em seis números, sem gráfico nenhum.
 *
 * 🔑 Por que ele existe ao lado de `CardDashboard`: os nove cards de 10/09
 * tinham todos o mesmo peso, e macro e micro disputavam a mesma atenção
 * ("nove cards iguais em grade 3×3 sem hierarquia", diagnóstico de 11/09). A
 * faixa passa a ser a primeira leitura — número grande, percentual ao lado,
 * uma linha de contexto e o destino — e os gráficos vêm depois, grandes.
 *
 * Anatomia fixa:
 *
 *   rótulo pequeno              ← o que é
 *   NÚMERO  ·  %                ← o dado, e de quanto ele é
 *   contexto OU variação        ← UMA linha, sempre numérica
 *   → link para a lista         ← o que fazer depois de ver
 *
 * 🔴 `pct` é `number | null`, e `null` vira **"—"**. Denominador zero não
 * produz "0%" (afirmação sobre conjunto vazio) nem `NaN%` — a conta está em
 * `graficos/tipos.ts:pctDe`.
 *
 * Sem `IconeChip`: seis chips em fila competiriam com os seis números, e o
 * chip é o vocabulário dos cards de gráfico, onde ele separa assuntos.
 */
export function KpiTile({
  rotulo,
  valor,
  pct,
  destaque = false,
  variacao,
  contexto,
  link,
}: {
  rotulo: string;
  /** O número macro, já formatado. */
  valor: string;
  /** O quanto ele representa do próprio universo. `null` → "—". */
  pct?: number | null;
  destaque?: boolean;
  /** `<VariacaoDoMes compacto>`, quando o tile tem comparação com o mês anterior. */
  variacao?: React.ReactNode;
  /** UMA linha curta, numérica. Ex.: "de 159 · 19 sem login". */
  contexto?: string;
  link: { href: string; rotulo: string };
}) {
  return (
    <Card elevacao="raised" className="h-full">
      <CardContent className="flex h-full flex-col gap-1">
        {/* `min-h-8` = duas linhas de rótulo reservadas: sem isso, o tile
            cujo nome quebra ("Ativos nos últimos 30 dias") empurra o número
            para baixo e os seis macros deixam de compartilhar a mesma linha de
            base — que é o que faz a faixa ser lida de uma vez. */}
        <span className="rotulo flex min-h-8 items-start text-muted-foreground">
          {rotulo}
        </span>

        <div className="flex flex-wrap items-baseline gap-x-2">
          <span
            className={cn("numero-lg", destaque && "text-accent-foreground")}
          >
            {valor}
          </span>
          {pct !== undefined ? (
            <span className="numero corpo-sm font-semibold text-muted-foreground">
              {pct === null ? "—" : `${pct}%`}
            </span>
          ) : null}
        </div>

        {variacao}
        {contexto ? (
          <p className="corpo-sm text-muted-foreground">{contexto}</p>
        ) : null}

        <div className="mt-auto pt-2">
          <Link
            href={link.href}
            prefetch={false}
            className="foco-visivel inline-flex items-center gap-1 rounded-sm corpo-sm font-medium text-accent-foreground hover:underline"
          >
            {link.rotulo}
            <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
