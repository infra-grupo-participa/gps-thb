import {
  PERGUNTAS_ENTREVISTA,
  type LetraDisc,
  type SinalDecisor,
} from "@/lib/entrevista-previa-perguntas";

/**
 * O CÁLCULO da Entrevista Prévia 2.0: das respostas saem o perfil DISC e o
 * mapa de decisores, sem ninguém digitar nada.
 *
 * Pedido do Marcio (23/09): *"ao final, eh gerado um relatorio geral do perfil
 * disc dele, automatico, sem precisar informar, anexar"*.
 *
 * ── 🔑 POR QUE É CONTAGEM, E NÃO IA ────────────────────────────────────────
 *
 * Cada opção do roteiro carrega um peso por letra. Aqui os pesos se somam e a
 * maior soma vence. Isso tem três propriedades que uma classificação por
 * modelo não teria:
 *   • **determinismo** — a mesma entrevista dá sempre o mesmo perfil;
 *   • **auditabilidade** — dá para mostrar QUAIS respostas levaram àquela
 *     letra, e a tela mostra;
 *   • **custo zero e offline** — não depende de chamada externa no meio de
 *     uma conversa ao vivo com um cliente.
 *
 * Esta casa já registrou que "IA não se treina, se guia". Aqui nem isso é
 * preciso: o julgamento está nas OPÇÕES, escritas por quem conhece o negócio.
 *
 * ── 🔴 O EMPATE É UM RESULTADO, NÃO UM ERRO ────────────────────────────────
 *
 * Perfil misto existe de verdade. Quando duas letras empatam, devolvemos a
 * primeira na ordem D→I→S→C e sinalizamos `empate` com as letras envolvidas —
 * a tela diz "perfil D com traços de C", que é mais honesto que fingir uma
 * letra única. Nunca se inventa desempate por sorteio.
 */

export interface RespostasEntrevista {
  /** `{ [perguntaId]: opcaoId }` — uma opção por pergunta. */
  [perguntaId: string]: string;
}

export interface ResultadoDisc {
  /** A letra vencedora. `null` quando não há resposta suficiente. */
  letra: LetraDisc | null;
  /** Pontuação bruta por letra — é o que torna o resultado auditável. */
  pontos: Record<LetraDisc, number>;
  /** Letras empatadas na liderança (inclui a vencedora). Tamanho 1 = sem empate. */
  empate: LetraDisc[];
  /** Quantas perguntas com peso DISC foram respondidas. */
  respondidasComPeso: number;
}

export interface DecisorDetectado {
  sinal: SinalDecisor;
  /** Qual pergunta revelou, para a tela explicar de onde veio. */
  origem: string;
}

export interface ResultadoDecisores {
  /**
   * Quantos decisores a entrevista revelou, contando o próprio lead.
   * Mínimo 1 — a pessoa entrevistada sempre decide algo sobre o próprio
   * patrimônio; `sozinho` não a remove da conta.
   */
  total: number;
  /** Os sinais além do próprio lead, sem repetir o mesmo tipo. */
  adicionais: DecisorDetectado[];
  /**
   * 🔴 A trava. `true` quando há mais de um decisor — a Reunião Preliminar
   * exige TODOS presentes (regra do Marcio: *"está proibido participar da
   * reunião sem os decisores"*).
   */
  exigeTodosNaPreliminar: boolean;
}

const LETRAS: LetraDisc[] = ["D", "I", "S", "C"];

/** Índice pergunta → opções, montado uma vez. */
const INDICE = new Map(
  PERGUNTAS_ENTREVISTA.map((p) => [
    p.id,
    { pergunta: p, opcoes: new Map(p.opcoes.map((o) => [o.id, o])) },
  ]),
);

/**
 * Soma os pesos e devolve o perfil.
 *
 * 🔴 Resposta desconhecida é IGNORADA, não derruba o cálculo: um id que não
 * existe mais no roteiro (pergunta reescrita depois da entrevista) some da
 * soma em silêncio, mas a entrevista antiga continua legível. O contrário —
 * lançar erro — tornaria irrecuperável todo histórico a cada ajuste de texto.
 */
export function calcularDisc(respostas: RespostasEntrevista): ResultadoDisc {
  const pontos: Record<LetraDisc, number> = { D: 0, I: 0, S: 0, C: 0 };
  let respondidasComPeso = 0;

  for (const [perguntaId, opcaoId] of Object.entries(respostas ?? {})) {
    const entrada = INDICE.get(perguntaId);
    if (!entrada) continue;
    const opcao = entrada.opcoes.get(opcaoId);
    if (!opcao?.disc) continue;

    let somouAlgo = false;
    for (const letra of LETRAS) {
      const peso = opcao.disc[letra];
      if (typeof peso === "number" && peso > 0) {
        pontos[letra] += peso;
        somouAlgo = true;
      }
    }
    if (somouAlgo) respondidasComPeso += 1;
  }

  const maximo = Math.max(...LETRAS.map((l) => pontos[l]));
  // Sem nenhum ponto = sem perfil. Devolver "D" por ser a primeira letra
  // seria inventar um resultado a partir de zero informação.
  if (maximo === 0) {
    return { letra: null, pontos, empate: [], respondidasComPeso };
  }

  const empate = LETRAS.filter((l) => pontos[l] === maximo);
  return { letra: empate[0], pontos, empate, respondidasComPeso };
}

/**
 * Lê os sinais de decisor espalhados pelo roteiro.
 *
 * 🔑 Conta TIPOS, não pessoas: duas perguntas que apontam "cônjuge" são o
 * mesmo cônjuge. Contar duas vezes inflaria a trava e faria o parceiro
 * procurar um decisor que não existe.
 */
export function mapearDecisores(respostas: RespostasEntrevista): ResultadoDecisores {
  const vistos = new Map<SinalDecisor, string>();

  for (const [perguntaId, opcaoId] of Object.entries(respostas ?? {})) {
    const entrada = INDICE.get(perguntaId);
    if (!entrada) continue;
    const opcao = entrada.opcoes.get(opcaoId);
    if (!opcao?.decisor) continue;
    // `sozinho` não acrescenta ninguém — só confirma que não há mais nenhum.
    if (opcao.decisor === "sozinho") continue;
    if (!vistos.has(opcao.decisor)) {
      vistos.set(opcao.decisor, entrada.pergunta.enunciado);
    }
  }

  const adicionais = [...vistos.entries()].map(([sinal, origem]) => ({ sinal, origem }));
  const total = 1 + adicionais.length;

  return {
    total,
    adicionais,
    exigeTodosNaPreliminar: total > 1,
  };
}

/** Rótulo humano de cada sinal, para a tela e para o relatório. */
export const ROTULO_DECISOR: Record<SinalDecisor, string> = {
  sozinho: "Decide sozinho",
  conjuge: "Cônjuge",
  filhos: "Filhos",
  socio: "Sócio",
  terceiro: "Consultor de confiança (contador, advogado)",
};

/** Nome por extenso de cada letra — espelha `PERFIS_DISC` de `etapa1.ts`. */
export const NOME_DA_LETRA: Record<LetraDisc, string> = {
  D: "Dominância",
  I: "Influência",
  S: "Estabilidade",
  C: "Conformidade",
};

/**
 * Como conduzir cada perfil — o texto que vai para `disc_relacionamento` da
 * ficha, e que a doutora lê no briefing antes da Reunião Preliminar.
 *
 * 🔑 Escrito como ORIENTAÇÃO DE CONDUÇÃO, não como descrição de
 * personalidade. "Vá direto ao ponto" serve para a conversa; "é uma pessoa
 * dominante" não serve para nada e ainda rotula alguém que não pediu.
 */
export const COMO_CONDUZIR: Record<LetraDisc, string> = {
  D: "Vá direto ao ponto. Comece pelo resultado e pelo prazo, não pelo método. Evite rodeios e reuniões longas — apresente o caminho e peça a decisão.",
  I: "Construa a relação antes do conteúdo. Traga casos de outras famílias, use exemplos e histórias. Confirme por escrito o que foi combinado, porque o entusiasmo dela é maior que a memória.",
  S: "Não apresse. Explique o passo a passo e deixe claro o que NÃO muda na vida dela. Segurança vale mais que oportunidade — e a presença da família na conversa ajuda em vez de atrapalhar.",
  C: "Leve número, documento e método. Antecipe as perguntas de detalhe e admita o que ainda não se sabe. Prometer sem base destrói a confiança dessa pessoa mais rápido que qualquer outra.",
};

/**
 * O RELATÓRIO em texto, gerado das respostas — é o que fica na ficha do
 * cliente sem ninguém escrever nada.
 *
 * 🔴 Cabe nos CHECKs da tabela (3..2000 por campo). Os textos são recortados
 * com folga: `COMO_CONDUZIR` tem ~240 caracteres e a lista de decisores é
 * curta por natureza (no máximo 4 tipos).
 */
export function gerarRelatorio(
  respostas: RespostasEntrevista,
  disc: ResultadoDisc,
  decisores: ResultadoDecisores,
): { consciencia: string; gatilhos: string; relacionamento: string } {
  const letra = disc.letra;

  // CONSCIÊNCIA: o quanto a pessoa já entende o problema dela. Sai do motivo
  // da busca, da urgência e do histórico de inventário na família.
  const consciencia = montarConsciencia(respostas, decisores);

  // GATILHOS: o que mobiliza. Sai do que convence e da objeção principal.
  const gatilhos = montarGatilhos(respostas, letra);

  // RELACIONAMENTO: como conduzir. Sai do perfil + a trava dos decisores.
  const relacionamento = montarRelacionamento(letra, disc, decisores);

  return { consciencia, gatilhos, relacionamento };
}

function rotuloDaOpcao(perguntaId: string, respostas: RespostasEntrevista): string | null {
  const entrada = INDICE.get(perguntaId);
  if (!entrada) return null;
  const opcao = entrada.opcoes.get(respostas[perguntaId] ?? "");
  return opcao?.rotulo ?? null;
}

function montarConsciencia(
  respostas: RespostasEntrevista,
  decisores: ResultadoDecisores,
): string {
  const partes: string[] = [];
  const motivo = rotuloDaOpcao("motivo_busca", respostas);
  const urgencia = rotuloDaOpcao("urgencia", respostas);
  const inventario = rotuloDaOpcao("inventario_familia", respostas);
  const tentou = rotuloDaOpcao("ja_tentou", respostas);

  if (motivo) partes.push(`Procurou por: ${motivo.toLowerCase()}.`);
  if (urgencia) partes.push(`Prazo que tem em mente: ${urgencia.toLowerCase()}.`);
  if (tentou) partes.push(`Histórico: ${tentou.toLowerCase()}.`);
  if (inventario) partes.push(`Inventário na família: ${inventario.toLowerCase()}.`);
  if (decisores.total > 1) {
    partes.push(`A decisão envolve ${decisores.total} pessoas.`);
  }

  const texto = partes.join(" ").trim();
  // Piso de 3 caracteres do CHECK: entrevista sem nenhuma dessas respostas
  // devolve uma frase honesta em vez de string vazia (que o CHECK recusaria).
  return texto.length >= 3 ? corta(texto) : "Entrevista sem respostas neste bloco.";
}

function montarGatilhos(respostas: RespostasEntrevista, letra: LetraDisc | null): string {
  const partes: string[] = [];
  const convence = rotuloDaOpcao("o_que_convence", respostas);
  const objecao = rotuloDaOpcao("objecao_principal", respostas);
  const reacao = rotuloDaOpcao("reacao_preco", respostas);
  const confianca = rotuloDaOpcao("confianca_equipe", respostas);

  if (convence) partes.push(`Convence-se por: ${convence.toLowerCase()}.`);
  if (confianca) partes.push(`Confia quando vê: ${confianca.toLowerCase()}.`);
  if (reacao) partes.push(`Diante de valores: ${reacao.toLowerCase()}.`);
  if (objecao) partes.push(`Pode travar por: ${objecao.toLowerCase()}.`);
  if (letra) partes.push(`Perfil ${letra}.`);

  const texto = partes.join(" ").trim();
  return texto.length >= 3 ? corta(texto) : "Entrevista sem respostas neste bloco.";
}

function montarRelacionamento(
  letra: LetraDisc | null,
  disc: ResultadoDisc,
  decisores: ResultadoDecisores,
): string {
  const partes: string[] = [];

  if (letra) {
    partes.push(`Perfil ${letra} — ${NOME_DA_LETRA[letra]}. ${COMO_CONDUZIR[letra]}`);
    if (disc.empate.length > 1) {
      const outras = disc.empate.filter((l) => l !== letra).join(" e ");
      partes.push(`Perfil misto: traços fortes também de ${outras}.`);
    }
  } else {
    partes.push("Perfil DISC não definido — respostas insuficientes.");
  }

  if (decisores.exigeTodosNaPreliminar) {
    const lista = decisores.adicionais.map((d) => ROTULO_DECISOR[d.sinal]).join(", ");
    partes.push(
      `🔴 ${decisores.total} decisores: o entrevistado e mais ${lista}. ` +
        `A Reunião Preliminar exige TODOS presentes.`,
    );
  } else {
    partes.push("Decide sozinho — a Reunião Preliminar pode ser feita só com ele.");
  }

  return corta(partes.join(" ").trim());
}

/** Respeita o teto de 2000 do CHECK, cortando em palavra inteira. */
function corta(texto: string, maximo = 1950): string {
  if (texto.length <= maximo) return texto;
  const cortado = texto.slice(0, maximo);
  const ultimoEspaco = cortado.lastIndexOf(" ");
  return (ultimoEspaco > maximo - 120 ? cortado.slice(0, ultimoEspaco) : cortado) + "…";
}
