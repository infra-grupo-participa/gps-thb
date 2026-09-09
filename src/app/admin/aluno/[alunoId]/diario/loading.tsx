import { PageHeader } from "@/components/ui/page-header";
import { HeaderSkeleton, ListaSkeleton } from "@/components/ui/lista-skeleton";

/**
 * A página real usa `max-w-4xl` (não `6xl`) — o esqueleto tem de nascer na
 * mesma largura, senão a coluna salta de lado quando o conteúdo chega.
 */
export default function DiarioLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main className="mx-auto w-full max-w-4xl px-4 py-8">
        <PageHeader
          titulo="Diário do aluno"
          descricao="Trilha única: o que o aluno fez no portal e o que a equipe observou, combinou ou deixou pendente. Visível só para o admin."
        />
        <ListaSkeleton linhas={6} />
      </main>
    </>
  );
}
