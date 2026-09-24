import { Linha } from "@/components/ui/graficos";
import { COR_DO_TOM } from "@/components/ui/graficos/tipos";
import type { DashboardSerie } from "@/lib/data/dashboard";

/**
 * **Zona 2 da sub-aba "O programa"** — o gráfico que cruza duas séries no
 * mesmo eixo de tempo. Largura cheia, Server Component, 0 KB de JS.
 *
 * 🔑 POR QUE DUAS SÉRIES NO MESMO EIXO Y É LEGÍTIMO AQUI
 *
 * `tipos.ts` proíbe escala dupla, e a proibição continua de pé: duas escalas
 * fazem grandezas incomparáveis parecerem comparáveis, e é o truque clássico
 * de gráfico que mente. **Esta tela é a exceção, e a exceção tem prova:**
 *
 * - as duas grandezas são **a mesma unidade** — contagem de cliente por
 *   semana. Não é "reais × percentual" nem "clientes × parceiros por mil";
 * - em `par="mensagem"`, **`comMsg ⊆ clientes`**: todo cliente com mensagem é
 *   um cliente cadastrado. A linha está DENTRO da barra por definição, e é
 *   exatamente essa relação de contido que o desenho mostra;
 * - em `par="parceiros"` a contenção é mais fraca (parceiro ativo é ambiente
 *   distinto que cadastrou naquela semana, então `parceirosAtivos ≤ clientes`
 *   sempre, porque um ambiente que cadastrou fez ao menos 1 cadastro).
 *   Continua sendo contagem sobre a mesma semana, e o teto comum é honesto.
 *
 * 🔴 **Não generalizar.** Escala única aqui funciona porque as duas séries
 * medem a mesma coisa. No dia em que alguém quiser cruzar clientes com
 * faturamento, ou com percentual de conclusão, **a resposta é dois gráficos**
 * — não um segundo eixo Y nesta peça. A permissão é do dado, não do desenho.
 *
 * 🔑 A história que o dado conta (medida em 23/09/2026): o cadastro explodiu
 * em 07/09 (395) e 14/09 (505), e `comMsg` no pico foi **29**. A linha fica
 * rente ao chão o tempo todo — é por isso que ela é LINHA sobre BARRA, e não
 * uma segunda barra ao lado: a leitura pretendida é "o quanto disso virou
 * ação", e o desenho tem de deixar o vão visível.
 *
 * ⚠️ **`comMsg` é o estado ATUAL da flag `mensagem_padrao_enviada`, não
 * "mandou naquela semana"** — a coluna não tem data. Lê-se "dos clientes
 * criados naquela semana, quantos têm a flag HOJE": a mensagem pode ter saído
 * semanas depois, e o número de uma semana antiga pode subir amanhã. É
 * aproximação honesta, não série temporal de envio.
 *
 * ⚠️ **A semana corrente é PARCIAL** — é o presente, e não se corrige
 * cortando. Ela sai hachurada + com opacidade na barra, e a LEGENDA traz o
 * token `em curso` explicando a hachura, para a barra baixa não ser lida como
 * queda. O token saiu do eixo X em 23/09/2026: medido em Chromium, ele
 * atropelava duas datas vizinhas em 390 px (ver `rotuloComToken`).
 *
 * 🔴 As duas ressalvas acima ficam AQUI, em comentário, e **não vão para o
 * DOM**: a tela mostra o que É. O rodapé de parágrafo que `evolucao.tsx` usa
 * não foi copiado — só o desenho foi reaproveitado.
 */

/** O que cada cruzamento desenha. A série não tem mais nada além disto. */
const PARES = {
  mensagem: {
    linha: "mensagem",
    campo: "comMsg",
  },
  parceiros: {
    linha: "parceiros",
    campo: "parceirosAtivos",
  },
} as const satisfies Record<
  string,
  { linha: string; campo: "comMsg" | "parceirosAtivos" }
>;

export type ParDoCruzamento = keyof typeof PARES;

export function Cruzamento({
  serie,
  par,
  altura = 220,
}: {
  serie: DashboardSerie;
  /** Qual segunda série cruza com `clientes`. */
  par: ParDoCruzamento;
  /**
   * Altura da plotagem, em px. 220 por padrão: esta é a peça principal da
   * tela agora, não um card entre 20.
   */
  altura?: number;
}) {
  const itens = serie.itens;
  if (itens.length === 0) return null;

  const { linha: rotuloLinha, campo } = PARES[par];

  /**
   * 🔴 Casa por IGUALDADE DE TEXTO com `semanaCorrente`, nunca por "é o
   * último item". São equivalentes hoje, mas se a RPC um dia devolver a série
   * em outra ordem, a posição mente e a chave não.
   */
  const iCorrente = itens.findIndex((i) => i.semana === serie.semanaCorrente);

  const totalClientes = itens.reduce((s, i) => s + i.clientes, 0);
  const totalPar = itens.reduce((s, i) => s + i[campo], 0);

  /**
   * O token `· em curso` para onde ele ainda cabe: o resumo do leitor de tela
   * e a tabela de valores, onde cada semana tem uma linha só para si.
   *
   * 🔴 **Ele NÃO vai mais para o rótulo do eixo X** (23/09/2026, medido em
   * Chromium). `21/09 · em curso` mede 103 px; em 390 px o plot tem ~356 px
   * para 10 rótulos, e esse rótulo cobria o `14/09` inteiro e ainda invadia o
   * `31/08` — três datas viravam uma mancha. Em 1920/1366 a sobreposição era
   * de 4 px, o mesmo defeito menor. Quem marca a semana parcial no DESENHO é a
   * hachura + opacidade da barra, e quem explica a hachura é a legenda, uma
   * vez. O eixo volta a ser só a data.
   */
  const rotuloComToken = (semana: string, i: number) =>
    i === iCorrente ? `${semana} · em curso` : semana;

  const pontosDe = (valorDe: (i: (typeof itens)[number]) => number) =>
    itens.map((i) => ({
      rotulo: i.semana,
      valor: valorDe(i),
    }));

  /**
   * Quantos rótulos o eixo X desenha.
   *
   * 🔴 Em 390 px o plot tem ~356 px e um rótulo `21/09` mede ~40 px: dez
   * rótulos precisariam de ~400 px e encostariam. `Linha` já esconde um sim,
   * um não abaixo do `sm` — **mantendo sempre o último**, que é a semana
   * corrente e a única que a legenda está explicando. Acima do `sm` os dez
   * cabem inteiros em ~1152 px.
   */
  const rotulosNoEixoX = itens.length;

  return (
    <section
      aria-labelledby="cruzamento-titulo"
      className="grid gap-3 border border-borda-fina bg-card p-4"
    >
      {/* Hierarquia por POSIÇÃO: rótulo pequeno, número macro do período e a
          legenda de UMA palavra por série, tudo numa faixa só antes do
          desenho. Sem ícone, sem card interno, sem frase. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <div className="flex items-baseline gap-3">
          <h3 id="cruzamento-titulo" className="rotulo text-muted-foreground">
            Por semana
          </h3>
          <span className="numero numero-lg font-semibold">
            {totalClientes}
          </span>
        </div>

        {/* Legenda: uma palavra por série, com a forma do desenho ao lado —
            bloco para a barra, traço para a linha. A forma é o segundo canal
            que o par de cores sozinho não daria. */}
        {/* `gap-3`, não `gap-4`, e `whitespace-nowrap` nos itens: medido em
            390px, os 3 itens da legenda pediam 330px e a seção dava 324 —
            "em curso" quebrava em "em / curso". Com 8px a menos cabe (322).
            `flex-wrap` é a rede: abaixo de 360px a legenda desce para uma
            2ª linha em vez de estourar a seção. */}
        <ul className="flex flex-wrap items-baseline gap-3 whitespace-nowrap">
          <li className="flex items-baseline gap-1.5">
            <span
              aria-hidden
              className="size-2 shrink-0 translate-y-px rounded-[2px]"
              style={{ backgroundColor: COR_DO_TOM.marca }}
            />
            <span className="corpo-sm text-muted-foreground">cadastros</span>
            <span className="numero corpo-sm font-semibold">
              {totalClientes}
            </span>
          </li>
          <li className="flex items-baseline gap-1.5">
            <span
              aria-hidden
              className="h-0.5 w-3 shrink-0 -translate-y-px rounded-full"
              style={{ backgroundColor: COR_DO_TOM.neutro }}
            />
            <span className="corpo-sm text-muted-foreground">
              {rotuloLinha}
            </span>
            <span className="numero corpo-sm font-semibold">{totalPar}</span>
          </li>

          {/* 🔑 **O terceiro item explica a FORMA, não uma série.** A hachura
              saiu do eixo X (onde `21/09 · em curso` atropelava duas datas em
              390 px) e virou o quadradinho aqui: a barra continua hachurada +
              opaca no desenho, e a legenda diz uma vez o que a hachura quer
              dizer. Sem número ao lado — não é um total, é uma chave.

              Só aparece quando a semana corrente está NA série (`iCorrente`
              achou): legenda de forma que não está desenhada em lugar nenhum
              é enfeite. */}
          {iCorrente !== -1 && (
            <li className="flex items-baseline gap-1.5">
              <span
                aria-hidden
                className="size-2 shrink-0 translate-y-px rounded-[2px]"
                style={{
                  // A MESMA receita da barra parcial em `linha.tsx` — hachura
                  // + opacidade, os dois canais. Se lá mudar, aqui muda.
                  backgroundColor: COR_DO_TOM.marca,
                  opacity: 0.55,
                  backgroundImage:
                    "repeating-linear-gradient(135deg, transparent 0 3px, var(--card) 3px 5px)",
                }}
              />
              <span className="corpo-sm text-muted-foreground">em curso</span>
            </li>
          )}
        </ul>
      </div>

      <Linha
        altura={altura}
        indiceHachurado={iCorrente === -1 ? undefined : iCorrente}
        // 10 semanas em ~1152 px cabem inteiras; em 390 px não, e a própria
        // `Linha` esconde um sim, um não abaixo do `sm` — **mantendo sempre o
        // último**, que é a semana corrente (ver `rotulosNoEixoX` acima).
        rotulosNoEixoX={rotulosNoEixoX}
        // A legenda de resumo já está acima, com uma palavra por série —
        // repetir aqui embaixo seria o mesmo número duas vezes na mesma peça.
        mostrarLegenda={false}
        series={[
          {
            rotulo: "cadastros",
            tom: "marca",
            forma: "barra",
            pontos: pontosDe((i) => i.clientes),
          },
          {
            rotulo: rotuloLinha,
            tom: "neutro",
            forma: "linha",
            pontos: pontosDe((i) => i[campo]),
          },
        ]}
        resumo={`Clientes cadastrados e ${rotuloLinha} por semana: ${itens
          .map(
            (i, k) =>
              `${rotuloComToken(i.semana, k)} ${i.clientes} cadastros e ${i[campo]} ${rotuloLinha}`,
          )
          .join("; ")}.`}
      />

      {/* A tabela de valores que os outros gráficos da casa já oferecem a
          leitor de tela. Visível: o número é o canal principal, e a régua da
          casa é "número em TEXTO, sempre". */}
      <table className="w-full border-t border-borda-fina text-left">
        <caption className="sr-only">
          Cadastros e {rotuloLinha} por semana
        </caption>
        <thead>
          <tr>
            <th scope="col" className="py-1 rotulo text-muted-foreground">
              Semana
            </th>
            <th scope="col" className="py-1 text-right rotulo text-muted-foreground">
              cadastros
            </th>
            <th scope="col" className="py-1 text-right rotulo text-muted-foreground">
              {rotuloLinha}
            </th>
          </tr>
        </thead>
        <tbody>
          {itens.map((i, k) => (
            <tr key={i.semana} className="border-t border-borda-fina">
              <th
                scope="row"
                className="py-1 corpo-sm font-normal text-muted-foreground"
              >
                {rotuloComToken(i.semana, k)}
              </th>
              <td className="numero py-1 text-right corpo-sm font-semibold">
                {i.clientes}
              </td>
              <td className="numero py-1 text-right corpo-sm font-semibold">
                {i[campo]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
