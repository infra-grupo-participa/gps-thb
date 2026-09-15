import { PageHeader } from "@/components/ui/page-header";
import { HeaderSkeleton, ListaSkeleton } from "@/components/ui/lista-skeleton";

/** Esqueleto com a altura real do card, nunca spinner centralizado. */
export default function TutoriaisLoading() {
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
