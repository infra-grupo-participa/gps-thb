import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Estado vazio padrão.
 *
 * Microcopy com saída: `titulo` diz o que aconteceu, `descricao` diz o que
 * fazer, `acao` é o caminho. Vazio sem saída é beco sem saída.
 *
 * O respiro vem de `--card-spacing` no `Card`, nunca de um `p-10` colado no
 * `CardContent` — que somaria ao padding vertical que o `Card` já paga (VIS1).
 */
export function EmptyState({
  icone,
  titulo,
  descricao,
  acao,
  className,
}: {
  icone?: React.ReactNode;
  titulo: React.ReactNode;
  descricao?: React.ReactNode;
  acao?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("[--card-spacing:--spacing(8)]", className)}>
      <CardContent className="grid justify-items-center gap-3 text-center">
        {icone ? (
          <span
            aria-hidden
            className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground [&>svg]:size-5"
          >
            {icone}
          </span>
        ) : null}
        <div className="grid max-w-prose gap-1">
          <p className="font-medium text-foreground">{titulo}</p>
          {descricao ? (
            <p className="text-sm text-muted-foreground">{descricao}</p>
          ) : null}
        </div>
        {acao ? (
          <div className="flex flex-wrap justify-center gap-2">{acao}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}
