import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { IconeChip } from "@/components/ui/kpi-card";
import { cn } from "@/lib/utils";

/**
 * A moldura de UM card do dashboard — a anatomia é fixa nos nove:
 *
 *   rótulo · chip           ← o que é
 *   NÚMERO MACRO · variação ← o dado que o card lidera
 *   micro                   ← a repartição do macro, em uma linha
 *   gráfico                 ← a forma do mesmo dado
 *   → link para a lista     ← o que fazer depois de ver
 *
 * 🔑 O **link é obrigatório** em todo card que tem para onde ir. Gráfico que
 * não termina numa lista filtrada de gente é ornamento, e ornamento é o que a
 * regra de otimização da casa proíbe. Os dois que não têm (atividade e grau de
 * relação) passam `link={null}` e declaram o motivo em `semLink`.
 *
 * O card NÃO é clicável por inteiro: ele contém uma tabela de valores e um
 * link: âncora dentro de âncora é HTML inválido e some do Tab. O alvo de
 * clique é o link do rodapé, com nome próprio ("Ver quem não respondeu").
 */
export function CardDashboard({
  icone,
  rotulo,
  valor,
  valorDescricao,
  destaque = false,
  variacao,
  micro,
  link,
  semLink,
  className,
  children,
}: {
  icone: React.ReactNode;
  rotulo: string;
  /** O número macro, já formatado. */
  valor: string;
  /** Texto para leitor de tela quando `valor` é abreviado ("R$ 42 mil"). */
  valorDescricao?: string;
  destaque?: boolean;
  /** `<VariacaoDoMes>`, quando o card tem comparação com o mês anterior. */
  variacao?: React.ReactNode;
  /** A repartição do macro em uma linha ("841 em prospecção · 37 em fechamento"). */
  micro: React.ReactNode;
  link?: { href: string; rotulo: string } | null;
  /** Por que este card não leva a lugar nenhum. Exigido quando `link` é nulo. */
  semLink?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Card elevacao="raised" className={cn("h-full", className)}>
      <CardContent className="flex h-full flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <span className="rotulo text-muted-foreground">{rotulo}</span>
          <IconeChip destaque={destaque}>{icone}</IconeChip>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span
            className={cn("numero-lg", destaque && "text-accent-foreground")}
          >
            {valorDescricao ? (
              <>
                <span aria-hidden>{valor}</span>
                <span className="sr-only">{valorDescricao}</span>
              </>
            ) : (
              valor
            )}
          </span>
          {variacao}
        </div>

        <p className="corpo-sm text-muted-foreground">{micro}</p>

        {children ? <div className="mt-1">{children}</div> : null}

        <div className="mt-auto pt-1">
          {link ? (
            <Link
              href={link.href}
              prefetch={false}
              className="foco-visivel inline-flex items-center gap-1 corpo-sm font-medium text-accent-foreground hover:underline"
            >
              {link.rotulo}
              <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          ) : semLink ? (
            <p className="corpo-sm text-muted-foreground/85">{semLink}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
