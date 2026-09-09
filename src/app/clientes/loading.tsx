import { PageHeader } from "@/components/ui/page-header";
import { HeaderSkeleton, ListaSkeleton } from "@/components/ui/lista-skeleton";

/**
 * O título e a linha de apoio são estáticos — já são conhecidos antes de
 * qualquer query. Só a lista é esqueleto, com a forma da lista de verdade.
 */
export default function ClientesLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 py-8">
        <PageHeader
          titulo="Clientes"
          descricao="Cadastre e acompanhe seus clientes potenciais e o contato com eles."
        />
        <ListaSkeleton linhas={6} />
      </main>
    </>
  );
}
