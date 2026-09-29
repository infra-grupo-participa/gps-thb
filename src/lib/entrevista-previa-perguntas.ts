/**
 * O ROTEIRO da Entrevista Prévia 3.0 — as perguntas que o parceiro lê em voz
 * alta enquanto conversa com o lead, e as opções que ele marca na tela.
 *
 * ── HISTÓRICO ──────────────────────────────────────────────────────────────
 *
 * 2.0 (23/09/2026): 24 perguntas fechadas, DISC por soma de pesos.
 * 24/09/2026: +6 perguntas de FATO para o Script de Fechamento (30 no total).
 * 🔑 3.0 (29/09/2026, decisões do Marcio): **no máximo 15 perguntas** no
 * caminho mais longo, em 4 blocos — Consciência · Quem decide · Gatilhos ·
 * Relacionamento — e a Reunião Preliminar marcada no fim. Caminho curto: 11.
 *   • 20 perguntas foram APOSENTADAS, não apagadas: continuam aqui com
 *     `aposentada: true`, fora do fluxo e do cálculo, legíveis para as
 *     entrevistas antigas (o briefing ainda as mostra). NENHUM id foi
 *     renomeado nem reaproveitado — o id é o que está gravado no banco.
 *   • Preço saiu do roteiro (`decide_investimento`, `reacao_preco`
 *     aposentadas). A Parte 06 do briefing passa a ser presença dos
 *     decisores + pontos de atenção + frases do cliente.
 *   • Só o papel "decide junto" (`dj`) trava a Reunião Preliminar. "Opina"
 *     (`inf`) e "só avisa" (`av`) vão para o relatório, não para a trava.
 *
 * ── 🔑 A REGRA QUE GOVERNA ESTE ARQUIVO ────────────────────────────────────
 *
 * **NENHUMA pergunta aberta.** O ENUNCIADO é conversacional (o parceiro lê
 * em voz alta); a RESPOSTA é sempre opção de lista fechada. Os únicos textos
 * livres do fluxo são o nome de cada decisor e as frases exatas do cliente
 * (`frases_cliente`) — nenhum dos dois entra em cálculo.
 *
 * ── COMO O DISC SAI DAQUI ──────────────────────────────────────────────────
 *
 * Cada opção carrega `disc` (peso por letra). Soma-se e a maior soma vence.
 * Só 5 perguntas ativas pesam, e o teto é **11 por letra** (100%):
 *   motivo_busca 2 · criterio_valor 2 · processamento 2 · ritmo_conversa 3 ·
 *   obs_comportamento 2 (múltipla: dois itens de 1 por letra).
 * Peso 3 só existe em `ritmo_conversa`, que é OBSERVAÇÃO (`observacao: true`)
 * — comportamento visto, não declarado.
 *
 * ── COMO OS DECISORES SAEM DAQUI ───────────────────────────────────────────
 *
 * `decisor` na opção diz QUEM a resposta revela; `papel` diz o PESO dele:
 *   `dj`  decide junto → grava em `gps.cliente_decisores` e trava a Preliminar
 *   `inf` influencia (opina) → só relatório/briefing
 *   `av`  só é avisado → só relatório/briefing
 *
 * ── FORMATO GRAVADO ────────────────────────────────────────────────────────
 *
 * `respostas` é `{ perguntaId: valor }`. Pergunta de escolha única grava o id
 * da opção; múltipla grava os ids separados por `|` (ver
 * `SEPARADOR_MULTIPLA`). Toda leitura passa por `opcoesMarcadas()`
 * (`entrevista-previa-fluxo.ts`), que aceita string, "a|b" e array.
 */

/** As 4 letras. Espelha `PERFIS_DISC` de `etapa1.ts`, que é a lista única. */
export type LetraDisc = "D" | "I" | "S" | "C";

/** O que uma resposta revela sobre QUEM decide. */
export type SinalDecisor = "sozinho" | "conjuge" | "filhos" | "socio" | "terceiro";

/**
 * O PESO do decisor revelado.
 * 🔴 Só `dj` trava a Reunião Preliminar (decisão do Marcio, 29/09, item c).
 */
export type PapelDecisor = "dj" | "inf" | "av";

/** Os 4 blocos da 3.0 + os 5 da 2.0 (só as aposentadas ainda os usam). */
export type BlocoEntrevista =
  | "consciencia"
  | "decisores"
  | "gatilhos"
  | "relacionamento"
  // legado 2.0 — só em perguntas aposentadas
  | "abertura"
  | "patrimonio"
  | "comportamento"
  | "fechamento";

/** Em `obs_comportamento`, a tela separa as opções em duas colunas. */
export type GrupoOpcao = "jeito" | "atencao";

/**
 * Valor gravado de uma resposta. `string` é o formato do banco (única = id;
 * múltipla = ids separados por `|`); `string[]` é aceito na leitura e no
 * estado da tela. Normalize SEMPRE com `opcoesMarcadas()`.
 */
export type ValorResposta = string | readonly string[];

/**
 * O mapa de respostas de uma entrevista.
 *
 * `frases_cliente`: 0 a 3 frases exatas do cliente, até 150 caracteres cada,
 * validadas e aparadas na action. NÃO é pergunta do catálogo e não entra em
 * cálculo nenhum — aparece só na Parte 06 do briefing. Gravada como string
 * única com as frases separadas por quebra de linha; lida com
 * `frasesDoCliente()`, que aceita também array.
 */
export interface RespostasEntrevista {
  [perguntaId: string]: ValorResposta | undefined;
  frases_cliente?: ValorResposta;
  /** Campo de FECHAMENTO (não é pergunta): ver `OPCOES_AGENDAMENTO`. */
  agendamento_preliminar?: ValorResposta;
  /** Só com `agendamento_preliminar = "nao_agendou"`: ver `MOTIVOS_NAO_AGENDOU`. */
  agendamento_motivo?: ValorResposta;
}

/** Chave de `frases_cliente` em `respostas`. */
export const CHAVE_FRASES_CLIENTE = "frases_cliente";

// ── CAMPOS DE FECHAMENTO: A REUNIÃO PRELIMINAR (ajuste do Marcio, 29/09) ────
//
// *"se ele tiver reunião agendada previamente, antes da entrevista, vai
// exibir como sugestão de data; se não tiver, é opcional também, mas ele tem
// que marcar que não agendou"*.
// NÃO são perguntas do roteiro: não contam nas 15, não têm peso DISC, não
// entram em `perguntasVisiveis`. Valores FECHADOS, nenhum texto livre.
// 🔴 `agendamento_preliminar` é OBRIGATÓRIO na conclusão
// (`concluirEntrevistaPrevia` recusa sem ele). A data prévia, quando existe,
// é `etapa1_clientes.data_reuniao_preliminar`, lida por `getClienteById`.

/** Chave de `agendamento_preliminar` em `respostas`. */
export const CHAVE_AGENDAMENTO_PRELIMINAR = "agendamento_preliminar";
/** Chave de `agendamento_motivo` em `respostas`. */
export const CHAVE_AGENDAMENTO_MOTIVO = "agendamento_motivo";

export type AgendamentoPreliminar = "agora" | "nao_agendou" | "ja_marcada";
export type MotivoNaoAgendou = "cliente_ve_agenda" | "ver_com_decisores" | "sem_horario_bom" | "outro";

/** O que o parceiro marca sobre a Reunião Preliminar ao concluir. */
export const OPCOES_AGENDAMENTO: readonly { id: AgendamentoPreliminar; rotulo: string }[] = [
  { id: "agora", rotulo: "Marcar agora" },
  { id: "ja_marcada", rotulo: "Já estava marcada antes da entrevista" },
  { id: "nao_agendou", rotulo: "Não agendou" },
];

/** Por que não agendou (opcional; só vale com `nao_agendou`). */
export const MOTIVOS_NAO_AGENDOU: readonly { id: MotivoNaoAgendou; rotulo: string }[] = [
  { id: "cliente_ve_agenda", rotulo: "Cliente vai ver a agenda" },
  { id: "ver_com_decisores", rotulo: "Precisa combinar com quem decide junto" },
  { id: "sem_horario_bom", rotulo: "Nenhum horário serviu" },
  { id: "outro", rotulo: "Outro motivo" },
];

/** Separador de opções na pergunta de múltipla escolha, no formato gravado. */
export const SEPARADOR_MULTIPLA = "|";

export interface OpcaoPergunta {
  /** Estável: é o que fica gravado. NUNCA renomear — quebraria o histórico. */
  id: string;
  /** O que o parceiro vê na tela para marcar. */
  rotulo: string;
  /**
   * Forma FALADA, para a tela de validação ("você chegou até nós por
   * {falado}"). Só nas perguntas que a validação cita.
   */
  falado?: string;
  /** Peso em cada letra. Ausente ou `{}` = não classifica comportamento. */
  disc?: Partial<Record<LetraDisc, number>>;
  /** QUEM esta resposta revela como decisor. */
  decisor?: SinalDecisor;
  /** O peso desse decisor. Só `dj` trava. */
  papel?: PapelDecisor;
  /** Coluna da tela em `obs_comportamento`. */
  grupo?: GrupoOpcao;
  /** Fora da tela nova; continua legível para entrevistas antigas. */
  aposentada?: boolean;
}

/**
 * Quando uma pergunta aparece. Declarativo (e não função) para ser
 * auditável e testável sem executar a tela.
 *   `contem`             — a pergunta X tem marcada ALGUMA destas opções
 *   `respondida_exceto`  — X foi respondida e NENHUMA marcada está na lista
 *   `algum_decide_junto` — alguma pergunta VISÍVEL antes revelou papel `dj`
 */
export type CondicaoPergunta =
  | { tipo: "contem"; pergunta: string; opcoes: readonly string[] }
  | { tipo: "respondida_exceto"; pergunta: string; opcoes: readonly string[] }
  | { tipo: "algum_decide_junto" };

export interface PerguntaEntrevista {
  /** Estável: é a chave no JSON de respostas. NUNCA renomear. */
  id: string;
  /** Escrito para ser LIDO EM VOZ ALTA — conversa, não formulário. */
  enunciado: string;
  /** Apoio curto ao parceiro, sob o enunciado (≤ 90 caracteres). */
  dica?: string;
  /** @deprecated 2.0 — use `dica`. Só perguntas aposentadas ainda têm. */
  ajuda?: string;
  bloco: BlocoEntrevista;
  opcoes: readonly OpcaoPergunta[];
  /** Mais de uma opção pode ser marcada (tela com botão "Continuar"). */
  multipla?: boolean;
  /** "Não pergunte": o parceiro marca o que OBSERVOU. */
  observacao?: boolean;
  /** Na mesma tela, um campo de nome (opcional) por decisor `dj`. */
  pedeNomesDecisores?: boolean;
  /** Ausente = sempre visível. */
  mostrarSe?: CondicaoPergunta;
  /** Fora do fluxo e do cálculo; legível para entrevistas antigas. */
  aposentada?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// AS 15 ATIVAS, NA ORDEM DA CONVERSA (C → QD → G → R)
// ═══════════════════════════════════════════════════════════════════════════

const ATIVAS: readonly PerguntaEntrevista[] = [
  // ─── CONSCIÊNCIA ─────────────────────────────────────────────────────────
  {
    id: "motivo_busca",
    bloco: "consciencia",
    enunciado:
      "O que aconteceu, ou o que você começou a perceber, que te fez pensar: " +
      "está na hora de organizar o patrimônio?",
    dica: "Se se estender: \"E por que justo agora?\"",
    opcoes: [
      { id: "problema_urgente", rotulo: "Tem um problema acontecendo agora", falado: "um problema que está acontecendo agora", disc: { D: 2 } },
      { id: "medo_futuro", rotulo: "Medo do que pode acontecer com a família", falado: "preocupação com o que pode acontecer com a família", disc: { S: 2 } },
      { id: "indicacao", rotulo: "Alguém indicou / ouviu falar", falado: "indicação de alguém", disc: { I: 2 } },
      { id: "pesquisa", rotulo: "Vinha pesquisando e estudando o assunto", falado: "já vir estudando o assunto", disc: { C: 2 } },
      { id: "economia", rotulo: "Quer pagar menos imposto", falado: "querer pagar menos imposto", disc: { D: 1, C: 1 } },
      { id: "inventario", rotulo: "Passou (ou está passando) por um inventário", falado: "ter visto de perto um inventário", disc: { D: 1, S: 1 } },
    ],
  },
  {
    id: "ja_tentou",
    bloco: "consciencia",
    enunciado:
      "Até chegar aqui, o que você já pesquisou, ouviu ou conversou sobre " +
      "holding ou planejamento?",
    dica: "Não corrija nada, só marque.",
    opcoes: [
      { id: "nunca", rotulo: "Nunca tratou do assunto" },
      { id: "pesquisou", rotulo: "Pesquisou por conta própria (internet, vídeos)" },
      { id: "conversou", rotulo: "Conversou com alguém, mas não avançou" },
      { id: "comecou", rotulo: "Começou e parou no meio" },
      { id: "outro_escritorio", rotulo: "Já fez com outro escritório" },
    ],
  },
  {
    id: "bens",
    bloco: "consciencia",
    multipla: true,
    enunciado:
      "Para a doutora ter uma ideia: hoje o patrimônio está em quê? Pode ser " +
      "mais de um.",
    dica: "Não peça valores.",
    opcoes: [
      { id: "imovel_uso", rotulo: "Imóvel onde mora" },
      { id: "imovel_aluguel", rotulo: "Imóveis alugados" },
      { id: "imovel_heranca", rotulo: "Imóvel herdado ou da família" },
      { id: "rural", rotulo: "Propriedade rural" },
      { id: "empresa", rotulo: "Empresa / participação em negócio" },
      { id: "investimentos", rotulo: "Investimentos financeiros" },
    ],
  },
  {
    id: "imoveis_qtd",
    bloco: "consciencia",
    enunciado: "Quantos imóveis, contando onde mora e os alugados?",
    mostrarSe: {
      tipo: "contem",
      pergunta: "bens",
      opcoes: ["imovel_uso", "imovel_aluguel", "imovel_heranca", "rural"],
    },
    opcoes: [
      { id: "nenhum", rotulo: "Nenhum", aposentada: true },
      { id: "um_dois", rotulo: "1 ou 2" },
      { id: "tres_cinco", rotulo: "3 a 5" },
      { id: "seis_mais", rotulo: "6 ou mais" },
    ],
  },
  {
    id: "titularidade",
    bloco: "consciencia",
    enunciado:
      "Esses bens estão no seu nome mesmo, de pessoa física, ou já dentro " +
      "de alguma empresa?",
    opcoes: [
      { id: "tudo_pf", rotulo: "Tudo em pessoa física" },
      { id: "parte_pj", rotulo: "Parte já está em empresa" },
      { id: "tudo_pj", rotulo: "Tudo em empresa" },
      { id: "nao_sabe", rotulo: "Não sabe dizer" },
    ],
  },
  {
    id: "instrumento_existente",
    bloco: "consciencia",
    enunciado:
      "Hoje existe alguma coisa formal para o dia em que você faltar — " +
      "testamento, doação em vida, uma empresa patrimonial?",
    dica: "Já tem holding? Avise a equipe — a oferta muda.",
    opcoes: [
      { id: "nada", rotulo: "Nada" },
      { id: "testamento", rotulo: "Testamento" },
      { id: "doacao", rotulo: "Doação em vida" },
      { id: "holding", rotulo: "Holding / empresa patrimonial" },
      { id: "nao_sabe", rotulo: "Não sabe" },
    ],
  },

  // ─── QUEM DECIDE ─────────────────────────────────────────────────────────
  {
    id: "decide_sozinho",
    bloco: "decisores",
    enunciado:
      "Numa decisão importante do patrimônio: você decide, conversa com o " +
      "cônjuge antes, ou precisa ser a dois?",
    opcoes: [
      { id: "sozinho", rotulo: "Decide sozinho", decisor: "sozinho" },
      { id: "conjuge_avisa", rotulo: "Decide e só avisa o cônjuge", decisor: "conjuge", papel: "av" },
      { id: "conjuge_opina", rotulo: "Conversa com o cônjuge antes, mas decide", decisor: "conjuge", papel: "inf" },
      { id: "conjuge_participa", rotulo: "Precisa ser a dois — decidem juntos", decisor: "conjuge", papel: "dj" },
      { id: "conjuge_decide", rotulo: "Na prática, quem decide é o cônjuge", decisor: "conjuge", papel: "dj" },
      { id: "sem_conjuge", rotulo: "Não tem cônjuge", decisor: "sozinho" },
    ],
  },
  {
    id: "filhos_participam",
    bloco: "decisores",
    enunciado: "E seus filhos — entram nessa decisão?",
    opcoes: [
      { id: "nao_tem", rotulo: "Não tem filhos" },
      { id: "nao_participam", rotulo: "Tem filhos, mas não participam" },
      { id: "opinam", rotulo: "Opinam, mas não decidem", decisor: "filhos", papel: "inf" },
      { id: "decidem_junto", rotulo: "Decidem junto — precisam concordar", decisor: "filhos", papel: "dj" },
      // Legado 2.0: quem marcou "participam do negócio" era contado como
      // decisor; na 3.0 isso é `dj` (plano aprovado, 29/09).
      { id: "participam_negocio", rotulo: "Participam do negócio / da gestão", decisor: "filhos", papel: "dj", aposentada: true },
    ],
  },
  {
    id: "socios_negocio",
    bloco: "decisores",
    enunciado:
      "Na empresa: mudança de estrutura você decide sozinho, ou tem sócio " +
      "que precisa concordar?",
    mostrarSe: { tipo: "contem", pergunta: "bens", opcoes: ["empresa"] },
    opcoes: [
      { id: "sem_socios", rotulo: "Não tem sócio que precise concordar" },
      { id: "socio_familia", rotulo: "Sócio da própria família", decisor: "socio", papel: "dj" },
      { id: "socio_externo", rotulo: "Sócio de fora da família", decisor: "socio", papel: "dj" },
    ],
  },
  {
    id: "presenca_decisores",
    bloco: "decisores",
    enunciado:
      "Para a reunião render, quem decide junto precisa estar lá. Eles " +
      "conseguem participar?",
    dica: "Anote o nome de cada um, se ele disser.",
    pedeNomesDecisores: true,
    mostrarSe: { tipo: "algum_decide_junto" },
    opcoes: [
      { id: "todos", rotulo: "Sim, todos conseguem participar" },
      { id: "alguns", rotulo: "Só alguns conseguem" },
      { id: "a_confirmar", rotulo: "Precisa confirmar com eles" },
      { id: "nao", rotulo: "Não conseguem participar" },
    ],
  },

  // ─── GATILHOS ────────────────────────────────────────────────────────────
  {
    id: "criterio_valor",
    bloco: "gatilhos",
    enunciado:
      "Quando terminar a reunião com a doutora, o que precisa ter ficado " +
      "claro para você pensar: valeu a pena?",
    dica: "As palavras dele voltam na reunião.",
    opcoes: [
      { id: "o_que_fazer", rotulo: "Saber exatamente o que fazer", falado: "exatamente o que fazer", disc: { D: 2 } },
      { id: "quem_ja_fez", rotulo: "Ver quem já fez e como ficou", falado: "quem já fez e como ficou", disc: { I: 2 } },
      { id: "proteger_familia", rotulo: "Ter certeza de que a família fica protegida", falado: "que a família fica protegida", disc: { S: 2 } },
      { id: "como_funciona", rotulo: "Entender como funciona, em detalhe", falado: "como tudo funciona, em detalhe", disc: { C: 2 } },
      { id: "custo_beneficio", rotulo: "Ver que o custo compensa", falado: "que o custo compensa", disc: { D: 1, C: 1 } },
    ],
  },
  {
    id: "conflito_herdeiros",
    bloco: "gatilhos",
    enunciado: "Se acontecesse algo amanhã, como imagina a divisão entre seus filhos?",
    mostrarSe: { tipo: "respondida_exceto", pergunta: "filhos_participam", opcoes: ["nao_tem"] },
    opcoes: [
      { id: "tranquila", rotulo: "Tranquila, todos se entendem" },
      { id: "discussao", rotulo: "Provavelmente daria discussão" },
      { id: "conflito_hoje", rotulo: "Já existe conflito hoje" },
      { id: "nunca_pensou", rotulo: "Nunca parou para pensar" },
    ],
  },

  // ─── RELACIONAMENTO ──────────────────────────────────────────────────────
  {
    id: "processamento",
    bloco: "relacionamento",
    enunciado:
      "Para a doutora preparar a conversa do seu jeito: prefere ver primeiro " +
      "onde vai chegar, ir por exemplos, ir com calma passo a passo, ou " +
      "começar pelos detalhes e números?",
    opcoes: [
      { id: "panorama", rotulo: "Ver primeiro onde vai chegar", disc: { D: 2 } },
      { id: "exemplos", rotulo: "Ir por exemplos e casos", disc: { I: 2 } },
      { id: "gradual", rotulo: "Com calma, passo a passo", disc: { S: 2 } },
      { id: "detalhes", rotulo: "Começar pelos detalhes e números", disc: { C: 2 } },
    ],
  },
  {
    id: "ritmo_conversa",
    bloco: "relacionamento",
    observacao: true,
    enunciado: "Não pergunte. Como a pessoa respondeu?",
    opcoes: [
      { id: "direto", rotulo: "Direto, quis saber logo do que se trata", disc: { D: 3 } },
      { id: "falante", rotulo: "Falante, contou histórias, se abriu", disc: { I: 3 } },
      { id: "reservado", rotulo: "Reservado, ouviu mais do que falou", disc: { S: 3 } },
      { id: "questionador", rotulo: "Questionador, quis detalhe de tudo", disc: { C: 3 } },
    ],
  },
  {
    id: "obs_comportamento",
    bloco: "relacionamento",
    observacao: true,
    multipla: true,
    enunciado: "Não pergunte. Marque o que percebeu.",
    opcoes: [
      { id: "interrompeu", rotulo: "Interrompeu, quis ir ao ponto", grupo: "jeito", disc: { D: 1 } },
      { id: "urgencia_controle", rotulo: "Falou em urgência ou em ter o controle", grupo: "jeito", disc: { D: 1 } },
      { id: "entusiasmo", rotulo: "Mostrou entusiasmo", grupo: "jeito", disc: { I: 1 } },
      { id: "citou_pessoas", rotulo: "Citou pessoas e histórias", grupo: "jeito", disc: { I: 1 } },
      { id: "cautela", rotulo: "Mostrou cautela, pediu tempo", grupo: "jeito", disc: { S: 1 } },
      { id: "familia", rotulo: "Falou muito da família", grupo: "jeito", disc: { S: 1 } },
      { id: "muitas_perguntas", rotulo: "Fez muitas perguntas", grupo: "jeito", disc: { C: 1 } },
      { id: "numeros", rotulo: "Pediu números e dados", grupo: "jeito", disc: { C: 1 } },
      { id: "consulta_terceiro", rotulo: "Vai consultar alguém de fora (contador, advogado)", grupo: "atencao" },
      { id: "falou_preco", rotulo: "Perguntou de preço", grupo: "atencao" },
      { id: "desconfianca", rotulo: "Demonstrou desconfiança", grupo: "atencao" },
      { id: "evitou_assunto", rotulo: "Evitou algum assunto", grupo: "atencao" },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// AS 20 APOSENTADAS (29/09/2026) — fora do fluxo, legíveis para o histórico
// ═══════════════════════════════════════════════════════════════════════════
//
// Textos e pesos exatamente como estavam na 2.0 (`git show 43f39c5`). Não
// entram em `perguntasVisiveis`, nem em `calcularDisc`, nem em
// `mapearDecisores`: servem só para o briefing mostrar o que uma entrevista
// antiga respondeu.

const APOSENTADAS: readonly PerguntaEntrevista[] = [
  {
    id: "urgencia", bloco: "abertura", aposentada: true,
    enunciado: "E pensando à frente: se desse certo, em quanto tempo você gostaria de ver isso resolvido?",
    opcoes: [
      { id: "ontem", rotulo: "Para ontem — já está atrasado", disc: { D: 2 } },
      { id: "meses", rotulo: "Nos próximos meses", disc: { D: 1, I: 2 } },
      { id: "ano", rotulo: "Dentro de um ano", disc: { S: 1, C: 1 } },
      { id: "sem_pressa", rotulo: "Sem pressa, quer entender primeiro", disc: { C: 2, S: 1 } },
    ],
  },
  {
    id: "composicao", bloco: "patrimonio", aposentada: true,
    enunciado: "Se a gente fosse desenhar um mapa do que você tem hoje, ele estaria mais concentrado em quê?",
    opcoes: [
      { id: "imoveis", rotulo: "Imóveis" },
      { id: "empresa", rotulo: "Na empresa / no negócio" },
      { id: "investimentos", rotulo: "Investimentos financeiros" },
      { id: "misto", rotulo: "Um pouco de cada" },
    ],
  },
  {
    id: "imoveis_heranca", bloco: "patrimonio", aposentada: true,
    enunciado: "Algum desses imóveis veio de herança, ou é dos seus pais?",
    opcoes: [
      { id: "sim_heranca", rotulo: "Sim, veio de herança" },
      { id: "sim_pais", rotulo: "Sim, é dos pais / da família" },
      { id: "nao", rotulo: "Não, foi tudo construído/comprado" },
      { id: "nao_tem", rotulo: "Não tem imóveis" },
    ],
  },
  {
    id: "imoveis_alugados", bloco: "patrimonio", aposentada: true,
    enunciado: "Pensa no aluguel que cai na sua conta todo mês — ele entra no seu nome de pessoa física, ou você não tem esse tipo de renda hoje?",
    opcoes: [
      { id: "sim_varios", rotulo: "Sim, vários" },
      { id: "sim_um", rotulo: "Sim, um ou dois" },
      { id: "nao", rotulo: "Não" },
    ],
  },
  {
    id: "pro_labore", bloco: "patrimonio", aposentada: true,
    enunciado: "No fim do mês, quando o dinheiro da empresa vira dinheiro seu, como isso costuma acontecer?",
    opcoes: [
      { id: "pro_labore", rotulo: "Pró-labore" },
      { id: "dividendos", rotulo: "Dividendos / lucros" },
      { id: "misturado", rotulo: "Mistura pessoa física e jurídica", disc: { I: 2 } },
      { id: "nao_se_aplica", rotulo: "Não tem empresa" },
    ],
  },
  {
    id: "inventario_familia", bloco: "patrimonio", aposentada: true,
    enunciado: "Pensando na sua família: já teve alguém próximo que precisou passar por um inventário?",
    opcoes: [
      { id: "sim_demorado", rotulo: "Sim, e foi demorado / caro", disc: { D: 2, S: 1 } },
      { id: "sim_tranquilo", rotulo: "Sim, e correu bem", disc: { S: 1 } },
      { id: "nao", rotulo: "Nunca passaram" },
      { id: "em_curso", rotulo: "Tem um acontecendo agora", disc: { D: 2 } },
    ],
  },
  {
    id: "risco_atividade", bloco: "patrimonio", aposentada: true,
    enunciado: "Se amanhã chegasse um processo — trabalhista, tributário, algo assim — isso te preocuparia, ou você sente que está numa área tranquila?",
    opcoes: [
      { id: "alto", rotulo: "Sim, é uma preocupação real", disc: { C: 2 } },
      { id: "algum", rotulo: "Algum risco, mas controlado", disc: { C: 1 } },
      { id: "nenhum", rotulo: "Não vê risco" },
      { id: "nao_sabe", rotulo: "Nunca parou para pensar nisso", disc: { I: 2 } },
    ],
  },
  {
    id: "consulta_terceiro", bloco: "decisores", aposentada: true,
    enunciado: "Se surgisse uma decisão importante amanhã, tem alguém de fora que você ligaria antes — um contador, um advogado, alguém de confiança?",
    opcoes: [
      { id: "ninguem", rotulo: "Decide sem consultar ninguém", disc: { D: 2 } },
      { id: "contador", rotulo: "Consulta o contador", decisor: "terceiro", disc: { C: 2 } },
      { id: "advogado", rotulo: "Consulta um advogado", decisor: "terceiro", disc: { C: 2 } },
      { id: "familiar", rotulo: "Consulta alguém da família", decisor: "terceiro" },
    ],
  },
  {
    id: "quem_bate_martelo", bloco: "decisores", aposentada: true,
    enunciado: "Imagina que essa estrutura fica pronta e chega a hora de assinar. Quando a decisão é dessas grandes, que mexem com o patrimônio da família, quem bate o martelo no final?",
    opcoes: [
      { id: "eu", rotulo: "A própria pessoa entrevistada", disc: { D: 2 } },
      { id: "conjuge_final", rotulo: "O cônjuge", decisor: "conjuge" },
      { id: "juntos", rotulo: "Decidem juntos, ninguém sozinho", decisor: "conjuge" },
      { id: "familia_toda", rotulo: "A família toda se reúne", decisor: "filhos" },
    ],
  },
  {
    id: "estilo_decisao", bloco: "comportamento", aposentada: true,
    enunciado: "Imagine que apareceu uma oportunidade boa, mas com prazo curto — precisa responder em dois dias. Nessa hora, como você costuma agir?",
    opcoes: [
      { id: "rapido", rotulo: "Decide rápido, no instinto", disc: { D: 3 } },
      { id: "conversa", rotulo: "Conversa com gente até se sentir seguro", disc: { I: 3 } },
      { id: "tempo", rotulo: "Leva um tempo, não gosta de pressa", disc: { S: 3 } },
      { id: "dados", rotulo: "Quer ver número, comparar, estudar", disc: { C: 3 } },
    ],
  },
  {
    id: "o_que_convence", bloco: "comportamento", aposentada: true,
    enunciado: "Imagina que você está entre duas propostas parecidas. O que pesaria mais na sua cabeça para escolher uma delas?",
    opcoes: [
      { id: "resultado", rotulo: "O resultado que ela entrega", disc: { D: 3 } },
      { id: "confianca", rotulo: "A confiança em quem está apresentando", disc: { I: 3 } },
      { id: "seguranca", rotulo: "A segurança de que não vai dar problema", disc: { S: 3 } },
      { id: "detalhe", rotulo: "O detalhamento, saber exatamente como funciona", disc: { C: 3 } },
    ],
  },
  {
    id: "reacao_preco", bloco: "comportamento", aposentada: true,
    enunciado: "Imagina que a gente chega na parte do investimento financeiro. Qual costuma ser a sua reação nessa hora?",
    opcoes: [
      { id: "quanto_retorna", rotulo: "Pergunta quanto retorna", disc: { D: 2 } },
      { id: "quem_ja_fez", rotulo: "Pergunta quem já fez, quer referência", disc: { I: 2 } },
      { id: "parcelas", rotulo: "Se preocupa em caber no orçamento", disc: { S: 2 } },
      { id: "o_que_inclui", rotulo: "Quer saber exatamente o que está incluso", disc: { C: 2 } },
    ],
  },
  {
    id: "lidar_com_erro", bloco: "comportamento", aposentada: true,
    enunciado: "Imagina que algo dá errado num negócio seu, do nada. Qual costuma ser a sua primeira reação?",
    opcoes: [
      { id: "resolve", rotulo: "Parte para resolver imediatamente", disc: { D: 3 } },
      { id: "chama_gente", rotulo: "Chama gente para ajudar a pensar", disc: { I: 3 } },
      { id: "espera", rotulo: "Espera esfriar antes de agir", disc: { S: 3 } },
      { id: "investiga", rotulo: "Investiga a causa antes de qualquer coisa", disc: { C: 3 } },
    ],
  },
  {
    id: "delega", bloco: "comportamento", aposentada: true,
    enunciado: "Se você precisasse passar uma tarefa importante para outra pessoa tocar, você entregaria e seguiria em frente, ou ficaria de olho em cada passo?",
    opcoes: [
      { id: "delega_total", rotulo: "Delega e confia", disc: { I: 3 } },
      { id: "delega_acompanha", rotulo: "Delega, mas acompanha", disc: { D: 2 } },
      { id: "faz_junto", rotulo: "Prefere fazer junto", disc: { S: 2 } },
      { id: "confere_tudo", rotulo: "Confere tudo pessoalmente", disc: { C: 3 } },
    ],
  },
  {
    id: "mudanca", bloco: "comportamento", aposentada: true,
    enunciado: "Imagina que alguém te propõe mudar totalmente o jeito como você faz algo hoje. Como você reage?",
    opcoes: [
      { id: "gosta", rotulo: "Gosta de mudança, acha bom", disc: { D: 2, I: 2 } },
      { id: "aceita", rotulo: "Aceita se fizer sentido", disc: { C: 2 } },
      { id: "resiste", rotulo: "Prefere o que já conhece", disc: { S: 3 } },
      { id: "precisa_entender", rotulo: "Precisa entender o porquê antes", disc: { C: 2, S: 1 } },
    ],
  },
  {
    id: "confianca_equipe", bloco: "comportamento", aposentada: true,
    enunciado: "Pensando num escritório que fosse cuidar do seu patrimônio: o que faria você confiar de verdade nele?",
    opcoes: [
      { id: "resultado_provado", rotulo: "Ver resultado comprovado", disc: { D: 2, C: 1 } },
      { id: "relacao", rotulo: "A relação pessoal, o atendimento", disc: { I: 3 } },
      { id: "tempo_mercado", rotulo: "Tempo de mercado, solidez", disc: { S: 2 } },
      { id: "metodo", rotulo: "Ter um método claro, documentado", disc: { C: 3 } },
    ],
  },
  {
    id: "disposicao_reuniao", bloco: "fechamento", aposentada: true,
    enunciado: "Imagina que a gente já sai daqui com uma reunião marcada com a nossa equipe jurídica, para desenhar a sua estrutura. Você consegue encaixar isso na sua agenda?",
    opcoes: [
      { id: "sim_qualquer", rotulo: "Sim, em qualquer horário", disc: { D: 1, I: 2 } },
      { id: "sim_combinado", rotulo: "Sim, combinando com antecedência", disc: { C: 1, S: 1 } },
      { id: "precisa_ver", rotulo: "Precisa ver com os outros decisores", disc: { S: 1 } },
      { id: "nao_agora", rotulo: "Agora não é o momento" },
    ],
  },
  {
    id: "decide_investimento", bloco: "fechamento", aposentada: true,
    enunciado: "Se a solução fizer sentido, um investimento inicial de alguns milhares de reais é decisão que você toma na hora, ou passa por mais alguém?",
    opcoes: [
      { id: "na_hora", rotulo: "Toma na hora", disc: { D: 1 } },
      { id: "consulta_conjuge", rotulo: "Consulta o cônjuge", decisor: "conjuge" },
      { id: "consulta_socio", rotulo: "Consulta sócio / família", decisor: "socio" },
      { id: "planejar_caixa", rotulo: "Precisa planejar o caixa antes", disc: { S: 1 } },
      { id: "nao_agora", rotulo: "Não faria agora" },
    ],
  },
  {
    id: "temperatura", bloco: "fechamento", aposentada: true,
    enunciado: "Pela sua percepção nesta conversa, o quanto essa pessoa parece pronta para avançar?",
    opcoes: [
      { id: "quente", rotulo: "Quer avançar agora" },
      { id: "morno", rotulo: "Interessado, mas sem pressa" },
      { id: "frio", rotulo: "Só explorando o assunto" },
    ],
  },
  {
    id: "objecao_principal", bloco: "fechamento", aposentada: true,
    enunciado: "Pela leitura desta conversa, o que mais pode travar essa pessoa de seguir adiante?",
    opcoes: [
      { id: "dinheiro", rotulo: "O investimento financeiro", disc: { S: 1 } },
      { id: "outros_decisores", rotulo: "Convencer os outros decisores", decisor: "conjuge" },
      { id: "entender", rotulo: "Não entender direito o que é", disc: { C: 1 } },
      { id: "tempo", rotulo: "Falta de tempo para se dedicar", disc: { I: 2 } },
      { id: "nada", rotulo: "Nada aparente, está decidido", disc: { D: 1 } },
    ],
  },
];

/**
 * 🔴 O CATÁLOGO INTEIRO: as 15 ativas NA ORDEM DA CONVERSA, depois as 20
 * aposentadas. Quem quer o fluxo usa `PERGUNTAS_ATIVAS` ou
 * `perguntasVisiveis()`; quem quer ler uma resposta antiga usa
 * `perguntaPorId()`.
 */
export const PERGUNTAS_ENTREVISTA: readonly PerguntaEntrevista[] = [...ATIVAS, ...APOSENTADAS];

/** As 15 do fluxo 3.0, na ordem. O caminho real é `perguntasVisiveis()`. */
export const PERGUNTAS_ATIVAS: readonly PerguntaEntrevista[] = ATIVAS;

/** Máximo de perguntas no caminho mais longo (decisão do Marcio: ≤ 15). */
export const MAXIMO_PERGUNTAS = ATIVAS.length;

/**
 * @deprecated 2.0 — o total agora depende das respostas. Use
 * `perguntasVisiveis(respostas).length`. Mantido = `MAXIMO_PERGUNTAS` para a
 * tela antiga compilar até sair.
 */
export const TOTAL_PERGUNTAS = MAXIMO_PERGUNTAS;

/** Os 4 blocos da 3.0, na ordem da conversa. */
export const BLOCOS_ENTREVISTA = [
  { id: "consciencia", rotulo: "Consciência" },
  { id: "decisores", rotulo: "Quem decide" },
  { id: "gatilhos", rotulo: "Gatilhos" },
  { id: "relacionamento", rotulo: "Relacionamento" },
] as const;

const POR_ID = new Map(PERGUNTAS_ENTREVISTA.map((p) => [p.id, p]));

/** Pergunta do catálogo (ativa OU aposentada) pelo id; `undefined` se não existe. */
export function perguntaPorId(id: string): PerguntaEntrevista | undefined {
  return POR_ID.get(id);
}
