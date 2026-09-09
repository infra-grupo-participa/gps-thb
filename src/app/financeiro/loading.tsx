import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { HeaderSkeleton } from "@/components/ui/lista-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * O título e a linha de apoio são estáticos — já são conhecidos antes de
 * qualquer query. Só o card do contrato é esqueleto, com a forma do card de
 * verdade (cabeçalho + trio de números + duas linhas de apoio): esqueleto de
 * altura errada é CLS, e CLS é pior que spinner.
 *
 * Um card só: a medição do banco mostrou 0 alunos com contrato duplicado e
 * apenas 2 com um segundo produto. Desenhar dois esqueletos encolheria a tela
 * na chegada em quase todos os casos.
 */
export default function FinanceiroLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-3xl px-4 py-8">
        <PageHeader
          titulo="Financeiro"
          descricao="Seu contrato com o Grupo Participa: quanto é, quanto já foi pago e o que ainda falta."
        />
        <div role="status" aria-live="polite">
          <span className="sr-only">Carregando…</span>
          <Card aria-hidden>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-1 h-5 w-24 rounded-4xl" />
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Skeleton className="h-[74px] rounded-lg" />
                <Skeleton className="h-[74px] rounded-lg" />
                <Skeleton className="h-[74px] rounded-lg" />
              </div>
              <div className="grid gap-2 border-t pt-4">
                <Skeleton className="h-5 w-56" />
                <Skeleton className="h-5 w-44" />
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
