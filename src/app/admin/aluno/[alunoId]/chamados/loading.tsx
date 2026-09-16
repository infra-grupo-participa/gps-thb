import { PageHeader } from "@/components/ui/page-header";
import {
  HeaderSkeleton,
  ListaSkeleton,
  SkeletonTexto,
} from "@/components/ui/lista-skeleton";

/**
 * O nome do parceiro só existe depois da query — o título leva uma barra
 * (`SkeletonTexto`, um `<span>` dentro do `h1`). O link "voltar" é estático.
 * `max-w-3xl` é a largura da página real (a mesma de `/chamados`).
 */
export default function AdminAlunoChamadosLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16">
        <PageHeader
          voltar={
            <span className="text-sm text-muted-foreground">
              ← Voltar ao ambiente do parceiro
            </span>
          }
          titulo={<SkeletonTexto className="h-7 w-64 max-w-full" />}
          descricao="Todos os chamados deste ambiente, abertos e fechados. Responder e fechar acontece na thread."
        />
        <ListaSkeleton linhas={3} />
      </main>
    </>
  );
}
