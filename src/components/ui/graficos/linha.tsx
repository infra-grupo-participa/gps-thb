import {
  COR_DO_TOM,
  COR_SUPERFICIE,
  escala,
  type FormatarValor,
  type PontoGrafico,
  type TomGrafico,
} from "./tipos";
import { LegendaValores } from "./legenda-valores";

const L = 320;
const TOPO = 6;
const BASE = 74;
const Y_ROTULO = 88;

export interface SerieLinha {
  rotulo: string;
  tom: TomGrafico;
  pontos: { rotulo: string; valor: number }[];
}

/**
 * Linhas ao longo do tempo — no máximo **duas séries**.
 *
 * 🔴 Duas, e um par específico: `marca` (#C74600) × `neutro` (#5C5751). É o
 * único par dos tokens da casa que passa na conta de separação (ΔE 9,4 em
 * protanopia, 19,8 em visão normal — os outros pares quentes ficam abaixo de
 * 5). Uma terceira linha exigiria cor nova, que é token fora do `globals.css`.
 * Precisa de mais séries? São dois gráficos, nunca duas escalas no mesmo.
 *
 * 🔑 A legenda aqui é de RESUMO, não ponto a ponto: 30 dias × 2 séries são 60
 * números, e sessenta números não são uma leitura — são um despejo. Cada série
 * vira UMA linha: nome, total do período e a fatia dele. O `<title>` de cada
 * série dá a inspeção que um Server Component sem JavaScript ainda pode dar.
 */
export function Linha({
  series,
  resumo,
  formatar = String,
  mostrarLegenda = true,
}: {
  series: SerieLinha[];
  resumo: string;
  formatar?: FormatarValor;
  mostrarLegenda?: boolean;
}) {
  const pontos = series.flatMap((s) => s.pontos.map((p) => p.valor));
  if (pontos.length === 0) return null;
  const alturaDe = escala(pontos, BASE - TOPO);
  const n = Math.max(...series.map((s) => s.pontos.length));
  // 5 unidades de margem nas duas pontas: o marcador tem raio 4 + anel de 2,
  // e encostado em x=0/x=L metade dele fica fora do `viewBox` e é cortado.
  const xDe = (i: number) => (n <= 1 ? L / 2 : 6 + (i / (n - 1)) * (L - 12));
  const primeiro = series[0].pontos[0]?.rotulo ?? "";
  const ultimo = series[0].pontos[series[0].pontos.length - 1]?.rotulo ?? "";

  const resumoDaSerie: PontoGrafico[] = series.map((s) => ({
    rotulo: s.rotulo,
    valor: s.pontos.reduce((a, p) => a + p.valor, 0),
    tom: s.tom,
  }));
  const totalDoPeriodo = resumoDaSerie.reduce((a, s) => a + s.valor, 0);

  return (
    <div className="grid gap-3">
      <svg
        viewBox={`0 0 ${L} 96`}
        role="img"
        aria-label={resumo}
        className="h-auto w-full"
      >
        <line
          x1="0"
          y1={BASE + 0.5}
          x2={L}
          y2={BASE + 0.5}
          stroke="var(--color-borda-fina)"
          strokeWidth="1"
        />
        {series.map((s) => {
          const d = s.pontos
            .map(
              (p, i) =>
                `${i === 0 ? "M" : "L"}${xDe(i).toFixed(1)},${(BASE - alturaDe(p.valor)).toFixed(1)}`,
            )
            .join("");
          const fim = s.pontos.length - 1;
          return (
            <g key={s.rotulo}>
              <title>{`${s.rotulo}`}</title>
              <path
                d={d}
                fill="none"
                stroke={COR_DO_TOM[s.tom]}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {fim >= 0 ? (
                // Marcador da ponta com anel de 2 px na cor da superfície:
                // quando as duas linhas terminam juntas, é o anel que impede
                // que virem uma mancha só.
                <circle
                  cx={xDe(fim)}
                  cy={BASE - alturaDe(s.pontos[fim].valor)}
                  r="4"
                  fill={COR_DO_TOM[s.tom]}
                  stroke={COR_SUPERFICIE}
                  strokeWidth="2"
                />
              ) : null}
            </g>
          );
        })}
        <text x="0" y={Y_ROTULO} fontSize="9" fill="var(--muted-foreground)">
          {primeiro}
        </text>
        <text
          x={L}
          y={Y_ROTULO}
          textAnchor="end"
          fontSize="9"
          fill="var(--muted-foreground)"
        >
          {ultimo}
        </text>
      </svg>
      {mostrarLegenda ? (
        <LegendaValores
          linhas={resumoDaSerie}
          formatar={formatar}
          total={totalDoPeriodo || undefined}
        />
      ) : null}
    </div>
  );
}
