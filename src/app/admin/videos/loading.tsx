import { PageHeader } from "@/components/ui/page-header";
import { HeaderSkeleton, ListaSkeleton } from "@/components/ui/lista-skeleton";

/** Mesma largura da página real (`max-w-5xl`), senão a coluna salta de lado. */
export default function AdminVideosLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-5xl px-4 pt-8 pb-16">
        <PageHeader
          titulo="Vídeos"
          descricao="Gravações de reuniões e aulas, embedadas do YouTube não listado. Cadastre por aqui — sem subir arquivo, sem deploy."
        />
        <ListaSkeleton linhas={4} />
      </main>
    </>
  );
}
