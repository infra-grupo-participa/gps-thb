import { COR_DO_TOM, type FormatarValor, type PontoGrafico } from "./tipos";
import { LegendaValores } from "./legenda-valores";

const R = 42; // raio da linha média do anel
const ESPESSURA = 16;
const VAO_GRAUS = 3; // o vão entre fatias, em graus do círculo

/**
 * Rosca (a "pizza" do pedido) — parte-e-todo de **até 4 fatias**.
 *
 * 🔴 Teto de 4 é regra, não estilo. Fatia fina não se lê, e os tons quentes
 * da casa não se separam por cor (a conta está em `tipos.ts`): com 5, 6 ou 7
 * categorias a peça certa é a barra horizontal, que rotula cada linha em
 * texto. Se a série crescer, troque o gráfico — não acrescente cor.
 *
 * O anel é desenhado com `stroke-dasharray` sobre `<circle pathLength="100">`:
 * a conta vira porcentagem direta, sem trigonometria e sem `NaN` quando o
 * total é zero. O vão de 3° entre fatias é o mesmo mecanismo da barra
 * empilhada — separação por superfície, nunca por contorno.
 *
 * 🔑 **O miolo é HTML sobreposto, não `<text>` do SVG.** Dentro do `viewBox`
 * o número encolhia junto com o card; aqui ele é `numero-lg` de verdade, na
 * escala tipográfica da casa, e o `tamanho` do anel é prop em pixels — foi o
 * "gráfico que não aparece" do diagnóstico de 11/09.
 */
export function Rosca({
  fatias,
  resumo,
  centroValor,
  centroRotulo,
  formatar = String,
  mostrarLegenda = true,
  tamanho = 168,
}: {
  fatias: (PontoGrafico & { tom: NonNullable<PontoGrafico["tom"]> })[];
  /** Frase com os números — vira o `aria-label` do anel. Obrigatória. */
  resumo: string;
  /** Número grande no miolo. Sem ele o anel não diz nada sozinho. */
  centroValor: string;
  centroRotulo?: string;
  formatar?: FormatarValor;
  mostrarLegenda?: boolean;
  /** Diâmetro do anel, em px. */
  tamanho?: number;
}) {
  const total = fatias.reduce((s, f) => s + Math.max(0, f.valor), 0);
  const visiveis = fatias.filter((f) => f.valor > 0);
  const vaoPct = visiveis.length > 1 ? (VAO_GRAUS / 360) * 100 : 0;

  // Início de cada arco CALCULADO, não acumulado num `let`: mutar variável
  // durante o render é reprovado pelo compilador do React.
  const arcos = visiveis.map((f, i) => {
    const pct = (Math.max(0, f.valor) / total) * 100;
    const inicio = visiveis
      .slice(0, i)
      .reduce((acc, a) => acc + (Math.max(0, a.valor) / total) * 100, 0);
    return { f, desenhado: Math.max(0, pct - vaoPct), inicio };
  });

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
      <div
        className="relative shrink-0"
        style={{ width: `${tamanho}px`, height: `${tamanho}px` }}
      >
        <svg
          viewBox="0 0 100 100"
          role="img"
          aria-label={resumo}
          className="size-full"
        >
          {/* Trilho — é ele que faz "ninguém respondeu ainda" ler como zero em
              vez de gráfico que não carregou. */}
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke="var(--color-superficie-afundada)"
            strokeWidth={ESPESSURA}
          />
          {arcos.map(({ f, desenhado, inicio }) => (
            <circle
              key={f.rotulo}
              cx="50"
              cy="50"
              r={R}
              fill="none"
              stroke={COR_DO_TOM[f.tom]}
              strokeWidth={ESPESSURA}
              strokeLinecap="butt"
              pathLength={100}
              strokeDasharray={`${desenhado} ${100 - desenhado}`}
              strokeDashoffset={-inicio}
              // O caminho de um `<circle>` começa às 3 h; a rotação põe o
              // zero às 12 h, que é onde o olho procura o início.
              transform="rotate(-90 50 50)"
            >
              <title>{`${f.rotulo}: ${formatar(f.valor)}`}</title>
            </circle>
          ))}
        </svg>
        <div
          aria-hidden
          className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 text-center"
        >
          <span className="numero-lg leading-none">{centroValor}</span>
          {centroRotulo ? (
            <span className="corpo-sm text-muted-foreground">{centroRotulo}</span>
          ) : null}
        </div>
      </div>
      {mostrarLegenda ? (
        <div className="min-w-[11rem] flex-1">
          <LegendaValores
            linhas={fatias}
            formatar={formatar}
            total={total || undefined}
          />
        </div>
      ) : null}
    </div>
  );
}
