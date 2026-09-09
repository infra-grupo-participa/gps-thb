import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { HeaderSkeleton } from "@/components/ui/lista-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * O título e a linha de apoio são estáticos — já são conhecidos antes de
 * qualquer query. Só os cards são esqueleto, com a FORMA dos de verdade
 * (hero do faturamento + card do contrato): esqueleto de altura errada é CLS,
 * e CLS é pior que spinner.
 *
 * Dois cards, não quatro. A lista de contratos fechados e o extrato só
 * existem quando há dado (a maioria dos ambientes ainda não tem contratado
 * com valor) — desenhá-los aqui encolheria a tela na chegada no caso comum.
 * Um card de contrato só: 0 alunos com contrato duplicado, 2 com um segundo
 * produto.
 */
export default function FinanceiroLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16">
        <PageHeader
          titulo="Financeiro"
          descricao="Quanto você já faturou na mentoria e como está o pagamento do seu programa."
        />
        <div role="status" aria-live="polite" className="grid gap-6">
          <span className="sr-only">Carregando…</span>

          {/* Hero: rótulo + número grande + frase + barra + apoio. */}
          <Card aria-hidden className="ring-primary/20">
            <CardContent className="grid gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="grid gap-1.5">
                  <Skeleton className="h-3.5 w-48" />
                  <Skeleton className="h-4 w-56" />
                </div>
                <Skeleton className="size-9 rounded-lg" />
              </div>
              <Skeleton className="h-11 w-56" />
              <Skeleton className="h-5 w-64" />
              <div>
                <Skeleton className="h-2.5 w-full rounded-full" />
                <div className="mt-1.5 flex justify-between">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-28" />
                </div>
              </div>
              <Skeleton className="h-4 w-52" />
            </CardContent>
          </Card>

          {/* "Seu programa": título de seção + card do contrato. */}
          <div className="grid gap-3">
            <Skeleton className="h-4 w-32" />
            <Card aria-hidden>
              <CardHeader>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="mt-1 h-5 w-24 rounded-4xl" />
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <Skeleton className="h-8 w-48" />
                  <Skeleton className="h-2 w-full rounded-full" />
                  <Skeleton className="h-5 w-40" />
                </div>
                <div className="grid gap-2 border-t pt-4">
                  <Skeleton className="h-5 w-56" />
                  <Skeleton className="h-5 w-44" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </>
  );
}
