import { cn } from "@/lib/utils";
import { COR_DO_TOM, fracaoDoTeto, pctDe, type TomGrafico } from "./tipos";

/** Um estágio: quantos ALCANÇARAM, sobre o denominador único da escada. */
export interface DegrauAlcance {
  rotulo: string;
  valor: number;
  tom?: TomGrafico;
  /**
   * Quantos alcançaram este estágio **sem** ter alcançado o anterior. Escrito
   * na tela quando `> 0`: é a prova, no próprio desenho, de que a escada NÃO
   * é sequência. Sem este número, barras decrescentes viram funil na cabeça
   * de quem lê, e a taxa de passagem é reinventada pelo leitor.
   *
   * ⚠️ Só passe este número se ele vier MEDIDO da mesma fonte dos estágios.
   * Ele cruza DOIS estágios por parceiro, o que exige as linhas individuais —
   * não dá para derivar de dois totais. Valor chutado ou copiado de uma
   * conferência antiga envelhece em silêncio, e é pior que ausência: a frase
   * é específica, então ninguém desconfia dela. Quando não houver o dado,
   * deixe indefinido e diga a quebra em prosa (ver `quebraDeOrdem`).
   */
  forDeOrdem?: number;
}

/**
 * **Escada de alcance** — quantos alcançaram cada estágio, todos sobre o
 * MESMO denominador. Deliberadamente **não é funil**.
 *
 * 🔴 A diferença é o ponto inteiro deste componente. O `Funil` divide cada
 * etapa pela ANTERIOR ("4% passam para Fechamento"), conta que só é honesta
 * quando cada etapa é subconjunto da de cima. Aqui não é: há parceiro que
 * escolheu favorito sem ter mandado mensagem, e parceiro que fechou contrato
 * sem ter marcado reunião. Dividir um estágio pelo outro produziria a mesma
 * classe de mentira que já custou a este projeto um "5200% passam de
 * entrevista prévia para reunião marcada" (ver `dashboard/caminho.tsx`).
 *
 * Portanto, e sem exceção:
 *
 * - **um denominador só**, o mesmo em todas as linhas, escrito por quem chama;
 * - **nenhuma taxa de passagem**, em lugar nenhum;
 * - a barra é largura sobre o denominador — nunca sobre o estágio anterior;
 * - quando um estágio tem gente que pulou o anterior (`forDeOrdem`), a tela
 *   **escreve isso**, porque é a evidência que impede a leitura sequencial.
 *
 * 🔑 Denso de propósito: cada degrau é UMA linha de texto (nome · número ·
 * percentual) com a barra de apoio embaixo, no molde do modo `horizontal` de
 * `Barras`. Nove estágios cabem numa tela sem rolagem — que é justamente o
 * que os cards de barra grandes não conseguiam.
 *
 * ♿ Sem `role="img"`: cada linha já é nome + número + percentual em TEXTO, a
 * forma mais acessível possível; a barra é `aria-hidden`. Mesma razão do modo
 * horizontal de `Barras` e do `Funil`.
 *
 * Server Component, 0 KB de JS.
 */
export function EscadaAlcance({
  degraus,
  total,
  denominador,
  quebraDeOrdem,
  className,
}: {
  degraus: DegrauAlcance[];
  /**
   * O denominador de TODAS as linhas. Um só, e o mesmo para todas — é o que
   * separa "quantos alcançaram" de "quantos passaram".
   */
  total: number;
  /**
   * O nome do denominador, por extenso ("148 parceiros no programa"). A tela é
   * obrigada a escrever de QUEM é o percentual: número solto e percentual sem
   * universo são a mesma omissão.
   */
  denominador: string;
  /**
   * UMA frase com o exemplo mais forte de alcance fora de ordem, para quando
   * a fonte não devolve o cruzamento por estágio (`forDeOrdem`). Fica ao lado
   * da nota do denominador, no rodapé.
   *
   * 🔑 Existe porque a alternativa era pior: sem nenhuma evidência na tela,
   * nove barras decrescentes leem como funil e o leitor inventa a taxa de
   * passagem sozinho. Uma frase verdadeira e datável vence nove números que
   * não se pode recalcular.
   */
  quebraDeOrdem?: string;
  className?: string;
}) {
  if (degraus.length === 0) return null;

  return (
    <div className={cn("grid gap-2", className)}>
      <ol className="grid gap-2">
        {degraus.map((d, i) => {
          // 🔴 SEMPRE sobre `total`, nunca sobre `degraus[i - 1]`.
          const pct = pctDe(d.valor, total);
          return (
            <li key={`${d.rotulo}-${i}`} className="grid gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-baseline gap-2">
                  {/* A ordem é de LEITURA (mais amplo em cima), não de
                      processo. O número de ordem ajuda a varrer nove linhas
                      sem prometer que uma leva à outra. */}
                  <span
                    aria-hidden
                    className="numero w-4 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums"
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 corpo-sm">{d.rotulo}</span>
                </span>
                <span className="numero shrink-0 font-semibold whitespace-nowrap tabular-nums">
                  {d.valor}
                  <span className="ml-1.5 corpo-sm font-normal text-muted-foreground">
                    {pct === null ? "—" : `${pct}%`}
                  </span>
                </span>
              </div>

              {/* A barra começa na mesma coluna do rótulo (o `ml-6` casa com
                  o número de ordem + o vão), para as nove larguras poderem
                  ser comparadas a olho numa vertical só. */}
              <div
                aria-hidden
                className="ml-6 h-2 overflow-hidden rounded-full bg-superficie-afundada inset-ring inset-ring-black/5"
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    // Teto = o denominador, não o maior da série: é o que faz
                    // "100% dos 86" desenhar a barra cheia e o resto encolher
                    // proporcionalmente ao universo real.
                    width: `${fracaoDoTeto(d.valor, total)}%`,
                    backgroundColor: COR_DO_TOM[d.tom ?? "marca"],
                  }}
                />
              </div>

              {/* 🔴 A prova de que não é sequência, dita em número e no lugar
                  onde a leitura errada aconteceria. */}
              {d.forDeOrdem && d.forDeOrdem > 0 ? (
                <p className="ml-6 text-[11px] text-muted-foreground">
                  {d.forDeOrdem}{" "}
                  {d.forDeOrdem === 1 ? "alcançou" : "alcançaram"} este estágio
                  sem o anterior
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="grid gap-1 border-t border-borda-fina pt-2">
        <p className="text-[11px] text-muted-foreground">
          Cada linha é sobre {denominador} — não é uma sequência, e um estágio
          não sai do anterior. Sem taxa de passagem.
        </p>
        {quebraDeOrdem ? (
          <p className="text-[11px] text-muted-foreground">{quebraDeOrdem}</p>
        ) : null}
      </div>
    </div>
  );
}
