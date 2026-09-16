import { PageHeader } from "@/components/ui/page-header";
import { HeaderSkeleton, ListaSkeleton } from "@/components/ui/lista-skeleton";

/** Mesma largura da página real (`max-w-3xl`), senão a coluna salta de lado. */
export default function AdminOperadoresLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16">
        <PageHeader
          titulo="Operadores"
          descricao="Quem está ativo aqui vê a fila de ligações e o dossiê de qualquer cliente — o advogado que conduz a reunião preliminar e o operador que liga são o mesmo papel."
        />
        <ListaSkeleton linhas={4} />
      </main>
    </>
  );
}
