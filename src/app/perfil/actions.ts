"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { PerfilAluno } from "@/lib/types";

const CAMPOS: (keyof PerfilAluno)[] = [
  "telefone",
  "profissao",
  "cidade",
  "estado",
  "bio",
  "instagram",
  "youtube",
  "linkedin",
  "facebook",
  "site",
];

export async function salvarPerfilAluno(perfil: PerfilAluno) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erro: "Não autenticado." };

  // Sanitiza: mantém só os campos conhecidos, sem vazios.
  const limpo: PerfilAluno = {};
  for (const c of CAMPOS) {
    const v = (perfil[c] ?? "").toString().trim();
    if (v) limpo[c] = v;
  }

  const { error } = await supabase
    .schema("gps")
    .from("membros")
    .update({ perfil: limpo })
    .eq("user_id", user.id);
  if (error) return { erro: error.message };

  revalidatePath("/", "layout");
  return {};
}
