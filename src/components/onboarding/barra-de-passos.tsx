/**
 * "Passo N de M" — a barra do onboarding.
 *
 * 🔑 `M` é o tamanho do caminho DAQUELA pessoa, não uma régua fixa. Uma barra
 * que promete dez passos e entrega sete ensina o usuário a não confiar nela —
 * e a barra existe justamente para dizer "falta pouco".
 *
 * O número vai em texto ANTES do trilho: `role="progressbar"` é lido por
 * leitor de tela, mas quem enxerga precisa do número sem passar o mouse.
 */
export function BarraDePassos({
  posicao,
  total,
}: {
  /** Índice do passo atual dentro do caminho (0-based). */
  posicao: number;
  total: number;
}) {
  return (
    <div className="grid gap-1.5">
      <p className="rotulo text-muted-foreground">
        Passo {posicao + 1} de {total}
      </p>
      <div
        role="progressbar"
        aria-valuenow={posicao + 1}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-label="Progresso do onboarding"
        className="h-1.5 w-full overflow-hidden rounded-full bg-superficie-afundada inset-ring inset-ring-black/5"
      >
        <div
          className="h-full rounded-full bg-marca-acao transition-[width] duration-300 ease-out"
          style={{ width: `${((posicao + 1) / total) * 100}%` }}
        />
      </div>
    </div>
  );
}
