import { PageHeader } from "@/components/ui/page-header";
import { HeaderSkeleton, SkeletonTexto } from "@/components/ui/lista-skeleton";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Mesma largura da página real (`max-w-6xl`), senão a coluna salta de lado.
 * Ficha única (link/preview da pasta do Drive) — `SkeletonTexto`, não
 * `ListaSkeleton` (não é lista de itens repetidos).
 */
export default function PastaLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 pt-8 pb-16">
        <PageHeader
          titulo="Minha pasta"
          descricao="Aqui fica a sua pasta de documentos no Drive, criada pela equipe durante a implementação."
        />
        <Card>
          <CardContent role="status" aria-live="polite" className="grid gap-3">
            <span className="sr-only">Carregando…</span>
            <SkeletonTexto className="h-6 w-1/3" />
            <SkeletonTexto className="h-[520px] w-full" />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
