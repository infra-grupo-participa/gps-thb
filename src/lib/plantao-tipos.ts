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
  encerrado: boolean;
  /** true quando `now()` está dentro de [início-1h, início+1h]. */
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

/** Uma linha da lista de inscritos de um slot, para o admin. */
export interface InscritoAdmin {
  nome: string;
  email: string;
  presencaEm: string | null;
  npsNota: number | null;
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

/** Janela do Zoom: abre 1h antes do início, fecha 1h depois. */
export const JANELA_ANTES_MIN = 60;
export const JANELA_DEPOIS_MIN = 60;
