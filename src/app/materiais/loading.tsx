import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { HeaderSkeleton } from "@/components/ui/lista-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * O título e a linha de apoio são estáticos — já são conhecidos antes de
 * qualquer query. Só o acervo é esqueleto.
 *
 * A forma é a do `MateriaisView`: barra de busca + 3 chips de tipo, e então
 * os materiais AGRUPADOS POR ETAPA (título da etapa + grade `sm:grid-cols-2`
 * de cards horizontais `py-3`, ícone `size-9` à esquerda). Grade de duas
 * colunas, não lista larga: `ListaSkeleton` desenharia linhas inteiras e o
 * conteúdo chegaria em duas colunas — o salto seria pior do que não ter
 * esqueleto nenhum.
 *
 * Dois grupos de etapa, de 4 cards: é a forma do acervo de quem está no
 * começo, o caso comum. Melhor faltar um grupo do que sobrar e a tela
 * encolher na chegada.
 */
export default function MateriaisLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 py-8">
        <PageHeader
          titulo="Materiais"
          descricao="Seu acervo de aulas e modelos — reunidos de todas as etapas, num só lugar."
        />
        <div role="status" aria-live="polite" className="grid gap-6">
          <span className="sr-only">Carregando o acervo…</span>

          {/* Busca + chips de tipo (Todos / Aulas / Modelos). */}
          <div
            aria-hidden
            className="flex flex-wrap items-center gap-3"
          >
            <Skeleton className="h-9 max-w-sm flex-1 rounded-lg" />
            {/* Classes literais: `w-${n}` interpolado não existe para o
                compilador do Tailwind e a barra sairia sem largura. */}
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
