/**
 * O ROTEIRO da Entrevista Prévia 2.0 — as perguntas que o parceiro lê em voz
 * alta enquanto conversa com o lead, e as opções que ele marca na tela.
 *
 * Pedido do Marcio (23/09/2026): *"20/30 perguntas relevantes sobre o lead,
 * para sabermos o perfil disc dele, e ao final, eh gerado um relatorio geral
 * do perfil disc dele, automatico, sem precisar informar, anexar"*.
 *
 * ── 🔑 A REGRA QUE GOVERNA ESTE ARQUIVO ────────────────────────────────────
 *
 * **NENHUMA pergunta aberta.** Palavras dele: *"nao tem pergunta aberta, com
 * base na resposta entendemos o numero de decisores, quem eh o decisor
 * principal, decisor secundario"*.
 *
 * A tensão que isso cria, e como ela se resolve aqui: o Marcio deu exemplos
 * que SOAM abertos (*"você compra sozinho ou sua esposa participa?"*). O
 * ENUNCIADO é conversacional — o parceiro lê aquilo em voz alta, do jeito que
 * se fala. A RESPOSTA é sempre uma opção de uma lista fechada. Sem isso, o
 * DISC não se calcula e a trava de decisores não sabe contar.
 *
 * ── COMO O DISC SAI DAQUI ──────────────────────────────────────────────────
 *
 * Cada opção carrega `disc`: quanto ela pesa para D, I, S ou C. Ao final,
 * somam-se os pesos e a letra vencedora é o perfil. Não é adivinhação de IA —
 * é contagem, auditável, e a mesma resposta dá sempre o mesmo resultado.
 *
 * 🔴 Uma pergunta pode ter peso ZERO em DISC (`disc: {}`) e ainda assim ser
 * essencial: as de decisor e de patrimônio existem para MAPEAR, não para
 * classificar. Forçar peso DISC nelas sujaria o cálculo com sinal que não é
 * de comportamento.
 *
 * ── COMO OS DECISORES SAEM DAQUI ───────────────────────────────────────────
 *
 * `decisor` na opção diz o que aquela resposta REVELA:
 *   `sozinho`    → 1 decisor, o próprio lead
 *   `conjuge`    → +1 decisor (cônjuge)
 *   `filhos`     → +1 ou mais (filhos participam)
 *   `socio`      → +1 (sócio no negócio)
 *   `terceiro`   → +1 (contador/advogado consultado)
 * O NOME de cada um é perguntado logo depois, em campo próprio — é o único
 * texto livre do roteiro, e não entra no cálculo de nada.
 */

/** As 4 letras. Espelha `PERFIS_DISC` de `etapa1.ts`, que é a lista única. */
export type LetraDisc = "D" | "I" | "S" | "C";

/** O que uma resposta revela sobre quem decide. */
export type SinalDecisor = "sozinho" | "conjuge" | "filhos" | "socio" | "terceiro";

export interface OpcaoPergunta {
  /** Estável: é o que fica gravado. NUNCA renomear — quebraria o histórico. */
  id: string;
  /** O que o parceiro vê na tela para marcar. */
  rotulo: string;
  /** Peso em cada letra. `{}` = esta opção não classifica comportamento. */
  disc?: Partial<Record<LetraDisc, number>>;
  /** O que esta resposta revela sobre decisores. */
  decisor?: SinalDecisor;
}

export interface PerguntaEntrevista {
  /** Estável: é a chave no JSON de respostas. NUNCA renomear. */
  id: string;
  /**
   * O enunciado, escrito para ser LIDO EM VOZ ALTA. Por isso soa como
   * conversa, não como formulário — é o parceiro falando com uma pessoa.
   */
  enunciado: string;
  /** Uma linha de apoio para o parceiro, quando a pergunta precisa de contexto. */
  ajuda?: string;
  /** O bloco a que pertence — a tela agrupa por isto. */
  bloco: "abertura" | "decisores" | "patrimonio" | "comportamento" | "fechamento";
  opcoes: OpcaoPergunta[];
  /**
   * `true` quando a pergunta só aparece se outra revelou um decisor a mais.
   * A tela pula o que não se aplica em vez de pedir "não se aplica".
   */
  dependeDe?: { pergunta: string; opcoes: string[] };
}

/**
 * 🔴 O ROTEIRO. 24 perguntas, dentro da faixa pedida (20 a 30).
 *
 * A ordem importa: abre leve (contexto), entra em decisores cedo (é a trava
 * que o Marcio mais enfatizou — *"está proibido participar da reunião sem os
 * decisores"*), passa por patrimônio, e fecha no comportamento, que é onde o
 * DISC ganha mais peso. Perguntar comportamento no fim é deliberado: depois
 * de 15 minutos de conversa a pessoa já relaxou, e as respostas são mais
 * fiéis do que seriam na primeira pergunta.
 */
export const PERGUNTAS_ENTREVISTA: readonly PerguntaEntrevista[] = [
  // ─── ABERTURA ────────────────────────────────────────────────────────────
  {
    id: "motivo_busca",
    bloco: "abertura",
    enunciado:
      "Me conta: o que está acontecendo na sua vida agora que te fez " +
      "procurar isso justo neste momento?",
    ajuda: "Deixe a pessoa falar e marque o que mais se aproxima.",
    opcoes: [
      { id: "problema_urgente", rotulo: "Tem um problema acontecendo agora", disc: { D: 2 } },
      { id: "medo_futuro", rotulo: "Medo do que pode acontecer com a família", disc: { S: 2 } },
      { id: "indicacao", rotulo: "Alguém indicou / ouviu falar", disc: { I: 3 } },
      { id: "pesquisa", rotulo: "Vinha pesquisando e estudando o assunto", disc: { C: 2 } },
      { id: "economia", rotulo: "Quer pagar menos imposto", disc: { D: 1, C: 1 } },
    ],
  },
  {
    id: "urgencia",
    bloco: "abertura",
    enunciado:
      "E pensando à frente: se desse certo, em quanto tempo você gostaria " +
      "de ver isso resolvido?",
    opcoes: [
      { id: "ontem", rotulo: "Para ontem — já está atrasado", disc: { D: 2 } },
      { id: "meses", rotulo: "Nos próximos meses", disc: { D: 1, I: 2 } },
      { id: "ano", rotulo: "Dentro de um ano", disc: { S: 1, C: 1 } },
      { id: "sem_pressa", rotulo: "Sem pressa, quer entender primeiro", disc: { C: 2, S: 1 } },
    ],
  },
  {
    id: "ja_tentou",
    bloco: "abertura",
    enunciado:
      "Antes de chegar aqui, você chegou a buscar ajuda com alguém sobre " +
      "isso, ou essa é a primeira vez que trata do assunto?",
    opcoes: [
      { id: "nunca", rotulo: "Nunca tratou do assunto", disc: { S: 1 } },
      { id: "conversou", rotulo: "Conversou com alguém, mas não avançou", disc: { I: 2 } },
      { id: "comecou", rotulo: "Começou e parou no meio", disc: { I: 3 } },
      { id: "outro_escritorio", rotulo: "Já fez com outro escritório", disc: { D: 1, C: 1 } },
    ],
  },

  // ─── DECISORES — o bloco que o Marcio mais enfatizou ─────────────────────
  {
    id: "decide_sozinho",
    bloco: "decisores",
    enunciado:
      "Imagina que aparece um imóvel bom para investir, e você precisa " +
      "decidir rápido. Você fecha sozinho, ou seu cônjuge entra nessa " +
      "decisão com você?",
    ajuda:
      "🔴 Esta é a pergunta-chave. A Reunião Preliminar não acontece sem todos " +
      "os decisores presentes.",
    opcoes: [
      { id: "sozinho", rotulo: "Decide sozinho", decisor: "sozinho", disc: { D: 1 } },
      { id: "conjuge_participa", rotulo: "O cônjuge participa da decisão", decisor: "conjuge" },
      { id: "conjuge_decide", rotulo: "Na prática, quem decide é o cônjuge", decisor: "conjuge" },
      { id: "sem_conjuge", rotulo: "Não tem cônjuge", decisor: "sozinho" },
    ],
  },
  {
    id: "filhos_participam",
    bloco: "decisores",
    enunciado:
      "E se um dia a família se reunir para falar de patrimônio, seus " +
      "filhos entrariam nessa conversa, dariam opinião?",
    ajuda: "Filho que opina sobre patrimônio é decisor, mesmo sem assinar nada.",
    opcoes: [
      { id: "nao_tem", rotulo: "Não tem filhos" },
      { id: "nao_participam", rotulo: "Tem filhos, mas não participam" },
      { id: "opinam", rotulo: "Opinam sobre as decisões", decisor: "filhos" },
      { id: "participam_negocio", rotulo: "Participam do negócio / da gestão", decisor: "filhos" },
    ],
  },
  {
    id: "consulta_terceiro",
    bloco: "decisores",
    enunciado:
      "Se surgisse uma decisão importante amanhã, tem alguém de fora que " +
      "você ligaria antes — um contador, um advogado, alguém de confiança?",
    opcoes: [
      { id: "ninguem", rotulo: "Decide sem consultar ninguém", disc: { D: 2 } },
      { id: "contador", rotulo: "Consulta o contador", decisor: "terceiro", disc: { C: 2 } },
      { id: "advogado", rotulo: "Consulta um advogado", decisor: "terceiro", disc: { C: 2 } },
      { id: "familiar", rotulo: "Consulta alguém da família", decisor: "terceiro" },
    ],
  },
  {
    id: "socios_negocio",
    bloco: "decisores",
    enunciado:
      "Pensando no seu negócio: se fosse mudar algo estrutural nele, você " +
      "decidiria sozinho, ou tem sócio que entraria nessa conversa?",
    opcoes: [
      { id: "sem_socios", rotulo: "Não tem sócios / não tem empresa", disc: { D: 1 } },
      { id: "socio_familia", rotulo: "Sócio da própria família", decisor: "socio" },
      { id: "socio_externo", rotulo: "Sócio de fora da família", decisor: "socio" },
    ],
  },
  {
    id: "quem_bate_martelo",
    bloco: "decisores",
    enunciado:
      "Imagina que essa estrutura fica pronta e chega a hora de assinar. " +
      "Quando a decisão é dessas grandes, que mexem com o patrimônio da " +
      "família, quem bate o martelo no final?",
    ajuda: "Marque quem tem a palavra final. É o decisor PRINCIPAL.",
    opcoes: [
      { id: "eu", rotulo: "A própria pessoa entrevistada", disc: { D: 2 } },
      { id: "conjuge_final", rotulo: "O cônjuge", decisor: "conjuge" },
      { id: "juntos", rotulo: "Decidem juntos, ninguém sozinho", decisor: "conjuge" },
      { id: "familia_toda", rotulo: "A família toda se reúne", decisor: "filhos" },
    ],
  },

  // ─── PATRIMÔNIO ──────────────────────────────────────────────────────────
  {
    id: "composicao",
    bloco: "patrimonio",
    enunciado:
      "Se a gente fosse desenhar um mapa do que você tem hoje, ele estaria " +
      "mais concentrado em quê?",
    opcoes: [
      { id: "imoveis", rotulo: "Imóveis" },
      { id: "empresa", rotulo: "Na empresa / no negócio" },
      { id: "investimentos", rotulo: "Investimentos financeiros" },
      { id: "misto", rotulo: "Um pouco de cada" },
    ],
  },
  {
    id: "imoveis_alugados",
    bloco: "patrimonio",
    enunciado:
      "Pensa no aluguel que cai na sua conta todo mês — ele entra no seu " +
      "nome de pessoa física, ou você não tem esse tipo de renda hoje?",
    opcoes: [
      { id: "sim_varios", rotulo: "Sim, vários" },
      { id: "sim_um", rotulo: "Sim, um ou dois" },
      { id: "nao", rotulo: "Não" },
    ],
  },
  {
    id: "pro_labore",
    bloco: "patrimonio",
    enunciado:
      "No fim do mês, quando o dinheiro da empresa vira dinheiro seu, como " +
      "isso costuma acontecer?",
    opcoes: [
      { id: "pro_labore", rotulo: "Pró-labore" },
      { id: "dividendos", rotulo: "Dividendos / lucros" },
      { id: "misturado", rotulo: "Mistura pessoa física e jurídica", disc: { I: 2 } },
      { id: "nao_se_aplica", rotulo: "Não tem empresa" },
    ],
  },
  {
    id: "inventario_familia",
    bloco: "patrimonio",
    enunciado:
      "Pensando na sua família: já teve alguém próximo que precisou passar " +
      "por um inventário?",
    ajuda: "Quem já viveu um inventário costuma decidir mais rápido.",
    opcoes: [
      { id: "sim_demorado", rotulo: "Sim, e foi demorado / caro", disc: { D: 2, S: 1 } },
      { id: "sim_tranquilo", rotulo: "Sim, e correu bem", disc: { S: 1 } },
      { id: "nao", rotulo: "Nunca passaram" },
      { id: "em_curso", rotulo: "Tem um acontecendo agora", disc: { D: 2 } },
    ],
  },
  {
    id: "risco_atividade",
    bloco: "patrimonio",
    enunciado:
      "Se amanhã chegasse um processo — trabalhista, tributário, algo assim " +
      "— isso te preocuparia, ou você sente que está numa área tranquila?",
    opcoes: [
      { id: "alto", rotulo: "Sim, é uma preocupação real", disc: { C: 2 } },
      { id: "algum", rotulo: "Algum risco, mas controlado", disc: { C: 1 } },
      { id: "nenhum", rotulo: "Não vê risco" },
      { id: "nao_sabe", rotulo: "Nunca parou para pensar nisso", disc: { I: 2 } },
    ],
  },

  // ─── COMPORTAMENTO — onde o DISC ganha mais peso ─────────────────────────
  {
    id: "estilo_decisao",
    bloco: "comportamento",
    enunciado:
      "Imagine que apareceu uma oportunidade boa, mas com prazo curto — " +
      "precisa responder em dois dias. Nessa hora, como você costuma agir?",
    opcoes: [
      { id: "rapido", rotulo: "Decide rápido, no instinto", disc: { D: 3 } },
      { id: "conversa", rotulo: "Conversa com gente até se sentir seguro", disc: { I: 3 } },
      { id: "tempo", rotulo: "Leva um tempo, não gosta de pressa", disc: { S: 3 } },
      { id: "dados", rotulo: "Quer ver número, comparar, estudar", disc: { C: 3 } },
    ],
  },
  {
    id: "o_que_convence",
    bloco: "comportamento",
    enunciado:
      "Imagina que você está entre duas propostas parecidas. O que pesaria " +
      "mais na sua cabeça para escolher uma delas?",
    opcoes: [
      { id: "resultado", rotulo: "O resultado que ela entrega", disc: { D: 3 } },
      { id: "confianca", rotulo: "A confiança em quem está apresentando", disc: { I: 3 } },
      { id: "seguranca", rotulo: "A segurança de que não vai dar problema", disc: { S: 3 } },
      { id: "detalhe", rotulo: "O detalhamento, saber exatamente como funciona", disc: { C: 3 } },
    ],
  },
  {
    id: "ritmo_conversa",
    bloco: "comportamento",
    enunciado: "Ao longo desta conversa, qual foi o jeito da pessoa se comportar?",
    ajuda: "Aqui você observa, não pergunta. Marque o que viu.",
    opcoes: [
      { id: "direto", rotulo: "Direto, quis saber logo do que se trata", disc: { D: 3 } },
      { id: "falante", rotulo: "Falante, contou histórias, se abriu", disc: { I: 3 } },
      { id: "reservado", rotulo: "Reservado, ouviu mais do que falou", disc: { S: 3 } },
      { id: "questionador", rotulo: "Questionador, quis detalhe de tudo", disc: { C: 3 } },
    ],
  },
  {
    id: "reacao_preco",
    bloco: "comportamento",
    enunciado:
      "Imagina que a gente chega na parte do investimento financeiro. Qual " +
      "costuma ser a sua reação nessa hora?",
    opcoes: [
      { id: "quanto_retorna", rotulo: "Pergunta quanto retorna", disc: { D: 2 } },
      { id: "quem_ja_fez", rotulo: "Pergunta quem já fez, quer referência", disc: { I: 2 } },
      { id: "parcelas", rotulo: "Se preocupa em caber no orçamento", disc: { S: 2 } },
      { id: "o_que_inclui", rotulo: "Quer saber exatamente o que está incluso", disc: { C: 2 } },
    ],
  },
  {
    id: "lidar_com_erro",
    bloco: "comportamento",
    enunciado:
      "Imagina que algo dá errado num negócio seu, do nada. Qual costuma " +
      "ser a sua primeira reação?",
    opcoes: [
      { id: "resolve", rotulo: "Parte para resolver imediatamente", disc: { D: 3 } },
      { id: "chama_gente", rotulo: "Chama gente para ajudar a pensar", disc: { I: 3 } },
      { id: "espera", rotulo: "Espera esfriar antes de agir", disc: { S: 3 } },
      { id: "investiga", rotulo: "Investiga a causa antes de qualquer coisa", disc: { C: 3 } },
    ],
  },
  {
    id: "delega",
    bloco: "comportamento",
    enunciado:
      "Se você precisasse passar uma tarefa importante para outra pessoa " +
      "tocar, você entregaria e seguiria em frente, ou ficaria de olho em " +
      "cada passo?",
    opcoes: [
      { id: "delega_total", rotulo: "Delega e confia", disc: { I: 3 } },
      { id: "delega_acompanha", rotulo: "Delega, mas acompanha", disc: { D: 2 } },
      { id: "faz_junto", rotulo: "Prefere fazer junto", disc: { S: 2 } },
      { id: "confere_tudo", rotulo: "Confere tudo pessoalmente", disc: { C: 3 } },
    ],
  },
  {
    id: "mudanca",
    bloco: "comportamento",
    enunciado:
      "Imagina que alguém te propõe mudar totalmente o jeito como você faz " +
      "algo hoje. Como você reage?",
    opcoes: [
      { id: "gosta", rotulo: "Gosta de mudança, acha bom", disc: { D: 2, I: 2 } },
      { id: "aceita", rotulo: "Aceita se fizer sentido", disc: { C: 2 } },
      { id: "resiste", rotulo: "Prefere o que já conhece", disc: { S: 3 } },
      { id: "precisa_entender", rotulo: "Precisa entender o porquê antes", disc: { C: 2, S: 1 } },
    ],
  },
  {
    id: "confianca_equipe",
    bloco: "comportamento",
    enunciado:
      "Pensando num escritório que fosse cuidar do seu patrimônio: o que " +
      "faria você confiar de verdade nele?",
    opcoes: [
      { id: "resultado_provado", rotulo: "Ver resultado comprovado", disc: { D: 2, C: 1 } },
      { id: "relacao", rotulo: "A relação pessoal, o atendimento", disc: { I: 3 } },
      { id: "tempo_mercado", rotulo: "Tempo de mercado, solidez", disc: { S: 2 } },
      { id: "metodo", rotulo: "Ter um método claro, documentado", disc: { C: 3 } },
    ],
  },

  // ─── FECHAMENTO ──────────────────────────────────────────────────────────
  {
    id: "disposicao_reuniao",
    bloco: "fechamento",
    enunciado:
      "Imagina que a gente já sai daqui com uma reunião marcada com a " +
      "nossa equipe jurídica, para desenhar a sua estrutura. Você consegue " +
      "encaixar isso na sua agenda?",
    opcoes: [
      { id: "sim_qualquer", rotulo: "Sim, em qualquer horário", disc: { D: 1, I: 2 } },
      { id: "sim_combinado", rotulo: "Sim, combinando com antecedência", disc: { C: 1, S: 1 } },
      { id: "precisa_ver", rotulo: "Precisa ver com os outros decisores", disc: { S: 1 } },
      { id: "nao_agora", rotulo: "Agora não é o momento" },
    ],
  },
  {
    id: "temperatura",
    bloco: "fechamento",
    enunciado:
      "Pela sua percepção nesta conversa, o quanto essa pessoa parece " +
      "pronta para avançar?",
    ajuda: "Sua percepção como entrevistador. Não pergunte isso em voz alta.",
    opcoes: [
      { id: "quente", rotulo: "Quer avançar agora" },
      { id: "morno", rotulo: "Interessado, mas sem pressa" },
      { id: "frio", rotulo: "Só explorando o assunto" },
    ],
  },
  {
    id: "objecao_principal",
    bloco: "fechamento",
    enunciado:
      "Pela leitura desta conversa, o que mais pode travar essa pessoa de " +
      "seguir adiante?",
    opcoes: [
      { id: "dinheiro", rotulo: "O investimento financeiro", disc: { S: 1 } },
      { id: "outros_decisores", rotulo: "Convencer os outros decisores", decisor: "conjuge" },
      { id: "entender", rotulo: "Não entender direito o que é", disc: { C: 1 } },
      { id: "tempo", rotulo: "Falta de tempo para se dedicar", disc: { I: 2 } },
      { id: "nada", rotulo: "Nada aparente, está decidido", disc: { D: 1 } },
    ],
  },
] as const;

/** Quantas perguntas o roteiro tem — usado na barra de progresso da tela. */
export const TOTAL_PERGUNTAS = PERGUNTAS_ENTREVISTA.length;

/** Rótulo de cada bloco, na ordem em que aparecem. */
export const BLOCOS_ENTREVISTA = [
  { id: "abertura", rotulo: "Abertura" },
  { id: "decisores", rotulo: "Quem decide" },
  { id: "patrimonio", rotulo: "Patrimônio" },
  { id: "comportamento", rotulo: "Como a pessoa é" },
  { id: "fechamento", rotulo: "Fechamento" },
] as const;
