import { PageHeader } from "@/components/ui/page-header";
import { HeaderSkeleton, ListaSkeleton } from "@/components/ui/lista-skeleton";

/**
 * A página real usa `max-w-4xl` (não `6xl`) — o esqueleto tem de nascer na
 * mesma largura, senão a coluna salta de lado quando o conteúdo chega.
 */
export default function DiarioLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-4xl px-4 pt-8 pb-16">
        <PageHeader
          titulo="Diário do parceiro"
        />
        <ListaSkeleton linhas={6} />
      </main>
    </>
  );
}
