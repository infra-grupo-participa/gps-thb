"use client";

import { useId } from "react";

/**
 * A escolha de uma opção entre poucas — a peça dos passos 2 e 3.
 *
 * 🔑 `<fieldset>` + `<legend>` + `<input type="radio">` NATIVOS, estilizados
 * como cartões. Nada de `role="radiogroup"` caseiro: o radio nativo já dá
 * navegação por seta, seleção por espaço, rótulo clicável, anúncio de "1 de 3"
 * no leitor de tela e o grupo inteiro como uma parada de Tab. Reimplementar
 * isso é reintroduzir bugs que o HTML já não tem.
 *
 * A opção selecionada se diz por **borda, fundo E marcador**, nunca só por cor
 * (WCAG 1.4.1) — a mesma regra do resto do portal.
 */
export function Escolha<T extends string>({
  legenda,
  opcoes,
  valor,
  onEscolher,
  desabilitado = false,
}: {
  /** A pergunta. Vira `<legend>` — é o nome acessível do grupo. */
  legenda: React.ReactNode;
  opcoes: { id: T; rotulo: string; ajuda?: string }[];
  valor: T | null;
  onEscolher: (id: T) => void;
  desabilitado?: boolean;
}) {
  const uid = useId();
  return (
    <fieldset className="grid gap-2" disabled={desabilitado}>
      <legend className="mb-2 font-heading titulo-h2 text-balance">
        {legenda}
      </legend>
      {opcoes.map((o) => {
        const id = `${uid}-${o.id}`;
        const marcado = valor === o.id;
        return (
          <label
            key={o.id}
            htmlFor={id}
            className={
              "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring " +
              (marcado
                ? "border-marca-acao bg-accent/60"
                : "border-borda-fina bg-card hover:border-borda-forte hover:bg-muted/50")
            }
          >
            <input
              id={id}
              type="radio"
              name={uid}
              checked={marcado}
              onChange={() => onEscolher(o.id)}
              className="mt-0.5 size-4 shrink-0 accent-[var(--color-marca-acao)]"
            />
            <span className="min-w-0">
              <span className="block corpo font-medium text-balance">
                {o.rotulo}
              </span>
              {o.ajuda ? (
                <span className="mt-0.5 block corpo-sm text-muted-foreground">
                  {o.ajuda}
                </span>
              ) : null}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
