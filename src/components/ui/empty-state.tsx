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
    // `raised`: o vazio é uma peça inteira, não mais um item da lista. Antes
    // ficava plano no meio de outros cards planos e parecia falha de carga.
    <Card
      elevacao="raised"
      className={cn("[--card-spacing:--spacing(10)]", className)}
    >
      <CardContent className="grid justify-items-center gap-4 text-center">
        {icone ? (
          <span
            aria-hidden
            className="flex size-12 items-center justify-center rounded-full bg-superficie-afundada text-muted-foreground [&>svg]:size-6"
          >
            {icone}
          </span>
        ) : null}
        <div className="grid max-w-[52ch] gap-1.5">
          <p className="font-heading titulo-h2 text-foreground">{titulo}</p>
          {descricao ? (
            <p className="corpo text-muted-foreground">{descricao}</p>
          ) : null}
        </div>
        {acao ? (
          <div className="mt-1 flex flex-wrap justify-center gap-2">{acao}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}
