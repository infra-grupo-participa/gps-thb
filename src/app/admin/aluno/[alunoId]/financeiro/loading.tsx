import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import {
  HeaderSkeleton,
  SkeletonTexto,
} from "@/components/ui/lista-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * O nome do parceiro só existe depois da query — o título leva uma barra
 * (`SkeletonTexto`). O link "voltar" e a descrição são estáticos. Os cards
 * têm a FORMA dos de verdade (hero do faturamento + card do contrato), mesmo
 * desenho de `src/app/financeiro/loading.tsx` — esqueleto de altura errada é
 * CLS, e CLS é pior que spinner.
 *
 * Dois cards, não quatro: a lista de contratos fechados e o extrato só
 * existem quando há dado. `max-w-3xl` é a largura real da página.
 */
export default function AdminAlunoFinanceiroLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16">
        <PageHeader
          voltar={
            <span className="text-sm text-muted-foreground">
              ← Voltar ao ambiente do parceiro
            </span>
          }
          titulo={<SkeletonTexto className="h-7 w-64 max-w-full" />}
          descricao="Faturamento do parceiro na mentoria e o contrato do programa, lido do cadastro financeiro do Grupo Participa. Somente leitura — o portal não edita esses valores. O sócio do ambiente não vê esta aba."
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
