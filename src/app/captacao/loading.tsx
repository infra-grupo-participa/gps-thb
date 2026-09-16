import { PageHeader } from "@/components/ui/page-header";
import { HeaderSkeleton, SkeletonTexto } from "@/components/ui/lista-skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Mesma largura da página real (`max-w-3xl`), senão a coluna salta de lado.
 * Portal do parceiro (aluno) ou admin — o header real muda de nav conforme o
 * papel da sessão, indisponível aqui; `HeaderSkeleton` fica genérico, como
 * nas demais telas.
 */
export default function CaptacaoLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16">
        <PageHeader
          titulo="Portal de Captação"
          acao={<Badge variant="outline">Em breve</Badge>}
        />
        <Card>
          <CardContent role="status" aria-live="polite">
            <span className="sr-only">Carregando…</span>
            <SkeletonTexto className="h-4 w-full" />
            <SkeletonTexto className="mt-2 h-4 w-4/5" />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
