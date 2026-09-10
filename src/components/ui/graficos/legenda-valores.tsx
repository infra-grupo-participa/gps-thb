import { cn } from "@/lib/utils";
import { COR_DO_TOM, pctDe, type FormatarValor, type PontoGrafico } from "./tipos";

/**
 * A legenda numérica que acompanha **todo** gráfico do portal: uma linha por
 * item, `rótulo · número · %`.
 *
 * 🔴 Não é enfeite nem "fallback": é o canal principal de leitura. Os tokens
 * semânticos da casa não formam uma paleta categórica separável (a conta está
 * em `tipos.ts`), e estes gráficos são Server Components sem hidratação — logo
 * não existe tooltip para inspecionar valor. Quem responde "quanto é a fatia
 * âmbar?" é esta legenda, com o nome escrito por extenso.
 *
 * 🔑 Era uma `<table>` com `<caption>` e `<th scope="row">`. Virou lista: o
 * pedido de 10/09 foi "menos texto, mais número", e três linhas de grade de
 * tabela por card empurravam os nove cards para o dobro da altura. A
 * acessibilidade não depende desta peça — o SVG ao lado é `role="img"` com o
 * `aria-label` carregando a série INTEIRA em número, que é a leitura completa
 * para quem não vê o desenho. Aqui ficam nome e número em texto de verdade,
 * numa `<ul>`, sem semântica de linha/coluna para navegar.
 */
export function LegendaValores({
  linhas,
  formatar = String,
  total,
  tomPadrao = "marca",
  colunas = 1,
}: {
  linhas: PontoGrafico[];
  formatar?: FormatarValor;
  /** Quando informado, cada linha ganha a porcentagem do todo. */
  total?: number;
  tomPadrao?: PontoGrafico["tom"];
  /**
   * `2` para série longa (os 12 meses): doze linhas em coluna única empurram o
   * card para o dobro da altura dos vizinhos. Leitura em Z (jan | fev na
   * primeira linha), que para meses continua cronológica.
   */
  colunas?: 1 | 2;
}) {
  return (
    <ul
      className={cn(
        "grid gap-x-4",
        colunas === 2 && linhas.length > 3 ? "grid-cols-2" : "grid-cols-1",
      )}
    >
      {linhas.map((l) => {
        // `pct` explícito manda (o funil calcula a conversão da etapa
        // anterior); sem ele, a fatia do total da série.
        const pct =
          l.pct !== undefined ? l.pct : total ? pctDe(l.valor, total) : null;
        return (
          <li
            key={l.rotulo}
            className="flex items-baseline justify-between gap-2 py-px"
          >
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span
                aria-hidden
                className="size-2 shrink-0 translate-y-px rounded-[2px]"
                style={{
                  backgroundColor: COR_DO_TOM[l.tom ?? tomPadrao ?? "marca"],
                }}
              />
              <span className="truncate corpo-sm text-muted-foreground">
                {l.rotulo}
              </span>
            </span>
            <span className="numero shrink-0 corpo-sm font-semibold whitespace-nowrap">
              {formatar(l.valor)}
              {pct !== null ? (
                <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                  {pct}%
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
