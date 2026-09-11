import { createClient } from "@/lib/supabase/server";
import { ehAdmin } from "@/lib/auth";
import { logErro } from "@/lib/log";
import { META_HONORARIOS } from "@/lib/etapa1";
import type { GrauRelacao } from "@/lib/types";
import type { AlunoGps } from "@/lib/data/alunos";
import type { AtendimentoDoAluno } from "@/lib/data/diario";

// ─────────────────────────────────────────────────────────────────────────
// Dashboard executivo de /admin (migração 20260910000209).
//
// 🔑 UMA IDA AO BANCO por abertura de /admin. Nenhum card consulta por conta
// própria — é o defeito que `chamados-data.ts` já documenta.
//
// 🔑 E DOIS dos nove cards NÃO vêm da RPC, de propósito:
//   · `faixasDeTrilha(alunos)` usa o `pct` que `getAlunosGps()` já calculou com
//     `resumoEtapa1`. Reescrever o catálogo de tarefas em SQL criaria um
//     segundo lugar para a MESMA regra divergir;
//   · `resumoAtendimento(...)` usa o Map que `getAtendimentoPorAluno()` já
//     devolve — a RPC `gps.admin_painel_atendimento()` que /admin JÁ chama.
// As duas são funções PURAS, sem I/O: custo zero, e testáveis.
//
// 🔑 ZERO PII no retorno da RPC: só contagens, somas e datas. Nem `aluno_id`.
// ─────────────────────────────────────────────────────────────────────────

export interface DashboardReferencia {
  fuso: string;
  /** Data local (America/Sao_Paulo) em que o dashboard foi gerado. */
  hoje: string;
  /**
   * Dia do mês. A tela é OBRIGADA a escrever "até o dia N" ao lado da
   * variação: sem isso, todo dia 1º o painel anunciaria −95% e alguém tomaria
   * decisão em cima disso.
   */
  dia: number;
  mes: string;
  mesAnterior: string;
}

export interface DashboardPrograma {
  /** Ambientes no programa (distintos em `gps.membros`). */
  total: number;
  /** Titulares que entraram no mês corrente. */
  noMes: number;
  /** Titulares que entraram no mês anterior ATÉ O MESMO DIA. */
  noMesAnteriorAteODia: number;
  porMes: { mes: string; qtd: number }[];
}

export interface DashboardAcesso {
  total: number;
  comLogin: number;
  semLogin: number;
  /** Tem login e `last_sign_in_at` nulo — nunca entrou. */
  nuncaEntraram: number;
  semAcesso30d: number;
  ativos30d: number;
}

export interface DashboardOnboarding {
  /** Denominador: PESSOAS com cadastro vinculado (o questionário é da pessoa). */
  pessoas: number;
  concluidos: number;
  emAndamento: number;
  /** Derivado: `pessoas - concluidos - emAndamento`, nunca negativo. */
  naoIniciados: number;
  concluidosNoMes: number;
  /** Em andamento há mais de 7 dias sem tocar — a fila da equipe. */
  parados7d: number;
  comCliente1: number;
  emExecucao: number;
}

export interface DashboardClientes {
  total: number;
  prospeccao: number;
  fechamento: number;
  contratado: number;
  noMes: number;
  noMesAnteriorAteODia: number;
}

export interface DashboardHonorarios {
  clientesContratados: number;
  contratadosSemValor: number;
  ambientesComContratado: number;
  /**
   * `null` = nenhum contratado com valor registrado. **Nunca exibir como
   * R$ 0,00** — `coalesce(total, 0)` transformaria buraco em resultado.
   */
  totalReais: number | null;
  /**
   * Quantos AMBIENTES bateram `META_HONORARIOS` (o **AURUM**, o próximo nível
   * do programa — o dashboard chamava isso de "Áureo", que estava errado; o
   * cálculo não mudou). Calculado aqui, com
   * a constante que já existe: a meta é POR AMBIENTE, e somar 158 × 150k para
   * inventar uma "meta do programa" seria número inventado.
   */
  ambientesNoAurum: number;
}

export interface DashboardAtividadeDia {
  dia: string;
  aluno: number;
  equipe: number;
  sistema: number;
}

export interface DashboardGrauRelacao {
  itens: { grau: GrauRelacao; qtd: number }[];
  /**
   * Clientes sem grau informado. Sai SEPARADO e nunca vira uma fatia chamada
   * "Lead": ausência de resposta sobre um terceiro não é um palpite.
   */
  naoInformado: number;
}

/**
 * Quem é quem no sistema, em números (pedido do Marcio, 11/09/2026).
 *
 * 🔑 `sociosAtivos30d` é o número que importa, não `socios`: em 11/09 havia
 * 10 sócios com login e só 4 acessando nos últimos 30 dias. Cadastrar sócio
 * não é o mesmo que ter sócio participando — e a tela precisa dizer isso.
 */
export interface DashboardEquipe {
  titulares: number;
  socios: number;
  sociosAtivos30d: number;
  sociosNuncaEntraram: number;
  /** Titulares/sócios que JÁ abriram o portal ao menos uma vez. */
  titularesJaEntraram: number;
  sociosJaEntraram: number;
  titularesAtivos30d: number;
  /** Tem conta e NUNCA entrou — o mesmo corte do filtro `nunca_entrou`. */
  nuncaEntraram: number;
  /** Ambientes com mais de um membro (titular + sócio dividindo o portal). */
  ambientesCompartilhados: number;
  /** Convites de sócio em aberto, ainda dentro do prazo de 7 dias. */
  convitesPendentes: number;
}

export interface Dashboard {
  geradoEm: string;
  referencia: DashboardReferencia;
  programa: DashboardPrograma;
  acesso: DashboardAcesso;
  equipe: DashboardEquipe;
  onboarding: DashboardOnboarding;
  clientes: DashboardClientes;
  honorarios: DashboardHonorarios;
  atividade: DashboardAtividadeDia[];
  grauRelacao: DashboardGrauRelacao;
}

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function numeroOuNulo(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

/**
 * O dashboard de `/admin` — UMA chamada a `gps.admin_dashboard()`.
 *
 * Devolve `null` em falha, e a tela mostra o painel de erro em vez de nove
 * cards zerados: um dashboard todo em zero é indistinguível de um sistema
 * vazio, e é assim que se toma decisão em cima de dado que não existe.
 */
export async function getDashboard(): Promise<Dashboard | null> {
  if (!(await ehAdmin())) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.schema("gps").rpc("admin_dashboard");

  if (error) {
    logErro("getDashboard", error, {
      rpc: "gps.admin_dashboard",
      efeito: "painel mostra o bloco de erro, nunca nove cards zerados",
    });
    return null;
  }

  return mapearDashboard((data ?? {}) as Record<string, unknown>);
}

/**
 * Do jsonb da RPC para `Dashboard`. Pura (sem sessão, sem rede) — é o que
 * permite renderizar a Visão geral com um retrato do dado fora do `/admin`.
 */
export function mapearDashboard(d: Record<string, unknown>): Dashboard {
  const ref = (d.referencia ?? {}) as Record<string, unknown>;
  const pro = (d.programa ?? {}) as Record<string, unknown>;
  const ace = (d.acesso ?? {}) as Record<string, unknown>;
  const eqp = (d.equipe ?? {}) as Record<string, unknown>;
  const onb = (d.onboarding ?? {}) as Record<string, unknown>;
  const cli = (d.clientes ?? {}) as Record<string, unknown>;
  const hon = (d.honorarios ?? {}) as Record<string, unknown>;
  const gra = (d.grau_relacao ?? {}) as Record<string, unknown>;

  const somas = Array.isArray(hon.somas_por_ambiente)
    ? (hon.somas_por_ambiente as unknown[]).map((s) => n(s))
    : [];

  const pessoas = n(onb.pessoas);
  const concluidos = n(onb.concluidos);
  const emAndamento = n(onb.em_andamento);

  return {
    geradoEm: String(d.gerado_em ?? ""),
    referencia: {
      fuso: String(ref.fuso ?? "America/Sao_Paulo"),
      hoje: String(ref.hoje ?? ""),
      dia: n(ref.dia),
      mes: String(ref.mes ?? ""),
      mesAnterior: String(ref.mes_anterior ?? ""),
    },
    programa: {
      total: n(pro.total),
      noMes: n(pro.no_mes),
      noMesAnteriorAteODia: n(pro.no_mes_anterior_ate_o_dia),
      porMes: Array.isArray(pro.por_mes)
        ? (pro.por_mes as { mes?: string; qtd?: number }[]).map((m) => ({
            mes: String(m.mes ?? ""),
            qtd: n(m.qtd),
          }))
        : [],
    },
    acesso: {
      total: n(ace.total),
      comLogin: n(ace.com_login),
      semLogin: n(ace.sem_login),
      nuncaEntraram: n(ace.nunca_entraram),
      semAcesso30d: n(ace.sem_acesso_30d),
      ativos30d: n(ace.ativos_30d),
    },
    equipe: {
      titulares: n(eqp.titulares),
      socios: n(eqp.socios),
      sociosAtivos30d: n(eqp.socios_ativos_30d),
      sociosNuncaEntraram: n(eqp.socios_nunca_entraram),
      titularesJaEntraram: n(eqp.titulares_ja_entraram),
      sociosJaEntraram: n(eqp.socios_ja_entraram),
      titularesAtivos30d: n(eqp.titulares_ativos_30d),
      nuncaEntraram: n(eqp.nunca_entraram),
      ambientesCompartilhados: n(eqp.ambientes_compartilhados),
      convitesPendentes: n(eqp.convites_pendentes),
    },
    onboarding: {
      pessoas,
      concluidos,
      emAndamento,
      naoIniciados: Math.max(pessoas - concluidos - emAndamento, 0),
      concluidosNoMes: n(onb.concluidos_no_mes),
      parados7d: n(onb.parados_7d),
      comCliente1: n(onb.com_cliente1),
      emExecucao: n(onb.em_execucao),
    },
    clientes: {
      total: n(cli.total),
      prospeccao: n(cli.prospeccao),
      fechamento: n(cli.fechamento),
      contratado: n(cli.contratado),
      noMes: n(cli.no_mes),
      noMesAnteriorAteODia: n(cli.no_mes_anterior_ate_o_dia),
    },
    honorarios: {
      clientesContratados: n(hon.clientes_contratados),
      contratadosSemValor: n(hon.contratados_sem_valor),
      ambientesComContratado: n(hon.ambientes_com_contratado),
      totalReais: numeroOuNulo(hon.total_reais),
      ambientesNoAurum: somas.filter((s) => s >= META_HONORARIOS).length,
    },
    atividade: Array.isArray(d.atividade)
      ? (d.atividade as Record<string, unknown>[]).map((a) => ({
          dia: String(a.dia ?? ""),
          aluno: n(a.aluno),
          equipe: n(a.equipe),
          sistema: n(a.sistema),
        }))
      : [],
    grauRelacao: {
      itens: Array.isArray(gra.itens)
        ? (gra.itens as { grau?: string; qtd?: number }[]).map((g) => ({
            grau: g.grau as GrauRelacao,
            qtd: n(g.qtd),
          }))
        : [],
      naoInformado: n(gra.nao_informado),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Os dois cards que NÃO custam consulta nova (funções puras)
// ─────────────────────────────────────────────────────────────────────────

export type FaixaTrilha = "0" | "1-49" | "50-99" | "100";

export interface FaixaDeTrilha {
  faixa: FaixaTrilha;
  rotulo: string;
  qtd: number;
}

/**
 * Ambientes por faixa de progresso da Etapa 01, a partir do `pct` que
 * `getAlunosGps()` já calculou com `resumoEtapa1`.
 *
 * 🔑 Por que NÃO vem do banco: `pct` mistura tarefas automáticas (derivadas dos
 * clientes) com manuais (`gps.progresso`), e o catálogo de tarefas vive em
 * `src/lib/etapa1.ts`. Reescrevê-lo em SQL criaria um segundo lugar para a
 * mesma regra divergir — e o número da tela do aluno e o do painel têm de ser
 * o mesmo número.
 *
 * ⚠️ Vale sobre o LOTE carregado, como a busca e os filtros do painel (Leitura
 * A). Com 158 ambientes e lote de 200, é a base inteira; a tela diz quantos
 * carregou.
 */
export function faixasDeTrilha(alunos: AlunoGps[]): FaixaDeTrilha[] {
  const contagem: Record<FaixaTrilha, number> = {
    "0": 0,
    "1-49": 0,
    "50-99": 0,
    "100": 0,
  };
  for (const a of alunos) {
    const pct = a.pct;
    if (pct <= 0) contagem["0"] += 1;
    else if (pct < 50) contagem["1-49"] += 1;
    else if (pct < 100) contagem["50-99"] += 1;
    else contagem["100"] += 1;
  }
  return [
    { faixa: "0", rotulo: "Não começou", qtd: contagem["0"] },
    { faixa: "1-49", rotulo: "Até a metade", qtd: contagem["1-49"] },
    { faixa: "50-99", rotulo: "Passou da metade", qtd: contagem["50-99"] },
    { faixa: "100", rotulo: "Etapa 01 concluída", qtd: contagem["100"] },
  ];
}

export interface ResumoAtendimento {
  pendenciasAbertas: number;
  ambientesComPendencia: number;
  chamadosAbertos: number;
  ambientesComChamado: number;
  /** Ambientes carregados sem NENHUMA nota no Diário. */
  semNenhumaNota: number;
  /** Ambientes que não acessam há 30 dias ou mais (inclui quem nunca entrou). */
  semAcesso30d: number;
}

const TRINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * O card "Atendimento", montado a partir do que `/admin` JÁ carregou:
 * o Map de `getAtendimentoPorAluno()` e a lista de `getAlunosGps()`.
 * Zero consulta nova — o crédito de otimização desta frente.
 */
export function resumoAtendimento(
  alunos: AlunoGps[],
  atendimento: Map<string, AtendimentoDoAluno> | Record<string, AtendimentoDoAluno>,
): ResumoAtendimento {
  const mapa =
    atendimento instanceof Map
      ? atendimento
      : new Map(Object.entries(atendimento));

  let pendenciasAbertas = 0;
  let ambientesComPendencia = 0;
  let chamadosAbertos = 0;
  let ambientesComChamado = 0;
  let semNenhumaNota = 0;
  let semAcesso30d = 0;

  const corte = Date.now() - TRINTA_DIAS_MS;

  for (const a of alunos) {
    const at = mapa.get(a.alunoId);
    const pend = at?.pendenciasAbertas ?? 0;
    const cham = at?.chamadosAbertos ?? 0;
    pendenciasAbertas += pend;
    if (pend > 0) ambientesComPendencia += 1;
    chamadosAbertos += cham;
    if (cham > 0) ambientesComChamado += 1;
    // `ultimaNotaEm` nulo (ou ambiente ausente do Map) = nenhuma nota.
    if (!at?.ultimaNotaEm) semNenhumaNota += 1;
    // `null` = NUNCA entrou, e isso conta como "sem acesso" — é justamente
    // quem a equipe precisa alcançar primeiro.
    if (!a.ultimoAcesso || new Date(a.ultimoAcesso).getTime() < corte) {
      semAcesso30d += 1;
    }
  }

  return {
    pendenciasAbertas,
    ambientesComPendencia,
    chamadosAbertos,
    ambientesComChamado,
    semNenhumaNota,
    semAcesso30d,
  };
}
