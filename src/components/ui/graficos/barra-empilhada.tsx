import {
  COR_DO_TOM,
  COR_SUPERFICIE,
  pctDe,
  type FormatarValor,
  type PontoGrafico,
} from "./tipos";
import { LegendaValores } from "./legenda-valores";

/** Abaixo disto o número não cabe dentro do segmento e fica só na legenda. */
const PCT_MINIMO_PARA_ROTULO = 14;

/**
 * Uma barra horizontal repartida — parte-e-todo de UM conjunto pequeno
 * ("842 em prospecção · 37 em fechamento" dentro dos 879). **HTML, sem SVG.**
 *
 * 🔑 O que separa dois segmentos é um **vão de 2 px na cor da superfície**, e
 * não um contorno: contorno é tinta que não é dado, e com os tons quentes da
 * casa (que ficam a ΔE 2,7 um do outro na deuteranopia) é o vão que faz a
 * fronteira existir. Ele sai de um `border-right` na cor do card, e não de um
 * `gap` — `gap` somaria pixels aos 100% e cortaria o último segmento.
 *
 * O número entra dentro do segmento **só quando o segmento tem ≥ 14% do
 * todo**; abaixo disso ele não caberia e fica na legenda, que traz todos.
 * Texto cortado pela própria marca é pior do que texto ausente.
 *
 * ♿ Sem `role="img"`: a legenda logo abaixo é uma lista de `rótulo · número ·
 * %` em texto de verdade, que é a leitura completa.
 */
export function BarraEmpilhada({
  segmentos,
  formatar = String,
  mostrarLegenda = true,
  altura = 24,
}: {
  /** Cada segmento PRECISA de tom — é o que o diferencia do vizinho. */
  segmentos: (PontoGrafico & { tom: NonNullable<PontoGrafico["tom"]> })[];
  formatar?: FormatarValor;
  mostrarLegenda?: boolean;
  /** Altura da barra em px. */
  altura?: number;
}) {
  const total = segmentos.reduce((s, x) => s + Math.max(0, x.valor), 0);
  const visiveis = segmentos.filter((s) => s.valor > 0);

  return (
    <div className="grid gap-3">
      <div
        aria-hidden
        className="flex w-full overflow-hidden rounded-md bg-superficie-afundada inset-ring inset-ring-black/5"
        style={{ height: `${altura}px` }}
      >
        {visiveis.map((s, i) => {
          const pct = pctDe(s.valor, total) ?? 0;
          const texto = formatar(s.valor);
          return (
            <div
              key={s.rotulo}
              title={`${s.rotulo}: ${texto}`}
              className="flex items-center justify-center overflow-hidden"
              style={{
                width: `${(Math.max(0, s.valor) / total) * 100}%`,
                backgroundColor: COR_DO_TOM[s.tom],
                borderRight:
                  i < visiveis.length - 1 ? `2px solid ${COR_SUPERFICIE}` : undefined,
              }}
            >
              {pct >= PCT_MINIMO_PARA_ROTULO ? (
                // Dentro de marca preenchida o texto é branco — os cinco tons
                // são escuros (≥ 4,8:1 com branco, medidos em `globals.css`).
                <span className="numero corpo-sm font-semibold text-white">
                  {texto}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      {mostrarLegenda ? (
        <LegendaValores
          linhas={segmentos}
          formatar={formatar}
          total={total || undefined}
        />
      ) : null}
    </div>
  );
}
