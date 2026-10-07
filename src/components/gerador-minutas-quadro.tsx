"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { GeradorMinutasMoldura } from "@/components/gerador-minutas-moldura";
import { cn } from "@/lib/utils";

/**
 * Gerador de minutas embedado. `src` = URL de acesso único (`…/sso#t=…`) ou,
 * sem passe, o painel do gerador com login próprio. A página só monta este
 * quadro com um `src` válido (o painel do gerador é a saída de falha).
 * `sandbox` (pedido do kirad) SEM `allow-top-navigation*`: o gerador não
 * navega a página inteira do GPS; login, popup e download seguem funcionando. O CSP `frame-src` em `next.config.ts` libera o domínio.
 *
 * Tela cheia (João, 07/10): "não tem que abrir aba nova, tem que deixar a
 * tela inteiramente cheia… sai com Esc". O MESMO elemento vai para tela cheia
 * (Fullscreen API) — o iframe não é desmontado, então não recarrega nem perde
 * o que o parceiro estava preenchendo, e o passe de uso único não é gasto de
 * novo. O Esc do navegador funciona mesmo com o foco dentro do gerador.
 * Sem Fullscreen API (iPhone/Safari em elemento comum), a janela cobre a tela
 * por CSS e o botão vira "Sair da tela cheia" (o Esc só chega aqui com o foco
 * fora do iframe, por isso o botão fica sempre visível).
 */
export function GeradorMinutasQuadro({ src }: { src: string }) {
  const janela = useRef<HTMLElement>(null);
  const [cheia, setCheia] = useState(false);
  const [porCss, setPorCss] = useState(false);

  useEffect(() => {
    const aoMudar = () => setCheia(document.fullscreenElement === janela.current);
    document.addEventListener("fullscreenchange", aoMudar);
    return () => document.removeEventListener("fullscreenchange", aoMudar);
  }, []);

  useEffect(() => {
    if (!porCss) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPorCss(false);
    };
    document.addEventListener("keydown", aoTeclar);
    // A página por trás não rola enquanto a janela cobre a tela.
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = anterior;
    };
  }, [porCss]);

  const alternar = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
      return;
    }
    if (porCss) {
      setPorCss(false);
      return;
    }
    const el = janela.current;
    if (el && typeof el.requestFullscreen === "function" && document.fullscreenEnabled) {
      try {
        await el.requestFullscreen({ navigationUI: "hide" });
        return;
      } catch {
        // cai no modo por CSS
      }
    }
    setPorCss(true);
  }, [porCss]);

  const expandida = cheia || porCss;

  return (
    <GeradorMinutasMoldura
      ref={janela}
      className={cn(porCss && "fixed inset-0 z-[60] rounded-none border-0", cheia && "rounded-none border-0")}
      acao={
        <button
          type="button"
          onClick={alternar}
          aria-pressed={expandida}
          className="foco-visivel flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border bg-white px-4 text-base font-medium text-foreground hover:bg-muted sm:inline-flex sm:w-auto"
        >
          {expandida ? (
            <>
              <Minimize2 aria-hidden className="size-4" />
              Sair da tela cheia
            </>
          ) : (
            <>
              <Maximize2 aria-hidden className="size-4" />
              Tela cheia
            </>
          )}
        </button>
      }
      dica={expandida ? "Para voltar, aperte Esc ou use o botão ao lado." : undefined}
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
