import { createClient } from "@/lib/supabase/server";
import type { Papel, Perfil } from "@/lib/types";
import type { User } from "@supabase/supabase-js";

export interface ContextoSessao {
  user: User;
  papel: Papel;
  perfil: Perfil | null;
  /** aluno_id quando o usuário é um aluno (via gps.membros). */
  alunoId: string | null;
}

/**
 * Resolve o usuário autenticado e seu papel no GPS.
 * - admin: consta em public.perfis com cargo dev/admin e status ativo.
 * - aluno: consta em gps.membros (vínculo com um thb_aluno).
 * - sem_acesso: autenticado, mas sem vínculo.
 * Retorna null se não houver sessão.
 */
export async function getContextoSessao(): Promise<ContextoSessao | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Admin?
  const { data: perfil } = await supabase
    .from("perfis")
    .select("id, nome, email, cargo, status")
    .eq("id", user.id)
    .maybeSingle();

  if (
    perfil &&
    perfil.status === "ativo" &&
    (perfil.cargo === "dev" || perfil.cargo === "admin")
  ) {
    return { user, papel: "admin", perfil, alunoId: null };
  }

  // Aluno?
  const { data: membro } = await supabase
    .schema("gps")
    .from("membros")
    .select("aluno_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (membro) {
    return {
      user,
      papel: "aluno",
      perfil: null,
      alunoId: membro.aluno_id,
    };
  }

  return { user, papel: "sem_acesso", perfil: null, alunoId: null };
}
