import { PageHeader } from "@/components/ui/page-header";
import {
  HeaderSkeleton,
  ListaSkeleton,
  SkeletonTexto,
} from "@/components/ui/lista-skeleton";

/** O `h1` é o nome do aluno — só conhecido depois da query. */
export default function AdminAlunoLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <PageHeader
          voltar={
            <span className="text-sm text-muted-foreground">
              ← Voltar aos alunos
            </span>
          }
          titulo={<SkeletonTexto className="h-7 w-64 max-w-full" />}
          descricao={<SkeletonTexto className="h-4 w-48 max-w-full" />}
        />
        <ListaSkeleton linhas={4} />
      </main>
    </>
  );
}
