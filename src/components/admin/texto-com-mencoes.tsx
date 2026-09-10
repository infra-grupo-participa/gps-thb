import type { ReactNode } from "react";

/**
 * Texto de nota com as @menções realçadas — negrito + laranja, como no
 * WhatsApp (pedido do João, 10/09/2026).
 *
 * O realce vem das menções GRAVADAS em `gps.nota_mencoes` (`nota.mencoes`),
 * nunca de um parse livre do texto: o picker insere `@Nome Completo`
 * (`diario-mencoes.tsx`), então é exatamente `@` + nome que se procura. Um
 * `@` de e-mail colado no meio da nota, ou um nome sem `@`, não vira menção.
 * Nome mais longo primeiro, para "@Ana Paula" não ser cortado por "@Ana".
 *
 * Só texto, sem HTML: cada trecho vira nó React — não há `innerHTML`.
 */
export function TextoComMencoes({
  texto,
  mencoes,
}: {
  texto: string;
  mencoes: { id: string; nome: string | null }[];
}): ReactNode {
  const nomes = [
    ...new Set(
      mencoes
        .map((m) => m.nome?.trim())
        .filter((n): n is string => Boolean(n)),
    ),
  ].sort((a, b) => b.length - a.length);

  if (nomes.length === 0) return texto;

  const re = new RegExp(
    `@(${nomes.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\p{L}\\p{N}])`,
    "gu",
  );

  const partes: ReactNode[] = [];
  let ultimo = 0;
  for (const m of texto.matchAll(re)) {
    const inicio = m.index ?? 0;
    if (inicio > ultimo) partes.push(texto.slice(ultimo, inicio));
    partes.push(
      <strong
        key={`${inicio}-${m[1]}`}
        className="rounded-sm bg-primary/10 px-0.5 font-semibold text-accent-foreground"
      >
        @{m[1]}
      </strong>,
    );
    ultimo = inicio + m[0].length;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return partes;
}
