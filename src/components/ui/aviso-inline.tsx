import { TriangleAlert, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Aviso curto no fluxo do conteúdo — "isto pede atenção, e é isto que fazer".
 *
 * O mesmo bloco estava copiado 4× (`border-amber-500/40 bg-amber-500/10 p-3
 * text-amber-800`), em três tamanhos de texto, escrito em Tailwind CRUA: o
 * âmbar do Tailwind não é o âmbar da marca e não passa pelo par semântico
 * medido da Onda A. Aqui é `atencao` (#8A5300 sobre #FFF4E0 = **5,81:1**,
 * medido no comentário de `globals.css`) — o MESMO par do
 * `Badge variant="warning"`, para o aviso e o chip de estado não falarem
 * duas cores diferentes do mesmo assunto.
 *
 * ♿ O ícone vem sempre: cor sozinha não é informação (WCAG 1.4.1). É
 * `aria-hidden` porque a frase ao lado já diz o que está errado — anunciar
 * "triângulo de alerta" antes dela só atrasa a leitura.
 *
 * Um tamanho só (`corpo-sm`, 13 px): aviso é texto de apoio em todos os
 * quatro lugares, e três tamanhos para a mesma peça era o sintoma de que ela
 * nunca tinha sido desenhada.
 */
export function AvisoInline({
  icone: Icone = TriangleAlert,
  moldura = true,
  className,
  children,
}: {
  /** Troca o ícone padrão (ex.: `Info` para a nota interna da equipe). */
  icone?: LucideIcon;
  /**
   * `false` quando a superfície ao redor **já** é a de atenção (o card do
   * contrato cancelado): caixa âmbar dentro de card âmbar não separa nada,
   * só adiciona uma borda. Sem moldura, fica a linha com ícone.
   */
  moldura?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 corpo-sm text-atencao-foreground",
        moldura ? "rounded-lg bg-atencao p-3" : "font-medium",
        className,
      )}
    >
      <Icone aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}
