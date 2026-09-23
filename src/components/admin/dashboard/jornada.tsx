import { Route } from "lucide-react";

import { EscadaAlcance, type DegrauAlcance } from "@/components/ui/graficos";
import type { Dashboard } from "@/lib/data/dashboard";
import { CardDashboard } from "./card-dashboard";

/**
 * **A jornada do parceiro** — quantos ambientes alcançaram cada estágio.
 *
 * 🔑 O pedido do Marcio (23/09/2026) foi "todo o caminho dos alunos mapeados
 * ali": a Visão geral mapeava o caminho do CLIENTE (`caminho.tsx`, sobre
 * ~1.700 fichas) e não havia lugar nenhum dizendo em que pé está o PARCEIRO.
 * Este card é essa peça.
 *
 * 🔴 **NÃO É FUNIL, e a base corrigida confirmou o motivo.** Os estágios são
 * alcançados FORA DE ORDEM, e não em um ou dois casos de borda: **26 dos 37
 * que escolheram favorito nunca mandaram mensagem**. Também há 11 que
 * cadastraram cliente sem concluir o onboarding, 11 que mandaram mensagem sem
 * ter os 30, 8 com reunião sem favorito e 8 com contrato sem reunião. Nenhum
 * estágio é subconjunto do anterior, logo dividir um pelo outro produz taxa de
 * passagem falsa — a mesma classe do "5200% passam de entrevista prévia para
 * reunião marcada" que `caminho.tsx` documenta. Por isso o desenho é
 * `EscadaAlcance` (um denominador só, sem passagem) e cada estágio com gente
 * fora de ordem **escreve quantos são**.
 *
 * 🔑 **Denominador único: `jornada.ambientes` (148), em TODOS os nove.** O
 * bloco `jornada` da RPC conta o mesmo universo que `programa.total`
 * (`select distinct m.aluno_id from gps.membros`), então os dois números da
 * tela não podem se contradizer. ⚠️ Não confundir com
 * `parceiros.totalParceiros` (86): aquele é a CTE `rk`, que só enxerga quem
 * JÁ TEM cliente — aqui ele é o VALOR do estágio "cadastrou", nunca o
 * denominador. Foi exatamente essa troca que uma versão anterior deste card
 * fez, e é o tipo de erro que não aparece na conferência número a número.
 *
 * Tudo vem pronto de `dados.jornada`: uma RPC só, zero consulta nova, Server
 * Component, 0 KB de JS.
 */
export function JornadaDoParceiro({ dados }: { dados: Dashboard }) {
  const { jornada } = dados;
  const total = jornada.ambientes;

  // Denominador zero não desenha escada: nove linhas de "0 — —" afirmariam
  // sobre um conjunto vazio. Vazio é resultado, dito em uma frase.
  if (total <= 0) {
    return (
      <CardDashboard
        icone={<Route />}
        rotulo="Jornada do parceiro"
        contexto="Nenhum ambiente no programa ainda."
        link={null}
        semLink="A escada aparece quando houver ao menos um ambiente."
      />
    );
  }

  /**
   * Os nove estágios, do mais amplo ao mais raro.
   *
   * 🔴 **Nenhum leva `forDeOrdem`, e é decisão, não esquecimento.** Aquele
   * número cruza DOIS estágios por parceiro, e `DashboardJornada` devolve só
   * os nove totais — a tela não tem as linhas individuais para recalcular.
   * Escrever "26 escolheram favorito sem mandar mensagem" ao lado da barra
   * exigiria fixar no código um número medido à mão em 23/09/2026, que
   * envelheceria em silêncio e seria específico demais para alguém duvidar.
   * A quebra vai em UMA frase no rodapé (`quebraDeOrdem`), datada.
   *
   * Quando a RPC devolver os cruzamentos, cada degrau passa a receber o
   * `forDeOrdem` dela e a frase sai.
   */
  const degraus: DegrauAlcance[] = [
    { rotulo: "No programa", valor: jornada.ambientes, tom: "neutro" },
    { rotulo: "Já entrou no portal", valor: jornada.entraram, tom: "neutro" },
    {
      rotulo: "Concluiu o onboarding",
      valor: jornada.onboardingOk,
      tom: "marca",
    },
    {
      rotulo: "Cadastrou ao menos 1 cliente",
      valor: jornada.cadastrou,
      tom: "marca",
    },
    {
      rotulo: "Fechou os 30 (ficha completa)",
      valor: jornada.fechou30,
      tom: "marca",
    },
    {
      rotulo: "Enviou ao menos 1 mensagem",
      valor: jornada.mandouMsg,
      tom: "atencao",
    },
    {
      rotulo: "Escolheu ao menos 1 favorito",
      valor: jornada.escolheuFavorito,
      tom: "atencao",
    },
    {
      rotulo: "Marcou ao menos 1 reunião",
      valor: jornada.marcouReuniao,
      tom: "atencao",
    },
    {
      rotulo: "Fechou ao menos 1 contrato",
      valor: jornada.fechouContrato,
      tom: "sucesso",
    },
  ];

  return (
    <CardDashboard
      icone={<Route />}
      rotulo="Jornada do parceiro"
      valor={`${jornada.fechouContrato} de ${total}`}
      valorDescricao={`${jornada.fechouContrato} parceiros de ${total} fecharam ao menos um contrato`}
      variante="grafico"
      contexto="Quantos parceiros alcançaram cada estágio. Não é sequência: dá para alcançar um sem o anterior."
      link={null}
      semLink="Cada estágio é uma contagem de ambientes; a lista não filtra por estágio."
    >
      <EscadaAlcance
        degraus={degraus}
        total={total}
        denominador={`${total} parceiros no programa`}
        // O exemplo mais forte da medição de 23/09/2026, com a data junto: é
        // uma afirmação sobre AQUELE dia, não um número vivo, e a tela diz
        // isso. Sem ela, nove barras decrescentes leem como funil.
        quebraDeOrdem="Exemplo medido em 23/09/2026: 26 dos 37 que escolheram favorito nunca enviaram mensagem."
      />
    </CardDashboard>
  );
}
