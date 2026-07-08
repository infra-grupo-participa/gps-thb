"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function revalidar(alunoId: string) {
  revalidatePath("/etapa", "layout");
  revalidatePath(`/admin/aluno/${alunoId}`, "layout");
}

// ---- Etapa 03: agendamentos da apresentação do Croqui ----

export async function addAgendamentoEtapa3(alunoId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .from("etapa3_agendamentos")
    .insert({ aluno_id: alunoId })
    .select("*")
    .single();
  if (error) return { erro: error.message };
  revalidar(alunoId);
  return { agendamento: data };
}

export async function atualizarAgendamentoEtapa3(
  id: string,
  alunoId: string,
  patch: {
    descricao?: string | null;
    data?: string | null;
    horario?: string | null;
  },
) {
  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("etapa3_agendamentos")
    .update(patch)
    .eq("id", id);
  if (error) return { erro: error.message };
  revalidar(alunoId);
  return {};
}

export async function removerAgendamentoEtapa3(id: string, alunoId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("etapa3_agendamentos")
    .delete()
    .eq("id", id);
  if (error) return { erro: error.message };
  revalidar(alunoId);
  return {};
}

/** Marca UM agendamento como o que a equipe participa (desmarca os demais). */
export async function definirEquipeParticipa(id: string, alunoId: string) {
  const supabase = await createClient();
  const gps = supabase.schema("gps");

  const { error: e1 } = await gps
    .from("etapa3_agendamentos")
    .update({ equipe_participa: false })
    .eq("aluno_id", alunoId)
    .neq("id", id);
  if (e1) return { erro: e1.message };

  const { error: e2 } = await gps
    .from("etapa3_agendamentos")
    .update({ equipe_participa: true })
    .eq("id", id);
  if (e2) return { erro: e2.message };

  revalidar(alunoId);
  return {};
}

// ---- Etapa 03: dúvidas do parceiro + correções da equipe ----

export async function salvarRevisaoEtapa3(
  alunoId: string,
  patch: { duvidas?: string | null; correcoes?: string | null },
) {
  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("etapa3_revisao")
    .upsert(
      { aluno_id: alunoId, ...patch },
      { onConflict: "aluno_id" },
    );
  if (error) return { erro: error.message };
  revalidar(alunoId);
  return {};
}
