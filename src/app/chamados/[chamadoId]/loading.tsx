import { Card, CardContent } from "@/components/ui/card";
import { HeaderSkeleton, SkeletonTexto } from "@/components/ui/lista-skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * O assunto do chamado só existe depois da query — por isso o `h1` é uma barra
 * (`SkeletonTexto`, um `<span>`, para não pôr um `<div>` dentro de um `<h1>`).
 * O link de voltar é estático e já aparece: quem clicou por engano sai sem
 * esperar a página inteira.
 */
export default function ChamadoLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16">
        <PageHeader
          voltar={
            <span className="text-sm text-muted-foreground">
              ← Voltar aos chamados
            </span>
          }
          titulo={<SkeletonTexto className="h-7 w-64 max-w-full" />}
          descricao={<SkeletonTexto className="h-5 w-40 rounded-4xl" />}
        />
        <div role="status" aria-live="polite" className="grid gap-3">
          <span className="sr-only">Carregando…</span>
          {[0, 1].map((i) => (
            <Card key={i} aria-hidden>
              <CardContent className="grid gap-2 py-4">
                <Skeleton className="h-5 w-24 rounded-4xl" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </>
  );
}
