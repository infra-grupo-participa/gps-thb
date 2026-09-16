import { HeaderSkeleton, SkeletonTexto } from "@/components/ui/lista-skeleton";

/**
 * Mesma largura da página real (`max-w-3xl`), senão a coluna salta de lado.
 * Ficha de UM cliente (dossiê) — `SkeletonTexto` em blocos, não `ListaSkeleton`
 * (não é lista).
 */
export default function DossieDoClienteLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16">
        <div className="mb-8">
          <p className="mb-1 rotulo text-accent-foreground">
            Dossiê para a reunião preliminar
          </p>
          <h1 className="font-heading titulo-h1 text-balance">
            <SkeletonTexto className="h-7 w-56" />
          </h1>
        </div>
        <div className="grid gap-4" role="status" aria-live="polite">
          <span className="sr-only">Carregando…</span>
          <SkeletonTexto className="h-24 w-full" />
          <SkeletonTexto className="h-24 w-full" />
          <SkeletonTexto className="h-40 w-full" />
        </div>
      </main>
    </>
  );
}
