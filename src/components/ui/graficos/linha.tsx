import {
  COR_DO_TOM,
  fracaoDoTeto,
  tetoDaSerie,
  type FormatarValor,
  type PontoGrafico,
  type TomGrafico,
} from "./tipos";
import { LegendaValores } from "./legenda-valores";

/** Quantos rótulos de dia cabem no eixo x sem virar um borrão. */
const ROTULOS_NO_EIXO_X = 6;

export interface SerieLinha {
  rotulo: string;
  tom: TomGrafico;
  pontos: { rotulo: string; valor: number }[];
  /** Preenche a área sob a linha. Use em UMA série — duas viram lama. */
  area?: boolean;
  /**
   * Escreve o valor do último ponto ao lado do marcador. Vale para UMA série:
   * duas etiquetas na mesma vertical se sobrepõem em silêncio, e o total de
   * cada série já está na legenda.
   */
  valorNoFim?: boolean;
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
 * 🔑 **Só o traçado é SVG.** O `viewBox` é `0 0 100 100` com
 * `preserveAspectRatio="none"`, ou seja, a geometria estica para a caixa que
 * o card der (`altura` em px) — e a espessura da linha sobrevive a isso por
 * `vector-effect="non-scaling-stroke"`. Eixos, gradeado, marcador da ponta e
 * rótulos são **HTML por cima**: texto de verdade, que não encolhe com a
 * largura do card. Era esse encolhimento que fazia a série de 30 dias virar
 * uma "serpentina de 40 px" no diagnóstico de 11/09.
 *
 * 🔑 A legenda é de RESUMO, não ponto a ponto: 30 dias × 2 séries são 60
 * números, e sessenta números não são uma leitura — são um despejo. Cada série
 * vira UMA linha: nome, total do período e a fatia dele.
 */
export function Linha({
  series,
  resumo,
  formatar = String,
  mostrarLegenda = true,
  altura = 200,
}: {
  series: SerieLinha[];
  resumo: string;
  formatar?: FormatarValor;
  mostrarLegenda?: boolean;
  /** Altura da área de plotagem, em px. */
  altura?: number;
}) {
  const valores = series.flatMap((s) => s.pontos.map((p) => p.valor));
  if (valores.length === 0) return null;

  const teto = tetoDaSerie(valores);
  const n = Math.max(...series.map((s) => s.pontos.length));
  const xDe = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);
  const yDe = (v: number) => 100 - fracaoDoTeto(v, teto);

  // Rótulos esparsos: um a cada ~5 dias, e o último dia sempre. Trinta
  // rótulos de "01/09" no mesmo eixo se sobrepõem e nenhum é lido.
  //
  // 🔑 O penúltimo escolhido SAI quando cai a menos de meio passo do último —
  // é o "07/0909/09" que a captura de 11/09 pegou: dois rótulos colados viram
  // um borrão que não é nenhum dos dois.
  const passo = Math.max(1, Math.ceil(n / ROTULOS_NO_EIXO_X));
  const indicesX = Array.from({ length: n }, (_, i) => i)
    .filter((i) => i % passo === 0 || i === n - 1)
    .filter((i, k, todos) => {
      const proximo = todos[k + 1];
      return proximo === undefined || proximo - i > passo / 2;
    });
  const rotulosX = series[0]?.pontos ?? [];

  const resumoDaSerie: PontoGrafico[] = series.map((s) => ({
    rotulo: s.rotulo,
    valor: s.pontos.reduce((a, p) => a + p.valor, 0),
    tom: s.tom,
  }));
  const totalDoPeriodo = resumoDaSerie.reduce((a, s) => a + s.valor, 0);

  const eixoY = [teto, Math.round(teto / 2), 0];

  return (
    <div className="grid gap-3">
      <div role="img" aria-label={resumo} className="flex gap-2">
        {/* Eixo Y: três valores, o suficiente para dar escala sem virar grade
            de tabela. Ficam FORA do desenho, em texto de verdade. */}
        <div
          className="relative w-8 shrink-0"
          style={{ height: `${altura}px` }}
        >
          {eixoY.map((v, i) => (
            <span
              key={`${v}-${i}`}
              className="numero absolute right-0 translate-y-1/2 text-[11px] text-muted-foreground"
              style={{ bottom: `${[100, 50, 0][i]}%` }}
            >
              {formatar(v)}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1" style={{ height: `${altura}px` }}>
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

          <svg
            aria-hidden
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 size-full"
          >
            {series.map((s) => {
              const pts = s.pontos
                .map((p, i) => `${xDe(i).toFixed(2)},${yDe(p.valor).toFixed(2)}`)
                .join(" L");
              return (
                <g key={s.rotulo}>
                  {s.area ? (
                    <path
                      d={`M${pts} L${xDe(s.pontos.length - 1).toFixed(2)},100 L${xDe(0).toFixed(2)},100 Z`}
                      fill={COR_DO_TOM[s.tom]}
                      opacity={0.14}
                    />
                  ) : null}
                  <path
                    d={`M${pts}`}
                    fill="none"
                    stroke={COR_DO_TOM[s.tom]}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              );
            })}
          </svg>

          {/* Marcador da ponta com anel na cor do card: quando as duas linhas
              terminam juntas, é o anel que impede que virem uma mancha só. */}
          {series.map((s) => {
            const fim = s.pontos.length - 1;
            if (fim < 0) return null;
            const p = s.pontos[fim];
            const f = fracaoDoTeto(p.valor, teto);
            return (
              <span key={`ponta-${s.rotulo}`}>
                <span
                  aria-hidden
                  className="absolute size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full ring-2 ring-card"
                  style={{
                    left: `${xDe(fim)}%`,
                    bottom: `${f}%`,
                    backgroundColor: COR_DO_TOM[s.tom],
                  }}
                />
                {s.valorNoFim ? (
                  // Fundo na cor do card: o rótulo do último dia cai em cima
                  // do traçado e do marcador da outra série, e sem a máscara
                  // os três viram uma mancha (medido em 11/09).
                  <span
                    className="numero absolute right-1 rounded bg-card px-1 corpo-sm font-semibold whitespace-nowrap"
                    style={{ bottom: `calc(${f}% + 9px)` }}
                  >
                    {formatar(p.valor)}
                  </span>
                ) : null}
              </span>
            );
          })}
        </div>
      </div>

      <div className="relative ml-10 h-4">
        {indicesX.map((i, k) => (
          <span
            key={i}
            // 🔑 Num card de 300 px (celular) seis rótulos de "11/08" se
            // encostam. Não dá para medir largura num Server Component, então
            // a metade do meio some abaixo do `sm` — e as pontas, que ancoram
            // a série, ficam sempre.
            className={`absolute corpo-sm whitespace-nowrap text-muted-foreground ${
              k % 2 === 1 && k !== indicesX.length - 1 ? "max-sm:hidden" : ""
            } ${
              i === 0
                ? "translate-x-0"
                : i === n - 1
                  ? "-translate-x-full"
                  : "-translate-x-1/2"
            }`}
            style={{ left: `${xDe(i)}%` }}
          >
            {rotulosX[i]?.rotulo ?? ""}
          </span>
        ))}
      </div>

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
