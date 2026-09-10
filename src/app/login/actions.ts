"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { destinoInterno } from "@/lib/nav";
import { guardarConta } from "@/lib/contas-do-navegador";
import { nomeDoUsuario } from "@/lib/nome-do-usuario";

export interface LoginState {
  erro?: string;
}

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");
  // Campo oculto do formulário = input do cliente. Revalidar aqui, mesmo
  // que a página já tenha sanitizado ao montar o campo.
  const destino = destinoInterno(String(formData.get("redirect") ?? ""));

  if (!email || !senha) {
    return { erro: "Informe e-mail e senha." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
  });

  if (error) {
    return { erro: "E-mail ou senha inválidos." };
  }

  // Entrou: a conta passa a ficar disponível no menu "trocar de conta" deste
  // navegador, por 7 dias de inatividade. Falha aqui NÃO derruba o login —
  // pior caso é a conta não aparecer no menu e a pessoa digitar a senha de
  // novo, que é exatamente o que acontecia antes desta feature existir.
  try {
    if (data.session?.refresh_token && data.user) {
      await guardarConta({
        userId: data.user.id,
        email: data.user.email ?? email,
        nome: await nomeDoUsuario(supabase, data.user.id),
        refreshToken: data.session.refresh_token,
      });
    }
  } catch {
    // silencioso por desenho — ver acima
  }

  // `destino` já passou por `destinoInterno()` — sempre caminho interno.
  redirect(destino);
}
