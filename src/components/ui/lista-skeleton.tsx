import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Esqueleto de lista, com a ALTURA REAL do card de lista do sistema
 * (`Card py-4` + `CardContent py-4` + três linhas de texto). Esqueleto de
 * altura errada é CLS, e CLS é pior que spinner.
 *
 * `role="status"` + texto `sr-only`: o leitor de tela ouve "Carregando…"; as
 * barras são `aria-hidden` porque não dizem nada.
 */
export function ListaSkeleton({
  linhas = 5,
  className,
}: {
  linhas?: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("grid gap-3", className)}
    >
      <span className="sr-only">Carregando…</span>
      {Array.from({ length: linhas }, (_, i) => (
        <Card key={i} aria-hidden>
          <CardContent className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid w-full gap-2 sm:max-w-sm">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-3.5 w-2/5" />
            </div>
            <div className="flex items-center gap-6">
              <Skeleton className="h-9 w-12" />
              <Skeleton className="h-9 w-12" />
              <Skeleton className="h-9 w-32" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Barra de esqueleto em `<span>`, para caber DENTRO de um `<h1>`/`<p>` — onde
 * o `<div>` do `Skeleton` seria conteúdo de fluxo em lugar de conteúdo de
 * frase (HTML inválido).
 */
export function SkeletonTexto({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block animate-pulse rounded-md bg-muted align-middle",
        className,
      )}
    />
  );
}

/**
 * Faixa da altura do `AppHeader` (h-16 + borda). O header é renderizado por
 * cada página, então o `loading.tsx` fica sem ele: sem esta faixa o conteúdo
 * salta 64 px para o topo e volta quando a página chega.
 */
export function HeaderSkeleton() {
  return (
    <div
      aria-hidden
      className="sticky top-0 z-20 h-16 shrink-0 border-b bg-background/95"
    />
  );
}
