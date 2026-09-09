import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Chip de ícone da marca — UM tamanho e UMA cor para o sistema inteiro.
 *
 * O mesmo bloco existia copiado em 4 lugares, em dois tamanhos (`size-8` e
 * `size-9`). Fica `size-9`. É decorativo: o rótulo em texto está sempre ao
 * lado, então `aria-hidden` evita ruído no leitor de tela.
 */
export function IconeChip({
  children,
  destaque,
  className,
}: {
  children: React.ReactNode;
  destaque?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg [&>svg]:size-4",
        destaque
          ? "bg-primary text-primary-foreground"
          : "bg-primary/10 text-primary",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Card de número — rótulo, chip de ícone, valor e auxílio.
 * Absorve o antigo `StatCard` (`src/components/stat-card.tsx`).
 */
export function KpiCard({
  icone,
  rotulo,
  valor,
  hint,
  destaque,
  className,
}: {
  icone: React.ReactNode;
  rotulo: string;
  valor: string;
  hint?: string;
  destaque?: boolean;
  className?: string;
}) {
  return (
    <Card className={cn("transition hover:shadow-sm", className)}>
      {/* Sem `pt-*` aqui: o `Card` já paga `py-(--card-spacing)`. */}
      <CardContent>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {rotulo}
          </span>
          <IconeChip destaque={destaque}>{icone}</IconeChip>
        </div>
        <div
          className={cn(
            "mt-2 text-2xl font-semibold tabular-nums",
            destaque && "text-primary",
          )}
        >
          {valor}
        </div>
        {hint ? (
          <div className="text-xs text-muted-foreground">{hint}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * Mesma informação em uma LINHA, para quando vários números dividem um card
 * só (a coluna de apoio da home). Absorve o `Linha` interno de `home-resumo`.
 */
export function KpiLinha({
  icone,
  rotulo,
  valor,
  hint,
}: {
  icone: React.ReactNode;
  rotulo: string;
  valor: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <IconeChip>{icone}</IconeChip>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{rotulo}</div>
        {hint ? (
          <div className="text-xs text-muted-foreground">{hint}</div>
        ) : null}
      </div>
      <div className="shrink-0 text-lg font-semibold tabular-nums">{valor}</div>
    </div>
  );
}
