import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * O nome de exibição de um login — para o menu "trocar de conta".
 *
 * O nome mora em dois lugares, conforme o papel: `public.perfis` (equipe) e
 * `public.thb_alunos` (aluno). Esta função tenta os dois na ordem e devolve
 * `null` quando não acha — o menu então mostra o e-mail, que sempre existe.
 *
 * 🔑 Nunca lança. É chamada no caminho do LOGIN: uma falha aqui não pode
 * impedir alguém de entrar no portal. O pior caso é o menu exibir o e-mail
 * em vez do nome.
 */
export async function nomeDoUsuario(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  try {
    const { data: perfil } = await supabase
      .from("perfis")
      .select("nome")
      .eq("id", userId)
      .maybeSingle();
    const nomePerfil = (perfil as { nome?: string | null } | null)?.nome;
    if (nomePerfil && nomePerfil.trim()) return nomePerfil.trim();

    // Aluno: o nome está em `thb_alunos`, alcançado pelo vínculo do membro.
    const { data: membro } = await supabase
      .schema("gps")
      .from("membros")
      .select("pessoa_aluno_id")
      .eq("user_id", userId)
      .not("pessoa_aluno_id", "is", null)
      .limit(1)
      .maybeSingle();
    const pessoa = (membro as { pessoa_aluno_id?: string | null } | null)
      ?.pessoa_aluno_id;
    if (!pessoa) return null;

    const { data: aluno } = await supabase
      .from("thb_alunos")
      .select("nome")
      .eq("id", pessoa)
      .maybeSingle();
    const nomeAluno = (aluno as { nome?: string | null } | null)?.nome;
    return nomeAluno && nomeAluno.trim() ? nomeAluno.trim() : null;
  } catch {
    return null;
  }
}
