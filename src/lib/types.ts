// Tipos de domínio do GPS.

export type Papel = "admin" | "aluno" | "sem_acesso";

export interface Perfil {
  id: string;
  nome: string | null;
  email: string | null;
  cargo: string | null;
  status: string | null;
}

export interface Aluno {
  id: string;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  turma_id: number | null;
  plano: string | null;
  status_acesso: string | null;
  eh_socio: boolean | null;
  profissao?: string | null;
  cidade?: string | null;
  estado?: string | null;
  instagram_url?: string | null;
  youtube_url?: string | null;
  site_profissional?: string | null;
  link_facebook?: string | null;
}

/** Valores aceitos pelo CHECK `thb_alunos_plano_check`. */
export const PLANOS_ALUNO = [
  "aluno",
  "diamante",
  "platina",
  "super_diamante",
  "aurum",
] as const;
export type PlanoAluno = (typeof PLANOS_ALUNO)[number];

export interface Turma {
  id: number;
  codigo: string | null;
  tipo: string | null;
  atual: boolean | null;
}

/** Dados do cadastro manual de um aluno novo em `thb_alunos`. */
export interface NovoAlunoInput {
  nome: string;
  email: string;
  documento?: string;
  telefone?: string;
  profissao?: string;
  turmaId?: number | null;
  plano?: string;
  cep?: string;
  cidade?: string;
  estado?: string;
  bairro?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  instagramUrl?: string;
  siteProfissional?: string;
  linkFacebook?: string;
}

export interface Etapa {
  id: number;
  nome: string;
  descricao: string | null;
  ordem: number;
  liberada: boolean;
}

export interface PerfilAluno {
  telefone?: string;
  profissao?: string;
  cidade?: string;
  estado?: string;
  bio?: string;
  instagram?: string;
  youtube?: string;
  linkedin?: string;
  facebook?: string;
  site?: string;
}

export type PapelMembro = "titular" | "socio";

export interface Membro {
  id: string;
  aluno_id: string;
  user_id: string | null;
  papel: PapelMembro;
  perfil: PerfilAluno;
}

/**
 * O ambiente do GPS (um por `aluno_id` titular). Compartilhado por todos os
 * membros (titular + sócios) daquele `aluno_id` — `pasta_drive_url` e
 * `data_agendamento_disponivel` são do AMBIENTE, não da pessoa.
 */
export interface Ambiente {
  aluno_id: string;
  pasta_drive_url: string | null;
  data_agendamento_disponivel: string | null;
  criado_em: string;
  atualizado_em: string;
}

/** Um membro do ambiente, como devolvido por `gps.admin_status_acesso`. */
export interface MembroStatus {
  membro_id: string;
  papel: PapelMembro;
  user_id: string | null;
  email: string | null;
  tem_senha: boolean;
  email_confirmado: boolean;
  ultimo_acesso: string | null;
}

export type NivelRelacionamento = "frio" | "morno" | "quente";
export type StatusCliente =
  | "pendente"
  | "contatado"
  | "agendado"
  | "recusou"
  | "realizada";
export type PerfilDisc = "D" | "I" | "S" | "C";

export interface ClienteEtapa1 {
  id: string;
  aluno_id: string;
  nome: string;
  telefone: string | null;
  nivel_relacionamento: NivelRelacionamento | null;
  problemas: string[];
  perda_inercia: number | null;
  registro_contato: string | null;
  mensagem_padrao_enviada: boolean;
  estudo_caso_enviado: boolean;
  ligacao_realizada: boolean;
  status: StatusCliente;
  data_reuniao_preliminar: string | null;
  aderiu_reuniao: boolean;
  perfil_disc: PerfilDisc | null;
  acompanhado_equipe: boolean;
  ordem: number;
}

export type StatusSolicitacao = "pendente" | "aprovada" | "recusada";

export interface Solicitacao {
  id: string;
  user_id: string;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  status: StatusSolicitacao;
  aluno_id: string | null;
  observacao: string | null;
  criado_em: string;
  decidido_em: string | null;
}

export interface Etapa3Agendamento {
  id: string;
  aluno_id: string;
  cliente_id: string | null;
  descricao: string | null;
  data: string | null;
  horario: string | null;
  equipe_participa: boolean;
  criado_em: string;
}

export interface Etapa3Revisao {
  aluno_id: string;
  duvidas: string | null;
  correcoes: string | null;
  atualizado_em: string;
}

export interface ProgressoTarefa {
  id: string;
  aluno_id: string;
  etapa: number;
  tarefa: number;
  concluida: boolean;
  concluida_em: string | null;
}

/** Override de destaque de tarefa definido pelo admin para um aluno. */
export type ModoEnfase = "realce" | "esmaecer";

export interface TarefaEnfase {
  aluno_id: string;
  etapa: number;
  tarefa: number;
  modo: ModoEnfase;
}

/**
 * Compromisso na agenda pessoal do aluno.
 * É organização dele e só dele: sem grade fixa, sem slot, sem confirmação da
 * equipe. O admin apenas enxerga (a policy de admin em `gps.agenda` é SELECT).
 */
export interface AgendaItem {
  id: string;
  aluno_id: string;
  titulo: string;
  data: string; // "YYYY-MM-DD"
  horario: string | null; // "HH:MM[:SS]"
  nota: string | null;
  criado_em: string;
  atualizado_em: string;
}

/** Compromisso com o nome do aluno — para a visão de leitura do admin. */
export interface AgendaItemComAluno extends AgendaItem {
  aluno_nome: string | null;
}

/**
 * Diário do aluno — linha do tempo da EQUIPE. Visualização EXCLUSIVA do
 * admin (LGPD: dado pessoal de terceiros no texto livre). Ver
 * `gps.aluno_notas` (migração 20260908000001).
 */
export const VOZES_NOTA = ["equipe", "aluno"] as const;
export type VozNota = (typeof VOZES_NOTA)[number];

export const TIPOS_NOTA = [
  "observacao",
  "duvida",
  "combinado",
  "pendencia",
] as const;
export type TipoNota = (typeof TIPOS_NOTA)[number];

export const ORIGENS_NOTA = [
  "reuniao",
  "email",
  "whatsapp",
  "plataforma",
  "planilha",
] as const;
export type OrigemNota = (typeof ORIGENS_NOTA)[number];

export interface AlunoNota {
  id: string;
  aluno_id: string;
  autor_id: string;
  criado_em: string;
  voz: VozNota;
  tipo: TipoNota;
  origem: OrigemNota;
  texto: string;
  resolvido_em: string | null;
  resolvido_por: string | null;
  /** Liga a nota a um evento do log (gps.aluno_eventos). Null = nota solta. */
  evento_id: string | null;
}

/** Nota do diário com o nome do autor/quem deu baixa (join manual em `public.perfis`). */
export interface AlunoNotaComAutor extends AlunoNota {
  autor_nome: string | null;
  resolvido_por_nome: string | null;
  /**
   * Rótulo/tipo do evento (`gps.aluno_eventos`) referenciado por
   * `evento_id`, resolvido na LEITURA (`getDiarioDoAluno`/`montarTrilha` —
   * ver `src/lib/data.ts` e `src/lib/log-agregacao.ts`). `null` quando a
   * nota é solta (`evento_id` nulo) OU quando o evento referenciado não foi
   * encontrado (ex.: apagado). Shape mínimo de propósito — a UI só precisa
   * do texto para exibir "sobre: <rótulo>", não do evento inteiro.
   */
  eventoContexto: { rotulo: string; tipo: TipoEvento } | null;
}

/** Resumo do diário para cards/listas (última nota + pendências em aberto). */
export interface ResumoDiario {
  ultima: AlunoNotaComAutor | null;
  pendenciasAbertas: number;
}

/**
 * Diário do aluno — Fase 2: LOG DE AÇÕES DO ALUNO (`gps.aluno_eventos`,
 * migração 20260909000001). Mesma trava LGPD da Fase 1: visualização
 * EXCLUSIVA do admin. UMA tabela de micro-eventos — a MACRO ("Listou 15
 * clientes") é derivada por agregação na leitura, ver `src/lib/log-agregacao.ts`.
 */
export const TIPOS_EVENTO = [
  "cliente_cadastrado",
  "cliente_favoritado",
  "cliente_desfavoritado",
  "cliente_status_mudou",
  "cliente_mensagem_padrao",
  "cliente_estudo_caso",
  "cliente_ligacao",
  "cliente_aderiu_reuniao",
  "cliente_reuniao_agendada",
  "cliente_excluido",
  "tarefa_concluida",
  "tarefa_reaberta",
  "conta_criada",
  "email_confirmado",
  "primeiro_acesso",
  "entrou_no_programa",
] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

export const ENTIDADES_EVENTO = ["cliente", "tarefa", "conta"] as const;
export type EntidadeEvento = (typeof ENTIDADES_EVENTO)[number];

export const ATORES_EVENTO = ["aluno", "equipe", "sistema"] as const;
export type AtorEvento = (typeof ATORES_EVENTO)[number];

export const ORIGENS_EVENTO = ["app", "backfill"] as const;
export type OrigemEvento = (typeof ORIGENS_EVENTO)[number];

export interface AlunoEvento {
  id: string;
  aluno_id: string;
  ocorrido_em: string;
  tipo: TipoEvento;
  entidade: EntidadeEvento;
  entidade_id: string | null;
  rotulo: string;
  detalhe: Record<string, unknown> | null;
  ator: AtorEvento;
  ator_user_id: string | null;
  origem: OrigemEvento;
}

/** Evento com o nome de quem agiu resolvido (join manual — ver `resolverAutores` em `data.ts`). */
export interface AlunoEventoComAutor extends AlunoEvento {
  ator_nome: string | null;
}

/**
 * Ação administrativa lida de `gps.acessos_log` (definir senha, excluir
 * acesso etc.) — mostrada na mesma trilha, mas nunca agregada em macro (é
 * sempre um evento único e sensível o bastante para não somar com outros).
 */
export interface AcaoAdministrativa {
  id: string;
  acao: string;
  aluno_id: string | null;
  user_id_alvo: string | null;
  email_alvo: string | null;
  detalhe: string | null;
  feito_por: string | null;
  criado_em: string;
}

/**
 * Uma "rajada" do mesmo `tipo` de evento no mesmo dia local
 * (America/Sao_Paulo), agregada na LEITURA por `src/lib/log-agregacao.ts`.
 * Um grupo com um único item não vira `MacroAcao` — vira `ItemTrilha` do
 * tipo "evento" solto (dropdown de 1 item é ruído).
 */
export interface MacroAcao {
  tipo: TipoEvento;
  diaLocal: string; // "YYYY-MM-DD" em America/Sao_Paulo
  quantidade: number;
  primeiroEm: string;
  ultimoEm: string;
  ator: AtorEvento;
  atorUserId: string | null;
  atorNome: string | null;
  itens: AlunoEventoComAutor[];
}

/**
 * Item unificado da trilha (log de eventos + notas da equipe + ações
 * administrativas), já ordenado por `log-agregacao.ts`. `ocorrido_em` é a
 * chave de ordenação comum às três variantes.
 */
export type ItemTrilha =
  | { variante: "macro"; ocorrido_em: string; macro: MacroAcao }
  | { variante: "evento"; ocorrido_em: string; evento: AlunoEventoComAutor }
  | { variante: "nota"; ocorrido_em: string; nota: AlunoNotaComAutor }
  | {
      variante: "acao_administrativa";
      ocorrido_em: string;
      acao: AcaoAdministrativa;
    };
