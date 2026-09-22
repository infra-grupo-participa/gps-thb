import { HeaderSkeleton } from "@/components/ui/lista-skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * A tela de sessões enquanto as consultas chegam.
 *
 * 🔑 ESQUELETO COM A ALTURA REAL, NUNCA SPINNER CENTRALIZADO (regra do
 * projeto desde o polimento de 09/09). A rota faz várias idas ao banco em
 * paralelo — catálogo, sessões vivas, elegibilidade e grade por tipo, e o
 * nome do cliente — e sem este arquivo a tela ANTERIOR congela: a pessoa
 * clica na aba e continua vendo a página de onde saiu, sem sinal nenhum de
 * que algo está acontecendo. É a queixa "demora demais" mesmo com o servidor
 * respondendo rápido; o que falta é retorno visual.
 *
 * A forma copia a de `page.tsx` (`max-w-3xl`, título estático, duas seções —
 * hoje o catálogo tem 2 tipos) para a chegada do conteúdo não empurrar a
 * página. Duas seções de 3 linhas é a altura típica de uma grade com poucos
 * blocos publicados, que é o caso comum medido (4 por semana).
 */
export default function SessoesLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16">
        <PageHeader titulo="Sessões com a equipe" />

        <div role="status" aria-live="polite" className="grid gap-8">
          <span className="sr-only">Carregando os horários da equipe…</span>

          {Array.from({ length: 2 }).map((_, secao) => (
            <div key={secao} aria-hidden className="grid gap-3">
              {/* Cabeçalho da seção (`Secao`: título + régua). */}
              <div className="flex items-center gap-3">
                <Skeleton className="h-5 w-44" />
                <Skeleton className="h-px flex-1" />
              </div>
              {/* Rótulo do dia + 3 linhas de horário, a altura de `py-2.5`. */}
              <Skeleton className="h-4 w-56" />
              <div className="grid gap-px">
                {Array.from({ length: 3 }).map((_, linha) => (
                  <div
                    key={linha}
                    className="flex items-center justify-between gap-4 py-2.5"
                  >
                    <Skeleton className="h-5 w-64" />
                    <Skeleton className="h-8 w-32" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
