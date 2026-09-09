import { PageHeader } from "@/components/ui/page-header";
import { HeaderSkeleton, ListaSkeleton } from "@/components/ui/lista-skeleton";

/** Mesma largura da página real (`max-w-4xl`), senão a coluna salta de lado. */
export default function AdminChamadosLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-4xl px-4 pt-8 pb-16">
        <PageHeader
          titulo="Chamados"
          descricao="Suporte do portal. O mais parado aparece primeiro — a fila existe para ninguém ficar sem resposta."
        />
        <ListaSkeleton linhas={4} />
      </main>
    </>
  );
}
