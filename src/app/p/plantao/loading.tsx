import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Rota PÚBLICA, embedada em iframe na área de membros da Hotmart.
 *
 * SEM `HeaderSkeleton` e SEM `PageHeader`: o cabeçalho desta área é a logo do
 * Acelera no cartão `#180b00`, e ele vive no `layout.tsx` de `/p` — o layout
 * NÃO é substituído pelo `loading.tsx`, então ele já está na tela. Repetir a
 * faixa aqui empurraria a página para baixo e ela subiria na troca.
 *
 * A largura também não se repete: quem centraliza (`max-w-md sm:max-w-lg`) é o
 * layout. Este arquivo é só o miolo — o mesmo `flex flex-col gap-4` da página.
 *
 * Nenhum elemento `sticky`, pela regra do iframe: dentro dele o elemento que
 * rola nem sempre é o `body` da própria página.
 */
export default function PlantaoPublicoLoading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-4">
      <span className="sr-only">Carregando o calendário…</span>

      {/* O aviso "exclusivo de quem comprou o Acelera Holding" é estático e
          curto — mas depende do `?e=`, então entra como forma, não texto. */}
      <div
        aria-hidden
        className="rounded-lg border border-dashed bg-muted/40 px-3 py-2"
      >
        <Skeleton className="h-4 w-full" />
        <Skeleton className="mt-1.5 h-4 w-2/3" />
      </div>

      {/* Identificação (ou a linha "Inscrevendo como…"). */}
      <div aria-hidden className="grid gap-2">
        <Skeleton className="h-9 w-full rounded-lg" />
        <Skeleton className="h-9 w-full rounded-lg" />
        <Skeleton className="h-9 w-36 rounded-lg" />
      </div>

      {/* O calendário do mês: navegação + 7 colunas. */}
      <Card aria-hidden>
        <CardContent className="grid gap-3">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="size-8 rounded-lg" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="size-8 rounded-lg" />
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 7 }, (_, i) => (
              <Skeleton key={i} className="h-3 w-full" />
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-md" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
