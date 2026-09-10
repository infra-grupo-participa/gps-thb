"use server";

import { createClient } from "@/lib/supabase/server";
import { normalizarEmail, normalizarSenhaColada } from "@/lib/texto";
import { documentoValido, soDigitos } from "@/lib/masks";
import { MSG_SENHA_MINIMO, SENHA_MINIMO } from "@/lib/senha-regras";

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
  // Mesmo tratamento do /login: o que vem colado do WhatsApp traz espaço
  // não separável e invisíveis que derrubam a comparação sem dar pista.
  const email = normalizarEmail(String(formData.get("email") ?? ""));
  const telefone = String(formData.get("telefone") ?? "").trim();
  const senha = normalizarSenhaColada(String(formData.get("senha") ?? ""));
  const documentoRaw = String(formData.get("documento") ?? "");
  const documento = soDigitos(documentoRaw);

  if (!email || !senha || !documento) {
    return { erro: "Preencha e-mail, CPF/CNPJ e senha." };
  }
  if (documento.length !== 11 && documento.length !== 14) {
    return { erro: "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido." };
  }
  // Dígito verificador, a MESMA regra do cadastro pelo admin
  // (`documentoValido` em `src/lib/masks.ts`). Sem ela, um CPF de 11 dígitos
  // digitado errado passava aqui e só falhava depois, no vínculo por
  // documento: a pessoa virava solicitação pendente sem entender por quê.
  if (!documentoValido(documento)) {
    return { erro: "CPF/CNPJ inválido — confira os dígitos." };
  }
  // O MESMO mínimo do formulário (`cadastro-form.tsx`) e dos outros 4 caminhos
  // de senha — o servidor aceitava 6 enquanto a tela pedia 8.
  if (senha.length < SENHA_MINIMO) {
    return { erro: MSG_SENHA_MINIMO };
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
