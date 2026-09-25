import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import {
  HeaderSkeleton,
  SkeletonTexto,
} from "@/components/ui/lista-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * O nome do parceiro só existe depois da query — o título leva uma barra
 * (`SkeletonTexto`). A descrição é estática. `max-w-6xl` é a largura real.
 *
 * Dois blocos, na ordem real: o formulário de configuração do link do Drive
 * (só admin) e o card com o botão "Abrir no Drive" (a prévia embutida saiu
 * em 25/09/2026).
 */
export default function AdminAlunoPastaLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 pt-8 pb-16">
        <PageHeader
          titulo={<SkeletonTexto className="h-7 w-56 max-w-full" />}
          descricao="Configure e acompanhe a pasta do Drive do parceiro."
        />
        <div role="status" aria-live="polite" className="grid gap-6">
          <span className="sr-only">Carregando…</span>

          {/* Formulário de configuração do link (PF4, só admin). */}
          <Card aria-hidden>
            <CardHeader>
              <Skeleton className="h-5 w-48" />
            </CardHeader>
            <CardContent className="grid gap-3 sm:flex sm:items-end">
              <div className="grid w-full gap-1.5">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-9 w-full rounded-lg" />
              </div>
              <Skeleton className="h-9 w-28 shrink-0 rounded-lg" />
            </CardContent>
          </Card>

          {/* Card com o link da pasta. */}
          <Skeleton aria-hidden className="h-28 w-full rounded-lg" />
        </div>
      </main>
    </>
  );
}
