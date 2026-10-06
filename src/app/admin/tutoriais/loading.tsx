import { PageHeader } from "@/components/ui/page-header";
import { HeaderSkeleton, ListaSkeleton } from "@/components/ui/lista-skeleton";

/** Mesma largura da página real (`max-w-5xl`), senão a coluna salta de lado. */
export default function AdminTutoriaisLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-5xl px-4 pt-8 pb-16">
        <PageHeader
          titulo="Tutoriais"
        />
        <ListaSkeleton linhas={4} />
      </main>
    </>
  );
}
