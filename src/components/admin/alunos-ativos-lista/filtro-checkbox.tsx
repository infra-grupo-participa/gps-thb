"use client";

/**
 * Um filtro da barra do painel. Só aparece quando há alguém para filtrar.
 *
 * 🎨 Onda B (B11): era um `<Checkbox>` nu com rótulo ao lado. Seis deles
 * espalhados em duas linhas, ao lado de uma busca e de um select, faziam a
 * barra de filtro parecer um FORMULÁRIO — algo a preencher, não a alternar.
 * Virou chip alternável, o mesmo desenho dos chips de fase da aba Clientes:
 * uma linguagem de chip só no portal.
 *
 * Continua sendo um `<button>` com `aria-pressed` (e não um `role="checkbox"`
 * caseiro): alternar um filtro é uma ação de duas posições, que é exatamente o
 * que `aria-pressed` diz. O nome acessível carrega a contagem, como antes.
 *
 * ⚠️ O nome do arquivo e o do componente ficam: são importados pelo `index.tsx`
 * e trocá-los seria diff sem ganho.
 */
export function FiltroCheckbox({
  rotulo,
  total,
  marcado,
  onChange,
}: {
  rotulo: string;
  total: number;
  marcado: boolean;
  onChange: (v: boolean) => void;
}) {
  if (total === 0) return null;
  return (
    <button
      type="button"
      aria-pressed={marcado}
      aria-label={`${rotulo} (${total})`}
      onClick={() => onChange(!marcado)}
      className={
        // Ativo em `marca-acao` (#C74600, 4,88:1 com branco): `bg-primary`
        // com texto branco dá 2,98:1 e o chip tem texto de 12 px.
        "foco-visivel inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition " +
        (marcado
          ? "border-marca-acao bg-marca-acao text-white"
          : "border-borda-forte bg-card text-muted-foreground hover:bg-muted hover:text-foreground")
      }
    >
      <span aria-hidden>{rotulo}</span>
      <span
        aria-hidden
        className={
          "numero rounded-full px-1.5 text-[10px] font-semibold " +
          (marcado
            ? "bg-black/25 text-white"
            : "bg-superficie-afundada text-neutro-foreground")
        }
      >
        {total}
      </span>
    </button>
  );
}
