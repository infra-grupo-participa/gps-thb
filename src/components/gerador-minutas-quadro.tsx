import { ExternalLink } from "lucide-react";
import { GERADOR_DASHBOARD_URL } from "@/lib/gerador-sso";
import { GeradorMinutasMoldura } from "@/components/gerador-minutas-moldura";

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
    <GeradorMinutasMoldura
      acao={
        <a
          href={hrefTelaCheia}
          target="_blank"
          rel="noopener"
          className="foco-visivel flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border bg-white px-4 text-base font-medium text-foreground hover:bg-muted sm:inline-flex sm:w-auto"
        >
          <ExternalLink aria-hidden className="size-4" />
          Abrir em tela cheia
        </a>
      }
    >
      {/* `min-h-0 flex-1`: o iframe ocupa o resto da moldura; quem rola é ele,
          nunca a página. */}
      <iframe
        src={src}
        title="Gerador de minutas"
        allow="clipboard-write"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
        referrerPolicy="strict-origin-when-cross-origin"
        className="block min-h-0 w-full flex-1 bg-white"
      />
    </GeradorMinutasMoldura>
  );
}
