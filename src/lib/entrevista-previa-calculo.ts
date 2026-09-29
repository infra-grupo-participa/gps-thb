import {
  perguntaPorId,
  type LetraDisc,
  type PapelDecisor,
  type RespostasEntrevista,
  type SinalDecisor,
} from "@/lib/entrevista-previa-perguntas";
import { opcoesMarcadas, perguntasVisiveis, textoAgendamento } from "@/lib/entrevista-previa-fluxo";

// Reexporta o tipo das respostas: telas antigas o importam daqui.
export type { RespostasEntrevista } from "@/lib/entrevista-previa-perguntas";

/**
 * O CÁLCULO da Entrevista Prévia 3.0: das respostas saem o perfil DISC (com
 * confiança e letra secundária), o mapa de decisores e o relatório da ficha.
 *
 * ── 🔑 POR QUE É CONTAGEM, E NÃO IA ────────────────────────────────────────
 *
 * Cada opção carrega um peso por letra; somam-se, a maior soma vence.
 * Determinístico, auditável (a tela mostra os pontos) e sem chamada externa
 * no meio de uma conversa ao vivo.
 *
 * ── 🔑 SÓ AS ATIVAS E VISÍVEIS CONTAM ──────────────────────────────────────
 *
 * Pergunta aposentada (29/09) e pergunta que a condição escondeu ficam FORA
 * da soma e do mapa de decisores. Entrevista antiga recalculada aqui usa só
 * o que ainda está no roteiro — o que ela gravou continua intacto no banco.
 *
 * ── 🔴 O EMPATE É UM RESULTADO, NÃO UM ERRO ────────────────────────────────
 *
 * Empate devolve a primeira na ordem D→I→S→C, `empate` com as letras e
 * confiança BAIXA. Nunca se inventa desempate.
 */

export type ConfiancaDisc = "alta" | "media" | "baixa";

export interface ResultadoDisc {
  /** A letra vencedora. `null` quando não há nenhum ponto. */
  letra: LetraDisc | null;
  /** A 2ª letra com pontos > 0 (ordem por pontos, desempate D→I→S→C). */
  secundaria: LetraDisc | null;
  /** Pontuação bruta por letra — é o que torna o resultado auditável. */
  pontos: Record<LetraDisc, number>;
  /** Letras empatadas na liderança (inclui a vencedora). Tamanho 1 = sem empate. */
  empate: LetraDisc[];
  /**
   * Nº de OPÇÕES com peso marcadas (a múltipla conta cada item). Máx. 12.
   */
  sinais: number;
  /** Pontos da 1ª − pontos da 2ª. */
  margem: number;
  /**
   * Alta: margem ≥ 3 e sinais ≥ 6 · Média: margem ≥ 2 e sinais ≥ 4 ·
   * Baixa: o resto, e todo empate. Derivada — nada novo é gravado.
   */
  confianca: ConfiancaDisc;
  /** @deprecated 2.0 — perguntas com peso respondidas. Use `sinais`. */
  respondidasComPeso: number;
}

export interface DecisorDetectado {
  sinal: SinalDecisor;
  papel: PapelDecisor;
  /** Pergunta que revelou. */
  perguntaId: string;
  opcaoId: string;
  /** Enunciado da pergunta, para a tela explicar de onde veio. */
  origem: string;
}

export interface ResultadoDecisores {
  /**
   * 1 (o entrevistado) + quem DECIDE JUNTO. É o número que vai para
   * `gps.cliente_decisores` e para a trava. Mínimo 1.
   */
  total: number;
  /** Quem decide junto (`dj`) — sem repetir tipo. Só estes travam. */
  decideJunto: DecisorDetectado[];
  /** Quem opina (`inf`) — relatório/briefing, não trava. */
  influenciam: DecisorDetectado[];
  /** Quem só é avisado (`av`) — relatório/briefing, não trava. */
  soAvisam: DecisorDetectado[];
  /** "Vai consultar alguém de fora" marcado nas observações — não trava. */
  consultaTerceiro: boolean;
  /** Resposta de `presenca_decisores` (todos · alguns · a_confirmar · nao), se visível. */
  presenca: string | null;
  /**
   * 🔴 A trava: `true` quando alguém DECIDE JUNTO. A Reunião Preliminar
   * exige essas pessoas presentes (*"está proibido participar da reunião sem
   * os decisores"*). Opina/avisa NÃO trava (decisão do Marcio, 29/09, c).
   */
  exigeTodosNaPreliminar: boolean;
  /** @deprecated 2.0 — igual a `decideJunto`. */
  adicionais: DecisorDetectado[];
}

const LETRAS: LetraDisc[] = ["D", "I", "S", "C"];

/**
 * Soma os pesos das perguntas ATIVAS e VISÍVEIS e devolve o perfil.
 * Resposta ou opção desconhecida é ignorada em silêncio: o histórico nunca
 * derruba o cálculo.
 */
export function calcularDisc(respostas: RespostasEntrevista | null | undefined): ResultadoDisc {
  const r = respostas ?? {};
  const pontos: Record<LetraDisc, number> = { D: 0, I: 0, S: 0, C: 0 };
  let sinais = 0;
  let respondidasComPeso = 0;

  for (const p of perguntasVisiveis(r)) {
    const marcadas = new Set(opcoesMarcadas(r[p.id]));
    let perguntaPesou = false;
    for (const o of p.opcoes) {
      if (!marcadas.has(o.id) || !o.disc) continue;
      let opcaoPesou = false;
      for (const l of LETRAS) {
        const peso = o.disc[l];
        if (typeof peso === "number" && peso > 0) {
          pontos[l] += peso;
          opcaoPesou = true;
        }
      }
      if (opcaoPesou) {
        sinais += 1;
        perguntaPesou = true;
      }
    }
    if (perguntaPesou) respondidasComPeso += 1;
  }

  // Ordem por pontos; `sort` é estável, então o empate fica em D→I→S→C.
  const ordem = [...LETRAS].sort((a, b) => pontos[b] - pontos[a]);
  const maximo = pontos[ordem[0]];
  if (maximo === 0) {
    // Zero informação = sem perfil. Devolver "D" seria inventar.
    return {
      letra: null, secundaria: null, pontos, empate: [], sinais, margem: 0,
      confianca: "baixa", respondidasComPeso,
    };
  }

  const empate = LETRAS.filter((l) => pontos[l] === maximo);
  const segunda = ordem[1];
  const margem = maximo - pontos[segunda];
  const confianca: ConfiancaDisc =
    empate.length > 1
      ? "baixa"
      : margem >= 3 && sinais >= 6
        ? "alta"
        : margem >= 2 && sinais >= 4
          ? "media"
          : "baixa";

  return {
    letra: empate[0],
    secundaria: pontos[segunda] > 0 ? segunda : null,
    pontos,
    empate,
    sinais,
    margem,
    confianca,
    respondidasComPeso,
  };
}

const FORCA: Record<PapelDecisor, number> = { dj: 3, inf: 2, av: 1 };

/**
 * Lê quem decide, nas perguntas ATIVAS e VISÍVEIS.
 *
 * 🔑 Conta TIPOS, não pessoas: o mesmo tipo aparece uma vez, com o papel
 * mais forte. Contar duas vezes faria o parceiro procurar alguém que não
 * existe.
 */
export function mapearDecisores(respostas: RespostasEntrevista | null | undefined): ResultadoDecisores {
  const r = respostas ?? {};
  const porSinal = new Map<SinalDecisor, DecisorDetectado>();
  let consultaTerceiro = false;
  let presenca: string | null = null;

  for (const p of perguntasVisiveis(r)) {
    const marcadas = new Set(opcoesMarcadas(r[p.id]));
    if (p.id === "presenca_decisores") presenca = [...marcadas][0] ?? null;
    if (p.id === "obs_comportamento" && marcadas.has("consulta_terceiro")) consultaTerceiro = true;
    for (const o of p.opcoes) {
      if (!marcadas.has(o.id) || !o.decisor || !o.papel || o.decisor === "sozinho") continue;
      const atual = porSinal.get(o.decisor);
      if (!atual || FORCA[o.papel] > FORCA[atual.papel]) {
        porSinal.set(o.decisor, {
          sinal: o.decisor,
          papel: o.papel,
          perguntaId: p.id,
          opcaoId: o.id,
          origem: p.enunciado,
        });
      }
    }
  }

  const todos = [...porSinal.values()];
  const decideJunto = todos.filter((d) => d.papel === "dj");
  return {
    total: 1 + decideJunto.length,
    decideJunto,
    influenciam: todos.filter((d) => d.papel === "inf"),
    soAvisam: todos.filter((d) => d.papel === "av"),
    consultaTerceiro,
    presenca,
    exigeTodosNaPreliminar: decideJunto.length > 0,
    adicionais: decideJunto,
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

/** Rótulo humano de cada papel. */
export const ROTULO_PAPEL: Record<PapelDecisor, string> = {
  dj: "Decide junto",
  inf: "Opina",
  av: "Só é avisado",
};

/** Rótulo de `presenca_decisores`. */
export const ROTULO_PRESENCA: Record<string, string> = {
  todos: "todos confirmam presença",
  alguns: "só alguns conseguem participar",
  a_confirmar: "presença ainda a confirmar",
  nao: "não conseguem participar",
};

/** Rótulo da confiança do perfil. */
export const ROTULO_CONFIANCA: Record<ConfiancaDisc, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

/** Nome por extenso de cada letra — espelha `PERFIS_DISC` de `etapa1.ts`. */
export const NOME_DA_LETRA: Record<LetraDisc, string> = {
  D: "Dominância",
  I: "Influência",
  S: "Estabilidade",
  C: "Conformidade",
};

/**
 * Como conduzir cada perfil — ORIENTAÇÃO DE CONDUÇÃO, não descrição de
 * personalidade.
 */
export const COMO_CONDUZIR: Record<LetraDisc, string> = {
  D: "Vá direto ao ponto. Comece pelo resultado e pelo prazo, não pelo método. Evite rodeios e reuniões longas — apresente o caminho e peça a decisão.",
  I: "Construa a relação antes do conteúdo. Traga casos de outras famílias, use exemplos e histórias. Confirme por escrito o que foi combinado, porque o entusiasmo dela é maior que a memória.",
  S: "Não apresse. Explique o passo a passo e deixe claro o que NÃO muda na vida dela. Segurança vale mais que oportunidade — e a presença da família na conversa ajuda em vez de atrapalhar.",
  C: "Leve número, documento e método. Antecipe as perguntas de detalhe e admita o que ainda não se sabe. Prometer sem base destrói a confiança dessa pessoa mais rápido que qualquer outra.",
};

/**
 * O que NÃO fazer com cada perfil — o erro que mais custa com aquela letra.
 * Complementa `COMO_CONDUZIR`; vai para o relatório de relacionamento.
 */
export const NAO_FAZER: Record<LetraDisc, string> = {
  D: "Não abra com histórico longo nem explique o método antes do resultado; não pareça tirar a decisão das mãos dela.",
  I: "Não afogue em número e documento logo no início; não seja frio nem corte a conversa para ganhar tempo.",
  S: "Não pressione por decisão na hora nem proponha mudança brusca; não trate a família como obstáculo.",
  C: "Não prometa sem base, não arredonde número e não responda \"depois eu vejo\"; não pule etapa do método.",
};

/**
 * O RELATÓRIO em texto — vai para `disc_consciencia`, `disc_gatilhos` e
 * `disc_relacionamento` da ficha, sem ninguém escrever nada.
 *
 * 🔴 Cabe nos CHECKs (3..2000 por campo): cada parte é cortada em 1950.
 * 🔴 `frases_cliente` NÃO entra aqui: é texto livre de terceiro e vai só
 * para a Parte 06 do briefing (decisão do Marcio, 29/09, item a).
 */
export function gerarRelatorio(
  respostas: RespostasEntrevista,
  disc: ResultadoDisc,
  decisores: ResultadoDecisores,
): { consciencia: string; gatilhos: string; relacionamento: string } {
  return {
    consciencia: montarConsciencia(respostas, decisores),
    gatilhos: montarGatilhos(respostas),
    relacionamento: montarRelacionamento(respostas, disc, decisores),
  };
}

/** Rótulos das opções marcadas numa pergunta visível (vazio se oculta). */
function rotulos(respostas: RespostasEntrevista, perguntaId: string, visiveis: Set<string>): string[] {
  if (!visiveis.has(perguntaId)) return [];
  const p = perguntaPorId(perguntaId);
  const marcadas = new Set(opcoesMarcadas(respostas[perguntaId]));
  return p ? p.opcoes.filter((o) => marcadas.has(o.id)).map((o) => o.rotulo) : [];
}

function primeiro(respostas: RespostasEntrevista, perguntaId: string, visiveis: Set<string>): string | null {
  return rotulos(respostas, perguntaId, visiveis)[0] ?? null;
}

function min(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function montarConsciencia(respostas: RespostasEntrevista, decisores: ResultadoDecisores): string {
  const vis = new Set(perguntasVisiveis(respostas).map((p) => p.id));
  const partes: string[] = [];
  const motivo = primeiro(respostas, "motivo_busca", vis);
  const conhecimento = primeiro(respostas, "ja_tentou", vis);
  const bens = rotulos(respostas, "bens", vis);
  const imoveis = primeiro(respostas, "imoveis_qtd", vis);
  const titularidade = primeiro(respostas, "titularidade", vis);
  const instrumento = opcoesMarcadas(respostas.instrumento_existente)[0];
  const instrumentoRotulo = primeiro(respostas, "instrumento_existente", vis);

  if (motivo) partes.push(`Procurou por: ${min(motivo)}.`);
  if (conhecimento) partes.push(`O que já sabe: ${min(conhecimento)}.`);
  if (bens.length) partes.push(`Patrimônio em: ${bens.map(min).join(", ")}.`);
  if (imoveis) partes.push(`Imóveis: ${imoveis}.`);
  if (titularidade) partes.push(`Titularidade: ${min(titularidade)}.`);
  if (instrumentoRotulo) partes.push(`Instrumento existente: ${min(instrumentoRotulo)}.`);
  if (vis.has("instrumento_existente") && instrumento === "holding") {
    partes.push("🔴 Já tem holding — avise a equipe: a oferta muda.");
  }
  if (decisores.total > 1) partes.push(`A decisão envolve ${decisores.total} pessoas.`);

  const texto = partes.join(" ").trim();
  // Piso de 3 caracteres do CHECK: nunca string vazia.
  return texto.length >= 3 ? corta(texto) : "Entrevista sem respostas neste bloco.";
}

function montarGatilhos(respostas: RespostasEntrevista): string {
  const vis = new Set(perguntasVisiveis(respostas).map((p) => p.id));
  const partes: string[] = [];
  const criterio = primeiro(respostas, "criterio_valor", vis);
  const herdeiros = primeiro(respostas, "conflito_herdeiros", vis);
  const obs = perguntaPorId("obs_comportamento");
  const marcadasObs = vis.has("obs_comportamento")
    ? new Set(opcoesMarcadas(respostas.obs_comportamento))
    : new Set<string>();
  const atencao = (obs?.opcoes ?? [])
    .filter((o) => o.grupo === "atencao" && marcadasObs.has(o.id))
    .map((o) => min(o.rotulo));

  if (criterio) partes.push(`Para valer a pena, precisa: ${min(criterio)}.`);
  if (herdeiros) partes.push(`Herdeiros: ${min(herdeiros)}.`);
  if (atencao.length) partes.push(`Pontos de atenção: ${atencao.join("; ")}.`);

  const texto = partes.join(" ").trim();
  return texto.length >= 3 ? corta(texto) : "Entrevista sem respostas neste bloco.";
}

function montarRelacionamento(
  respostas: RespostasEntrevista,
  disc: ResultadoDisc,
  decisores: ResultadoDecisores,
): string {
  const vis = new Set(perguntasVisiveis(respostas).map((p) => p.id));
  const partes: string[] = [];
  const letra = disc.letra;

  if (letra) {
    partes.push(`Perfil ${letra} — ${NOME_DA_LETRA[letra]}.`);
    if (disc.empate.length > 1) {
      const outras = disc.empate.filter((l) => l !== letra).join(" e ");
      partes.push(`Perfil misto: empate com ${outras}.`);
    } else if (disc.secundaria) {
      partes.push(`Secundária: ${disc.secundaria} — ${NOME_DA_LETRA[disc.secundaria]}.`);
    }
    partes.push(`Confiança ${ROTULO_CONFIANCA[disc.confianca].toLowerCase()} (${disc.sinais} sinais, margem ${disc.margem}).`);
    partes.push(COMO_CONDUZIR[letra]);
    partes.push(`Evite: ${NAO_FAZER[letra]}`);
  } else {
    partes.push("Perfil DISC não definido — respostas insuficientes.");
  }

  const processamento = primeiro(respostas, "processamento", vis);
  if (processamento) partes.push(`Prefere conduzir assim: ${min(processamento)}.`);

  if (decisores.exigeTodosNaPreliminar) {
    const lista = decisores.decideJunto.map((d) => ROTULO_DECISOR[d.sinal]).join(", ");
    const presenca = decisores.presenca ? ` Presença: ${ROTULO_PRESENCA[decisores.presenca] ?? decisores.presenca}.` : "";
    partes.push(
      `🔴 ${decisores.total} decisores: o entrevistado e mais ${lista}. ` +
        `A Reunião Preliminar exige TODOS presentes.${presenca}`,
    );
  } else {
    partes.push("Decide sem ninguém junto — a Reunião Preliminar pode ser feita só com ele.");
  }
  const opinam = [...decisores.influenciam, ...decisores.soAvisam]
    .map((d) => `${ROTULO_DECISOR[d.sinal]} (${ROTULO_PAPEL[d.papel].toLowerCase()})`);
  if (opinam.length) partes.push(`Influenciam sem decidir: ${opinam.join(", ")}.`);
  if (decisores.consultaTerceiro) partes.push("Vai consultar alguém de fora (contador, advogado).");
  const agendamento = textoAgendamento(respostas);
  if (agendamento) partes.push(agendamento);

  return corta(partes.join(" ").trim());
}

/** Respeita o teto de 2000 do CHECK, cortando em palavra inteira. */
function corta(texto: string, maximo = 1950): string {
  if (texto.length <= maximo) return texto;
  const cortado = texto.slice(0, maximo);
  const ultimoEspaco = cortado.lastIndexOf(" ");
  return (ultimoEspaco > maximo - 120 ? cortado.slice(0, ultimoEspaco) : cortado) + "…";
}
