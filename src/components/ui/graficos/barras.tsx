import {
  COR_DO_TOM,
  caminhoBarra,
  escala,
  larguraTexto,
  type FormatarValor,
  type PontoGrafico,
  type TomGrafico,
} from "./tipos";
import { TabelaValores } from "./tabela-valores";

const L = 320; // largura do viewBox — o SVG escala sozinho no card
const TOPO = 18; // respiro do rótulo direto acima da coluna mais alta
const BASE = 82; // linha de base (vertical)
const Y_ROTULO = 96;

/**
 * Barras — série de UMA cor, comparação de magnitude.
 *
 * Duas orientações, um conceito só:
 *
 * - `"vertical"` (padrão) para **sequência**: os 12 meses de entrada, as 4
 *   faixas de progresso. O eixo horizontal é o tempo/a ordem, e o rótulo curto
 *   ("set", "50–99%") cabe embaixo da coluna.
 * - `"horizontal"` para **categoria nominal** com nome longo: os 6 graus de
 *   relação. Cada linha é nome + número em TEXTO, com a barra como apoio —
 *   nome escrito é o canal de identidade que a cor não dá (ver `tipos.ts`).
 *   É por isso que categoria nominal aqui NUNCA vira rosca: 6 fatias quentes
 *   não se separam, 6 linhas rotuladas se leem sem esforço. Este modo não usa
 *   SVG (a razão está no corpo) e por isso ignora `mostrarTabela`: a lista JÁ
 *   é a tabela de valores.
 *
 * Server Component, zero JS.
 *
 * No modo vertical, sem gradeado de propósito: a regra é "rótulo direto antes
 * de grade", e a tabela abaixo carrega **todos** os valores — grade seria
 * tinta que não é dado. Fica a linha de base, que é o zero.
 */
export function Barras({
  dados,
  resumo,
  tom = "marca",
  orientacao = "vertical",
  formatar = String,
  mostrarTabela = true,
  tituloTabela,
  colunasTabela = 1,
}: {
  dados: PontoGrafico[];
  /** Frase com os números — vira o `aria-label` do gráfico. Obrigatória. */
  resumo: string;
  tom?: TomGrafico;
  orientacao?: "vertical" | "horizontal";
  formatar?: FormatarValor;
  mostrarTabela?: boolean;
  tituloTabela?: string;
  /** `2` para série longa (os 12 meses) — ver `TabelaValores`. */
  colunasTabela?: 1 | 2;
}) {
  if (dados.length === 0) return null;

  if (orientacao === "horizontal") {
    // 🔑 O modo horizontal é HTML, não SVG — e a razão foi MEDIDA. Texto dentro
    // de `viewBox` encolhe junto com a largura: os 6 rótulos de grau de relação
    // saíam a ~6 px num viewport de 390 px, ilegíveis. Em HTML o rótulo é texto
    // de verdade, na escala tipográfica da casa, e não encolhe nunca.
    //
    // Por isso aqui também não existe `role="img"` nem `aria-label`: cada linha
    // já é nome + número em texto, que é a forma mais acessível possível. A
    // barra é decoração da linha (`aria-hidden`), no molde da `BarraMeta` do
    // `KpiCard`.
    const teto = Math.max(1, ...dados.map((d) => d.valor));
    return (
      <ul className="grid gap-2">
        {dados.map((d, i) => (
          <li key={`${d.rotulo}-${i}`} className="grid gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 corpo-sm text-muted-foreground">
                {d.rotulo}
              </span>
              <span className="numero shrink-0 corpo-sm font-semibold">
                {formatar(d.valor)}
              </span>
            </div>
            <div
              aria-hidden
              className="h-2 w-full overflow-hidden rounded-full bg-superficie-afundada inset-ring inset-ring-black/5"
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(Math.max(0, d.valor) / teto) * 100}%`,
                  backgroundColor: COR_DO_TOM[d.tom ?? tom],
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  const alturaDe = escala(
    dados.map((d) => d.valor),
    BASE - TOPO,
  );
  const banda = L / dados.length;
  const largura = Math.max(4, Math.min(24, banda - 6));
  const pico = dados.reduce((a, b) => (b.valor > a.valor ? b : a));
  const ultimo = dados[dados.length - 1];

  return (
    <div className="grid gap-3">
      <svg
        viewBox={`0 0 ${L} 104`}
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
        {dados.map((d, i) => {
          const alt = alturaDe(d.valor);
          const x = i * banda + (banda - largura) / 2;
          // Rótulo direto só no PICO e no ÚLTIMO (o mês corrente): número em
          // cima de toda coluna vira ruído e ninguém lê.
          const rotular = d === pico || d === ultimo;
          const texto = formatar(d.valor);
          return (
            <g key={`${d.rotulo}-${i}`}>
              <title>{`${d.rotulo}: ${texto}`}</title>
              {alt > 0 ? (
                <path
                  d={caminhoBarra(x, BASE - alt, largura, alt, "cima")}
                  fill={COR_DO_TOM[d.tom ?? tom]}
                />
              ) : (
                // Zero é resultado: um traço de 2 px na linha de base diz
                // "medimos e deu zero". Sem ele, o mês vazio some e parece
                // que o dado não chegou.
                <rect
                  x={x}
                  y={BASE - 2}
                  width={largura}
                  height={2}
                  fill="var(--color-borda-forte)"
                />
              )}
              {rotular && larguraTexto(texto, 10) <= banda ? (
                <text
                  x={x + largura / 2}
                  y={BASE - alt - 5}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="600"
                  fill="var(--foreground)"
                >
                  {texto}
                </text>
              ) : null}
              <text
                x={x + largura / 2}
                y={Y_ROTULO}
                textAnchor="middle"
                fontSize="9"
                fill="var(--muted-foreground)"
              >
                {d.rotulo}
              </text>
            </g>
          );
        })}
      </svg>
      {mostrarTabela ? (
        <TabelaValores
          titulo={tituloTabela ?? resumo}
          linhas={dados}
          formatar={formatar}
          tomPadrao={tom}
          colunas={colunasTabela}
        />
      ) : null}
    </div>
  );
}
