import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { HeaderSkeleton, ListaSkeleton } from "@/components/ui/lista-skeleton";

export default function AdminLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 py-8">
        <PageHeader
          titulo="Painel do administrador"
          descricao="Gerencie os acessos e acompanhe os alunos em implementação assistida."
        />

        {/* Os 4 KPIs do topo: mesma grade e mesma altura do conteúdo real. */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Card key={i} aria-hidden>
              <CardContent className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="size-9 rounded-lg" />
                </div>
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-3 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>

        <ListaSkeleton linhas={6} />
      </main>
    </>
  );
}
