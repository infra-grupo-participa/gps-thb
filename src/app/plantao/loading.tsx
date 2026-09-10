import { PageHeader } from "@/components/ui/page-header";
import { HeaderSkeleton } from "@/components/ui/lista-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * A aba do Plantão enquanto as 3 consultas do calendário chegam.
 *
 * 🔑 SEM ISTO A TELA ANTERIOR CONGELA. A rota faz 3 consultas
 * (`plantao_calendario_logado`, `plantao_minha_inscricao_logado` e a sessão)
 * e nasceu em 10/09 sem `loading.tsx`: quem clicava na aba ficava vendo a
 * página antiga, sem sinal nenhum de que algo estava acontecendo. É a
 * queixa "demora demais" mesmo quando o servidor responde em 300 ms — o
 * que falta é o retorno visual, não a velocidade.
 *
 * A forma é a de `page.tsx`: `max-w-3xl`, título estático (já é conhecido
 * antes de qualquer consulta), a faixa de aviso, e então o calendário do
 * mês — cabeçalho de navegação + grade de dias. Uma grade só: dois meses de
 * esqueleto para um calendário que mostra um encolheria a tela na chegada.
 */
export default function PlantaoLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16">
        <PageHeader titulo="Plantão de Dúvidas" />

        <div role="status" aria-live="polite" className="grid gap-4">
          <span className="sr-only">Carregando o calendário do Plantão…</span>

          {/* A faixa "você já está logado" — texto fixo, mas o esqueleto
              guarda a altura dela para a página não pular. */}
          <Skeleton className="h-9 w-full rounded-lg" />

          {/* Cabeçalho do calendário: ‹ mês › */}
          <div className="flex items-center justify-between gap-2 rounded-xl border border-borda-fina bg-card p-3">
            <Skeleton className="size-8 rounded-lg" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="size-8 rounded-lg" />
          </div>

          {/* A grade do mês. 5 linhas de 7 é a altura típica. */}
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 35 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
