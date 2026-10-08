import { HeaderSkeleton } from "@/components/ui/lista-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { GeradorMinutasMoldura } from "@/components/gerador-minutas-moldura";

/** Mesma geometria da página (faixa + área de trabalho): nada pula ao trocar. */
export default function GeradorDeMinutasLoading() {
  return (
    <div className="flex h-dvh min-h-[560px] flex-col bg-background">
      <HeaderSkeleton />
      <main
        id="conteudo"
        className="mx-auto flex min-h-0 w-full max-w-pagina flex-1 flex-col px-4 pt-3 pb-4"
      >
        <GeradorMinutasMoldura
          acao={<Skeleton aria-hidden className="h-11 w-full rounded-lg sm:w-52" />}
        >
          <div role="status" aria-live="polite" className="min-h-0 flex-1 p-4">
            <span className="sr-only">Carregando o gerador…</span>
            <Skeleton aria-hidden className="h-full w-full rounded-md" />
          </div>
        </GeradorMinutasMoldura>
      </main>
    </div>
  );
}
