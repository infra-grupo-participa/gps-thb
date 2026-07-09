"use server";

import { createClient as createStatelessClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getContextoSessao } from "@/lib/auth";

/** Envia ao aluno o e-mail de redefinição de senha (fluxo de recuperação do Supabase). */
export async function enviarRedefinicaoSenha(alunoId: string) {
  const ctx = await getContextoSessao();
  if (ctx?.papel !== "admin") return { erro: "Sem permissão." };

  const supabase = await createClient();
  const { data: aluno } = await supabase
    .from("thb_alunos")
    .select("email")
    .eq("id", alunoId)
    .maybeSingle();
  if (!aluno?.email) return { erro: "Este aluno não tem e-mail cadastrado." };

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://programa.timeholdingbrasil.com.br"
  ).replace(/\/+$/, "");

  const sb = createStatelessClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { error } = await sb.auth.resetPasswordForEmail(aluno.email, {
    redirectTo: `${appUrl}/auth/confirm?next=/auth/redefinir`,
  });
  if (error) return { erro: "Não foi possível enviar o e-mail." };
  return { email: aluno.email };
}
