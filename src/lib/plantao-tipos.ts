/**
 * Plantão de Dúvidas — Acelera Holding.
 *
 * ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
 * (commit b457005) e PROIBIDO de reconstruir. As tabelas `gps.reuniao_*`
 * ficam órfãs e intocadas — este módulo não as lê nem escreve.
 *
 * Contrato entre backend e frontend: só tipos e constantes, ZERO lógica.
 * O backend (Server Actions/queries) devolve exatamente estas formas; o
 * frontend consome sem reformatar registro cru do banco.
 */

/** Um horário do calendário mensal, já com o que o aluno vê publicamente. */
export interface SlotPublico {
  slotId: string;
  data: string; // "YYYY-MM-DD"
  horaInicio: string; // "HH:MM"
  duracaoMin: number;
  mentoraNome: string;
  /** Contagem agregada — nunca nomes de quem se inscreveu. */
  inscritosQtd: number;
  /** true quando o aluno logado tem inscrição ativa neste slot. */
  minhaInscricao: boolean;
  /** true quando `inicio_em` já passou. */
  encerrado: boolean;
  /**
   * true quando passou do cut-off (12:00 do dia anterior) — o plantão ainda
   * VAI acontecer, mas as inscrições fecharam.
   *
   * Calculado por `gps.plantao_calendario` espelhando a regra de
   * `plantao_inscrever`, para a tela mostrar o estado em vez de deixar a
   * pessoa clicar e tomar um erro.
   */
  inscricaoEncerrada: boolean;
}

/** A inscrição ativa (ou mais recente) do aluno logado. */
export interface MinhaInscricao {
  inscricaoId: string;
  slotId: string;
  data: string;
  horaInicio: string;
  mentoraNome: string;
  presencaEm: string | null;
  npsEm: string | null;
  /** true depois que a sessão TERMINOU (início + duração), não no início. */
  encerrado: boolean;
  /**
   * true quando `now()` está dentro de [início-1h, FIM da sessão].
   *
   * 🔑 O fim vem de `fim_em`, calculado no banco a partir de `duracao_min` do
   * próprio slot (decisão do Marcio, 09/09/2026): a sala abre 1h antes e fica
   * aberta durante toda a live. A regra anterior fechava no instante do
   * início — quem chegasse 5 minutos atrasado não conseguia entrar.
   */
  janelaAberta: boolean;
  /**
   * true quando o slot já tem sala cadastrada. É só um SINAL booleano — a URL
   * continua saindo apenas por `revelarLink`, dentro da janela, porque revelar
   * registra presença.
   *
   * Existe porque publicar deixou de exigir `zoom_url` (08/09/2026): sem este
   * sinal, o aluno veria "Entrar na sala", clicaria, gravaria presença e só
   * então tomaria "Link indisponível" — presença registrada numa sala que não
   * existe.
   */
  temSala: boolean;
  /**
   * false quando o prazo de cancelamento já passou — a partir de 1h antes do
   * início, quando a sala é liberada e o e-mail com o link é enviado, a vaga
   * está consumida (decisão de 08/09/2026).
   *
   * Espelha exatamente a regra de `gps.plantao_cancelar` (inclusive o "só
   * trava se houver sala"), para a tela mostrar o estado ANTES do clique em
   * vez de deixar a pessoa descobrir por um erro.
   */
  podeCancelar: boolean;
}

/** Slot como o admin vê/edita — inclui os campos de gestão. */
export interface SlotAdmin extends SlotPublico {
  zoomUrl: string | null;
  publicado: boolean;
  gravacaoUrl: string | null;
  observacao: string | null;
  /**
   * `mentora_id` cru. Existe porque o painel precisa DECIDIR sobre a mentora
   * (pré-selecionar no editor, trocar quem apresenta), e nome não é chave: o
   * código anterior resolvia o id por `mentoras.find(m => m.nome === slot.mentoraNome)`,
   * que erra silenciosamente com duas mentoras homônimas e devolve `""` se
   * alguém corrigir a grafia do nome no cadastro.
   */
  mentoraId: string;
  /**
   * E-mail da mentora DESTE slot — `null` é estado válido e perigoso.
   * `gps.plantao_aviso_mentora_pendente` filtra mentora sem e-mail, então
   * publicar um plantão de mentora sem endereço significa que ela nunca é
   * avisada na véspera. A tela precisa alertar ANTES do clique;
   * `publicarSlot(id, true)` recusa de qualquer forma (a Server Action é o
   * endpoint real, o botão desabilitado não é fronteira).
   */
  mentoraEmail: string | null;
  /**
   * Cancelado = despublicado + inscrições canceladas + inscritos avisados por
   * e-mail. O slot NUNCA é apagado: some do calendário do aluno porque
   * `publicado` virou false, e fica aqui para o histórico continuar legível.
   */
  canceladoEm: string | null;
  /** Motivo opcional (≤300) digitado ao cancelar; vai no e-mail aos inscritos. */
  canceladoMotivo: string | null;
}

/**
 * Uma mentora, para o admin escolher ao criar/editar um plantão E para a
 * aba de gestão de mentoras (`PlantaoMentoras`).
 *
 * `email: null` é um estado válido mas perigoso: `gps.plantao_aviso_mentora_pendente`
 * filtra mentora sem e-mail de propósito (RPC nunca manda para endereço vazio) —
 * uma mentora ATIVA sem e-mail simplesmente não recebe o aviso de véspera dos
 * plantões dela. A UI precisa avisar isso, não só guardar o dado.
 */
export interface MentoraAdmin {
  id: string;
  nome: string;
  email: string | null;
  ativa: boolean;
}

/**
 * Uma linha da lista de inscritos de um slot, para o admin — e agora a
 * unidade de EDIÇÃO da lista (Fase 0/1 do painel de inscritos, 09/09/2026).
 *
 * 🔑 `nome` é o que a tela mostra, e resolve uma divergência que existia
 * desde a inscrição sem login (migração `…043`): `nome_informado` (o que a
 * pessoa digitou no formulário público) é gravado por inscrição e NUNCA foi
 * lido aqui — a lista mostrava `plantao_alunos.nome` (o cadastro), enquanto
 * o e-mail de cancelamento (`cancelarSlot`) já usava `nome_informado` na
 * saudação. Resultado: o nome na tela do admin podia ser um, e o nome no
 * e-mail que o aluno recebia, outro. `nome` = `nome_informado ?? nomeCadastro`
 * fecha essa divergência; `nomeCadastro` fica exposto à parte para a tela
 * poder mostrar os dois quando divergem (e para `editarNomeInscricao`, que
 * SÓ toca `nome_informado`, nunca `plantao_alunos.nome`).
 */
export interface InscritoAdmin {
  /** PK de `gps.plantao_inscricoes` — é o que as 3 novas actions recebem. */
  inscricaoId: string;
  /** FK para `gps.plantao_alunos` — identidade da pessoa, não da inscrição. */
  alunoPlantaoId: string;
  /** `nome_informado ?? nomeCadastro` — o que a tela e os e-mails mostram. */
  nome: string;
  /** `plantao_alunos.nome` cru, para a tela sinalizar quando os dois divergem. */
  nomeCadastro: string;
  email: string;
  presencaEm: string | null;
  /**
   * Quem marcou a presença — `null` é ESTADO VÁLIDO, não "não sei": cobre
   * tanto quem nunca teve presença marcada quanto todo registro ANTERIOR a
   * esta coluna (`…179`, sem backfill de propósito — a UI não pode afirmar
   * uma origem que o dado não prova).
   */
  presencaOrigem: "portal" | "equipe" | null;
  npsNota: number | null;
  /** Quando a pessoa se inscreveu — usado para ordenar/exibir na lista. */
  inscritoEm: string;
}

/** Um aluno do plantão, como listado no painel do admin. */
export interface AlunoPlantaoAdmin {
  id: string;
  nome: string;
  email: string;
  lote: string;
  ativo: boolean;
  inscricoesQtd: number;
  /**
   * Perdeu o Plantao por estar no Programa de Implementacao — o Plantao
   * pertence ao Acelera Holding (decisao 08/09/2026). Hoje sao 20 de 422, e
   * ate esta mudanca isso NAO aparecia em tela nenhuma: so por SQL.
   */
  bloqueadoPorPrograma: boolean;
  /**
   * O admin liberou esta pessoa a mao. O job noturno de reconciliacao nunca
   * a toca — sem esta flag, o desbloqueio duraria ate a proxima madrugada.
   */
  bloqueioExcecao: boolean;
}

/** Retorno padrão das Server Actions de mutação do plantão. */
export type ResultadoAcao = { ok: true } | { ok: false; erro: string };

/**
 * Retorno de `criarSlot` — que pode criar UM plantão ou uma série semanal.
 *
 * União discriminada, não um objeto com tudo opcional: depois de `if
 * (res.ok)` a tela lê `criados`/`pulados` como números/listas de verdade, sem
 * `?? 0` que disfarçaria um contrato quebrado de sucesso vazio.
 *
 * `pulados` são as datas ISO que já tinham plantão desta mentora neste
 * horário (colisão de `unique`). Numa série isso é esperado e NÃO é erro —
 * mas precisa aparecer na tela, senão a equipe conta 12 e recebe 9 sem saber.
 */
export type ResultadoCriacaoSlots =
  | { ok: true; criados: number; pulados: string[] }
  | { ok: false; erro: string; criados?: number; pulados?: string[] };

/**
 * Retorno de `cancelarSlot`.
 *
 * `avisados + falhas === inscritos`, sempre. É o que permite a tela dizer
 * "12 de 14 avisados; 2 e-mails não saíram" em vez de sugerir que todo mundo
 * ficou sabendo. Falha de e-mail nunca desfaz o cancelamento — some do
 * calendário de qualquer forma, e quem não recebeu precisa ser avisado por
 * fora.
 */
export type ResultadoCancelamento =
  | { ok: true; avisados: number; inscritos: number; falhas: number }
  | {
      ok: false;
      erro: string;
      avisados?: number;
      inscritos?: number;
      falhas?: number;
    };

/**
 * Quanto tempo ANTES do início a sala abre.
 *
 * O fechamento NÃO é uma constante: a sala fica aberta até o fim da sessão,
 * que o banco calcula por slot (`fim_em` = `inicio_em` + `duracao_min`) e
 * devolve em `plantao_minha_inscricao`. `JANELA_DEPOIS_MIN`, que fixava 60
 * minutos, saiu em 09/09/2026 — plantão de 120 min fechava a sala na metade.
 */
export const JANELA_ANTES_MIN = 60;
