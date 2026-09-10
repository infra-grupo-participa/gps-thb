import { Card, CardContent } from "@/components/ui/card";
import { HeaderSkeleton, SkeletonTexto } from "@/components/ui/lista-skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Gêmeo do esqueleto do chamado do aluno (`/chamados/[chamadoId]`), com a
 * largura desta página (`max-w-3xl`) e o link de voltar para a FILA.
 *
 * O assunto só existe depois da query — por isso o `h1` é uma barra
 * (`SkeletonTexto`, um `<span>`, para não pôr um `<div>` dentro de um `<h1>`).
 * O link de voltar é estático e já aparece: quem abriu o chamado errado volta
 * à fila sem esperar a thread inteira.
 */
export default function AdminChamadoLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16">
        <PageHeader
          voltar={
            <span className="text-sm text-muted-foreground">
              ← Voltar à fila
            </span>
          }
          titulo={<SkeletonTexto className="h-7 w-64 max-w-full" />}
          descricao={
            <span className="flex flex-wrap items-center gap-2">
              <SkeletonTexto className="h-5 w-20 rounded-4xl" />
              <SkeletonTexto className="h-5 w-40" />
            </span>
          }
        />
        <div role="status" aria-live="polite" className="grid gap-6">
          <span className="sr-only">Carregando…</span>
          <div className="grid gap-3">
            {[0, 1].map((i) => (
              <Card key={i} aria-hidden>
                <CardContent className="grid gap-2 py-4">
                  <Skeleton className="h-5 w-24 rounded-4xl" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </CardContent>
              </Card>
            ))}
          </div>
          {/* O campo de resposta da equipe: sempre existe nesta tela. */}
          <Card aria-hidden>
            <CardContent className="grid gap-3 py-4">
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-9 w-32 rounded-lg" />
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
