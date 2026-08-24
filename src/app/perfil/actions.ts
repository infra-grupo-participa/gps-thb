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
 * Sem `alunoId`, o aluno logado edita o próprio perfil (`eq user_id` — já é
 * uma linha só, sempre a dele). Com `alunoId`, o admin edita o perfil do
 * TITULAR daquele ambiente (modo assistência).
 *
 * ⚠️ `gps.membros` não tem mais `UNIQUE(aluno_id)`: pode haver várias linhas
 * por ambiente (titular + sócios). Um `update ... eq("aluno_id", alunoId)`
 * casaria todas e sobrescreveria o perfil de todo mundo com o mesmo texto —
 * por isso o modo admin resolve primeiro o `membro_id` do titular e atualiza
 * por ele, nunca por `aluno_id` sozinho.
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

  let query;
  if (alunoId) {
    if (ctx.papel !== "admin") return { erro: "Sem permissão." };

    const { data: titular, error: eTitular } = await supabase
      .schema("gps")
      .from("membros")
      .select("id")
      .eq("aluno_id", alunoId)
      .eq("papel", "titular")
      .maybeSingle();
    if (eTitular) return { erro: eTitular.message };
    if (!titular) return { erro: "Titular do ambiente não encontrado." };

    query = supabase
      .schema("gps")
      .from("membros")
      .update({ perfil: limpo })
      .eq("id", titular.id);
  } else {
    if (ctx.papel !== "aluno") return { erro: "Sem permissão." };
    query = supabase
      .schema("gps")
      .from("membros")
      .update({ perfil: limpo })
      .eq("user_id", ctx.user.id);
  }

  const { data, error } = await query.select("id");
  if (error) return { erro: error.message };
  if (!data || data.length === 0) {
    return { erro: "Perfil não encontrado — nada foi salvo." };
  }

  revalidatePath("/", "layout");
  return {};
}
