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
}

export interface Etapa {
  id: number;
  nome: string;
  descricao: string | null;
  ordem: number;
  liberada: boolean;
}

export interface Membro {
  id: string;
  aluno_id: string;
  user_id: string | null;
  data_agendamento_disponivel: string | null;
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

export interface ProgressoTarefa {
  id: string;
  aluno_id: string;
  etapa: number;
  tarefa: number;
  concluida: boolean;
  concluida_em: string | null;
}
