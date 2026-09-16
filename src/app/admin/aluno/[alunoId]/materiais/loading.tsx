import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { HeaderSkeleton } from "@/components/ui/lista-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Título e descrição são estáticos — a página real usa exatamente
 * "Materiais" / "Acervo de aulas e modelos de todas as etapas.", sem depender
 * de query nenhuma. `max-w-6xl` + `py-8` é a forma real (mesma da irmã do
 * aluno, `src/app/materiais/loading.tsx`).
 *
 * A forma é a do `MateriaisView`: barra de busca + 3 chips de tipo, e então
 * os materiais agrupados por etapa (grade `sm:grid-cols-2` de cards
 * horizontais). A seção de gravações do topo é condicional
 * (`videosAtivo`) — não desenhada aqui, senão a tela encolheria na chegada
 * para quem não tem vídeo publicado, o caso mais comum.
 */
export default function AdminAlunoMateriaisLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 py-8">
        <PageHeader
          titulo="Materiais"
          descricao="Acervo de aulas e modelos de todas as etapas."
        />
        <div role="status" aria-live="polite" className="grid gap-6">
          <span className="sr-only">Carregando o acervo…</span>

          {/* Busca + chips de tipo (Todos / Aulas / Modelos). */}
          <div aria-hidden className="flex flex-wrap items-center gap-3">
            <Skeleton className="h-9 max-w-sm flex-1 rounded-lg" />
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-8 w-24 rounded-4xl" />
              <Skeleton className="h-8 w-24 rounded-4xl" />
              <Skeleton className="h-8 w-28 rounded-4xl" />
            </div>
          </div>

          {[0, 1].map((g) => (
            <div key={g} aria-hidden>
              <div className="mb-2 flex items-center gap-2">
                <Skeleton className="h-4 w-56" />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {Array.from({ length: 4 }, (_, i) => (
                  <Card key={i}>
                    <CardContent className="flex items-start gap-3 py-3">
                      <Skeleton className="size-9 shrink-0 rounded-lg" />
                      <div className="grid min-w-0 flex-1 gap-1.5">
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-4 w-14 rounded-4xl" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                        <Skeleton className="h-4 w-4/5" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
