"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient as createStatelessClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getContextoSessao } from "@/lib/auth";
import { enviarCredenciaisAcesso } from "@/lib/email";

/**
 * Gestão do acesso do aluno pelo painel — sem depender de e-mail e sem
 * `service_role`. O trabalho pesado (mexer em `auth.users`) fica em funções
 * SECURITY DEFINER no schema `gps`, liberadas só para admin
 * (`public.gp_is_admin()`): `admin_status_acesso`, `admin_definir_senha` e
 * `admin_excluir_acesso`. Ver migração `gps_admin_gestao_de_acesso`.
 */

async function ehAdmin(): Promise<boolean> {
  const ctx = await getContextoSessao();
  return ctx?.papel === "admin";
}

/** Senha temporária legível para ditar por telefone (ex.: Thb-7f3a-2b9c). */
function gerarSenhaTemporaria(): string {
  const b = randomBytes(4).toString("hex");
  return `Thb-${b.slice(0, 4)}-${b.slice(4)}`;
}

export interface StatusAcesso {
  temLogin: boolean;
  emailCadastro: string | null;
  emailLogin: string | null;
  emailBate: boolean;
  emailConfirmado: boolean;
  temSenha: boolean;
  ultimoAcesso: string | null;
  noGps: boolean;
  vinculoCompleto: boolean;
  solicitacaoPendente: boolean;
}

/** Diagnóstico do acesso: mostra exatamente onde o aluno trava. */
export async function statusAcessoAluno(
  alunoId: string,
): Promise<{ erro?: string; status?: StatusAcesso }> {
  if (!(await ehAdmin())) return { erro: "Sem permissão." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("admin_status_acesso", { p_aluno_id: alunoId });

  if (error) return { erro: error.message };

  const d = data as Record<string, unknown>;
  return {
    status: {
      temLogin: Boolean(d.tem_login),
      emailCadastro: (d.email_cadastro as string) ?? null,
      emailLogin: (d.email_login as string) ?? null,
      emailBate: Boolean(d.email_bate),
      emailConfirmado: Boolean(d.email_confirmado),
      temSenha: Boolean(d.tem_senha),
      ultimoAcesso: (d.ultimo_acesso as string) ?? null,
      noGps: Boolean(d.no_gps),
      vinculoCompleto: Boolean(d.vinculo_completo),
      solicitacaoPendente: Boolean(d.solicitacao_pendente),
    },
  };
}

/**
 * Define a senha do aluno na hora e devolve as credenciais para o admin
 * repassar. Também confirma o e-mail, derruba as sessões antigas e garante o
 * vínculo aluno ⇄ login. O e-mail é só cortesia: se não sair, o acesso já
 * está valendo do mesmo jeito.
 */
export async function definirSenhaAluno(
  alunoId: string,
  opts?: { senha?: string; enviarEmail?: boolean },
): Promise<{
  erro?: string;
  email?: string;
  senha?: string;
  emailEnviado?: boolean;
  telefone?: string | null;
  nome?: string | null;
}> {
  if (!(await ehAdmin())) return { erro: "Sem permissão." };

  const senha = opts?.senha?.trim() || gerarSenhaTemporaria();
  if (senha.length < 8) {
    return { erro: "A senha precisa ter ao menos 8 caracteres." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("admin_definir_senha", { p_aluno_id: alunoId, p_senha: senha });

  if (error) return { erro: error.message };

  const email = (data as { email?: string })?.email ?? null;
  if (!email) return { erro: "Não foi possível identificar o login do aluno." };

  const { data: aluno } = await supabase
    .from("thb_alunos")
    .select("nome, telefone")
    .eq("id", alunoId)
    .maybeSingle();

  let emailEnviado = false;
  if (opts?.enviarEmail !== false) {
    const envio = await enviarCredenciaisAcesso({
      para: email,
      nome: aluno?.nome ?? null,
      senha,
      precisaConfirmar: false,
    });
    emailEnviado = envio.ok;
  }

  revalidatePath("/admin", "layout");
  return {
    email,
    senha,
    emailEnviado,
    nome: aluno?.nome ?? null,
    telefone: aluno?.telefone ?? null,
  };
}

/**
 * Apaga o acesso por completo: dados do GPS + login (`auth.users`).
 * O cadastro em `thb_alunos` permanece — é base compartilhada com o sip.
 */
export async function excluirAcessoAluno(
  alunoId: string,
): Promise<{ erro?: string; loginApagado?: boolean; email?: string | null }> {
  if (!(await ehAdmin())) return { erro: "Sem permissão." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("admin_excluir_acesso", { p_aluno_id: alunoId });

  if (error) return { erro: error.message };

  revalidatePath("/admin", "layout");
  return {
    loginApagado: Boolean((data as { login_apagado?: boolean })?.login_apagado),
    email: (data as { email?: string })?.email ?? null,
  };
}

/** Envia ao aluno o e-mail de redefinição de senha (fluxo do Supabase). */
export async function enviarRedefinicaoSenha(alunoId: string) {
  if (!(await ehAdmin())) return { erro: "Sem permissão." };

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
