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
  /**
   * Como esta série é desenhada. **Padrão `"linha"`** — nenhum consumidor
   * existente muda de forma por esta prop ter nascido.
   *
   * 🔑 `"barra"` existe para o CRUZAMENTO de duas séries no mesmo eixo de
   * tempo: a grandeza de fundo (volume por período) vira coluna e a outra
   * corre por cima como linha. Duas linhas contam "duas curvas"; barra + linha
   * conta "o pedaço dentro do todo", que é uma leitura diferente.
   *
   * 🔴 O mesmo eixo Y continua valendo para as duas. **A trava não é desta
   * peça, é de quem chama**: só cruze aqui grandezas que compartilham unidade
   * e onde a comparação direta seja verdadeira. Escala dupla continua proibida
   * (ver `tipos.ts`) — e barra + linha em escalas diferentes seria exatamente
   * a escala dupla disfarçada de desenho novo.
   *
   * ⚠️ `area` é ignorado em `"barra"` (a coluna já é preenchimento); e a
   * ordem importa: a barra é desenhada ATRÁS, a linha por cima.
   */
  forma?: "linha" | "barra";
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
 *
 * 🔑 **`forma` por série** (23/09/2026): `"linha"` (padrão, o contrato de
 * sempre) ou `"barra"`. Barra + linha no mesmo eixo de tempo é o desenho do
 * CRUZAMENTO — ver `SerieLinha.forma` para o que isso exige de quem chama.
 * As barras são HTML por cima do gradeado, pelo mesmo motivo que o texto
 * saiu do `viewBox`: `preserveAspectRatio="none"` estica preenchimento.
 */
export function Linha({
  series,
  resumo,
  formatar = String,
  mostrarLegenda = true,
  altura = 200,
  indiceHachurado,
  rotulosNoEixoX = ROTULOS_NO_EIXO_X,
}: {
  series: SerieLinha[];
  resumo: string;
  formatar?: FormatarValor;
  mostrarLegenda?: boolean;
  /** Altura da área de plotagem, em px. */
  altura?: number;
  /**
   * Índice do ponto desenhado como **período incompleto** — hachura na barra.
   * É a semana corrente: sem marca, a barra baixa lê-se como queda.
   *
   * Vale só para série `forma: "barra"`; a linha por cima não muda (o traçado
   * é contínuo, e interrompê-lo sugeriria dado ausente em vez de parcial).
   */
  indiceHachurado?: number;
  /** Quantos rótulos de tempo cabem no eixo X sem virar borrão. */
  rotulosNoEixoX?: number;
}) {
  const valores = series.flatMap((s) => s.pontos.map((p) => p.valor));
  if (valores.length === 0) return null;

  const teto = tetoDaSerie(valores);
  const n = Math.max(...series.map((s) => s.pontos.length));

  /**
   * 🔴 **A FAIXA INTERNA das barras — e por que ela vale para o eixo X
   * INTEIRO, não só para a série em barra.**
   *
   * A barra é `left: xDe(i)%` com `-translate-x-1/2`, ou seja, ela ocupa
   * `[xDe(i) − w/2, xDe(i) + w/2]`. Com o eixo cru (`xDe(0) = 0`,
   * `xDe(n−1) = 100`) a primeira barra começa em `−w/2` e a última termina em
   * `100 + w/2`: metade de cada barra das pontas fica FORA da caixa de
   * plotagem. Medido em Chromium (1920, 23/09/2026): a primeira barra (72 px)
   * invadia 36 px para a esquerda e pintava por cima do "0" do eixo Y; a
   * última passava 19 px da borda do card. Em 390 px, 9,8 px de cada lado.
   *
   * A correção é mapear `i` para `[w/2, 100 − w/2]` em vez de `[0, 100]`.
   * Com isso a primeira barra começa exatamente em 0 e a última termina
   * exatamente em 100 — ela encosta na borda, não a atravessa.
   *
   * 🔴 **A LINHA usa o MESMO `xDe`.** Se o eixo recuasse só para as barras, o
   * ponto da linha da semana `i` cairia em `i/(n−1)*100` enquanto o centro da
   * barra da MESMA semana estaria em `w/2 + i/(n−1)*(100−w)` — as duas séries
   * falariam de semanas diferentes na mesma vertical, que é exatamente a
   * mentira que o cruzamento existe para não contar. Mesma coisa para os
   * rótulos do eixo X, que também saem de `xDe`.
   *
   * Sem nenhuma série em barra, `recuo` é 0 e `xDe` volta a ser o mapeamento
   * de sempre — os consumidores só de linha não mudam de pixel.
   */
  const temBarra = series.some((s) => s.forma === "barra");
  /** Largura da barra, em % da caixa de plotagem. Espelha o `width` abaixo. */
  const larguraBarra = n <= 1 ? 40 : (100 / (n - 1)) * 0.62;
  const recuo = temBarra ? larguraBarra / 2 : 0;
  const xDe = (i: number) =>
    n <= 1 ? 50 : recuo + (i / (n - 1)) * (100 - 2 * recuo);
  const yDe = (v: number) => 100 - fracaoDoTeto(v, teto);

  // Rótulos esparsos: um a cada ~5 dias, e o último dia sempre. Trinta
  // rótulos de "01/09" no mesmo eixo se sobrepõem e nenhum é lido.
  //
  // 🔑 O penúltimo escolhido SAI quando cai a menos de meio passo do último —
  // é o "07/0909/09" que a captura de 11/09 pegou: dois rótulos colados viram
  // um borrão que não é nenhum dos dois.
  const passo = Math.max(1, Math.ceil(n / rotulosNoEixoX));
  const indicesX = Array.from({ length: n }, (_, i) => i)
    .filter((i) => i % passo === 0 || i === n - 1)
    .filter((i, k, todos) => {
      const proximo = todos[k + 1];
      return proximo === undefined || proximo - i > passo / 2;
    });
  const rotulosX = series[0]?.pontos ?? [];

  /**
   * 🔴 **Quais rótulos somem abaixo do `sm` — a paridade conta DO FIM, não do
   * começo.**
   *
   * A regra antiga era `k % 2 === 1`, com uma exceção para nunca esconder o
   * último. Numa lista de tamanho PAR isso guardava os dois últimos lado a
   * lado: com 10 semanas, sobravam os índices 0,2,4,6,8 **e** 9 — e 8 e 9 são
   * vizinhos imediatos. Medido em 390 px (plot ~356 px, rótulo `21/09` ~40 px):
   * o penúltimo ia até 326,9 px e o último começava em 303,7 px — **23 px de
   * sobreposição**, exatamente o borrão que a regra existia para evitar.
   *
   * Contando a paridade a partir do fim (`ultimo - k`), o último é sempre par
   * (fica) e o vizinho dele é sempre ímpar (sai) — o espaçamento vira uniforme
   * de ponta a ponta, sem caso especial e sem depender de a lista ser par ou
   * ímpar. Com 10 semanas sobram 1,3,5,7,9: gaps de ~33 px entre todos.
   *
   * ⚠️ O último NUNCA sai: é a semana corrente, a única que a legenda
   * `em curso` está explicando.
   */
  const escondeNoCelular = (k: number) => (indicesX.length - 1 - k) % 2 === 1;

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

          {/* 🔑 As BARRAS são HTML, não SVG — e a razão é a mesma que tirou o
              texto do `viewBox` em 11/09. O `viewBox` daqui usa
              `preserveAspectRatio="none"`, então um `<rect>` teria a largura
              esticada pela caixa do card: a mesma barra mediria 6 px num card
              estreito e 40 px num largo, e `vector-effect` só salva TRAÇO, não
              preenchimento. Em HTML a coluna é uma fração da faixa do ponto e
              se comporta igual em qualquer largura.

              Ficam ANTES do `<svg>` no DOM: a linha tem de cruzar por cima da
              barra, senão a série de menor valor desaparece atrás dela. */}
          {series.map((s) =>
            s.forma !== "barra" ? null : (
              <div key={`barras-${s.rotulo}`} aria-hidden>
                {s.pontos.map((p, i) => {
                  const f = fracaoDoTeto(p.valor, teto);
                  const cor = COR_DO_TOM[s.tom];
                  const parcial = i === indiceHachurado;
                  return (
                    <span
                      key={`${p.rotulo}-${i}`}
                      className="absolute bottom-0 -translate-x-1/2 rounded-t-[3px]"
                      style={{
                        left: `${xDe(i)}%`,
                        // Largura em % da faixa de UM ponto, com folga entre
                        // colunas. Com n=1 o `xDe` devolve 50 e a barra fica
                        // centrada, sem divisão por zero.
                        //
                        // 🔴 É a MESMA `larguraBarra` que define o recuo do
                        // eixo X lá em cima — as duas têm de sair da mesma
                        // conta, senão a barra da ponta volta a transbordar
                        // pela diferença. Não duplicar a fórmula aqui.
                        width: `${larguraBarra.toFixed(2)}%`,
                        height: `${f}%`,
                        // Zero é resultado: o traço de 2 px diz "medimos e deu
                        // zero" em vez de sumir e parecer dado que não chegou.
                        minHeight: "2px",
                        backgroundColor:
                          p.valor > 0 ? cor : "var(--color-borda-forte)",
                        // Período incompleto: hachura + opacidade. São DOIS
                        // canais porque hachura fina some em tela densa e
                        // opacidade sozinha lê-se como "menos importante".
                        ...(parcial
                          ? {
                              opacity: 0.55,
                              backgroundImage: `repeating-linear-gradient(135deg, transparent 0 3px, var(--card) 3px 5px)`,
                            }
                          : null),
                      }}
                    />
                  );
                })}
              </div>
            ),
          )}

          <svg
            aria-hidden
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 size-full"
          >
            {series.map((s) => {
              if (s.forma === "barra") return null;
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
            // Série em barra não leva marcador de ponta: a coluna já termina
            // na própria altura, e o anel flutuando sobre ela vira sujeira.
            if (s.forma === "barra") return null;
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
            // um sim, um não some abaixo do `sm` — contado DO FIM, para o
            // último (a semana corrente) ficar sempre e nunca colar no vizinho.
            // Ver `escondeNoCelular`.
            //
            // 🔑 As pontas ancoram pela BORDA (`translate-x-0` / `-translate-x-full`)
            // e não pelo centro: assim o rótulo da primeira e o da última
            // semana não vazam da caixa. Com o recuo das barras, `xDe(0)` já
            // é `w/2` — o rótulo nasce alinhado à borda esquerda da primeira
            // barra, que é onde a coluna de fato começa.
            className={`absolute corpo-sm whitespace-nowrap text-muted-foreground ${
              escondeNoCelular(k) ? "max-sm:hidden" : ""
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
