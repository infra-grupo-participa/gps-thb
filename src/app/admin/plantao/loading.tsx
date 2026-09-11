import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { HeaderSkeleton } from "@/components/ui/lista-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * A tela mais pesada do admin: o mês do calendário, os inscritos de cada slot,
 * os alunos do Plantão e as mentoras — quatro consultas antes do primeiro
 * pixel. É exatamente onde o esqueleto paga.
 *
 * Título, eyebrow e linha de apoio são estáticos. A logo do Acelera NÃO entra:
 * ela é `next/image` sobre o cartão `#180b00` e apareceria de verdade no
 * esqueleto, não como forma — melhor deixar o espaço e não piscar a marca.
 *
 * A forma é: fileira de abas (Calendário / Parceiros / Mentoras) e a grade do
 * mês, 7 colunas — o padrão do `PlantaoCalendario`. Esqueleto de lista aqui
 * seria a forma errada: o conteúdo chega em calendário.
 */
export default function AdminPlantaoLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 pt-8 pb-16">
        <PageHeader
          titulo="Plantão de Dúvidas"
          eyebrow="Produto: Acelera Holding"
          descricao="Só participa quem comprou o Acelera Holding — agenda das mentoras, inscritos e acesso dos parceiros."
        />
        <div role="status" aria-live="polite" className="grid gap-6">
          <span className="sr-only">Carregando o plantão…</span>

          {/* As três abas. */}
          <div aria-hidden className="flex flex-wrap gap-2">
            <Skeleton className="h-9 w-32 rounded-lg" />
            <Skeleton className="h-9 w-24 rounded-lg" />
            <Skeleton className="h-9 w-28 rounded-lg" />
          </div>

          <Card aria-hidden>
            <CardContent className="grid gap-4">
              {/* Navegação do mês: ‹ mês › */}
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="size-9 rounded-lg" />
                <Skeleton className="h-5 w-40" />
                <Skeleton className="size-9 rounded-lg" />
              </div>

              {/* Cabeçalho dos dias da semana. */}
              <div className="grid grid-cols-7 gap-1.5">
                {Array.from({ length: 7 }, (_, i) => (
                  <Skeleton key={i} className="h-3.5 w-full" />
                ))}
              </div>

              {/* Cinco semanas de células com a altura da célula real. */}
              <div className="grid grid-cols-7 gap-1.5">
                {Array.from({ length: 35 }, (_, i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-lg" />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
