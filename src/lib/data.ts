import { createClient } from "@/lib/supabase/server";
import { calcularMetricasEtapa1 } from "@/lib/etapa1";
import {
  montarGrade,
  hojeSaoPaulo,
  horaCurta,
  proximasQuartas,
  type DiaGrade,
  type Bloqueio,
} from "@/lib/reuniao";
import type {
  Aluno,
  ClienteEtapa1,
  Etapa,
  Membro,
  ModoEnfase,
  ProgressoTarefa,
  ReuniaoAgendamento,
  ReuniaoAgendamentoDetalhe,
  ReuniaoEvento,
  ReuniaoHorario,
  Solicitacao,
  StatusSolicitacao,
} from "@/lib/types";

export async function getEtapas(): Promise<Etapa[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("etapas")
    .select("*")
    .order("ordem");
  return (data ?? []) as Etapa[];
}

export async function getAlunoById(alunoId: string): Promise<Aluno | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("thb_alunos")
    .select(
      "id, nome, email, telefone, turma_id, plano, status_acesso, eh_socio, profissao, cidade, estado, instagram_url, youtube_url, site_profissional, link_facebook",
    )
    .eq("id", alunoId)
    .maybeSingle();
  return (data as Aluno) ?? null;
}

/** Código/nome da turma do aluno (thb_turmas). */
export async function getTurmaCodigo(
  turmaId: number | null | undefined,
): Promise<string | null> {
  if (turmaId == null) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("thb_turmas")
    .select("codigo")
    .eq("id", turmaId)
    .maybeSingle();
  return (data?.codigo as string) ?? null;
}

export async function getMembro(alunoId: string): Promise<Membro | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("membros")
    .select(
      "id, aluno_id, user_id, data_agendamento_disponivel, pasta_drive_url, perfil",
    )
    .eq("aluno_id", alunoId)
    .maybeSingle();
  return (data as Membro) ?? null;
}

export async function getClientesEtapa1(
  alunoId: string,
): Promise<ClienteEtapa1[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("etapa1_clientes")
    .select("*")
    .eq("aluno_id", alunoId)
    .order("ordem")
    .order("criado_em");
  return (data ?? []) as ClienteEtapa1[];
}

export interface AlunoGps {
  membro: Membro;
  aluno: Aluno | null;
  pct: number;
  clientesPreenchidos: number;
  agendados: number;
}

/** Lista os alunos vinculados ao GPS com um resumo da Etapa 01. */
export async function getAlunosGps(): Promise<AlunoGps[]> {
  const supabase = await createClient();

  const { data: membros } = await supabase
    .schema("gps")
    .from("membros")
    .select(
      "id, aluno_id, user_id, data_agendamento_disponivel, pasta_drive_url",
    )
    .order("criado_em", { ascending: false });

  const lista = (membros ?? []) as Membro[];
  if (lista.length === 0) return [];

  const alunoIds = lista.map((m) => m.aluno_id);

  const [{ data: alunos }, { data: clientes }, { data: progresso }] =
    await Promise.all([
      supabase
        .from("thb_alunos")
        .select(
          "id, nome, email, telefone, turma_id, plano, status_acesso, eh_socio",
        )
        .in("id", alunoIds),
      supabase
        .schema("gps")
        .from("etapa1_clientes")
        .select("*")
        .in("aluno_id", alunoIds),
      supabase
        .schema("gps")
        .from("progresso")
        .select("*")
        .in("aluno_id", alunoIds)
        .eq("etapa", 1),
    ]);

  const alunosMap = new Map(
    ((alunos ?? []) as Aluno[]).map((a) => [a.id, a]),
  );

  return lista.map((membro) => {
    const cs = ((clientes ?? []) as ClienteEtapa1[]).filter(
      (c) => c.aluno_id === membro.aluno_id,
    );
    const manual: Record<number, boolean> = {};
    for (const p of (progresso ?? []) as ProgressoTarefa[]) {
      if (p.aluno_id === membro.aluno_id) manual[p.tarefa] = p.concluida;
    }
    const m = calcularMetricasEtapa1(cs, manual);
    return {
      membro,
      aluno: alunosMap.get(membro.aluno_id) ?? null,
      pct: m.pct,
      clientesPreenchidos: m.preenchidos,
      agendados: m.agendados,
    };
  });
}

/** Solicitação de acesso do usuário logado (ou null). */
export async function getMinhaSolicitacao(
  userId: string,
): Promise<Solicitacao | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("solicitacoes_acesso")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as Solicitacao) ?? null;
}

/** Solicitações de acesso (para o admin), filtradas por status. */
export async function getSolicitacoes(
  status?: StatusSolicitacao,
): Promise<Solicitacao[]> {
  const supabase = await createClient();
  let query = supabase
    .schema("gps")
    .from("solicitacoes_acesso")
    .select("*")
    .order("criado_em", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data } = await query;
  return (data ?? []) as Solicitacao[];
}

export async function contarSolicitacoesPendentes(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .schema("gps")
    .from("solicitacoes_acesso")
    .select("id", { count: "exact", head: true })
    .eq("status", "pendente");
  return count ?? 0;
}

/** Procura um thb_aluno pelo e-mail (para sugerir vínculo na aprovação). */
export async function acharAlunoPorEmail(
  email: string | null,
): Promise<Aluno | null> {
  if (!email) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("thb_alunos")
    .select(
      "id, nome, email, telefone, turma_id, plano, status_acesso, eh_socio",
    )
    .ilike("email", email)
    .limit(1)
    .maybeSingle();
  return (data as Aluno) ?? null;
}

export async function getClienteById(
  clienteId: string,
): Promise<ClienteEtapa1 | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("etapa1_clientes")
    .select("*")
    .eq("id", clienteId)
    .maybeSingle();
  return (data as ClienteEtapa1) ?? null;
}

export async function getAgendamentosEtapa3(alunoId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("etapa3_agendamentos")
    .select("*")
    .eq("aluno_id", alunoId)
    .order("data", { ascending: true, nullsFirst: false })
    .order("criado_em");
  return data ?? [];
}

export async function getRevisaoEtapa3(alunoId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("etapa3_revisao")
    .select("*")
    .eq("aluno_id", alunoId)
    .maybeSingle();
  return data ?? null;
}

/** Todo o progresso do aluno (todas as etapas). */
export async function getProgressoAluno(
  alunoId: string,
): Promise<ProgressoTarefa[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("progresso")
    .select("*")
    .eq("aluno_id", alunoId);
  return (data ?? []) as ProgressoTarefa[];
}

/** Cliente marcado como acompanhado pela equipe (ou null). */
export async function getClienteEquipe(
  alunoId: string,
): Promise<ClienteEtapa1 | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("etapa1_clientes")
    .select("*")
    .eq("aluno_id", alunoId)
    .eq("acompanhado_equipe", true)
    .maybeSingle();
  return (data as ClienteEtapa1) ?? null;
}

export async function getProgressoEtapa(
  alunoId: string,
  etapa: number,
): Promise<ProgressoTarefa[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("progresso")
    .select("*")
    .eq("aluno_id", alunoId)
    .eq("etapa", etapa);
  return (data ?? []) as ProgressoTarefa[];
}

/** Overrides de destaque de tarefa (definidos pelo admin) para uma etapa. */
export async function getEnfasesEtapa(
  alunoId: string,
  etapa: number,
): Promise<Record<number, ModoEnfase>> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("tarefa_enfase")
    .select("tarefa, modo")
    .eq("aluno_id", alunoId)
    .eq("etapa", etapa);
  const out: Record<number, ModoEnfase> = {};
  for (const r of (data ?? []) as { tarefa: number; modo: ModoEnfase }[]) {
    out[r.tarefa] = r.modo;
  }
  return out;
}

/** O agendamento de reunião do aluno (no máximo um). */
export async function getAgendamentoReuniao(
  alunoId: string,
): Promise<ReuniaoAgendamento | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("reuniao_agendamentos")
    .select("*")
    .eq("aluno_id", alunoId)
    .maybeSingle();
  return (data as ReuniaoAgendamento) ?? null;
}

/**
 * Horários da grade (`gps.reuniao_horarios`). Por padrão só os abertos; com
 * `incluirInativos` traz todos, para a tela de disponibilidade do admin.
 */
export async function getHorariosReuniao(
  incluirInativos = false,
): Promise<ReuniaoHorario[]> {
  const supabase = await createClient();
  let q = supabase.schema("gps").from("reuniao_horarios").select("*");
  if (!incluirInativos) q = q.eq("ativo", true);
  const { data } = await q.order("horario");
  return ((data ?? []) as ReuniaoHorario[]).map((h) => ({
    ...h,
    horario: horaCurta(h.horario),
  }));
}

/**
 * Reunião do aluno + a grade de horários (livres/ocupados) pronta para a UI.
 * Reusado pela home do aluno e pelo admin em modo assistência.
 */
export async function getReuniaoDoAluno(alunoId: string): Promise<{
  agendamento: ReuniaoAgendamento | null;
  grade: DiaGrade[];
  /** "hoje" em São Paulo — o card usa para detectar reunião com data vencida. */
  hojeIso: string;
}> {
  const hojeIso = hojeSaoPaulo();
  const quartas = proximasQuartas(hojeIso);
  const deIso = quartas[0];
  const ateIso = quartas[quartas.length - 1];

  const [agendamento, ocupados, bloqueios, horarios] = await Promise.all([
    getAgendamentoReuniao(alunoId),
    getSlotsOcupados(deIso, ateIso),
    getBloqueiosRange(deIso, ateIso),
    getHorariosReuniao(),
  ]);

  const grade = montarGrade({
    hojeIso,
    horarios: horarios.map((h) => h.horario),
    ocupados,
    bloqueios,
    // Uma reunião recusada não é mais "meu horário": o slot voltou para a grade
    // e pode já estar com outro aluno. Marcar como "meu" ofereceria um horário
    // que o aluno não consegue pegar.
    meuAgendamento:
      agendamento && agendamento.status !== "recusada" ? agendamento : null,
  });
  return { agendamento, grade, hojeIso };
}

/**
 * Slots já tomados (por qualquer aluno) numa janela de datas — para montar a
 * grade do aluno sem vazar dados de terceiros (só data+horário).
 *
 * Recusada não conta: quando a equipe recusa, o horário volta a ficar livre.
 */
export async function getSlotsOcupados(
  deIso: string,
  ateIso: string,
): Promise<Pick<ReuniaoAgendamento, "data" | "horario">[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("reuniao_agendamentos")
    .select("data, horario")
    .neq("status", "recusada")
    .gte("data", deIso)
    .lte("data", ateIso);
  return (data ?? []) as Pick<ReuniaoAgendamento, "data" | "horario">[];
}

/**
 * Bloqueios numa janela de datas. Cada linha traz a quarta e o `horario`
 * (NULL = quarta inteira; preenchido = só aquele slot).
 */
export async function getBloqueiosRange(
  deIso: string,
  ateIso: string,
): Promise<Bloqueio[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("reuniao_bloqueios")
    .select("data, horario")
    .gte("data", deIso)
    .lte("data", ateIso);
  return ((data ?? []) as { data: string; horario: string | null }[]).map(
    (b) => ({ data: b.data, horario: b.horario ? horaCurta(b.horario) : null }),
  );
}

/**
 * Reuniões agendadas numa janela de datas, com nome do aluno e do cliente —
 * para o calendário do admin. Usa duas consultas (o PostgREST não faz join
 * entre schemas diferentes: aluno vive em public, o agendamento em gps).
 */
export async function getAgendamentosReuniaoRange(
  deIso: string,
  ateIso: string,
): Promise<ReuniaoAgendamentoDetalhe[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("reuniao_agendamentos")
    .select("*")
    .gte("data", deIso)
    .lte("data", ateIso)
    .order("data")
    .order("horario");
  return detalharAgendamentos((data ?? []) as ReuniaoAgendamento[]);
}

/**
 * Todas as solicitações pendentes — a fila de resposta da equipe. Vem de todas
 * as semanas, não só da que está aberta no calendário: uma solicitação para
 * daqui a 3 semanas não pode ficar invisível.
 *
 * Inclui de propósito as de data **vencida**: um aluno que pediu e nunca foi
 * respondido tem de aparecer, não sumir da fila.
 */
export async function getSolicitacoesPendentes(): Promise<
  ReuniaoAgendamentoDetalhe[]
> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("reuniao_agendamentos")
    .select("*")
    .eq("status", "pendente")
    .order("data")
    .order("horario");
  return detalharAgendamentos((data ?? []) as ReuniaoAgendamento[]);
}

/** Quantas solicitações de reunião aguardam resposta (badge do menu do admin). */
export async function contarReunioesPendentes(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .schema("gps")
    .from("reuniao_agendamentos")
    .select("id", { count: "exact", head: true })
    .eq("status", "pendente");
  return count ?? 0;
}

/** Trilha da reunião de um aluno (mais recente primeiro). */
export async function getEventosReuniao(
  alunoId: string,
  limite = 12,
): Promise<ReuniaoEvento[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("reuniao_eventos")
    .select("*")
    .eq("aluno_id", alunoId)
    .order("criado_em", { ascending: false })
    .limit(limite);
  return (data ?? []) as ReuniaoEvento[];
}

/** Junta nome do aluno e do cliente a uma lista de agendamentos. */
async function detalharAgendamentos(
  ags: ReuniaoAgendamento[],
): Promise<ReuniaoAgendamentoDetalhe[]> {
  if (!ags.length) return [];
  const supabase = await createClient();

  const alunoIds = [...new Set(ags.map((a) => a.aluno_id))];
  // cliente_id pode ser null (admin agendou antes de o aluno favoritar).
  const clienteIds = [
    ...new Set(ags.map((a) => a.cliente_id).filter((id): id is string => !!id)),
  ];

  const [{ data: alunos }, { data: clientes }] = await Promise.all([
    supabase
      .from("thb_alunos")
      .select("id, nome, email, telefone")
      .in("id", alunoIds),
    supabase
      .schema("gps")
      .from("etapa1_clientes")
      .select("id, nome")
      .in("id", clienteIds),
  ]);

  const alunoPorId = new Map(
    (
      (alunos ?? []) as {
        id: string;
        nome: string | null;
        email: string | null;
        telefone: string | null;
      }[]
    ).map((a) => [a.id, a]),
  );
  const clientePorId = new Map(
    ((clientes ?? []) as { id: string; nome: string | null }[]).map((c) => [
      c.id,
      c,
    ]),
  );

  return ags.map((a) => ({
    ...a,
    aluno_nome: alunoPorId.get(a.aluno_id)?.nome ?? null,
    aluno_email: alunoPorId.get(a.aluno_id)?.email ?? null,
    aluno_telefone: alunoPorId.get(a.aluno_id)?.telefone ?? null,
    cliente_nome: a.cliente_id
      ? (clientePorId.get(a.cliente_id)?.nome ?? null)
      : null,
  }));
}
