import { PageHeader } from "@/components/ui/page-header";
import {
  HeaderSkeleton,
  ListaSkeleton,
  SkeletonTexto,
} from "@/components/ui/lista-skeleton";

/**
 * O nome da etapa só existe depois da query, então o título é uma barra de
 * esqueleto DENTRO do `h1` (`SkeletonTexto` é `<span>` — um `<div>` ali seria
 * HTML inválido). O link "voltar" é estático e já fica clicável.
 */
export default function EtapaLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 py-8">
        <PageHeader
          voltar={
            <span className="text-sm text-muted-foreground">
              ← Voltar ao início
            </span>
          }
          titulo={<SkeletonTexto className="h-7 w-72 max-w-full" />}
        />
        <ListaSkeleton linhas={5} />
      </main>
    </>
  );
}
