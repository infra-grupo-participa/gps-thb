import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { HeaderSkeleton, SkeletonTexto } from "@/components/ui/lista-skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * O nome do cliente só existe depois da query — por isso o `h1` é uma barra
 * (`SkeletonTexto`, um `<span>`, para não pôr um `<div>` dentro de um `<h1>`).
 * O link de voltar é estático e já aparece: quem abriu a ficha errada volta à
 * lista sem esperar.
 *
 * `max-w-4xl` é a largura da ficha de verdade — não a `max-w-6xl` da lista de
 * onde a pessoa veio.
 */
export default function ClienteFichaLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-4xl px-4 pt-8 pb-16">
        <PageHeader
          voltar={
            <span className="text-sm text-muted-foreground">
              ← Voltar aos clientes
            </span>
          }
          titulo={<SkeletonTexto className="h-7 w-56 max-w-full" />}
        />
        <div role="status" aria-live="polite" className="grid gap-6">
          <span className="sr-only">Carregando a ficha…</span>

          {/* Dados do cliente: cabeçalho + grade de campos. */}
          <Card aria-hidden>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-1 h-4 w-64" />
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="grid gap-1.5">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-9 w-full rounded-lg" />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Andamento do caso: bloco de texto e ações. */}
          <Card aria-hidden>
            <CardHeader>
              <Skeleton className="h-5 w-48" />
            </CardHeader>
            <CardContent className="grid gap-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-9 w-40 rounded-lg" />
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
