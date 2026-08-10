"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface LoginState {
  erro?: string;
}

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");
  const destino = String(formData.get("redirect") ?? "/") || "/";

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

  // Só redireciona para caminhos internos.
  redirect(destino.startsWith("/") ? destino : "/");
}

/**
 * Login em duas etapas (decisão do Marcio, 2026-08-10).
 *
 * O aluno digita só o e-mail. Se for **primeiro acesso** (nunca logou ou ainda
 * não tem senha), ele **cria a senha ali mesmo e entra** — sem e-mail de
 * verificação, sem link, sem código. Objetivo: tirar o atrito de quem recebe o
 * link por disparo.
 *
 * ⚠️ Conta que já está em uso NÃO passa por aqui: cai no campo de senha e, se
 * esqueceu, no fluxo de "esqueci minha senha" (com código). A trava não é da
 * tela — é da função `gps.primeiro_acesso_definir_senha` no banco.
 */
export type PassoEmail =
  | { passo: "senha"; email: string }
  | { passo: "criar-senha"; email: string }
  | { passo: "sem-cadastro"; email: string };

export async function verificarEmail(
  email: string,
): Promise<{ erro?: string; resultado?: PassoEmail }> {
  const limpo = email.trim().toLowerCase();
  if (!limpo || !limpo.includes("@")) {
    return { erro: "Informe um e-mail válido." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("login_estado_email", { p_email: limpo });

  if (error) return { erro: "Não foi possível verificar o e-mail." };

  const d = (data ?? {}) as { existe?: boolean; primeiro_acesso?: boolean };
  if (!d.existe) return { resultado: { passo: "sem-cadastro", email: limpo } };
  return {
    resultado: {
      passo: d.primeiro_acesso ? "criar-senha" : "senha",
      email: limpo,
    },
  };
}

/** Cria a senha do primeiro acesso e já entra com ela. */
export async function criarSenhaEEntrar(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const senha = String(formData.get("senha") ?? "");
  const confirma = String(formData.get("confirma") ?? "");
  const destino = String(formData.get("redirect") ?? "/") || "/";

  if (senha.length < 8) return { erro: "A senha precisa ter ao menos 8 caracteres." };
  if (senha !== confirma) return { erro: "As senhas não conferem." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("primeiro_acesso_definir_senha", { p_email: email, p_senha: senha });

  if (error) return { erro: "Não foi possível criar a senha." };

  const res = (data ?? {}) as { ok?: boolean; erro?: string };
  if (!res.ok) return { erro: res.erro ?? "Não foi possível criar a senha." };

  // Senha criada: entra direto, sem pedir para digitar de novo.
  const { error: erroLogin } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
  });
  if (erroLogin) {
    return { erro: "Senha criada, mas o login falhou. Tente entrar novamente." };
  }

  redirect(destino.startsWith("/") ? destino : "/");
}
