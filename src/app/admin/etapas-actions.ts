"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContextoSessao } from "@/lib/auth";

/** Libera ou bloqueia uma etapa para todos os alunos (gps.etapas). */
export async function definirEtapaLiberada(
  etapaId: number,
  liberada: boolean,
) {
  const ctx = await getContextoSessao();
  if (ctx?.papel !== "admin") return { erro: "Sem permissão." };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("etapas")
    .update({ liberada })
    .eq("id", etapaId);
  if (error) return { erro: error.message };

  revalidatePath("/", "layout");
  return {};
}
