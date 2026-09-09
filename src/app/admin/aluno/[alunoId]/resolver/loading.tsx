import { PageHeader } from "@/components/ui/page-header";
import { HeaderSkeleton } from "@/components/ui/lista-skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esqueleto da Central com a ALTURA REAL do checklist: a barra de contagem
 * (card `raised`) e seis seções de 3 linhas, do tamanho da linha de verdade
 * (badge de 24 px + rótulo + auxílio). Nunca spinner centralizado — esqueleto
 * de altura errada é CLS, e CLS é pior que spinner.
 *
 * `max-w-4xl` é a largura da página real: um esqueleto mais largo faria a
 * coluna saltar de lado quando o conteúdo chegasse.
 */
function LinhaSkeleton() {
  return (
    <div className="flex gap-3 border-b border-borda-fina py-3 last:border-b-0">
      <Skeleton className="h-6 w-24 shrink-0 rounded-4xl" />
      <div className="grid w-full gap-2">
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-3.5 w-3/5" />
      </div>
    </div>
  );
}

export default function ResolverLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-4xl px-4 py-8">
        <PageHeader
          eyebrow="Central de resolução"
          titulo="Resolver"
          descricao="O que está travando este ambiente, na ordem do socorro: sem login, nada mais importa. Cada linha traz o dado que sustenta o diagnóstico."
        />

        <div role="status" aria-live="polite">
          <span className="sr-only">Conferindo o ambiente…</span>

          <Card elevacao="raised" className="mb-6" aria-hidden>
            <CardContent className="flex items-center justify-between gap-4">
              <div className="grid w-full max-w-sm gap-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3.5 w-1/2" />
              </div>
              <Skeleton className="h-9 w-32 shrink-0" />
            </CardContent>
          </Card>

          <div className="ritmo-secao" aria-hidden>
            {Array.from({ length: 6 }, (_, s) => (
              <section key={s}>
                <div className="flex items-center gap-3">
                  <Skeleton className="size-6 shrink-0 rounded-md" />
                  <Skeleton className="h-5 w-48" />
                </div>
                <div className="mt-4 border-t border-borda-fina">
                  {Array.from({ length: 3 }, (_, l) => (
                    <LinhaSkeleton key={l} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
