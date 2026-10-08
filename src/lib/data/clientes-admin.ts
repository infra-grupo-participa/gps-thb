import { createClient } from "@/lib/supabase/server";
import { ehAdmin } from "@/lib/auth";
import { SEM_PERMISSAO, traduzirErroBanco } from "@/lib/erros";
import type { FaseCliente, GrauRelacao } from "@/lib/types";
import type { FiltroReuniao } from "@/components/admin/clientes-programa/estado-na-url";
import {
  ETAPAS_AGENDA,
  ehEtapaAgenda,
  estadoReuniao,
  type EstadoReuniao,
  type EtapaAgenda,
} from "@/lib/clientes-agenda-tipos";

import {
  SITUACOES_ANEXO,
  TIPOS_ANEXO,
  ehSituacaoAnexo,
  ehTipoAnexo,
  statusAnexo,
  type FiltroAnexo,
  type SituacaoAnexo,
  type StatusAnexo,
  type TipoAnexo,
} from "@/lib/clientes-anexos-tipos";

// Vocabulário da agenda (…355) vive em módulo puro; reexportado aqui porque é
// a linha do cliente que o carrega (contrato com a tela).
export type { EstadoReuniao, EtapaAgenda } from "@/lib/clientes-agenda-tipos";
// (…378) Idem para os anexos.
export type {
  FiltroAnexo,
  SituacaoAnexo,
  StatusAnexo,
  TipoAnexo,
} from "@/lib/clientes-anexos-tipos";

// ─────────────────────────────────────────────────────────────────────────
// Lista consolidada de clientes do programa (item 3 dos 9, 14/09/2026).
// Ver docs/audits/2026-09-14-esteira/01-listas-clicaveis.md para as
// decisões e as medições que sustentam esta leitura.
//
// 🔴 DECISÃO DE LGPD DO MARCIO: `registro_contato` NÃO entra aqui — nem
// `valor_honorarios`, nem `contrato_*`, nem `problemas`. Os 1.214 clientes
// são terceiros; a anotação livre do parceiro sobre a vida deles fica só
// na ficha individual (com trilha própria). A RPC `gps.admin_clientes_lista`
// já não devolve essas colunas — não é "esconder na tela".
//
// Arquivo NOVO e SEPARADO de `src/lib/data/clientes.ts` de propósito:
// aquele é o CRM do ALUNO (a própria ficha, `gps.etapa1_clientes` por
// `aluno_id`); este é a visão consolidada do ADMIN sobre TODOS os
// ambientes — mesmo padrão de separação que já existe entre
// `src/lib/data/alunos.ts` (painel) e `src/lib/data/dashboard.ts`.
// ─────────────────────────────────────────────────────────────────────────

/** Uma linha da lista consolidada — as colunas exatas de `admin_clientes_lista`. */
export interface ClienteDoPrograma {
  id: string;
  alunoId: string;
  parceiroNome: string;
  clienteNome: string;
  telefone: string | null;
  fase: FaseCliente;
  grauRelacao: GrauRelacao | null;
  perfilDisc: string | null;
  dataReuniaoPreliminar: string | null;
  aderiuReuniao: boolean;
  acompanhadoEquipe: boolean;
  criadoEm: string;
  /** Entrevista Prévia (sessão tipo 1). `null` = nada. */
  epEm: string | null;
  epEstado: EstadoReuniao | null;
  /** Reunião Preliminar (sessão tipo 2 ou 3 — Viabilidade = Preliminar — ou a data da ficha). */
  rpEm: string | null;
  rpEstado: EstadoReuniao | null;
  /** Croqui (sessão tipo 4 ou `cliente_croquis.apresentado_em`). */
  cqEm: string | null;
  cqEstado: EstadoReuniao | null;
  /** Reunião Inicial de Execução (sessão tipo 5). */
  exEm: string | null;
  exEstado: EstadoReuniao | null;
  etapaAgenda: EtapaAgenda;
  /** (…378) Versão MAIS RECENTE da minuta. `null` = cliente sem minuta. */
  mnStatus: StatusAnexo | null;
  /** `enviado_em` da versão mais recente da minuta. */
  mnEm: string | null;
  /** `true` = a versão mais recente foi anexada pela equipe. `null` = sem minuta. */
  mnPorEquipe: boolean | null;
  /** (…378) Folha MAIS RECENTE do croqui (PDF). `null` = cliente sem croqui.
   * Não confundir com `cqEm`/`cqEstado`, que são a REUNIÃO de croqui. */
  cqPdfStatus: StatusAnexo | null;
  cqPdfEm: string | null;
  cqPdfPorEquipe: boolean | null;
}

export interface FiltrosClientesDoPrograma {
  limite?: number;
  offset?: number;
  /** `null`/ausente = todas as fases. */
  fase?: FaseCliente | null;
  /** `"_nulo"` = sem grau informado (mesma convenção da RPC). */
  grau?: GrauRelacao | "_nulo" | null;
  /** Nome do cliente OU do parceiro. */
  busca?: string | null;
  /** `null`/ausente = todos. Ver `FiltroReuniao` em `estado-na-url.ts`. */
  reuniao?: FiltroReuniao;
  /** `null`/ausente = todas as etapas. Ver `EtapaAgenda`. */
  agenda?: EtapaAgenda | null;
  /** (…378) `null`/ausente = todos. Ver `FiltroAnexo`. */
  anexo?: FiltroAnexo | null;
}

/**
 * `gps.admin_clientes_lista(...)` → `{ linhas, total }`.
 *
 * `total` é o universo do FILTRO (o `count(*) over()` da RPC), não o
 * tamanho da página — é o número que a tela usa para dizer "100 de 1.214".
 *
 * `ehAdmin()` de guarda (mesmo padrão de `getDashboard`): evita uma viagem
 * ao banco à toa. A fronteira real é `gps.eh_admin()` na RPC (42501).
 */
export async function getClientesDoPrograma(
  opts?: FiltrosClientesDoPrograma,
): Promise<{ linhas: ClienteDoPrograma[]; total: number; erro?: string }> {
  if (!(await ehAdmin())) return { linhas: [], total: 0, erro: SEM_PERMISSAO };

  const supabase = await createClient();
  const { data, error } = await supabase.schema("gps").rpc("admin_clientes_lista", {
    p_limite: opts?.limite ?? 100,
    p_offset: opts?.offset ?? 0,
    p_fase: opts?.fase ?? null,
    p_grau: opts?.grau ?? null,
    p_busca: opts?.busca ?? null,
    p_reuniao: opts?.reuniao ?? null,
    p_agenda: opts?.agenda ?? null,
    // (…378) Só vai quando há filtro: sem a chave, a chamada casa também com a
    // assinatura antiga (7 parâmetros) na janela entre deploy e migração.
    ...(opts?.anexo ? { p_anexo: opts.anexo } : {}),
  });

  if (error) {
    return {
      linhas: [],
      total: 0,
      erro: traduzirErroBanco("getClientesDoPrograma", error, {
        rpc: "gps.admin_clientes_lista",
      }),
    };
  }

  const linhas = ((data ?? []) as Record<string, unknown>[]).map(mapearLinha);
  const total = linhas.length > 0 ? Number(data![0].total_linhas ?? 0) : 0;

  return { linhas, total };
}

/** Uma linha de `gps.admin_clientes_agenda_kpis()` (…355). */
export interface AgendaKpi {
  etapa: EtapaAgenda;
  /** Clientes nesta etapa (com e sem estrela). */
  total: number;
  /** Só os com estrela (`acompanhado_equipe`) — o número grande do tile. */
  estrela: number;
}

/**
 * `gps.admin_clientes_agenda_kpis()` → as 5 etapas, sempre nesta ordem:
 * sem, entrevista, preliminar, croqui, execucao. Universo INTEIRO de
 * `gps.etapa1_clientes` (não o filtro da tela); a soma de `total` é a base.
 *
 * 🔴 LANÇA em erro, nunca devolve zeros: "0 em croqui" é afirmação sobre o
 * mundo, e a busca ter falhado não prova conjunto vazio. Quem chama decide
 * o aviso (`page.tsx` faz `.catch(() => null)`). Também lança se a RPC não
 * devolver as 5 etapas do catálogo — linha faltando não vira zero.
 */
export async function getClientesAgendaKpis(): Promise<AgendaKpi[]> {
  if (!(await ehAdmin())) throw new Error(SEM_PERMISSAO);

  const supabase = await createClient();
  const { data, error } = await supabase.schema("gps").rpc("admin_clientes_agenda_kpis");

  if (error) {
    throw new Error(
      traduzirErroBanco("getClientesAgendaKpis", error, {
        rpc: "gps.admin_clientes_agenda_kpis",
      }),
    );
  }

  const porEtapa = new Map<EtapaAgenda, AgendaKpi>();
  for (const d of (data ?? []) as Record<string, unknown>[]) {
    if (!ehEtapaAgenda(d.etapa_agenda)) continue;
    porEtapa.set(d.etapa_agenda, {
      etapa: d.etapa_agenda,
      total: Number(d.total ?? 0),
      estrela: Number(d.estrela ?? 0),
    });
  }

  const linhas = ETAPAS_AGENDA.map((e) => porEtapa.get(e));
  if (linhas.some((l) => !l)) {
    throw new Error("Não foi possível apurar as etapas da agenda agora.");
  }
  return linhas as AgendaKpi[];
}

/** Uma linha de `gps.admin_clientes_anexos_kpis()` (…378). */
export interface AnexoKpi {
  tipo: TipoAnexo;
  /** `pendente` CONTÉM `em_analise` — ver `SITUACOES_ANEXO`. */
  situacao: SituacaoAnexo;
  /** CLIENTES cuja versão mais recente está nesta situação. */
  total: number;
}

/**
 * `gps.admin_clientes_anexos_kpis()` → as 6 linhas, sempre nesta ordem:
 * minuta × (pendente, em_analise, revisada), croqui × (as mesmas).
 *
 * 🔴 LANÇA em erro e se faltar alguma das 6 linhas — mesma regra de
 * `getClientesAgendaKpis`: "0 pendentes" é afirmação sobre o mundo, e a busca
 * ter falhado não prova conjunto vazio. Quem chama decide o aviso.
 */
export async function getClientesAnexosKpis(): Promise<AnexoKpi[]> {
  if (!(await ehAdmin())) throw new Error(SEM_PERMISSAO);

  const supabase = await createClient();
  const { data, error } = await supabase.schema("gps").rpc("admin_clientes_anexos_kpis");

  if (error) {
    throw new Error(
      traduzirErroBanco("getClientesAnexosKpis", error, {
        rpc: "gps.admin_clientes_anexos_kpis",
      }),
    );
  }

  const porChave = new Map<string, AnexoKpi>();
  for (const d of (data ?? []) as Record<string, unknown>[]) {
    if (!ehTipoAnexo(d.tipo) || !ehSituacaoAnexo(d.situacao)) continue;
    porChave.set(`${d.tipo}:${d.situacao}`, {
      tipo: d.tipo,
      situacao: d.situacao,
      total: Number(d.total ?? 0),
    });
  }

  const linhas = TIPOS_ANEXO.flatMap((t) =>
    SITUACOES_ANEXO.map((s) => porChave.get(`${t}:${s}`)),
  );
  if (linhas.some((l) => !l)) {
    throw new Error("Não foi possível apurar os anexos agora.");
  }
  return linhas as AnexoKpi[];
}

/** `boolean` cru da RPC; `null`/ausente fica `null` (cliente sem o anexo). */
function boolOuNulo(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function mapearLinha(d: Record<string, unknown>): ClienteDoPrograma {
  return {
    id: String(d.id),
    alunoId: String(d.aluno_id),
    parceiroNome: String(d.parceiro_nome ?? ""),
    clienteNome: String(d.cliente_nome ?? ""),
    telefone: (d.telefone as string | null) ?? null,
    fase: (d.fase as FaseCliente) ?? "prospeccao",
    grauRelacao: (d.grau_relacao as GrauRelacao | null) ?? null,
    perfilDisc: (d.perfil_disc as string | null) ?? null,
    dataReuniaoPreliminar: (d.data_reuniao_preliminar as string | null) ?? null,
    aderiuReuniao: Boolean(d.aderiu_reuniao),
    acompanhadoEquipe: Boolean(d.acompanhado_equipe),
    criadoEm: String(d.criado_em ?? ""),
    epEm: (d.ep_em as string | null) ?? null,
    epEstado: estadoReuniao(d.ep_estado),
    rpEm: (d.rp_em as string | null) ?? null,
    rpEstado: estadoReuniao(d.rp_estado),
    cqEm: (d.cq_em as string | null) ?? null,
    cqEstado: estadoReuniao(d.cq_estado),
    exEm: (d.ex_em as string | null) ?? null,
    exEstado: estadoReuniao(d.ex_estado),
    // Banco sem a …355 não devolve a coluna: cai em "sem", nunca quebra a linha.
    etapaAgenda: ehEtapaAgenda(d.etapa_agenda) ? d.etapa_agenda : "sem",
    // (…378) Banco sem a migração não devolve as colunas: tudo `null` = "sem
    // anexo" na tela. ⚠️ Por isso a migração vai ANTES do deploy.
    mnStatus: statusAnexo(d.mn_status),
    mnEm: (d.mn_em as string | null) ?? null,
    mnPorEquipe: boolOuNulo(d.mn_por_equipe),
    cqPdfStatus: statusAnexo(d.cq_pdf_status),
    cqPdfEm: (d.cq_pdf_em as string | null) ?? null,
    cqPdfPorEquipe: boolOuNulo(d.cq_pdf_por_equipe),
  };
}
