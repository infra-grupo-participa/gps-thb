import {
  PERGUNTAS_ENTREVISTA,
  type LetraDisc,
} from "@/lib/entrevista-previa-perguntas";
import type { RespostasEntrevista } from "@/lib/entrevista-previa-calculo";

/**
 * O BRIEFING da Reunião Preliminar, organizado pelas 7 partes do "Script de
 * Fechamento da Reunião Preliminar" (Holding Masters, técnica SPIN): 01
 * Abertura · 02 História real · 03 Diagnóstico (Situação/Implicação) · 04
 * Solução · 05 Virada (Sessão de Viabilidade / Croqui Estrutural) · 06 Oferta
 * binária · 07 Encerramento.
 *
 * ── 🔑 POR QUE É MAPA ESTÁTICO, NÃO CAMPO CONGELADO ────────────────────────
 *
 * `PARTES_SCRIPT` é lido em tempo de exibição do briefing, a partir das
 * respostas já salvas — não é calculado uma vez e gravado, como
 * `gerarRelatorio` faz com `disc_consciencia`/`disc_gatilhos`/
 * `disc_relacionamento` (ver `entrevista-previa-calculo.ts`). A diferença
 * importa: se amanhã o script mudar (nova parte, pergunta trocada de lugar,
 * gatilho reescrito), o ajuste é só neste arquivo e alcança TODO CLIENTE já
 * entrevistado — inclusive os antigos, sem reprocessar nada. Um valor
 * congelado no banco no dia da entrevista teria ficado preso à versão do
 * script daquele dia.
 *
 * ── 🔴 O QUE NÃO ENTRA AQUI ─────────────────────────────────────────────────
 *
 * As FRASES do script são material de treinamento do parceiro, não dado de
 * sistema — decorá-las e cravá-las em código as tornaria enfeite estático,
 * incapaz de reagir ao que o cliente falou de fato. Este arquivo carrega só a
 * ESTRUTURA (título de cada parte, o que a alimenta, uma linha curta de
 * condução por letra DISC) — nunca o texto que a doutora vai falar.
 *
 * Pela mesma razão, NENHUM preço em reais aparece aqui: a Parte 05 (Virada)
 * do script proíbe citar valor do produto — só o "até 21%" de inventário na
 * Parte 03, que é fato do diagnóstico, não preço do que se vende.
 *
 * ── O QUE FICA FORA DAS 7 PARTES ────────────────────────────────────────────
 *
 * As 4 perguntas PURAMENTE de DISC (`estilo_decisao`, `ritmo_conversa`,
 * `lidar_com_erro`, `delega` — só medem a letra, não dizem nada sobre o caso)
 * e as 4 de decisores (`decide_sozinho`, `filhos_participam`,
 * `consulta_terceiro`, `socios_negocio`) já têm bloco próprio no briefing —
 * "DISC" e "Decisores" — que não muda com este arquivo. As outras 4 de
 * `comportamento` ENTRAM nas partes de propósito: `o_que_convence`,
 * `confianca_equipe` e `mudanca` dizem como apresentar a solução (parte 04) e
 * `reacao_preco` como a pessoa recebe a oferta (parte 06) — são resposta do
 * cliente sobre o caso, não só sinal de letra. `e2e/script-reuniao.spec.ts`
 * fixa essa lista.
 */

/** Uma das 7 partes do script, com o que a alimenta e como conduzir por letra. */
export interface ParteScript {
  numero: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  /** Estável — usado como key de lista e em eventual link direto. */
  id: string;
  titulo: string;
  /** Ids de pergunta (`PERGUNTAS_ENTREVISTA`) que alimentam esta parte. */
  alimentadaPor: readonly string[];
  /** Uma linha curta de condução por letra DISC — não repete `COMO_CONDUZIR`. */
  gatilho: Record<LetraDisc, string>;
  /** Só a Parte 05 tem: os dois caminhos possíveis, título apenas. */
  variantes?: readonly string[];
}

export const PARTES_SCRIPT: readonly ParteScript[] = [
  {
    numero: 1,
    id: "abertura",
    titulo: "Abertura",
    alimentadaPor: ["imoveis_qtd", "imoveis_heranca", "imoveis_alugados", "composicao"],
    gatilho: {
      D: "Vá ao ponto: cite o bem concreto e diga aonde a conversa vai chegar.",
      I: "Abra puxando a história por trás do bem — deixe a pessoa contar.",
      S: "Cite o bem com calma, sem soar inquisitivo — é só para mostrar que você ouviu.",
      C: "Cite os números exatos (quantidade, tipo) que a entrevista levantou.",
    },
  },
  {
    numero: 2,
    id: "historia_real",
    titulo: "História real",
    alimentadaPor: ["conflito_herdeiros", "inventario_familia"],
    gatilho: {
      D: "Encurte a história — vá direto ao desfecho e ao custo do Rafael.",
      I: "Conte a história completa, com detalhe humano — é o que prende essa letra.",
      S: "Conduza a história enfatizando que dava para ter sido evitado, sem alarmismo.",
      C: "Ancore a história nos fatos verificáveis do caso, não na emoção dele.",
    },
  },
  {
    numero: 3,
    id: "diagnostico",
    titulo: "Diagnóstico",
    alimentadaPor: ["titularidade", "instrumento_existente", "pro_labore", "risco_atividade"],
    gatilho: {
      D: "Situação e implicação num só fôlego — o problema e o que ele custa.",
      I: "Situação como conversa, implicação como alerta cuidadoso, não susto.",
      S: "Vá devagar: primeiro a situação atual, só depois a implicação — sem pressa.",
      C: "Detalhe a situação levantada e sustente a implicação com o número: inventário até 21%.",
    },
  },
  {
    numero: 4,
    id: "solucao",
    titulo: "Solução",
    alimentadaPor: ["o_que_convence", "confianca_equipe", "mudanca"],
    gatilho: {
      D: "Apresente a solução como controle: \"a chave que só você tem\".",
      I: "Apresente a solução pela relação — quem já confiou e passou por isso.",
      S: "Frise o que NÃO muda: não é doação, não é testamento — a rotina dela continua.",
      C: "Explique o mecanismo (cofre, Golden Share) com precisão, sem vender.",
    },
  },
  {
    numero: 5,
    id: "virada",
    titulo: "Virada",
    alimentadaPor: ["urgencia", "ja_tentou", "motivo_busca"],
    gatilho: {
      D: "Ofereça o caminho mais rápido dos dois — sem citar valor, só o próximo passo.",
      I: "Deixe ela escolher entre os dois caminhos, conversando — sem citar valor.",
      S: "Explique os dois caminhos com calma, sem empurrar nenhum — sem citar valor.",
      C: "Explique o que cada caminho entrega e o que fica pronto ao final — sem citar valor.",
    },
    variantes: ["Sessão de Viabilidade", "Croqui Estrutural"],
  },
  {
    numero: 6,
    id: "oferta_binaria",
    titulo: "Oferta binária",
    alimentadaPor: [
      "decide_investimento",
      "reacao_preco",
      "objecao_principal",
      "quem_bate_martelo",
      "disposicao_reuniao",
    ],
    gatilho: {
      D: "Oferta binária, sem rodeio: pagamento agora ou não.",
      I: "Quem já fez, referência — e depois pergunte, sem preencher o silêncio dela.",
      S: "Não pressione — deixe claro que dá para combinar, e depois fique em silêncio.",
      C: "O que está incluso e o que não está — e depois deixe ela responder, calado.",
    },
  },
  {
    numero: 7,
    id: "encerramento",
    titulo: "Encerramento",
    alimentadaPor: ["temperatura"],
    gatilho: {
      D: "Feche com o próximo passo marcado, data e hora.",
      I: "Feche reforçando a relação e confirme por escrito o combinado.",
      S: "Feche confirmando que não há pressa e que a família pode participar.",
      C: "Feche resumindo por escrito o que ficou combinado, item a item.",
    },
  },
] as const;

/** Uma pergunta de `alimentadaPor` já resolvida contra a resposta do lead. */
export interface ItemParteMontada {
  perguntaId: string;
  enunciado: string;
  rotuloDaOpcao: string;
}

export interface ParteMontada {
  parte: ParteScript;
  itens: readonly ItemParteMontada[];
  /** Ids de `alimentadaPor` que não existem (mais) em `PERGUNTAS_ENTREVISTA`. */
  idsDesconhecidos: readonly string[];
  gatilho: string | null;
  cobertura: "completa" | "parcial" | "nenhuma";
}

/** Índice pergunta → opção, montado uma vez, igual ao padrão de `entrevista-previa-calculo.ts`. */
const INDICE = new Map(
  PERGUNTAS_ENTREVISTA.map((p) => [
    p.id,
    { enunciado: p.enunciado, opcoes: new Map(p.opcoes.map((o) => [o.id, o.rotulo])) },
  ]),
);

/**
 * Resolve uma parte do script contra as respostas de uma entrevista.
 *
 * 🔴 Id de `alimentadaPor` que não existe no catálogo NÃO quebra a função —
 * ele some de `itens` e aparece em `idsDesconhecidos`, para o chamador (ou um
 * teste) acusar o descompasso entre este arquivo e
 * `entrevista-previa-perguntas.ts` sem derrubar o briefing na frente da
 * doutora.
 */
export function montarParte(
  parte: ParteScript,
  respostas: RespostasEntrevista | null,
  letra: LetraDisc | null,
): ParteMontada {
  const itens: ItemParteMontada[] = [];
  const idsDesconhecidos: string[] = [];
  const respostasSeguras = respostas ?? {};

  for (const perguntaId of parte.alimentadaPor) {
    const entrada = INDICE.get(perguntaId);
    if (!entrada) {
      idsDesconhecidos.push(perguntaId);
      continue;
    }
    const opcaoId = respostasSeguras[perguntaId];
    if (!opcaoId) continue;
    const rotulo = entrada.opcoes.get(opcaoId);
    if (!rotulo) continue;
    itens.push({ perguntaId, enunciado: entrada.enunciado, rotuloDaOpcao: rotulo });
  }

  const idsValidos = parte.alimentadaPor.length - idsDesconhecidos.length;
  const cobertura: ParteMontada["cobertura"] =
    itens.length === 0
      ? "nenhuma"
      : idsValidos > 0 && itens.length >= idsValidos
        ? "completa"
        : "parcial";

  return {
    parte,
    itens,
    idsDesconhecidos,
    gatilho: letra ? parte.gatilho[letra] : null,
    cobertura,
  };
}
