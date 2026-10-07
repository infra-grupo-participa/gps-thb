import { ExternalLink } from "lucide-react";
import { GERADOR_DASHBOARD_URL } from "@/lib/gerador-sso";

/**
 * Gerador de minutas embedado. `src` = URL de acesso único (`…/sso#t=…`) ou,
 * sem passe, o painel do gerador com login próprio.
 * `sandbox` (pedido do kirad) SEM `allow-top-navigation*`: o gerador não
 * navega a página inteira do GPS; login, popup e download seguem funcionando. O CSP `frame-src` em `next.config.ts` libera o domínio.
 */
export function GeradorMinutasQuadro({
  src = GERADOR_DASHBOARD_URL,
  hrefTelaCheia = src,
}: {
  src?: string;
  /** O token do `src` é de uso único: a tela cheia pede outro (…358). */
  hrefTelaCheia?: string;
}) {
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <a
          href={hrefTelaCheia}
          target="_blank"
          rel="noopener"
          className="foco-visivel inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-base font-medium hover:bg-muted"
        >
          <ExternalLink aria-hidden className="size-4" />
          Abrir em tela cheia
        </a>
        <p className="text-base text-muted-foreground">
          Se o login não abrir aqui, use Abrir em tela cheia.
        </p>
      </div>
      <iframe
        src={src}
        title="Gerador de minutas"
        allow="clipboard-write"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
        referrerPolicy="strict-origin-when-cross-origin"
        className="block min-h-[600px] h-[calc(100dvh-11rem)] w-full rounded-xl border bg-background ring-1 ring-foreground/10"
      />
    </div>
  );
}
