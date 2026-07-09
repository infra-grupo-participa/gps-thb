import { createClient } from "@/lib/supabase/server";
import { calcularMetricasEtapa1 } from "@/lib/etapa1";
import type {
  Aluno,
  ClienteEtapa1,
  Etapa,
  Membro,
  ProgressoTarefa,
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
      "id, nome, email, telefone, turma_id, plano, status_acesso, eh_socio",
    )
    .eq("id", alunoId)
    .maybeSingle();
  return (data as Aluno) ?? null;
}

export async function getMembro(alunoId: string): Promise<Membro | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("membros")
    .select(
      "id, aluno_id, user_id, data_agendamento_disponivel, pasta_drive_url",
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

export async function getDocumentos(clienteId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("documentos")
    .select("*")
    .eq("cliente_id", clienteId)
    .order("criado_em", { ascending: false });
  return data ?? [];
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
