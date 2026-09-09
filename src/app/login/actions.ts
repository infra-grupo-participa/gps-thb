"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { destinoInterno } from "@/lib/nav";

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
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
  });

  if (error) {
    return { erro: "E-mail ou senha inválidos." };
  }

  // `destino` já passou por `destinoInterno()` — sempre caminho interno.
  redirect(destino);
}
