"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContextoSessao } from "@/lib/auth";
import { ehSessaoIndeterminada } from "@/lib/auth-erros";
import { traduzirErroBanco, MSG_SESSAO_INDETERMINADA } from "@/lib/erros";

/** Libera ou bloqueia uma etapa para todos os alunos (gps.etapas). */
export async function definirEtapaLiberada(
  etapaId: number,
  liberada: boolean,
) {
  let ctx;
  try {
    ctx = await getContextoSessao();
  } catch (e) {
    if (!ehSessaoIndeterminada(e)) throw e;
    return { erro: MSG_SESSAO_INDETERMINADA };
  }
  if (ctx?.papel !== "admin") return { erro: "Sem permissão." };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("etapas")
    .update({ liberada })
    .eq("id", etapaId);
  if (error) {
    return { erro: traduzirErroBanco("admin/definirEtapaLiberada", error, { etapaId }) };
  }

  revalidatePath("/", "layout");
  return {};
}
