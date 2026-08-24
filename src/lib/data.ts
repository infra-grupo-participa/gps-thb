import { createClient } from "@/lib/supabase/server";
import { calcularMetricasEtapa1 } from "@/lib/etapa1";
import type {
  Aluno,
  Ambiente,
  ClienteEtapa1,
  Etapa,
  Membro,
  ModoEnfase,
  ProgressoTarefa,
  AgendaItem,
  AgendaItemComAluno,
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

/**
 * O ambiente do GPS (pasta do Drive, data de agendamento). Um por
 * `aluno_id` titular, compartilhado por todos os membros — não usar
 * `gps.membros` para esses campos, senão o sócio lê `null`.
 */
export async function getAmbiente(alunoId: string): Promise<Ambiente | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("ambientes")
    .select("aluno_id, pasta_drive_url, data_agendamento_disponivel, criado_em, atualizado_em")
    .eq("aluno_id", alunoId)
    .maybeSingle();
  return (data as Ambiente) ?? null;
}

/** O registro de `gps.membros` da PESSOA logada (identidade + perfil próprio). */
export async function getMembroDoUsuario(
  userId: string,
): Promise<Membro | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("membros")
    .select("id, aluno_id, user_id, papel, perfil")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as Membro) ?? null;
}

/** Todos os membros (titular + sócios) de um ambiente. */
export async function getMembrosDoAmbiente(
  alunoId: string,
): Promise<Membro[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("membros")
    .select("id, aluno_id, user_id, papel, perfil")
    .eq("aluno_id", alunoId)
    .order("papel", { ascending: true });
  return (data ?? []) as Membro[];
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
  alunoId: string;
  temLogin: boolean;
  qtdMembros: number;
  aluno: Aluno | null;
  pct: number;
  clientesPreenchidos: number;
  agendados: number;
}

/**
 * Lista os AMBIENTES vinculados ao GPS (um por `aluno_id` titular) com um
 * resumo da Etapa 01. `gps.membros` agora tem N linhas por ambiente (titular
 * + sócios) — agrupa por `aluno_id`, senão o painel mostra o mesmo ambiente
 * repetido e infla os `.in()` a seguir.
 */
export async function getAlunosGps(): Promise<AlunoGps[]> {
  const supabase = await createClient();

  const { data: membros } = await supabase
    .schema("gps")
    .from("membros")
    .select("aluno_id, user_id, criado_em")
    .order("criado_em", { ascending: false });

  const lista = (membros ?? []) as {
    aluno_id: string;
    user_id: string | null;
    criado_em: string;
  }[];
  if (lista.length === 0) return [];

  // Agrupa por ambiente, preservando a ordem (ambiente mais recente primeiro).
  const porAmbiente = new Map<
    string,
    { user_id: string | null; criado_em: string }[]
  >();
  for (const m of lista) {
    const arr = porAmbiente.get(m.aluno_id) ?? [];
    arr.push({ user_id: m.user_id, criado_em: m.criado_em });
    porAmbiente.set(m.aluno_id, arr);
  }
  const alunoIds = [...porAmbiente.keys()];

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

  return alunoIds.map((alunoId) => {
    const membrosDoAmbiente = porAmbiente.get(alunoId)!;
    const cs = ((clientes ?? []) as ClienteEtapa1[]).filter(
      (c) => c.aluno_id === alunoId,
    );
    const manual: Record<number, boolean> = {};
    for (const p of (progresso ?? []) as ProgressoTarefa[]) {
      if (p.aluno_id === alunoId) manual[p.tarefa] = p.concluida;
    }
    const m = calcularMetricasEtapa1(cs, manual);
    return {
      alunoId,
      temLogin: membrosDoAmbiente.some((mb) => mb.user_id),
      qtdMembros: membrosDoAmbiente.length,
      aluno: alunosMap.get(alunoId) ?? null,
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

/** Agenda pessoal do aluno, do mais próximo ao mais distante. */
export async function getAgenda(alunoId: string): Promise<AgendaItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("agenda")
    .select("*")
    .eq("aluno_id", alunoId)
    .order("data")
    .order("horario", { nullsFirst: true });
  return (data ?? []) as AgendaItem[];
}

/**
 * O que os alunos agendaram, de `deIso` em diante — visão de LEITURA do admin.
 * Duas consultas porque o PostgREST não faz join entre schemas: a agenda vive
 * em `gps` e o aluno em `public`.
 */
export async function getAgendaDeTodos(
  deIso: string,
): Promise<AgendaItemComAluno[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("agenda")
    .select("*")
    .gte("data", deIso)
    .order("data")
    .order("horario", { nullsFirst: true });

  const itens = (data ?? []) as AgendaItem[];
  if (!itens.length) return [];

  const alunoIds = [...new Set(itens.map((i) => i.aluno_id))];
  const { data: alunos } = await supabase
    .from("thb_alunos")
    .select("id, nome")
    .in("id", alunoIds);

  const nomePorId = new Map(
    ((alunos ?? []) as { id: string; nome: string | null }[]).map((a) => [
      a.id,
      a.nome,
    ]),
  );
  return itens.map((i) => ({
    ...i,
    aluno_nome: nomePorId.get(i.aluno_id) ?? null,
  }));
}
