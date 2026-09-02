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
}

/** Slot como o admin vê/edita — inclui os campos de gestão. */
export interface SlotAdmin extends SlotPublico {
  zoomUrl: string | null;
  publicado: boolean;
  gravacaoUrl: string | null;
  observacao: string | null;
}

/** Uma mentora, para o admin escolher ao criar/editar um plantão. */
export interface MentoraAdmin {
  id: string;
  nome: string;
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
  temSenha: boolean;
  /** false quando o CSV veio sem documento — o 1º acesso não pode conferir. */
  temDocumento: boolean;
  /** true quando o admin liberou UM 1º acesso sem conferir documento. */
  liberadoSemDocumento: boolean;
  ultimoLoginEm: string | null;
  ativo: boolean;
  inscricoesQtd: number;
}

/** Retorno padrão das Server Actions de mutação do plantão. */
export type ResultadoAcao = { ok: true } | { ok: false; erro: string };

/** Sessão do aluno do plantão, resolvida a partir do cookie. */
export interface SessaoPlantao {
  alunoPlantaoId: string;
  nome: string;
}

/** Janela do Zoom: abre 1h antes do início, fecha 1h depois. */
export const JANELA_ANTES_MIN = 60;
export const JANELA_DEPOIS_MIN = 60;

/** Piso de senha — mesmo mínimo de `gps.admin_definir_senha`. */
export const SENHA_MIN = 8;

/** Nome do cookie de sessão do plantão (isolado do cookie do Supabase Auth). */
export const COOKIE_SESSAO = "gps_plantao_sessao";
