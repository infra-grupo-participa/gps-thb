/**
 * Vocabulário dos gráficos do portal — tipo, cor e as duas contas de geometria
 * que os cinco desenhos dividem. Sem React, sem JSX.
 *
 * 🔑 POR QUE NÃO EXISTE PALETA CATEGÓRICA AQUI
 *
 * Os tokens semânticos da casa são QUENTES por desenho (sucesso #186A3B,
 * atenção #8A5300, risco #A32020, neutro #5C5751, marca #C74600). Medido com
 * o validador de paleta (OKLab, ΔE de CVD) contra o fundo do card:
 *
 *   #A32020 ↔ #8A5300   ΔE 2,7 (deuteranopia) · 11,3 (visão normal)  → REPROVA
 *   #8A5300 ↔ #186A3B   ΔE 4,7 (protanopia)                          → REPROVA
 *   #5C5751 ↔ #8A5300   ΔE 10,4 (visão normal)                       → REPROVA
 *   #C74600 ↔ #5C5751   ΔE 9,4 (protanopia) · 19,8 (normal)          → passa
 *
 * Ou seja: **cor nunca pode ser o único canal** nestes gráficos — nem para
 * quem enxerga todas as cores. A consequência está no desenho de todos eles:
 *
 * 1. `LegendaValores` é OBRIGATÓRIA (`mostrarLegenda` nasce `true`) e carrega
 *    a identidade em texto, com o quadradinho de cor ao lado, nunca no lugar;
 * 2. segmento vizinho se separa por um **vão de 2 px na cor da superfície**,
 *    não por contorno — é o vão que faz dois tons próximos lerem como dois;
 * 3. o gráfico inteiro é `role="img"` com `aria-label` contendo o resumo em
 *    número, então o leitor de tela nunca depende do desenho.
 *
 * O único par usado lado a lado sem apoio de texto é `marca` × `neutro` (as
 * duas linhas do card de atividade), que é justamente o par que passa.
 *
 * ⚠️ Não acrescentar cor nova (teal, azul, roxo) para "diferenciar série":
 * seria token fora do `globals.css` e mataria a regra de uma linguagem só.
 * Mais de 4 fatias? Vira barra horizontal, que rotula cada linha em texto.
 */

/** Os cinco papéis de cor que os gráficos aceitam. Nada fora desta lista. */
export type TomGrafico = "marca" | "sucesso" | "atencao" | "risco" | "neutro";

/**
 * Tom → variável CSS. Sempre `var(--…)`: o SVG herda o token do tema, e trocar
 * a cor no `globals.css` troca o gráfico junto.
 *
 * São as versões *foreground* dos pares semânticos (as escuras, medidas em
 * `globals.css`): preenchimento de marca precisa de contraste ≥ 3:1 contra o
 * card, e o lado claro do par (#E8F5EC e companhia) é fundo de chip, não
 * marca de dado.
 */
export const COR_DO_TOM: Record<TomGrafico, string> = {
  marca: "var(--color-marca-acao)",
  sucesso: "var(--color-sucesso-foreground)",
  atencao: "var(--color-atencao-foreground)",
  risco: "var(--color-risco-foreground)",
  neutro: "var(--color-neutro-foreground)",
};

/** Um valor com nome. É a unidade de todos os cinco gráficos. */
export interface PontoGrafico {
  rotulo: string;
  valor: number;
  /** Sem tom, o gráfico usa o dele (barras e linha são de uma cor só). */
  tom?: TomGrafico;
  /**
   * Percentual JÁ CALCULADO desta linha, quando o "de quanto" não é o total
   * da série. O funil usa isto para dizer a conversão da etapa ANTERIOR — e
   * deixa a primeira etapa sem `pct`, porque "100% de si mesma" é tinta.
   */
  pct?: number | null;
}

/** Formatador do valor exibido. `brlCompacto`, `String`, o que o card quiser. */
export type FormatarValor = (valor: number) => string;

/** Cor da superfície onde o gráfico é desenhado — o vão de 2 px é dela. */
export const COR_SUPERFICIE = "var(--card)";

/**
 * Caminho de uma barra com **as duas pontas do lado do dado arredondadas em
 * 4 px e as do lado da linha de base retas** (spec de marca da casa).
 *
 * `direcao`:
 *   "cima"    coluna que cresce para cima  (arredonda o topo)
 *   "direita" barra que cresce para a direita (arredonda a ponta direita)
 *
 * O raio encolhe sozinho quando a barra é mais curta que ele — sem isso, uma
 * barra de 2 px com raio 4 vira um arco torto (ou `NaN` no `arcTo`).
 */
export function caminhoBarra(
  x: number,
  y: number,
  largura: number,
  altura: number,
  direcao: "cima" | "direita",
  raio = 4,
): string {
  const l = Math.max(0, largura);
  const a = Math.max(0, altura);
  if (l === 0 || a === 0) return "";
  if (direcao === "cima") {
    const r = Math.min(raio, l / 2, a);
    return `M${x},${y + a}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}H${x + l - r}A${r},${r} 0 0 1 ${x + l},${y + r}V${y + a}Z`;
  }
  const r = Math.min(raio, a / 2, l);
  return `M${x},${y}H${x + l - r}A${r},${r} 0 0 1 ${x + l},${y + r}V${y + a - r}A${r},${r} 0 0 1 ${x + l - r},${y + a}H${x}Z`;
}

/**
 * Escala linear valor → pixel, com o teto SEMPRE ≥ 1.
 *
 * Uma série inteira zerada (o card 5 nasce assim, e o funil tem uma etapa em
 * 0) dividiria por zero e produziria `NaN` no atributo `d` — que o navegador
 * descarta em silêncio e deixa o card com uma moldura vazia, sem erro no
 * console. Piso de 1 evita a classe inteira.
 */
export function escala(valores: number[], tamanho: number): (v: number) => number {
  const teto = Math.max(1, ...valores.map((v) => (Number.isFinite(v) ? v : 0)));
  return (v) => (Number.isFinite(v) && v > 0 ? (v / teto) * tamanho : 0);
}

/**
 * Largura aproximada de um texto em SVG, em unidades do `viewBox`.
 *
 * Serve para decidir se um rótulo CABE dentro de um segmento antes de
 * desenhá-lo: rótulo cortado por `overflow` é pior do que rótulo ausente, e o
 * valor nunca se perde — a legenda abaixo carrega todos.
 *
 * 0,58 em é a média da Inter para dígito e minúscula; é estimativa, e por isso
 * a folga exigida por quem chama é generosa (8 px).
 */
export function larguraTexto(texto: string, tamanhoFonte: number): number {
  return texto.length * tamanhoFonte * 0.58;
}
