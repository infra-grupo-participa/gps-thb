import { cn } from "@/lib/utils";
import {
  COR_DO_TOM,
  fracaoDoTeto,
  pctDe,
  tetoDaSerie,
  type FormatarValor,
  type PontoGrafico,
  type TomGrafico,
} from "./tipos";
import { LegendaValores } from "./legenda-valores";

/**
 * Barras — série de UMA cor, comparação de magnitude. **HTML, sem SVG.**
 *
 * Duas orientações, um conceito só:
 *
 * - `"vertical"` (padrão) para **sequência**: os meses de entrada no programa.
 *   O eixo horizontal é o tempo, o rótulo curto ("set") cabe embaixo da coluna
 *   e o valor vai **em cima de cada barra** — pedido do João de 11/09: "quero
 *   ver os números, não adivinhar a altura".
 * - `"horizontal"` para **categoria nominal** com nome longo: as faixas de
 *   progresso, os graus de relação. Cada linha é nome + número (+ % do todo)
 *   em TEXTO, com a barra como apoio — nome escrito é o canal de identidade
 *   que a cor não dá (ver `tipos.ts`). É por isso que categoria nominal aqui
 *   NUNCA vira rosca: 6 fatias quentes não se separam, 6 linhas rotuladas se
 *   leem sem esforço.
 *
 * 🔑 A altura da área de plotagem é **prop, em pixels** (`altura`, 200 por
 * padrão). Antes ela saía da razão do `viewBox` × largura do card: num card
 * de três colunas as colunas mediam ~60 px e o gráfico virava enfeite. Agora
 * o card manda na altura, e o texto não depende dela.
 *
 * ♿ No modo vertical o conjunto é `role="img"` com o resumo em número — é
 * geometria, e o `aria-label` é o canal de quem não vê o desenho. No modo
 * horizontal **não há** `role="img"`: cada linha já é nome + número em texto,
 * que é a forma mais acessível possível, e a barra é decoração (`aria-hidden`).
 *
 * Server Component, zero JS.
 */
export function Barras({
  dados,
  resumo,
  tom = "marca",
  orientacao = "vertical",
  formatar = String,
  mostrarLegenda = true,
  colunasLegenda = 1,
  altura = 200,
  total,
}: {
  dados: PontoGrafico[];
  /** Frase com os números — vira o `aria-label` do gráfico vertical. */
  resumo: string;
  tom?: TomGrafico;
  orientacao?: "vertical" | "horizontal";
  formatar?: FormatarValor;
  mostrarLegenda?: boolean;
  /** `2` para série longa (12 meses) — ver `LegendaValores`. */
  colunasLegenda?: 1 | 2;
  /** Altura MÍNIMA da área de plotagem, em px. Só no modo vertical. */
  altura?: number;
  /**
   * Denominador do `%` de cada linha, no modo horizontal. Sem ele a linha
   * mostra só o número — "% de quanto" tem de ser uma decisão de quem chama,
   * nunca um palpite do gráfico.
   */
  total?: number;
}) {
  if (dados.length === 0) return null;
  const teto = tetoDaSerie(dados.map((d) => d.valor));

  if (orientacao === "horizontal") {
    return (
      <ul className="grid gap-2.5">
        {dados.map((d, i) => {
          const pct = total !== undefined ? pctDe(d.valor, total) : null;
          return (
            <li key={`${d.rotulo}-${i}`} className="grid gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 corpo-sm text-muted-foreground">
                  {d.rotulo}
                </span>
                <span className="numero shrink-0 font-semibold whitespace-nowrap">
                  {formatar(d.valor)}
                  {pct !== null ? (
                    <span className="ml-1.5 corpo-sm font-normal text-muted-foreground">
                      {pct}%
                    </span>
                  ) : null}
                </span>
              </div>
              <div
                aria-hidden
                className="h-2.5 w-full overflow-hidden rounded-full bg-superficie-afundada inset-ring inset-ring-black/5"
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${fracaoDoTeto(d.valor, teto)}%`,
                    backgroundColor: COR_DO_TOM[d.tom ?? tom],
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    // `h-full` + `flex-1` na área de plotagem: num par de cards lado a lado, o
    // mais alto define a linha da grade, e sem isso as colunas ficavam com a
    // altura fixa e o resto do card virava vão em branco (medido em 11/09).
    // `altura` passa a ser o PISO, não o teto.
    <div className="flex h-full flex-col gap-3">
      {/* `pt-6` reserva o espaço do rótulo da coluna mais alta, que fica ACIMA
          dos 100% da área de plotagem. Sem ele, o número do pico é cortado. */}
      <div role="img" aria-label={resumo} className="flex flex-1 flex-col pt-6">
        <div
          className="relative flex flex-1 items-end gap-1.5"
          style={{ minHeight: `${altura}px` }}
        >
          {/* Gradeado leve: duas linhas de referência e a base, que é o zero.
              Nada de rótulo no eixo Y — cada coluna já traz o próprio número,
              e valor repetido em dois lugares é tinta que não é dado. */}
          {[100, 50].map((p) => (
            <span
              key={p}
              aria-hidden
              className="absolute inset-x-0 border-t border-borda-fina"
              style={{ bottom: `${p}%` }}
            />
          ))}
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 border-t border-borda-forte"
          />
          {dados.map((d, i) => {
            const f = fracaoDoTeto(d.valor, teto);
            const texto = formatar(d.valor);
            return (
              <div
                key={`${d.rotulo}-${i}`}
                className="relative h-full min-w-0 flex-1"
                title={`${d.rotulo}: ${texto}`}
              >
                <span
                  className="numero absolute inset-x-0 text-center corpo-sm font-semibold"
                  style={{ bottom: `calc(${f}% + 6px)` }}
                >
                  {texto}
                </span>
                {/* Zero é resultado: o `minHeight` de 2 px deixa um traço na
                    linha de base dizendo "medimos e deu zero". Sem ele, o mês
                    vazio some e parece que o dado não chegou. */}
                <div
                  className={cn(
                    "absolute inset-x-0 bottom-0 mx-auto w-full max-w-16 rounded-t-md",
                  )}
                  style={{
                    height: `${f}%`,
                    minHeight: "2px",
                    backgroundColor:
                      d.valor > 0
                        ? COR_DO_TOM[d.tom ?? tom]
                        : "var(--color-borda-forte)",
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex gap-1.5">
          {dados.map((d, i) => (
            <span
              key={`${d.rotulo}-${i}`}
              className="min-w-0 flex-1 truncate text-center corpo-sm text-muted-foreground"
            >
              {d.rotulo}
            </span>
          ))}
        </div>
      </div>
      {mostrarLegenda ? (
        <LegendaValores
          linhas={dados}
          formatar={formatar}
          tomPadrao={tom}
          colunas={colunasLegenda}
        />
      ) : null}
    </div>
  );
}
