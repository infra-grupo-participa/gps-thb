import { PageHeader } from "@/components/ui/page-header";
import {
  HeaderSkeleton,
  ListaSkeleton,
  SkeletonTexto,
} from "@/components/ui/lista-skeleton";

/**
 * O nome do parceiro só existe depois da query — o título leva uma barra
 * (`SkeletonTexto`, um `<span>` dentro do `h1`). `max-w-6xl` é a largura da
 * página real, senão a coluna salta de lado quando o conteúdo chega.
 */
export default function AdminAlunoClientesLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 pt-8 pb-16">
        <PageHeader
          titulo={<SkeletonTexto className="h-7 w-64 max-w-full" />}
          descricao="Gerencie os clientes e documentos no ambiente do parceiro."
        />
        <ListaSkeleton linhas={6} />
      </main>
    </>
  );
}
