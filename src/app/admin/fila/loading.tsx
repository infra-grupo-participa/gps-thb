import { PageHeader } from "@/components/ui/page-header";
import { HeaderSkeleton, ListaSkeleton } from "@/components/ui/lista-skeleton";

/** Mesma largura da página real (`max-w-4xl`), senão a coluna salta de lado. */
export default function AdminFilaLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-4xl px-4 pt-8 pb-16">
        <PageHeader
          titulo="Fila de ligações"
          descricao="Os clientes selecionados pelos parceiros para a entrevista prévia, do mais antigo para o mais recente. Ligue, registre o resultado e a linha sai da fila."
        />
        <ListaSkeleton linhas={5} />
      </main>
    </>
  );
}
