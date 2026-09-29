import { CircleAlert } from "lucide-react";

/**
 * A mensagem de erro AO LADO do campo (logo abaixo dele).
 *
 * O `id` é o que o controle aponta em `aria-describedby` (`idDoErro(campo)`,
 * `ficha-abas-estado.ts`). Sem `role="alert"` de propósito: a barra de salvar
 * já anuncia a recusa, e dois anúncios da mesma frase viram ruído.
 *
 * Quem informa é a PALAVRA; o ícone e a cor (`risco-foreground`, 6,6:1 sobre o
 * fundo claro) são reforço (WCAG 1.4.1). Renderiza nada sem texto.
 */
export function CampoErro({
  id,
  texto,
}: {
  id: string;
  texto?: string | null;
}) {
  if (!texto) return null;
  return (
    <p
      id={id}
      className="corpo-sm flex items-start gap-1.5 font-medium text-risco-foreground"
    >
      <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{texto}</span>
    </p>
  );
}
