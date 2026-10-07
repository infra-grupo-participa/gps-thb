import { PageHeader } from "@/components/ui/page-header";
import { HeaderSkeleton } from "@/components/ui/lista-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function GeradorDeMinutasLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 py-8">
        <PageHeader titulo="Gerador de minutas" />
        <div role="status" aria-live="polite" className="grid gap-3">
          <span className="sr-only">Carregando o gerador…</span>
          <Skeleton aria-hidden className="h-11 w-48 rounded-lg" />
          <Skeleton aria-hidden className="h-[600px] w-full rounded-xl" />
        </div>
      </main>
    </>
  );
}
