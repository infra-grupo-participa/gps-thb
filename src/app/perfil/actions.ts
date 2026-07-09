"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContextoSessao } from "@/lib/auth";
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

/**
 * Salva o perfil em `gps.membros.perfil`.
 *
 * Sem `alunoId`, o aluno logado edita o próprio perfil. Com `alunoId`, o admin
 * edita o perfil daquele aluno (modo assistência).
 *
 * O `select()` no fim não é decorativo: um update que não casa nenhuma linha
 * volta sem erro. Sem conferir a linha afetada, um admin (que não tem registro
 * em `gps.membros`) veria "perfil salvo" sem nada ter sido gravado.
 */
export async function salvarPerfilAluno(
  perfil: PerfilAluno,
  alunoId?: string,
) {
  const ctx = await getContextoSessao();
  if (!ctx) return { erro: "Não autenticado." };

  const supabase = await createClient();

  // Sanitiza: mantém só os campos conhecidos, sem vazios.
  const limpo: PerfilAluno = {};
  for (const c of CAMPOS) {
    const v = (perfil[c] ?? "").toString().trim();
    if (v) limpo[c] = v;
  }

  const update = supabase.schema("gps").from("membros").update({
    perfil: limpo,
  });

  const query = alunoId
    ? ctx.papel === "admin"
      ? update.eq("aluno_id", alunoId)
      : null
    : ctx.papel === "aluno"
      ? update.eq("user_id", ctx.user.id)
      : null;

  if (!query) return { erro: "Sem permissão." };

  const { data, error } = await query.select("aluno_id");
  if (error) return { erro: error.message };
  if (!data || data.length === 0) {
    return { erro: "Perfil não encontrado — nada foi salvo." };
  }

  revalidatePath("/", "layout");
  return {};
}
