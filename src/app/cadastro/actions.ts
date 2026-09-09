"use server";

import { createClient } from "@/lib/supabase/server";
import { soDigitos } from "@/lib/masks";

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
  const documentoRaw = String(formData.get("documento") ?? "");
  const documento = soDigitos(documentoRaw);

  if (!email || !senha || !documento) {
    return { erro: "Preencha e-mail, CPF/CNPJ e senha." };
  }
  if (documento.length !== 11 && documento.length !== 14) {
    return { erro: "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido." };
  }
  if (senha.length < 6) {
    return { erro: "A senha deve ter ao menos 6 caracteres." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: senha,
    options: {
      data: { nome, telefone, documento, origem: "gps" },
    },
  });

  if (error) {
    // Enumeração de conta: "Já existe uma conta com este e-mail" confirmava,
    // para quem não está logado, que aquele e-mail tem cadastro no portal —
    // basta um CPF de formato válido para varrer uma lista. O texto abaixo
    // não afirma que a conta existe; oferece a saída (entrar / recuperar
    // senha) de um jeito que serve tanto para quem já tem conta quanto para
    // quem errou o dado.
    if (error.code === "user_already_exists" || error.status === 422) {
      return {
        erro:
          "Não foi possível criar a conta com estes dados. Se você já tem acesso ao portal, entre pela tela de login ou use “Esqueci minha senha”.",
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
