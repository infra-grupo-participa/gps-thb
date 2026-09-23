import { TrendingUp } from "lucide-react";

import { Linha } from "@/components/ui/graficos";
import type { Dashboard } from "@/lib/data/dashboard";
import { CardDashboard } from "./card-dashboard";

/** Altura útil da plotagem. Mesmo valor do resto da faixa de gráficos. */
const ALTURA_GRAFICO = 150;

/**
 * **Evolução semanal** — a história que a Visão geral não contava.
 *
 * 🔑 O pedido do Marcio foi por "visões macro e detalhadas" e algo que
 * mostrasse o caminho ao longo do tempo. Todo o resto da tela é um RETRATO de
 * hoje (quantos são, em que pé estão); esta é a única peça que mostra
 * MOVIMENTO — e o movimento é justamente onde está o problema: na semana de
 * 14/09 entraram 505 clientes e só 29 tinham mensagem. O cadastro explodiu, a
 * ação não acompanhou.
 *
 * 🔴 **DUAS séries, e são estas duas de propósito.** `Linha` aceita no máximo
 * duas (o par `marca` × `neutro` é o único dos tokens da casa que se separa em
 * daltonismo — ΔE 9,4 em protanopia). "Parceiros ativos" ficaria numa terceira
 * linha ou numa segunda escala; vai como número na legenda do card, não no
 * desenho. Duas escalas no mesmo gráfico é o jeito clássico de fazer duas
 * grandezas parecerem comparáveis quando não são.
 *
 * 🔴 **A última semana é a CORRENTE e está incompleta.** Hoje ela tem 37
 * clientes ao lado de 505 da semana cheia anterior — desenhada sem aviso, é uma
 * despencada que não existe. O rótulo dela ganha "(em andamento)" e o card diz
 * isso em texto. Mesmo cuidado do `VariacaoDoMes`, que escreve "até o dia N":
 * comparação com período parcial mente uma vez por ciclo, e número que mente
 * uma vez é número que ninguém mais lê.
 *
 * ⚠️ **`comMsg` é o estado ATUAL da flag, não "mandou naquela semana".** A
 * coluna `mensagem_padrao_enviada` não tem data: lê-se "dos clientes criados
 * naquela semana, quantos têm a flag HOJE". A mensagem pode ter saído semanas
 * depois, e o número de uma semana antiga pode subir amanhã. O card escreve
 * isso — é aproximação honesta, não série temporal de envio, e o rótulo sozinho
 * ("com mensagem") induziria a leitura errada.
 *
 * Server Component, 0 KB de JS.
 */
export function EvolucaoSemanal({ dados }: { dados: Dashboard }) {
  const { serie } = dados;
  const itens = serie.itens;

  if (itens.length === 0) {
    return (
      <CardDashboard
        icone={<TrendingUp />}
        rotulo="Evolução semanal"
        contexto="Ainda não há semanas suficientes para desenhar a evolução."
        link={null}
        semLink="A série aparece quando houver ao menos uma semana registrada."
      />
    );
  }

  /**
   * 🔴 Casa por IGUALDADE DE TEXTO com `semanaCorrente`, como o contrato
   * manda — não por "é o último item". São equivalentes hoje, mas se a RPC um
   * dia devolver a série em outra ordem, a posição mente e a chave não.
   */
  const ehCorrente = (semana: string) => semana === serie.semanaCorrente;
  const temCorrente = itens.some((i) => ehCorrente(i.semana));

  // O rótulo do eixo carrega a marca — o gráfico é lido sem legenda ao lado.
  const rotuloDe = (semana: string) =>
    ehCorrente(semana) ? `${semana} (em andamento)` : semana;

  const totalClientes = itens.reduce((s, i) => s + i.clientes, 0);
  const totalComMsg = itens.reduce((s, i) => s + i.comMsg, 0);

  /**
   * O pico de cadastro entre as semanas COMPLETAS, e quantos tinham mensagem
   * naquela mesma semana. É o número que conta a história em uma linha, e sai
   * do dado — não é frase fixa que envelhece.
   *
   * ⚠️ A semana corrente fica fora: ela é parcial, e "o pico" de um período
   * pela metade não é comparável com os cheios.
   */
  const completas = itens.filter((i) => !ehCorrente(i.semana));
  const pico = completas.reduce<(typeof completas)[number] | null>(
    (maior, i) => (maior === null || i.clientes > maior.clientes ? i : maior),
    null,
  );

  return (
    <CardDashboard
      icone={<TrendingUp />}
      rotulo="Evolução semanal"
      valor={String(totalClientes)}
      valorDescricao={`${totalClientes} clientes cadastrados nas últimas ${itens.length} semanas`}
      variante="grafico"
      contexto={
        pico
          ? `Clientes cadastrados por semana. No pico (${pico.semana}) foram ${pico.clientes}, e ${pico.comMsg} com mensagem.`
          : "Clientes cadastrados por semana."
      }
      // 🔑 23/09/2026 (2ª rodada): "Clientes no período" saiu daqui porque era
      // o PRÓPRIO número macro do card (`totalClientes`), repetido dois
      // centímetros abaixo dele. "Com mensagem" FICA — é o outro número da
      // série e não aparece em mais lugar nenhum da tela.
      pares={[{ rotulo: "Com mensagem", valor: String(totalComMsg) }]}
      link={null}
      semLink="Série agregada por semana; não há lista por período."
    >
      <div className="grid gap-2">
        <Linha
          altura={ALTURA_GRAFICO}
          series={[
            {
              rotulo: "Clientes cadastrados",
              tom: "marca",
              area: true,
              valorNoFim: true,
              pontos: itens.map((i) => ({
                rotulo: rotuloDe(i.semana),
                valor: i.clientes,
              })),
            },
            {
              rotulo: "Com mensagem enviada",
              tom: "neutro",
              pontos: itens.map((i) => ({
                rotulo: rotuloDe(i.semana),
                valor: i.comMsg,
              })),
            },
          ]}
          resumo={`Clientes cadastrados por semana: ${itens
            .map(
              (i) =>
                `${rotuloDe(i.semana)} ${i.clientes} cadastrados e ${i.comMsg} com mensagem`,
            )
            .join("; ")}.`}
        />

        {/* As duas ressalvas que o desenho não consegue dizer sozinho. Ficam
            juntas, no rodapé, e não em balão nem em cor de alerta: são parte
            da leitura do gráfico, não aviso de erro.

            🔑 23/09/2026 (2ª rodada): eram DOIS parágrafos, que numa coluna de
            ~440 px viravam ~6 linhas (~90 px). Viraram UM, separados por `·`.
            🔴 As duas ressalvas CONTINUAM escritas, inteiras: a semana em
            andamento não se compara com as fechadas, e "com mensagem" é o
            estado de hoje. Elas existem para o gráfico não mentir — encurtar a
            forma, nunca o conteúdo. */}
        <p className="border-t border-borda-fina pt-1.5 text-[11px] text-muted-foreground">
          {temCorrente ? (
            <>
              {serie.semanaCorrente} está em andamento (ainda sobe; não se
              compara com as fechadas) ·{" "}
            </>
          ) : null}
          &quot;Com mensagem&quot; é o estado de hoje dos clientes criados
          naquela semana — a mensagem pode ter saído depois.
        </p>
      </div>
    </CardDashboard>
  );
}
