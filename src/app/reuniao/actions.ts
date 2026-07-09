"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function revalidar(alunoId: string) {
  revalidatePath("/");
  revalidatePath("/", "layout");
  revalidatePath(`/admin/aluno/${alunoId}`, "layout");
}

/** Admin: disponibiliza uma janela em que a equipe pode participar da reunião. */
export async function adicionarJanela(
  alunoId: string,
  data: string,
  horario: string | null,
) {
  if (!data) return { erro: "Informe a data." };
  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("reuniao_janelas")
    .insert({ aluno_id: alunoId, data, horario: horario?.trim() || null });

  if (error) return { erro: error.message };
  revalidar(alunoId);
  return {};
}

/** Admin: remove uma janela. */
export async function removerJanela(id: string, alunoId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("reuniao_janelas")
    .delete()
    .eq("id", id);

  if (error) return { erro: error.message };
  revalidar(alunoId);
  return {};
}

/**
 * Aluno (ou admin): escolhe a janela que será oferecida ao cliente. No máximo
 * uma escolhida por aluno (respeita o índice único parcial).
 */
export async function escolherJanela(id: string, alunoId: string) {
  const supabase = await createClient();
  const gps = supabase.schema("gps");

  const { error: e1 } = await gps
    .from("reuniao_janelas")
    .update({ escolhida: false })
    .eq("aluno_id", alunoId)
    .eq("escolhida", true);
  if (e1) return { erro: e1.message };

  const { error: e2 } = await gps
    .from("reuniao_janelas")
    .update({ escolhida: true })
    .eq("id", id);
  if (e2) return { erro: e2.message };

  revalidar(alunoId);
  return {};
}
