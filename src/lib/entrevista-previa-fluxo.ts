import {
  CHAVE_AGENDAMENTO_MOTIVO,
  CHAVE_AGENDAMENTO_PRELIMINAR,
  CHAVE_FRASES_CLIENTE,
  MOTIVOS_NAO_AGENDOU,
  OPCOES_AGENDAMENTO,
  type AgendamentoPreliminar,
  type MotivoNaoAgendou,
  PERGUNTAS_ATIVAS,
  SEPARADOR_MULTIPLA,
  perguntaPorId,
  type CondicaoPergunta,
  type PerguntaEntrevista,
  type RespostasEntrevista,
} from "@/lib/entrevista-previa-perguntas";
// `import type`: some na compilação — não cria ciclo em runtime com o cálculo.
import type { ResultadoDecisores } from "@/lib/entrevista-previa-calculo";

/**
 * O FLUXO da Entrevista Prévia 3.0 — funções PURAS (sem React, sem banco)
 * que a tela e as actions compartilham: quais perguntas aparecem, em que
 * ordem, quanto falta, o que se poda na conclusão, como se lê e se grava
 * cada valor, e a frase de validação.
 *
 * 🔑 A tela NUNCA decide visibilidade por conta própria: chama
 * `perguntasVisiveis()`. Assim a condição ("imóveis só se tem imóvel") vive
 * num lugar só, e a poda da conclusão usa exatamente a mesma regra que a
 * tela mostrou.
 */

// ── LEITURA E GRAVAÇÃO DE VALORES ──────────────────────────────────────────

/**
 * Normaliza QUALQUER valor gravado em lista de ids de opção.
 * Aceita `"id"`, `"a|b"` (formato gravado da múltipla) e `["a","b"]`.
 * Qualquer outra coisa (null, número, objeto) vira `[]` — nunca lança.
 */
export function opcoesMarcadas(valor: unknown): string[] {
  const brutos: unknown[] =
    typeof valor === "string"
      ? valor.split(SEPARADOR_MULTIPLA)
      : Array.isArray(valor)
        ? valor
        : [];
  const vistos = new Set<string>();
  for (const b of brutos) {
    if (typeof b !== "string") continue;
    const id = b.trim();
    if (id) vistos.add(id);
  }
  return [...vistos];
}

/** `true` quando a pergunta tem ao menos uma opção marcada. */
export function estaRespondida(respostas: RespostasEntrevista | null | undefined, perguntaId: string): boolean {
  return opcoesMarcadas(respostas?.[perguntaId]).length > 0;
}

// ── VISIBILIDADE ───────────────────────────────────────────────────────────

function revelaDecideJunto(p: PerguntaEntrevista, respostas: RespostasEntrevista): boolean {
  const marcadas = new Set(opcoesMarcadas(respostas[p.id]));
  return p.opcoes.some((o) => o.papel === "dj" && marcadas.has(o.id));
}

function condicaoOk(
  c: CondicaoPergunta,
  respostas: RespostasEntrevista,
  visiveisAntes: readonly PerguntaEntrevista[],
): boolean {
  const visivel = (id: string) => visiveisAntes.some((p) => p.id === id);
  switch (c.tipo) {
    case "contem": {
      // Resposta de pergunta que ficou OCULTA não conta: senão um rascunho
      // antigo reabriria uma pergunta que a tela já tinha escondido.
      if (!visivel(c.pergunta)) return false;
      const marcadas = opcoesMarcadas(respostas[c.pergunta]);
      return marcadas.some((id) => c.opcoes.includes(id));
    }
    case "respondida_exceto": {
      if (!visivel(c.pergunta)) return false;
      const marcadas = opcoesMarcadas(respostas[c.pergunta]);
      return marcadas.length > 0 && !marcadas.some((id) => c.opcoes.includes(id));
    }
    case "algum_decide_junto":
      return visiveisAntes.some((p) => revelaDecideJunto(p, respostas));
  }
}

/**
 * As perguntas que aparecem PARA ESTAS respostas, na ordem da conversa.
 * Caminho longo: 15. Caminho curto (sem imóvel, sem empresa, sem ninguém
 * que decida junto, sem filhos): 11.
 *
 * Avalia em sequência: a condição de uma pergunta só enxerga as visíveis
 * ANTES dela — é a ordem em que a conversa acontece.
 */
export function perguntasVisiveis(respostas: RespostasEntrevista | null | undefined): PerguntaEntrevista[] {
  const r = respostas ?? {};
  const visiveis: PerguntaEntrevista[] = [];
  for (const p of PERGUNTAS_ATIVAS) {
    if (!p.mostrarSe || condicaoOk(p.mostrarSe, r, visiveis)) visiveis.push(p);
  }
  return visiveis;
}

/** A pergunta está no caminho destas respostas? */
export function perguntaEstaVisivel(respostas: RespostasEntrevista | null | undefined, perguntaId: string): boolean {
  return perguntasVisiveis(respostas).some((p) => p.id === perguntaId);
}

/**
 * Retomada: a 1ª pergunta visível SEM resposta. `null` = tudo respondido
 * (a tela vai para a validação).
 */
export function primeiraSemResposta(respostas: RespostasEntrevista | null | undefined): PerguntaEntrevista | null {
  return perguntasVisiveis(respostas).find((p) => !estaRespondida(respostas, p.id)) ?? null;
}

const ORDEM = new Map(PERGUNTAS_ATIVAS.map((p, i) => [p.id, i]));

/**
 * A próxima pergunta visível DEPOIS de `perguntaId`, pela ordem do roteiro.
 * Funciona mesmo se `perguntaId` acabou de ficar oculta (a resposta mudou).
 * `null` = acabou (vai para a validação).
 */
export function perguntaSeguinte(respostas: RespostasEntrevista | null | undefined, perguntaId: string): PerguntaEntrevista | null {
  const i = ORDEM.get(perguntaId) ?? -1;
  return perguntasVisiveis(respostas).find((p) => (ORDEM.get(p.id) ?? -1) > i) ?? null;
}

/** A pergunta visível ANTES de `perguntaId` (botão "Anterior"); `null` na 1ª. */
export function perguntaAnterior(respostas: RespostasEntrevista | null | undefined, perguntaId: string): PerguntaEntrevista | null {
  const i = ORDEM.get(perguntaId) ?? PERGUNTAS_ATIVAS.length;
  const antes = perguntasVisiveis(respostas).filter((p) => (ORDEM.get(p.id) ?? -1) < i);
  return antes[antes.length - 1] ?? null;
}

/**
 * "Pergunta X de Y" — `total` é recalculado a cada resposta (o caminho
 * muda). `posicao` é 1-based.
 */
export function progresso(
  respostas: RespostasEntrevista | null | undefined,
  perguntaId: string,
): { posicao: number; total: number } {
  const visiveis = perguntasVisiveis(respostas);
  const i = ORDEM.get(perguntaId) ?? PERGUNTAS_ATIVAS.length;
  const antes = visiveis.filter((p) => (ORDEM.get(p.id) ?? -1) < i).length;
  return { posicao: Math.min(antes + 1, visiveis.length), total: visiveis.length };
}

// ── TEMPO ESTIMADO ─────────────────────────────────────────────────────────

/** Pergunta falada: o parceiro lê e a pessoa responde. */
export const SEGUNDOS_POR_FALADA = 30;
/** Observação ("Não pergunte"): só marcar. */
export const SEGUNDOS_POR_OBSERVACAO = 10;

function segundosDe(p: PerguntaEntrevista): number {
  return p.observacao ? SEGUNDOS_POR_OBSERVACAO : SEGUNDOS_POR_FALADA;
}

/**
 * Tempo estimado das perguntas visíveis ainda SEM resposta.
 * `minutos` arredonda para cima (a tela escreve "≈ N min restantes");
 * `0` só quando não falta nada.
 */
export function tempoRestante(respostas: RespostasEntrevista | null | undefined): { segundos: number; minutos: number } {
  const segundos = perguntasVisiveis(respostas)
    .filter((p) => !estaRespondida(respostas, p.id))
    .reduce((s, p) => s + segundosDe(p), 0);
  return { segundos, minutos: Math.ceil(segundos / 60) };
}

/** Tempo do caminho mais longo (15 perguntas), para a abertura. */
export const TEMPO_MAXIMO_SEGUNDOS = PERGUNTAS_ATIVAS.reduce((s, p) => s + segundosDe(p), 0);

// ── NORMALIZAÇÃO E PODA (usadas pelas actions) ─────────────────────────────

/**
 * Filtra e serializa o que veio do navegador. 🔴 Server Action é endpoint
 * HTTP: o tipo do TypeScript não vale em runtime. Fica só:
 *   • chave que é pergunta do catálogo (ativa OU aposentada — rascunho e
 *     entrevista antiga continuam legíveis);
 *   • opção que existe NAQUELA pergunta;
 *   • única com 1 opção; múltipla gravada como "a|b" na ordem do catálogo.
 *   • `agendamento_preliminar` só com valor de `OPCOES_AGENDAMENTO`;
 *     `agendamento_motivo` só com valor de `MOTIVOS_NAO_AGENDOU` E só quando
 *     `agendamento_preliminar = "nao_agendou"` (senão é descartado).
 * `frases_cliente` NÃO passa por aqui (tem validação própria).
 */
export function normalizarRespostas(entrada: unknown): {
  respostas: RespostasEntrevista;
  descartadas: string[];
} {
  const respostas: RespostasEntrevista = {};
  const descartadas: string[] = [];
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) {
    return { respostas, descartadas };
  }
  const bruto = entrada as Record<string, unknown>;
  const agendamento = lerAgendamento(bruto);
  if (agendamento.preliminar) respostas[CHAVE_AGENDAMENTO_PRELIMINAR] = agendamento.preliminar;
  else if (bruto[CHAVE_AGENDAMENTO_PRELIMINAR] !== undefined) descartadas.push(CHAVE_AGENDAMENTO_PRELIMINAR);
  if (agendamento.motivo) respostas[CHAVE_AGENDAMENTO_MOTIVO] = agendamento.motivo;
  else if (bruto[CHAVE_AGENDAMENTO_MOTIVO] !== undefined) descartadas.push(CHAVE_AGENDAMENTO_MOTIVO);

  for (const [chave, valor] of Object.entries(bruto)) {
    if (
      chave === CHAVE_FRASES_CLIENTE ||
      chave === CHAVE_AGENDAMENTO_PRELIMINAR ||
      chave === CHAVE_AGENDAMENTO_MOTIVO
    ) continue;
    const p = perguntaPorId(chave);
    if (!p) {
      descartadas.push(chave);
      continue;
    }
    const marcadas = new Set(opcoesMarcadas(valor));
    const validas = p.opcoes.filter((o) => marcadas.has(o.id)).map((o) => o.id);
    if (validas.length === 0 || (!p.multipla && validas.length > 1)) {
      if (marcadas.size > 0) descartadas.push(chave);
      continue;
    }
    respostas[chave] = validas.join(SEPARADOR_MULTIPLA);
  }
  return { respostas, descartadas };
}

/**
 * Poda da CONCLUSÃO: tira a resposta de pergunta ATIVA que a condição
 * escondeu (ex.: marcou "empresa", respondeu sócios, depois desmarcou
 * "empresa"). Rascunho mantém tudo — quem volta atrás não perde nada.
 * Respostas de perguntas aposentadas e `frases_cliente` ficam intactas.
 */
export function podarRespostasOcultas(respostas: RespostasEntrevista): RespostasEntrevista {
  const visiveis = new Set(perguntasVisiveis(respostas).map((p) => p.id));
  const ativas = new Set(PERGUNTAS_ATIVAS.map((p) => p.id));
  const podadas: RespostasEntrevista = {};
  for (const [chave, valor] of Object.entries(respostas)) {
    if (ativas.has(chave) && !visiveis.has(chave)) continue;
    podadas[chave] = valor;
  }
  return podadas;
}

// ── REUNIÃO PRELIMINAR (campo de fechamento) ───────────────────────────────

/**
 * Lê `agendamento_preliminar`/`agendamento_motivo` de qualquer objeto de
 * respostas. Valor fora da lista fechada = `null`. Motivo só existe com
 * `nao_agendou`.
 */
export function lerAgendamento(respostas: RespostasEntrevista | Record<string, unknown> | null | undefined): {
  preliminar: AgendamentoPreliminar | null;
  motivo: MotivoNaoAgendou | null;
} {
  const r = (respostas ?? {}) as Record<string, unknown>;
  const p = r[CHAVE_AGENDAMENTO_PRELIMINAR];
  const m = r[CHAVE_AGENDAMENTO_MOTIVO];
  const preliminar = OPCOES_AGENDAMENTO.find((o) => o.id === p)?.id ?? null;
  const motivo =
    preliminar === "nao_agendou" ? (MOTIVOS_NAO_AGENDOU.find((o) => o.id === m)?.id ?? null) : null;
  return { preliminar, motivo };
}

/** Recusa da conclusão sem `agendamento_preliminar` válido. */
export const MSG_AGENDAMENTO_OBRIGATORIO = "Marque se a Reunião Preliminar foi agendada.";

/**
 * Uma linha para relatório/briefing. `null` quando não foi marcado
 * (entrevista antiga).
 */
export function textoAgendamento(respostas: RespostasEntrevista | Record<string, unknown> | null | undefined): string | null {
  const { preliminar, motivo } = lerAgendamento(respostas);
  if (preliminar === "agora") return "Reunião Preliminar: o parceiro seguiu para marcar no fim da entrevista.";
  if (preliminar === "ja_marcada") return "Reunião Preliminar: já estava marcada antes da entrevista.";
  if (preliminar === "nao_agendou") {
    const rot = MOTIVOS_NAO_AGENDOU.find((o) => o.id === motivo)?.rotulo;
    return `Reunião Preliminar: não agendada na entrevista${rot ? ` (${rot.charAt(0).toLowerCase()}${rot.slice(1)})` : ""}.`;
  }
  return null;
}

// ── FRASES EXATAS DO CLIENTE ───────────────────────────────────────────────

/** No máximo 3 frases (decisão do Marcio, 29/09, item a). */
export const FRASES_MAXIMO = 3;
/** No máximo 150 caracteres por frase. */
export const FRASE_MAXIMO_CARACTERES = 150;
/** Separador no formato gravado (uma frase por linha). */
const SEPARADOR_FRASES = "\n";

function limparFrase(f: string): string {
  // Colapsa espaço e quebra de linha: a frase é uma linha só, e a quebra é
  // o separador do formato gravado.
  return f.replace(/\s+/g, " ").trim();
}

/**
 * Lê as frases de uma entrevista, em qualquer formato (string com uma por
 * linha, ou array). Sem frase = `[]`.
 */
export function frasesDoCliente(respostas: RespostasEntrevista | Record<string, unknown> | null | undefined): string[] {
  const bruto = (respostas as Record<string, unknown> | null | undefined)?.[CHAVE_FRASES_CLIENTE];
  const lista: unknown[] =
    typeof bruto === "string" ? bruto.split(SEPARADOR_FRASES) : Array.isArray(bruto) ? bruto : [];
  return lista
    .filter((f): f is string => typeof f === "string")
    .map((f) => limparFrase(f).slice(0, FRASE_MAXIMO_CARACTERES))
    .filter((f) => f.length > 0)
    .slice(0, FRASES_MAXIMO);
}

/**
 * Valida o que veio do navegador: 0 a 3 frases, cada uma aparada e com até
 * 150 caracteres. Frase vazia é descartada (não é erro).
 */
export function validarFrases(entrada: unknown):
  | { ok: true; frases: string[] }
  | { ok: false; erro: string } {
  if (entrada === undefined || entrada === null || entrada === "") return { ok: true, frases: [] };
  const lista: unknown[] =
    typeof entrada === "string" ? entrada.split(SEPARADOR_FRASES) : Array.isArray(entrada) ? entrada : [null];
  if (lista.some((f) => typeof f !== "string")) {
    return { ok: false, erro: "As frases do cliente vieram em formato inválido." };
  }
  const frases = (lista as string[]).map(limparFrase).filter((f) => f.length > 0);
  if (frases.length > FRASES_MAXIMO) {
    return { ok: false, erro: `Anote no máximo ${FRASES_MAXIMO} frases do cliente.` };
  }
  if (frases.some((f) => f.length > FRASE_MAXIMO_CARACTERES)) {
    return {
      ok: false,
      erro: `Cada frase do cliente pode ter até ${FRASE_MAXIMO_CARACTERES} caracteres.`,
    };
  }
  return { ok: true, frases };
}

/** Formato gravado das frases (string única, uma por linha). */
export function serializarFrases(frases: readonly string[]): string {
  return frases.join(SEPARADOR_FRASES);
}

// ── TELA DE VALIDAÇÃO ──────────────────────────────────────────────────────

export interface ValidacaoEntrevista {
  /**
   * "Deixa eu confirmar: você chegou até nós por {motivo}. O que precisa
   * ficar claro é {critério}. E a decisão envolve {decisores}. É isso?"
   * Parte sem resposta é OMITIDA (nunca "undefined"). `null` quando não há
   * nenhuma das três.
   */
  frase: string | null;
  motivo: string | null;
  criterio: string | null;
  decisores: string | null;
  /** Para onde cada "Ajustar" leva (id da pergunta). */
  ajustar: { motivo: "motivo_busca"; criterio: "criterio_valor"; decisores: "decide_sozinho" };
}

const NOME_FALADO: Record<string, string> = {
  conjuge: "o cônjuge",
  filhos: "os filhos",
  socio: "o sócio",
  terceiro: "alguém de confiança",
};

function juntarE(itens: string[]): string {
  if (itens.length <= 1) return itens[0] ?? "";
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

function faladoDe(perguntaId: string, respostas: RespostasEntrevista): string | null {
  const p = perguntaPorId(perguntaId);
  const id = opcoesMarcadas(respostas[perguntaId])[0];
  const o = p?.opcoes.find((x) => x.id === id);
  return o ? (o.falado ?? o.rotulo.toLowerCase()) : null;
}

/**
 * Monta a frase de validação lida para o cliente antes de concluir.
 * `decisores` é o retorno de `mapearDecisores(respostas)`.
 */
export function montarValidacao(
  respostas: RespostasEntrevista,
  decisores: ResultadoDecisores,
): ValidacaoEntrevista {
  const visiveis = new Set(perguntasVisiveis(respostas).map((p) => p.id));
  const motivo = visiveis.has("motivo_busca") ? faladoDe("motivo_busca", respostas) : null;
  const criterio = visiveis.has("criterio_valor") ? faladoDe("criterio_valor", respostas) : null;

  let textoDecisores: string | null = null;
  const dj = decisores.decideJunto.map((d) => NOME_FALADO[d.sinal]).filter(Boolean);
  const inf = decisores.influenciam.map((d) => NOME_FALADO[d.sinal]).filter(Boolean);
  if (dj.length > 0) {
    textoDecisores = `você e ${juntarE(dj)}`;
  } else if (estaRespondida(respostas, "decide_sozinho")) {
    textoDecisores = "só você";
  }
  if (textoDecisores && inf.length > 0) textoDecisores += `, ouvindo ${juntarE(inf)}`;

  const partes: string[] = [];
  if (motivo) partes.push(`você chegou até nós por ${motivo}.`);
  if (criterio) partes.push(`${partes.length ? "O" : "o"} que precisa ficar claro é ${criterio}.`);
  if (textoDecisores) partes.push(`${partes.length ? "E a" : "a"} decisão envolve ${textoDecisores}.`);

  return {
    frase: partes.length ? `Deixa eu confirmar: ${partes.join(" ")} É isso?` : null,
    motivo,
    criterio,
    decisores: textoDecisores,
    ajustar: { motivo: "motivo_busca", criterio: "criterio_valor", decisores: "decide_sozinho" },
  };
}
