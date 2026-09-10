import {
  COR_DO_TOM,
  COR_SUPERFICIE,
  caminhoBarra,
  larguraTexto,
  type FormatarValor,
  type PontoGrafico,
} from "./tipos";
import { LegendaValores } from "./legenda-valores";

const L = 320;
const ALTURA = 22; // ≤ 24 px, a espessura máxima de marca da casa
const VAO = 2; // o vão na cor da superfície que separa dois segmentos

/**
 * Uma barra horizontal repartida — parte-e-todo de UM conjunto pequeno
 * ("139 com login · 19 sem login · 3 nunca entraram" dentro dos 158).
 *
 * 🔑 O que separa dois segmentos é um **vão de 2 px na cor da superfície**, e
 * não um contorno: contorno é tinta que não é dado, e com os tons quentes da
 * casa (que ficam a ΔE 2,7 um do outro na deuteranopia) é o vão que faz a
 * fronteira existir. Rótulo direto entra **só quando mede que cabe** — texto
 * cortado pela própria marca é pior do que texto ausente, e o valor nunca se
 * perde: a legenda abaixo tem todos.
 */
export function BarraEmpilhada({
  segmentos,
  resumo,
  formatar = String,
  mostrarLegenda = true,
}: {
  /** Cada segmento PRECISA de tom — é o que o diferencia do vizinho. */
  segmentos: (PontoGrafico & { tom: NonNullable<PontoGrafico["tom"]> })[];
  resumo: string;
  formatar?: FormatarValor;
  mostrarLegenda?: boolean;
}) {
  const total = segmentos.reduce((s, x) => s + Math.max(0, x.valor), 0);
  const visiveis = segmentos.filter((s) => s.valor > 0);

  // Todo o espaço dos vãos sai da largura útil, senão a barra estoura o
  // viewBox e o último segmento é cortado pelo `preserveAspectRatio`.
  const util = L - VAO * Math.max(0, visiveis.length - 1);

  // A posição de cada segmento é CALCULADA, não acumulada numa variável: um
  // `let` mutado durante o render é reprovado pelo compilador do React (e, com
  // renderização parcial, produziria posições diferentes entre passadas).
  const pecas = visiveis.map((s, i) => {
    const largura = (Math.max(0, s.valor) / total) * util;
    const inicio = visiveis
      .slice(0, i)
      .reduce((acc, a) => acc + (Math.max(0, a.valor) / total) * util + VAO, 0);
    return { s, largura, inicio, primeiro: i === 0, ultimo: i === visiveis.length - 1 };
  });

  return (
    <div className="grid gap-3">
      <svg
        viewBox={`0 0 ${L} ${ALTURA}`}
        role="img"
        aria-label={resumo}
        className="h-auto w-full"
      >
        {total === 0 ? (
          <rect
            x="0"
            y="0"
            width={L}
            height={ALTURA}
            rx="4"
            fill="var(--color-superficie-afundada)"
          />
        ) : null}
        {pecas.map(({ s, largura: w, inicio, primeiro, ultimo }) => {
          const texto = formatar(s.valor);
          const cabe = larguraTexto(texto, 11) + 12 <= w;
          return (
            <g key={s.rotulo}>
              {/* `<title>` PRIMEIRO: é assim que o navegador o adota como
                  dica nativa do grupo (e é o único "tooltip" possível num
                  componente sem JavaScript). */}
              <title>{`${s.rotulo}: ${texto}`}</title>
              {/* Só as pontas EXTERNAS são arredondadas (as pontas do dado);
                  as internas ficam retas, encostadas no vão. */}
              {primeiro && ultimo ? (
                <rect
                  x={inicio}
                  y={0}
                  width={w}
                  height={ALTURA}
                  rx={4}
                  fill={COR_DO_TOM[s.tom]}
                />
              ) : (
                <path
                  d={
                    primeiro
                      ? `M${inicio + 4},0H${inicio + w}V${ALTURA}H${inicio + 4}A4,4 0 0 1 ${inicio},${ALTURA - 4}V4A4,4 0 0 1 ${inicio + 4},0Z`
                      : ultimo
                        ? caminhoBarra(inicio, 0, w, ALTURA, "direita")
                        : `M${inicio},0H${inicio + w}V${ALTURA}H${inicio}Z`
                  }
                  fill={COR_DO_TOM[s.tom]}
                />
              )}
              {cabe ? (
                // Dentro de marca preenchida o texto é branco — os cinco tons
                // são escuros (≥ 4,8:1 com branco, medidos em `globals.css`).
                <text
                  x={inicio + w / 2}
                  y={ALTURA / 2 + 4}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="600"
                  fill={COR_SUPERFICIE}
                >
                  {texto}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
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
