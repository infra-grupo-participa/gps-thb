import { PageHeader } from "@/components/ui/page-header";
import { HeaderSkeleton, ListaSkeleton } from "@/components/ui/lista-skeleton";

/** Mesma largura da página real (`max-w-6xl`), senão a coluna salta de lado. */
export default function AdminClientesLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 pt-8 pb-16">
        <PageHeader
          titulo="Clientes"
          descricao="Clientes dos parceiros, de todos os ambientes do programa — são dados de terceiros: nunca fizeram login no portal. Sem o registro de contato, que fica só na ficha individual do parceiro."
        />
        <ListaSkeleton linhas={6} />
      </main>
    </>
  );
}
