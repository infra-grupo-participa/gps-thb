import { cn } from "@/lib/utils";

/**
 * Padrão de TRILHA — a única decoração do produto, e ela diz o que o produto
 * é: um roteiro de 6 etapas com marcos pelo caminho.
 *
 * Substitui o clichê que estava no login (gradiente + 2 blobs com `blur-2xl`),
 * que aparece igual em qualquer template e não fala do programa. Aqui a
 * decoração é conteúdo: linha tracejada em zigue-zague com um marco redondo em
 * cada vértice.
 *
 * - SVG **inline** com `<pattern>` — zero requisição, ~700 bytes, e o tile de
 *   260×130 casa nas bordas (o `y` da esquerda é o mesmo da direita), então
 *   ladrilha sem emenda em qualquer tamanho.
 * - `currentColor`: no painel laranja do login herda o branco; num hero claro
 *   herda o laranja. Uma peça, dois usos.
 * - `aria-hidden` + `pointer-events-none`: é textura, não informação nem alvo.
 */
export function PadraoTrilha({
  className,
  opacidade = 0.22,
}: {
  className?: string;
  /** 0–1. No laranja sólido do login o branco pede menos; num hero claro, mais. */
  opacidade?: number;
}) {
  return (
    <svg
      aria-hidden
      focusable="false"
      className={cn(
        "pointer-events-none absolute inset-0 size-full",
        className,
      )}
      style={{ opacity: opacidade }}
    >
      <defs>
        <pattern
          id="gps-trilha"
          width="260"
          height="130"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M0 100 L65 30 L130 100 L195 30 L260 100"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="9 10"
            strokeLinecap="round"
          />
          <circle cx="65" cy="30" r="5.5" fill="currentColor" />
          <circle cx="130" cy="100" r="5.5" fill="currentColor" />
          <circle cx="195" cy="30" r="5.5" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#gps-trilha)" />
    </svg>
  );
}
