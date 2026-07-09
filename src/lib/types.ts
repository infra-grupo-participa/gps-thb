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

export interface Membro {
  id: string;
  aluno_id: string;
  user_id: string | null;
  data_agendamento_disponivel: string | null;
  pasta_drive_url: string | null;
  perfil: PerfilAluno;
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

/** Janela de reunião que a equipe disponibiliza para o cliente favoritado. */
export interface ReuniaoJanela {
  id: string;
  aluno_id: string;
  data: string;
  horario: string | null;
  escolhida: boolean;
  criado_em: string;
}
