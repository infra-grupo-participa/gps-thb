"use server";

import { createClient } from "@/lib/supabase/server";

export interface CadastroState {
  erro?: string;
  sucesso?: boolean;
  precisaConfirmar?: boolean;
}

export async function cadastrar(
  _prev: CadastroState,
  formData: FormData,
): Promise<CadastroState> {
  const nome = String(formData.get("nome") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const telefone = String(formData.get("telefone") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");

  if (!nome || !email || !senha) {
    return { erro: "Preencha nome, e-mail e senha." };
  }
  if (senha.length < 6) {
    return { erro: "A senha deve ter ao menos 6 caracteres." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: senha,
    options: {
      data: { nome, telefone, origem: "gps" },
    },
  });

  if (error) {
    if (error.code === "user_already_exists" || error.status === 422) {
      return {
        erro: "Já existe uma conta com este e-mail. Tente entrar.",
      };
    }
    return { erro: "Não foi possível concluir o cadastro. Tente novamente." };
  }

  // Sem sessão => o projeto exige confirmação de e-mail.
  if (!data.session) {
    return { sucesso: true, precisaConfirmar: true };
  }

  return { sucesso: true, precisaConfirmar: false };
}
