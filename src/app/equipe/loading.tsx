import { PageHeader } from "@/components/ui/page-header";
import { HeaderSkeleton, ListaSkeleton } from "@/components/ui/lista-skeleton";

/**
 * Título e linha de apoio são estáticos; só a lista de membros é esqueleto,
 * na MESMA largura da página real (`max-w-3xl`) — esqueleto de largura
 * errada faz a coluna saltar de lado quando o conteúdo chega (CLS).
 */
export default function EquipeLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16">
        <PageHeader
          titulo="Equipe"
          descricao="Quem compartilha este ambiente com você — os mesmos clientes, tarefas e progresso."
        />
        <ListaSkeleton linhas={2} />
      </main>
    </>
  );
}
