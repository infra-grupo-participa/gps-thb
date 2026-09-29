import {
  CHAVE_AGENDAMENTO_PRELIMINAR,
  CHAVE_FRASES_CLIENTE,
  PERGUNTAS_ENTREVISTA,
  type GrupoOpcao,
  type LetraDisc,
  type RespostasEntrevista,
} from "@/lib/entrevista-previa-perguntas";
import {
  frasesDoCliente,
  lerAgendamento,
  textoAgendamento,
  opcoesMarcadas,
  perguntasVisiveis,
} from "@/lib/entrevista-previa-fluxo";

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
 * 3.0 (29/09/2026): as perguntas que SÓ medem a letra (`ritmo_conversa`) e
 * as de quem decide (`decide_sozinho`, `filhos_participam`,
 * `socios_negocio`) já têm bloco próprio no briefing — "DISC" e
 * "Decisores". `presenca_decisores` e `obs_comportamento` ENTRAM na Parte 06
 * de propósito: presença de quem decide e pontos de atenção (preço,
 * consulta a terceiro, desconfiança, assunto evitado) são o que a doutora
 * precisa ver antes da oferta. Da `obs_comportamento` a Parte 06 mostra só
 * o grupo "atenção" (`somenteGrupo`); o "jeito" já virou a letra DISC.
 *
 * Cada parte lista primeiro os ids da 3.0 e depois os LEGADOS (perguntas
 * aposentadas em 29/09): entrevista antiga continua montando o briefing.
 * `frases_cliente` (Parte 06) não é pergunta — é texto livre do cliente e
 * sai em `frasesCliente`, separado de `itens`. `agendamento_preliminar`
 * (Parte 06) também não é pergunta: vira um item (`perguntaId =
 * "agendamento_preliminar"`) SÓ quando o parceiro marcou "não agendou", e
 * não conta na cobertura.
 * `e2e/script-reuniao.spec.ts` fixa essa lista.
 */

/** Uma das 7 partes do script, com o que a alimenta e como conduzir por letra. */
export interface ParteScript {
  numero: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  /** Estável — usado como key de lista e em eventual link direto. */
  id: string;
  titulo: string;
  /**
   * Ids de pergunta (`PERGUNTAS_ENTREVISTA`, ativas e aposentadas) que
   * alimentam esta parte, mais `frases_cliente` na Parte 06.
   */
  alimentadaPor: readonly string[];
  /** Pergunta de múltipla que só mostra um grupo de opções nesta parte. */
  somenteGrupo?: Readonly<Record<string, GrupoOpcao>>;
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
    alimentadaPor: ["bens", "imoveis_qtd", "imoveis_heranca", "imoveis_alugados", "composicao"],
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
    alimentadaPor: ["criterio_valor", "processamento", "o_que_convence", "confianca_equipe", "mudanca"],
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
    alimentadaPor: ["motivo_busca", "ja_tentou", "urgencia"],
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
      "presenca_decisores",
      "obs_comportamento",
      CHAVE_FRASES_CLIENTE,
      CHAVE_AGENDAMENTO_PRELIMINAR,
      "decide_investimento",
      "reacao_preco",
      "objecao_principal",
      "quem_bate_martelo",
      "disposicao_reuniao",
    ],
    somenteGrupo: { obs_comportamento: "atencao" },
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
  /** Rótulos marcados juntos por ", " (a múltipla tem mais de um). */
  rotuloDaOpcao: string;
  /** Os rótulos marcados, um por item. */
  rotulos: readonly string[];
  /** A pergunta foi aposentada em 29/09 — resposta de entrevista antiga. */
  legado: boolean;
}

export interface ParteMontada {
  parte: ParteScript;
  itens: readonly ItemParteMontada[];
  /**
   * Frases exatas do cliente (0 a 3), só na parte que lista
   * `frases_cliente`. 🔴 Texto livre de TERCEIRO: a tela mostra como citação,
   * nunca como HTML, e nunca fora do briefing.
   */
  frasesCliente: readonly string[];
  /** Ids de `alimentadaPor` que não existem (mais) em `PERGUNTAS_ENTREVISTA`. */
  idsDesconhecidos: readonly string[];
  gatilho: string | null;
  /**
   * Conta só o ESPERADO: pergunta ativa visível para estas respostas, ou
   * aposentada que foi respondida. `frases_cliente` é opcional e nunca
   * rebaixa a cobertura.
   */
  cobertura: "completa" | "parcial" | "nenhuma";
}

const INDICE = new Map(PERGUNTAS_ENTREVISTA.map((p) => [p.id, p]));

/**
 * Resolve uma parte do script contra as respostas de uma entrevista.
 *
 * 🔴 Id de `alimentadaPor` que não existe no catálogo NÃO quebra a função —
 * ele some de `itens` e aparece em `idsDesconhecidos`, para o chamador (ou um
 * teste) acusar o descompasso sem derrubar o briefing na frente da doutora.
 */
export function montarParte(
  parte: ParteScript,
  respostas: RespostasEntrevista | null,
  letra: LetraDisc | null,
): ParteMontada {
  const itens: ItemParteMontada[] = [];
  const idsDesconhecidos: string[] = [];
  const r: RespostasEntrevista = respostas ?? {};
  const visiveis = new Set(perguntasVisiveis(r).map((p) => p.id));
  let esperadas = 0;
  let frasesCliente: string[] = [];
  let avisoAgendamento: ItemParteMontada | null = null;

  for (const perguntaId of parte.alimentadaPor) {
    if (perguntaId === CHAVE_FRASES_CLIENTE) {
      frasesCliente = frasesDoCliente(r);
      continue;
    }
    if (perguntaId === CHAVE_AGENDAMENTO_PRELIMINAR) {
      // Só aparece quando NÃO agendou — é o aviso que a doutora precisa.
      // Não conta na cobertura (é campo de fechamento, não pergunta).
      const texto = lerAgendamento(r).preliminar === "nao_agendou" ? textoAgendamento(r) : null;
      if (texto) {
        avisoAgendamento = { perguntaId, enunciado: "Reunião Preliminar", rotuloDaOpcao: texto, rotulos: [texto], legado: false };
      }
      continue;
    }
    const p = INDICE.get(perguntaId);
    if (!p) {
      idsDesconhecidos.push(perguntaId);
      continue;
    }
    const marcadas = new Set(opcoesMarcadas(r[perguntaId]));
    const respondida = p.opcoes.some((o) => marcadas.has(o.id));
    const esperada = p.aposentada ? respondida : visiveis.has(perguntaId);
    if (!esperada) continue;
    esperadas += 1;
    if (!respondida) continue;

    const grupo = parte.somenteGrupo?.[perguntaId];
    const rotulos = p.opcoes
      .filter((o) => marcadas.has(o.id) && (!grupo || o.grupo === grupo))
      .map((o) => o.rotulo);
    // Respondeu, mas nada do grupo desta parte: é informação ("nenhum ponto
    // de atenção"), não lacuna.
    const lista = rotulos.length > 0 ? rotulos : grupo ? ["Nenhum ponto de atenção marcado"] : [];
    if (lista.length === 0) continue;
    itens.push({
      perguntaId,
      enunciado: p.enunciado,
      rotuloDaOpcao: lista.join(", "),
      rotulos: lista,
      legado: p.aposentada === true,
    });
  }

  const cobertura: ParteMontada["cobertura"] =
    itens.length === 0 && frasesCliente.length === 0
      ? "nenhuma"
      : itens.length >= esperadas
        ? "completa"
        : "parcial";
  // Depois da cobertura, de propósito: o aviso não pode "completar" a parte.
  if (avisoAgendamento) itens.push(avisoAgendamento);

  return {
    parte,
    itens,
    frasesCliente,
    idsDesconhecidos,
    gatilho: letra ? parte.gatilho[letra] : null,
    cobertura,
  };
}
