"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { destinoInterno } from "@/lib/nav";
import { normalizarEmail, normalizarSenhaColada } from "@/lib/texto";
import { guardarConta } from "@/lib/contas-do-navegador";
import { nomeDoUsuario } from "@/lib/nome-do-usuario";

export interface LoginState {
  erro?: string;
  /**
   * O e-mail digitado, devolvido para o formulário reexibir quando dá erro.
   *
   * 🔴 Sem isto o campo voltava VAZIO a cada tentativa: o React remonta o
   * formulário no retorno da action. Caso real de 10/09/2026 (Helton):
   * *"quando digito essa senha apaga o e-mail informado e diz senha ou
   * e-mail não confere"* — com a senha CERTA, provado direto no GoTrue.
   *
   * ⚠️ A SENHA NUNCA volta aqui. Só o e-mail.
   */
  email?: string;
}

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  // 🔑 TOLERANTE AO QUE A PESSOA COLA. A equipe manda login e senha por
  // WhatsApp; o que chega vem com espaço no fim, espaço não separável
  // (U+00A0, que o WhatsApp insere), letra maiúscula do teclado do celular
  // e, às vezes, caracteres invisíveis de formatação.
  //
  // O GoTrue casa o e-mail em minúsculas, então normalizar aqui é o que faz
  // a diferença entre "entrou" e "e-mail ou senha inválidos" para alguém que
  // digitou tudo certo.
  const email = normalizarEmail(String(formData.get("email") ?? ""));
  // ⚠️ A SENHA NÃO é normalizada: espaço pode fazer parte dela de propósito.
  // Só os invisíveis de formatação saem, que ninguém digita por vontade.
  const senha = normalizarSenhaColada(String(formData.get("senha") ?? ""));
  // Campo oculto do formulário = input do cliente. Revalidar aqui, mesmo
  // que a página já tenha sanitizado ao montar o campo.
  const destino = destinoInterno(String(formData.get("redirect") ?? ""));

  if (!email || !senha) {
    return { erro: "Informe e-mail e senha.", email };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
  });

  if (error) {
    // O e-mail volta para o campo: quem errou a senha não redigita o e-mail,
    // e quem errou o e-mail vê o que de fato mandou.
    return { erro: "E-mail ou senha inválidos.", email };
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
