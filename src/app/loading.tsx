import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { HeaderSkeleton } from "@/components/ui/lista-skeleton";

/**
 * Início do aluno. O esqueleto espelha a FORMA da página (`HomeAluno`):
 * saudação, próximo passo, fileira de números, os dois atalhos e a trilha das
 * 6 etapas. Sem spinner central — esqueleto de forma errada gera salto de
 * layout na troca.
 */
export default function HomeLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo"
        role="status"
        aria-live="polite"
        className="mx-auto w-full max-w-6xl px-4 pt-6 pb-16"
      >
        <span className="sr-only">Carregando seu início…</span>

        <div aria-hidden className="mb-6 grid gap-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-5 w-72" />
        </div>

        <Skeleton aria-hidden className="h-24 w-full rounded-2xl" />

        <div aria-hidden className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Card key={i}>
              <CardContent className="grid gap-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-4 w-14" />
              </CardContent>
            </Card>
          ))}
        </div>

        <div aria-hidden className="mt-6 grid gap-3 sm:grid-cols-2 sm:gap-4">
          {Array.from({ length: 2 }, (_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>

        <div aria-hidden className="mt-10">
          <Skeleton className="h-5 w-32" />
          <div className="mt-4 grid gap-2 lg:grid-cols-6 lg:gap-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl lg:h-28" />
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
