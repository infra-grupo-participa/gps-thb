// ─────────────────────────────────────────────────────────────────────────
// FACHADA de leitura do schema `gps`.
//
// Este arquivo tinha 1091 linhas e cinco assuntos misturados (CD5 da rodada
// final). O código foi para `src/lib/data/*` POR RESPONSABILIDADE, sem uma
// linha de lógica nova — mesmas consultas, mesmas colunas, mesmos retornos,
// mesmas guardas `ehAdmin()`. Aqui ficou só o reexporte, para que os ~40
// importadores existentes continuem escrevendo `from "@/lib/data"`.
//
//   src/lib/data/alunos.ts        aluno, turma, ambiente, membros e o PAINEL
//   src/lib/data/clientes.ts      `etapa1_clientes` + os dados da Etapa 03
//   src/lib/data/progresso.ts     etapas, progresso de tarefa e ênfase
//   src/lib/data/diario.ts        notas, eventos, trilha e atendimento (só-admin)
//   src/lib/data/solicitacoes.ts  fila de acesso
//   src/lib/data/central.ts       diagnostico do ambiente e override de etapa
//   src/lib/data/videos.ts        biblioteca de vídeos (`gps.videos`)
//
// 🔑 Ao escrever consulta NOVA, escreva no arquivo do assunto e acrescente o
// reexporte aqui — não volte a engordar este. E a regra do P6 continua de pé:
// consulta nova declara colunas (`COLUNAS_*`), nunca `select("*")`, porque o
// egress do Supabase tem teto DA ORGANIZAÇÃO, dividido com o sip.
// ─────────────────────────────────────────────────────────────────────────

export {
  getAlunoById,
  getTurmaCodigo,
  getAmbiente,
  getMembroDoUsuario,
  getMembrosDoAmbiente,
  contarMembrosDoAmbiente,
  getAlunosGps,
  acharAlunosPorEmails,
  LIMITE_PAINEL_ALUNOS,
  LIMITE_PAINEL_ALUNOS_MAX,
} from "@/lib/data/alunos";
export type { AlunoGps, PaginaAlunosGps } from "@/lib/data/alunos";

export {
  getClientesEtapa1,
  getClienteById,
  getClienteEquipe,
  getAgendamentosEtapa3,
  getRevisaoEtapa3,
} from "@/lib/data/clientes";
// `getClientesHonorarios` NÃO passa por aqui: o único consumidor é
// `src/lib/financeiro.ts`, que importa direto de `@/lib/data/clientes`.
// Barril com nome que ninguém pega é convite a um segundo caminho para o
// mesmo dado.

export {
  getEtapas,
  getProgressoAluno,
  getProgressoEtapa,
  getEnfasesEtapa,
} from "@/lib/data/progresso";

export {
  getDiagnosticoAmbiente,
  getEtapasLiberadasPara,
} from "@/lib/data/central";

export {
  getVideosAtivo,
  getVideosDoAluno,
  getVideosDoAlunoAdmin,
  getVideosAdmin,
} from "@/lib/data/videos";
// `mapearStatusAcesso` NÃO passa por aqui: `src/app/admin/senha-actions.ts`
// importa direto de `@/lib/data/central` (e precisa, porque um módulo
// `"use server"` não pode reexportar função síncrona).
export type {
  DiagnosticoAmbiente,
  VerificacaoDiagnostico,
  MembroDiagnostico,
  EtapaDiagnostico,
  CandidatoFinanceiro,
  SolicitacaoPendenteDiagnostico,
} from "@/lib/data/central";

export {
  getDiarioDoAluno,
  getPendenciasAbertasDoAluno,
  getResumoDiario,
  getAtendimentoPorAluno,
  getEventosDoAluno,
  getMarcosDeTrilha,
  getAcoesAdministrativasDoAluno,
  getMarcosDeAcesso,
} from "@/lib/data/diario";
export type {
  AtendimentoDoAluno,
  EventosDoAlunoResultado,
} from "@/lib/data/diario";

export { getMinhaSolicitacao, getSolicitacoes } from "@/lib/data/solicitacoes";

export {
  alunoJaTemCliente,
  getMeuOnboarding,
  getOnboardingDoAluno,
  urlDoAnexoOnboarding,
} from "@/lib/data/onboarding";

export {
  getDashboard,
  faixasDeTrilha,
  resumoAtendimento,
} from "@/lib/data/dashboard";
export type {
  Dashboard,
  DashboardAcesso,
  DashboardAtividadeDia,
  DashboardClientes,
  DashboardGrauRelacao,
  DashboardHonorarios,
  DashboardOnboarding,
  DashboardPrograma,
  DashboardReferencia,
  FaixaDeTrilha,
  FaixaTrilha,
  ResumoAtendimento,
} from "@/lib/data/dashboard";
