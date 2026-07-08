// Conteúdo estático da Etapa 01 (da planilha oficial do GPS).
// Não é dado de aluno — é a definição do programa.

import type {
  NivelRelacionamento,
  StatusCliente,
  PerfilDisc,
} from "@/lib/types";

/** Meta de reuniões preliminares agendadas na Etapa 01. */
export const META_REUNIOES = 15;

/** Quantidade de clientes potenciais a listar. */
export const META_CLIENTES = 30;

/** Os 7 problemas — o cliente deve ter ao menos um. */
export const PROBLEMAS_7: { id: string; rotulo: string }[] = [
  { id: "dividendos", rotulo: "Recebe dividendos relevantes" },
  {
    id: "lucro_presumido",
    rotulo: "Empresa no lucro presumido com faturamento elevado",
  },
  { id: "alugueis_pf", rotulo: "Recebe aluguéis como pessoa física" },
  {
    id: "negocio_familiar",
    rotulo: "Negócio familiar com sócios, irmãos ou investidores",
  },
  {
    id: "dependente_fundador",
    rotulo: "Patrimônio/negócio dependente do fundador",
  },
  { id: "patrimonio_risco", rotulo: "Patrimônio exposto a riscos futuros" },
  { id: "inventario_caro", rotulo: "Patrimônio que geraria inventário caro" },
];

export const NIVEIS_RELACIONAMENTO: {
  id: NivelRelacionamento;
  rotulo: string;
}[] = [
  { id: "frio", rotulo: "Frio" },
  { id: "morno", rotulo: "Morno" },
  { id: "quente", rotulo: "Quente" },
];

export const STATUS_CLIENTE: {
  id: StatusCliente;
  rotulo: string;
  cor: string;
}[] = [
  { id: "pendente", rotulo: "Pendente", cor: "bg-muted text-muted-foreground" },
  {
    id: "contatado",
    rotulo: "Contatado",
    cor: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  },
  {
    id: "agendado",
    rotulo: "Agendado",
    cor: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  },
  {
    id: "recusou",
    rotulo: "Recusou",
    cor: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  },
  {
    id: "realizada",
    rotulo: "Realizada",
    cor: "bg-emerald-600 text-white",
  },
];

export const PERFIS_DISC: { id: PerfilDisc; rotulo: string }[] = [
  { id: "D", rotulo: "D — Dominância" },
  { id: "I", rotulo: "I — Influência" },
  { id: "S", rotulo: "S — Estabilidade" },
  { id: "C", rotulo: "C — Conformidade" },
];

/** Definição de uma tarefa de etapa. */
export interface TarefaDef {
  num: number;
  titulo: string;
  descricao: string;
  /** Tarefa medida automaticamente (não é checkbox manual). */
  automatica?: boolean;
  /** Link da aula/tutorial (coluna "Aula" da planilha), quando houver. */
  tutorialUrl?: string;
  /** Modelo/arquivo de apoio (coluna "Modelo" da planilha), quando houver. */
  modelo?: { nome: string; url?: string };
  /** Observação/informação extra exibida ao aluno (coluna "Informações"). */
  info?: string;
}

export const TAREFAS_ETAPA1: TarefaDef[] = [
  {
    num: 1,
    titulo: "Listar 30 clientes potenciais",
    descricao:
      "Liste 30 possíveis clientes do seu círculo de relacionamento que tenham pelo menos um dos sete problemas.",
    automatica: true,
    modelo: { nome: "Sete Problemas x Sete Clientes.pdf" },
  },
  {
    num: 2,
    titulo: "Identificar a perda pela inércia",
    descricao:
      "Para cada um dos 30, identifique quanto ele perde por permanecer inerte.",
    automatica: true,
  },
  {
    num: 3,
    titulo: "Enviar mensagem padrão",
    descricao:
      "Envie a mensagem padrão falando da sua formação técnica e da perda pela inércia.",
  },
  {
    num: 4,
    titulo: "Enviar mensagem de estudo de caso",
    descricao:
      "No dia seguinte, envie outra mensagem com um estudo de caso sobre a dor específica do cliente. Mostre o custo da inércia, faça uma pergunta que estimule a conversa e não ofereça nada — só agende reunião se o cliente pedir.",
  },
  {
    num: 5,
    titulo: "Ligar e oferecer duas opções de agenda",
    descricao:
      "No dia seguinte, ligue para cada um dos 30, retome a especialização e ofereça duas opções de agenda. Meta: agendar pelo menos 15 reuniões preliminares.",
  },
  {
    num: 6,
    titulo: "Preencher os dados dos 30 clientes",
    descricao:
      "Preencha nome, telefone, nível de relacionamento, perda pela inércia, registro do contato e data da reunião preliminar. Defina também a data que você disponibiliza para agendamento.",
    automatica: true,
  },
  {
    num: 7,
    titulo: "Criar os grupos de WhatsApp",
    descricao:
      "Crie os grupos de WhatsApp com os clientes que aderiram à Reunião Preliminar.",
  },
  {
    num: 8,
    titulo: "Realizar a entrevista prévia (perfil DISC)",
    descricao:
      "Faça a entrevista prévia com cada agendado, identifique o perfil DISC e quem são os tomadores de decisão — trazendo-os para a reunião.",
  },
  {
    num: 9,
    titulo: "Criar conta de negócio na Hotmart",
    descricao: "Crie uma conta de negócio na Hotmart.",
    tutorialUrl: "https://1sh.co/877580e0",
  },
  {
    num: 10,
    titulo: "Criar os produtos na Hotmart",
    descricao:
      "Crie os produtos: Sessão de Viabilidade, Croqui Estrutural e Execução Holding.",
    tutorialUrl:
      "https://membros.holdingmasters.com.br/playlist/5EoqQB6Ko0/file/6NKzBzneDz",
  },
];

export function rotuloProblema(id: string): string {
  return PROBLEMAS_7.find((p) => p.id === id)?.rotulo ?? id;
}

import type { ClienteEtapa1 } from "@/lib/types";

export interface MetricasEtapa1 {
  preenchidos: number;
  comPerda: number;
  comDados: number;
  agendados: number;
  perdaTotal: number;
  totalTarefas: number;
  totalConcluidas: number;
  pct: number;
  tarefaConcluida: (num: number) => boolean;
}

/**
 * Calcula as métricas e o estado das tarefas da Etapa 01 a partir dos clientes
 * e do mapa de tarefas manuais concluídas. Pura — usada no servidor e no cliente.
 */
export function calcularMetricasEtapa1(
  clientes: ClienteEtapa1[],
  manual: Record<number, boolean>,
): MetricasEtapa1 {
  const preenchidos = clientes.filter((c) => c.nome.trim() !== "").length;
  const comPerda = clientes.filter((c) => c.perda_inercia != null).length;
  const comDados = clientes.filter(
    (c) => c.nome.trim() && c.telefone && c.nivel_relacionamento,
  ).length;
  const agendados = clientes.filter(
    (c) => c.status === "agendado" || c.status === "realizada",
  ).length;
  const perdaTotal = clientes.reduce(
    (soma, c) => soma + (c.perda_inercia ?? 0),
    0,
  );

  const tarefaConcluida = (num: number): boolean => {
    switch (num) {
      case 1:
        return preenchidos >= META_CLIENTES;
      case 2:
        return comPerda >= META_CLIENTES;
      case 6:
        return comDados >= META_CLIENTES;
      default:
        return Boolean(manual[num]);
    }
  };

  const totalConcluidas = TAREFAS_ETAPA1.filter((t) =>
    tarefaConcluida(t.num),
  ).length;
  const pct = Math.round((totalConcluidas / TAREFAS_ETAPA1.length) * 100);

  return {
    preenchidos,
    comPerda,
    comDados,
    agendados,
    perdaTotal,
    totalTarefas: TAREFAS_ETAPA1.length,
    totalConcluidas,
    pct,
    tarefaConcluida,
  };
}
