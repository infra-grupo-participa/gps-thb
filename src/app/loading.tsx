import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { HeaderSkeleton } from "@/components/ui/lista-skeleton";

/**
 * Início do aluno. A home não tem `h1` (a identidade vem do `PerfilHero`),
 * então o esqueleto espelha a FORMA da página: hero, "continue de onde parou"
 * e a grade de 2 colunas (jornada + coluna de apoio). Sem spinner central —
 * esqueleto de forma errada gera salto de layout na troca.
 */
export default function HomeLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo"
        role="status"
        aria-live="polite"
        className="mx-auto w-full max-w-6xl px-4 py-8"
      >
        <span className="sr-only">Carregando seu início…</span>

        <Skeleton aria-hidden className="h-32 w-full rounded-xl" />

        <Card aria-hidden className="mt-6">
          <CardContent className="grid gap-2">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-5 w-3/5" />
            <Skeleton className="h-9 w-40 rounded-lg" />
          </CardContent>
        </Card>

        <div aria-hidden className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Skeleton className="h-4 w-28" />
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 6 }, (_, i) => (
                <Card key={i}>
                  <CardContent className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <Skeleton className="size-9 rounded-lg" />
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </div>
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-3 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <aside className="lg:col-span-1">
            <Card>
              <CardContent className="grid gap-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-2 w-full rounded-full" />
                {Array.from({ length: 3 }, (_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="size-9 rounded-lg" />
                    <div className="grid flex-1 gap-1.5">
                      <Skeleton className="h-3.5 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                    <Skeleton className="h-5 w-12" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </aside>
        </div>
      </main>
    </>
  );
}
