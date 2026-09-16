import { HeaderSkeleton, SkeletonTexto } from "@/components/ui/lista-skeleton";

/** Mesma largura da página real (`max-w-3xl`), senão a coluna salta de lado. */
export default function AdminAlunoPerfilLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16">
        <div className="mb-8">
          <p className="mb-2 text-sm text-muted-foreground">
            ← Voltar ao ambiente do parceiro
          </p>
          <h1 className="font-heading titulo-h1 text-balance">
            Perfil de <SkeletonTexto className="h-7 w-40" />
          </h1>
        </div>
        <div className="grid gap-4" role="status" aria-live="polite">
          <span className="sr-only">Carregando…</span>
          <SkeletonTexto className="h-10 w-full" />
          <SkeletonTexto className="h-10 w-full" />
          <SkeletonTexto className="h-10 w-2/3" />
          <SkeletonTexto className="h-10 w-full" />
          <SkeletonTexto className="h-24 w-full" />
        </div>
      </main>
    </>
  );
}
