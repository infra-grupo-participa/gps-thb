/**
 * Vocabulário dos gráficos do portal — tipo, cor e as contas que os seis
 * desenhos dividem. Sem React, sem JSX.
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
 * 1. o número aparece **em texto**, sempre: rótulo direto na barra, valor no
 *    miolo da rosca, ou `LegendaValores` (que carrega a identidade escrita,
 *    com o quadradinho de cor ao lado, nunca no lugar);
 * 2. segmento vizinho se separa por um **vão de 2 px na cor da superfície**,
 *    não por contorno — é o vão que faz dois tons próximos lerem como dois;
 * 3. o desenho puramente geométrico (rosca, linha, colunas) é `role="img"`
 *    com `aria-label` contendo o resumo em número.
 *
 * O único par usado lado a lado sem apoio de texto é `marca` × `neutro` (as
 * duas linhas do card de atividade), que é justamente o par que passa.
 *
 * ⚠️ Não acrescentar cor nova (teal, azul, roxo) para "diferenciar série":
 * seria token fora do `globals.css` e mataria a regra de uma linguagem só.
 * Mais de 4 fatias? Vira barra horizontal, que rotula cada linha em texto.
 *
 * 🔑 **POR QUE HTML NO LUGAR DE SVG** (redesign de 11/09)
 *
 * Texto dentro de `viewBox` encolhe junto com a largura do card: os gráficos
 * anteriores desenhavam rótulo e valor em `<text>` de 9–11 unidades, e num
 * card de 300 px eles saíam a ~8 px — ilegíveis, exatamente o "visual cru" que
 * o João reclamou. Barra, coluna e linha de conversão viraram **HTML com
 * altura em `%`**: a proporção é a mesma, mas o texto é texto de verdade, na
 * escala tipográfica da casa, e **não encolhe nunca**.
 *
 * Sobrou SVG só onde a geometria não tem equivalente em caixa: o arco da
 * rosca e o traçado da linha. Nos dois, o texto vive FORA do `viewBox`
 * (miolo da rosca e eixos são HTML sobreposto), então continua sem encolher.
 *
 * Continua tudo Server Component, **0 KB de JavaScript**.
 */

/** Os cinco papéis de cor que os gráficos aceitam. Nada fora desta lista. */
export type TomGrafico = "marca" | "sucesso" | "atencao" | "risco" | "neutro";

/**
 * Tom → variável CSS. Sempre `var(--…)`: o desenho herda o token do tema, e
 * trocar a cor no `globals.css` troca o gráfico junto.
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

/** Um valor com nome. É a unidade de todos os gráficos. */
export interface PontoGrafico {
  rotulo: string;
  valor: number;
  /** Sem tom, o gráfico usa o dele (colunas e linha são de uma cor só). */
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
 * Percentual inteiro de `valor` sobre `total` — ou `null` quando não existe.
 *
 * 🔴 Denominador zero devolve **`null`**, nunca `0%` e nunca `NaN`. "0% de 0"
 * é uma afirmação sobre um conjunto vazio, e `NaN%` na tela é o defeito que
 * denuncia que ninguém olhou. Quem chama decide a palavra do vazio ("—").
 */
export function pctDe(valor: number, total: number): number | null {
  if (!Number.isFinite(valor) || !Number.isFinite(total) || total <= 0) return null;
  return Math.round((valor / total) * 100);
}

/**
 * Fração 0–100 de `valor` sobre o teto da série, para virar `height`/`width`
 * em CSS. O teto é SEMPRE ≥ 1: uma série inteira zerada (o funil tem uma
 * etapa em 0, e o onboarding nasce assim) dividiria por zero e produziria
 * `NaN%` — que o navegador descarta em silêncio e deixa o card com uma
 * moldura vazia, sem erro no console.
 */
export function fracaoDoTeto(valor: number, teto: number): number {
  const t = Math.max(1, teto);
  if (!Number.isFinite(valor) || valor <= 0) return 0;
  return Math.min(100, (valor / t) * 100);
}

/** O maior valor da série, com piso de 1 (ver `fracaoDoTeto`). */
export function tetoDaSerie(valores: number[]): number {
  return Math.max(1, ...valores.map((v) => (Number.isFinite(v) ? v : 0)));
}
