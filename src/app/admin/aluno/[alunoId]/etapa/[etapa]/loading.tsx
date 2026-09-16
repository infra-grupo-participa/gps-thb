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
 *
 * `max-w-6xl` + `py-8` (não `pt-8 pb-16`) é a forma exata da página real —
 * a mesma da irmã do aluno (`src/app/etapa/[etapa]/loading.tsx`).
 */
export default function AdminAlunoEtapaLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 py-8">
        <PageHeader
          voltar={
            <span className="text-sm text-muted-foreground">
              ← Voltar ao início do parceiro
            </span>
          }
          titulo={<SkeletonTexto className="h-7 w-72 max-w-full" />}
        />
        <ListaSkeleton linhas={5} />
      </main>
    </>
  );
}
