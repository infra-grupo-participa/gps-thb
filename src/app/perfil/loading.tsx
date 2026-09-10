import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { HeaderSkeleton } from "@/components/ui/lista-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * O título e o link de voltar são estáticos: quem clicou por engano sai sem
 * esperar a página inteira.
 *
 * Três cards, não quatro. `PerfilEditor`, `TrocarNome` e `TrocarSenha` sempre
 * existem; `RespostasDoInicio` SOME quando a pessoa não respondeu o dia 0 —
 * desenhá-lo aqui encolheria a tela na chegada de quem ainda não respondeu.
 * Mesma decisão do esqueleto do Financeiro: no caso comum é melhor faltar um
 * card do que sobrar.
 */
export default function PerfilLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16">
        <PageHeader
          titulo="Meu perfil"
          voltar={
            <span className="text-sm text-muted-foreground">
              ← Voltar ao início
            </span>
          }
        />
        <div role="status" aria-live="polite" className="grid gap-6">
          <span className="sr-only">Carregando…</span>

          {/* PerfilEditor: cabeçalho + alguns campos. */}
          <Card aria-hidden>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-1 h-4 w-64" />
            </CardHeader>
            <CardContent className="grid gap-4">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="grid gap-1.5">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-9 w-full rounded-lg" />
                </div>
              ))}
              <Skeleton className="h-9 w-32 rounded-lg" />
            </CardContent>
          </Card>

          {/* TrocarNome e TrocarSenha: um campo e um botão cada. */}
          {[0, 1].map((i) => (
            <Card key={i} aria-hidden>
              <CardHeader>
                <Skeleton className="h-5 w-36" />
                <Skeleton className="mt-1 h-4 w-56" />
              </CardHeader>
              <CardContent className="grid gap-4">
                <Skeleton className="h-9 w-full rounded-lg" />
                <Skeleton className="h-9 w-36 rounded-lg" />
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </>
  );
}
