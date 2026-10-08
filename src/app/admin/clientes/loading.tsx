import { PageHeader } from "@/components/ui/page-header";
import { HeaderSkeleton, ListaSkeleton } from "@/components/ui/lista-skeleton";

/** Mesma largura da página real (`max-w-pagina`), senão a coluna salta de lado. */
export default function AdminClientesLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-pagina px-4 pt-8 pb-16">
        <PageHeader
          titulo="Clientes"
        />
        <ListaSkeleton linhas={6} />
      </main>
    </>
  );
}
