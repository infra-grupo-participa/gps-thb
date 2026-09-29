import { HeaderSkeleton } from "@/components/ui/lista-skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Enquanto a página confere elegibilidade e grade. Esqueleto com a forma da
 * grade (dia + 3 horários) e o rodapé de saídas — nunca spinner centralizado
 * (regra do projeto desde 09/09). Largura e título iguais aos de `page.tsx`
 * para a chegada do conteúdo não empurrar a tela.
 */
export default function AgendarPreliminarLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16">
        <PageHeader titulo="Marque a Reunião Preliminar" />
        <div role="status" aria-live="polite" className="grid gap-6">
          <span className="sr-only">Conferindo os horários da equipe…</span>
          <div aria-hidden className="grid gap-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-4 w-56" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-4 py-2.5">
                <Skeleton className="h-5 w-64" />
                <Skeleton className="h-8 w-32" />
              </div>
            ))}
          </div>
          <div aria-hidden className="flex gap-2 border-t border-borda-fina pt-4">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-9 w-40" />
          </div>
        </div>
      </main>
    </>
  );
}
