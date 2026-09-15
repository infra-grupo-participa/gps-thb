import { PageHeader } from "@/components/ui/page-header";
import { HeaderSkeleton, ListaSkeleton } from "@/components/ui/lista-skeleton";

/** Mesma largura da página real (`max-w-6xl`), senão a coluna salta de lado. */
export default function AdminAlunoTutoriaisLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 py-8">
        <PageHeader
          titulo="Tutoriais"
          descricao="Como usar o portal, passo a passo — por assunto."
        />
        <ListaSkeleton linhas={6} />
      </main>
    </>
  );
}
