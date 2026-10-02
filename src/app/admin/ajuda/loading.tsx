import { PageHeader } from "@/components/ui/page-header";
import { HeaderSkeleton, ListaSkeleton } from "@/components/ui/lista-skeleton";

/** Mesma largura da página real (`max-w-5xl`), senão a coluna salta de lado. */
export default function AdminAjudaLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-5xl px-4 pt-8 pb-16">
        <PageHeader
          titulo="Ajuda"
          descricao="Os artigos do “Como faço?” do parceiro: em que tela aparecem, quantas vezes foram lidos e se resolveram."
        />
        <ListaSkeleton linhas={5} />
      </main>
    </>
  );
}
