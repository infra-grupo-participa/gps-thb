"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { traduzirErroBanco } from "@/lib/erros";

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
    // Colunas explícitas, não `select("*")`: o egress do Supabase é teto da
    // ORGANIZAÇÃO, dividido com o `sip`. É a regra da casa desde 09/09 e
    // esta linha era a única sobra — ficou de fora da varredura porque mora
    // em `src/app/`, e a limpeza olhou `src/lib/data/**`.
    // Espelha `Etapa3Agendamento` (`src/lib/types.ts`).
    .select(
      "id, aluno_id, cliente_id, descricao, data, horario, equipe_participa, criado_em",
    )
    .single();
  if (error) return { erro: traduzirErroBanco("etapa3/addAgendamento", error) };
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
  if (error) {
    return { erro: traduzirErroBanco("etapa3/atualizarAgendamento", error) };
  }
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
  if (error) {
    return { erro: traduzirErroBanco("etapa3/removerAgendamento", error) };
  }
  revalidar(alunoId);
  return {};
}

/**
 * Marca UM agendamento como a apresentação principal (desmarca os demais).
 * A coluna `equipe_participa` foi mantida por compatibilidade com o banco; hoje
 * significa apenas o destaque pessoal do aluno, sem promessa de presença da equipe.
 */
export async function definirEquipeParticipa(id: string, alunoId: string) {
  const supabase = await createClient();
  const gps = supabase.schema("gps");

  const { error: e1 } = await gps
    .from("etapa3_agendamentos")
    .update({ equipe_participa: false })
    .eq("aluno_id", alunoId)
    .neq("id", id);
  if (e1) return { erro: traduzirErroBanco("etapa3/definirEquipeParticipa", e1) };

  const { error: e2 } = await gps
    .from("etapa3_agendamentos")
    .update({ equipe_participa: true })
    .eq("id", id);
  if (e2) return { erro: traduzirErroBanco("etapa3/definirEquipeParticipa", e2) };

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
  if (error) return { erro: traduzirErroBanco("etapa3/salvarRevisao", error) };
  revalidar(alunoId);
  return {};
}
