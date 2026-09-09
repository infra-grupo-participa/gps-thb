import { PageHeader } from "@/components/ui/page-header";
import { HeaderSkeleton, ListaSkeleton } from "@/components/ui/lista-skeleton";

/**
 * Título e linha de apoio são estáticos — já se conhecem antes de qualquer
 * query. Só a lista é esqueleto, e na MESMA largura da página real
 * (`max-w-3xl`): esqueleto de largura errada faz a coluna saltar de lado
 * quando o conteúdo chega, que é CLS.
 */
export default function ChamadosLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16">
        <PageHeader
          titulo="Suporte"
          descricao="Fale com a equipe por aqui. Abra um chamado, acompanhe a resposta e feche quando resolver."
        />
        <ListaSkeleton linhas={3} />
      </main>
    </>
  );
}
