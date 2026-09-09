"use server";

import { emailParaIlike, emailValido } from "@/lib/texto";
import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient as createStatelessClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin } from "@/lib/auth";
import { enviarCredenciaisAcesso } from "@/lib/email";
import { traduzirErroBanco } from "@/lib/erros";
import { logErro } from "@/lib/log";
import type { PapelMembro } from "@/lib/types";

/**
 * Gestão do acesso do aluno pelo painel — sem depender de e-mail e sem
 * `service_role`. O trabalho pesado (mexer em `auth.users`) fica em funções
 * SECURITY DEFINER no schema `gps`, liberadas só para admin
 * (`public.gp_is_admin()`): `admin_status_acesso`, `admin_definir_senha`,
 * `admin_definir_senha_membro`, `admin_excluir_acesso`,
 * `admin_adicionar_socio` e `admin_excluir_membro`.
 * Ver migração `gps_admin_gestao_de_acesso` (e a extensão para sócios), o
 * retrato em `...118` e `...132` (senha do membro).
 */

/** Senha temporária legível para ditar por telefone (ex.: Thb-7f3a-2b9c). */
function gerarSenhaTemporaria(): string {
  const b = randomBytes(4).toString("hex");
  return `Thb-${b.slice(0, 4)}-${b.slice(4)}`;
}

export interface MembroAcesso {
  membroId: string;
  papel: PapelMembro;
  userId: string | null;
  email: string | null;
  temSenha: boolean;
  emailConfirmado: boolean;
  ultimoAcesso: string | null;
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
  /** Ambiente compartilhado: todos os membros (titular + sócios). */
  qtdMembros: number;
  membros: MembroAcesso[];
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

  if (error) {
    return { erro: traduzirErroBanco("admin/statusAcessoAluno", error) };
  }

  const d = data as Record<string, unknown>;
  const membrosRaw = (d.membros as Record<string, unknown>[]) ?? [];
  const membros: MembroAcesso[] = membrosRaw.map((m) => ({
    membroId: String(m.membro_id),
    papel: (m.papel as PapelMembro) ?? "socio",
    userId: (m.user_id as string) ?? null,
    email: (m.email as string) ?? null,
    temSenha: Boolean(m.tem_senha),
    emailConfirmado: Boolean(m.email_confirmado),
    ultimoAcesso: (m.ultimo_acesso as string) ?? null,
  }));

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
      qtdMembros: Number(d.qtd_membros ?? membros.length),
      membros,
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

  if (error) {
    return { erro: traduzirErroBanco("admin/definirSenhaAluno", error) };
  }

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
 * Define a senha de UM MEMBRO do ambiente (o remédio que faltava para o
 * sócio — PL8). `definirSenhaAluno` acima endereça o AMBIENTE e sempre cai no
 * titular (`gps.admin_user_do_aluno`); esta endereça `gps.membros.id`, que é
 * exatamente a linha que o admin clicou em "Gerenciar acesso".
 *
 * Antes disso, a única saída para um sócio travado era removê-lo e
 * re-adicioná-lo — o que APAGA o login e o histórico dele.
 *
 * As guardas ficam todas no banco (`gps.admin_definir_senha_membro`,
 * migração ...132): admin, senha ≥ 8, o membro existe, tem login, não é
 * conta de equipe e não é quem está executando. O `ehAdmin()` daqui é a
 * primeira porta, não a única — quem decide é a RPC.
 *
 * Nome e telefone saem de `thb_alunos` pelo E-MAIL do login: para o sócio,
 * `gps.membros.aluno_id` é o id do AMBIENTE (o titular), então buscar por ele
 * traria o nome errado no e-mail e no link de WhatsApp. Sem cadastro
 * correspondente, os dois voltam nulos e a tela some com o botão de WhatsApp.
 */
export async function definirSenhaMembro(
  membroId: string,
  opts?: { senha?: string; enviarEmail?: boolean; confirmarOutrosSistemas?: boolean },
): Promise<{
  erro?: string;
  email?: string;
  senha?: string;
  emailEnviado?: boolean;
  papel?: PapelMembro;
  telefone?: string | null;
  nome?: string | null;
  /** A conta tem papel em OUTRO sistema do grupo; nada foi alterado. Repita com `confirmarOutrosSistemas: true`. */
  precisaConfirmar?: boolean;
  programas?: string[];
}> {
  if (!(await ehAdmin())) return { erro: "Sem permissão." };

  const senha = opts?.senha?.trim() || gerarSenhaTemporaria();
  if (senha.length < 8) {
    return { erro: "A senha precisa ter ao menos 8 caracteres." };
  }

  const supabase = await createClient();

  // Pentest de 09/09 (MÉDIO): `gps.admin_alvo_e_equipe` só enxerga public.perfis,
  // mas auth.users é compartilhado por 7 sistemas. Antes de trocar a senha (e
  // derrubar as sessões) de uma conta que é privilegiada em OUTRO portal, o admin
  // precisa saber — e confirmar. Nada muda no banco até a confirmação.
  if (opts?.confirmarOutrosSistemas !== true) {
    const { data: membro } = await supabase
      .schema("gps")
      .from("membros")
      .select("aluno_id")
      .eq("id", membroId)
      .maybeSingle();
    if (membro?.aluno_id) {
      const { data: status } = await supabase
        .schema("gps")
        .rpc("admin_status_acesso", { p_aluno_id: membro.aluno_id });
      const emailDoMembro = (
        (status as { membros?: { membro_id: string; email: string | null }[] } | null)?.membros ?? []
      ).find((m) => m.membro_id === membroId)?.email;
      if (emailDoMembro) {
        const { data: prog } = await supabase
          .schema("gps")
          .rpc("admin_programas_do_email", { p_email: emailDoMembro });
        const programas = (
          (prog as { programas?: { programa: string }[] } | null)?.programas ?? []
        )
          .map((x) => x.programa)
          .filter((nome) => nome !== "GPS");
        if (programas.length > 0) {
          return { precisaConfirmar: true, programas };
        }
      }
    }
  }
  const { data, error } = await supabase
    .schema("gps")
    .rpc("admin_definir_senha_membro", {
      p_membro_id: membroId,
      p_senha: senha,
    });

  if (error) {
    return {
      erro: traduzirErroBanco("admin/definirSenhaMembro", error, { membroId }),
    };
  }

  const resultado = (data ?? {}) as {
    email?: string;
    papel?: PapelMembro;
  };
  const email = resultado.email ?? null;
  if (!email) {
    // A senha JÁ trocou (a RPC commitou); o que falta é o e-mail para exibir.
    // Dizer "não foi possível" aqui seria mentira que faz o admin repetir a
    // operação e trocar a senha duas vezes.
    return {
      erro: "Senha definida, mas este login não tem e-mail para exibir.",
    };
  }

  // `ilike` com o e-mail escapado, não `eq`: `thb_alunos.email` é base
  // compartilhada com o sip e guarda o que a pessoa digitou ("Fulano@X.com"),
  // enquanto o login vem sempre em minúsculas do GoTrue. Com `eq` o cadastro
  // não casava e o admin recebia a senha certa com nome e telefone vazios — a
  // tela some com o botão de WhatsApp exatamente quando ele é mais útil.
  const { data: aluno } = await supabase
    .from("thb_alunos")
    .select("nome, telefone")
    .ilike("email", emailParaIlike(email))
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
    papel: resultado.papel,
    nome: aluno?.nome ?? null,
    telefone: aluno?.telefone ?? null,
  };
}

/**
 * Apaga o AMBIENTE INTEIRO: dados do GPS + login de TODOS os membros
 * (titular e sócios) em `auth.users`. O cadastro em `thb_alunos` de cada um
 * permanece — é base compartilhada com o sip. Não confundir com
 * `excluirMembroAluno`, que tira só uma pessoa (sócio) do ambiente.
 */
export async function excluirAcessoAluno(
  alunoId: string,
): Promise<{ erro?: string; loginApagado?: boolean; email?: string | null }> {
  if (!(await ehAdmin())) return { erro: "Sem permissão." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("admin_excluir_acesso", { p_aluno_id: alunoId });

  if (error) {
    return { erro: traduzirErroBanco("admin/excluirAcessoAluno", error) };
  }

  revalidatePath("/admin", "layout");
  return {
    loginApagado: Boolean((data as { login_apagado?: boolean })?.login_apagado),
    email: (data as { email?: string })?.email ?? null,
  };
}

/**
 * Adiciona um sócio ao ambiente: vincula um `thb_aluno` já existente
 * (`p_socio_aluno_id`) como segundo membro do ambiente do titular
 * (`p_ambiente_aluno_id`), com login e senha próprios.
 */
export async function adicionarSocioAluno(
  ambienteAlunoId: string,
  socioAlunoId: string,
  opts?: { email?: string; senha?: string },
): Promise<{
  erro?: string;
  email?: string;
  senha?: string;
  emailEnviado?: boolean;
}> {
  if (!(await ehAdmin())) return { erro: "Sem permissão." };

  const senha = opts?.senha?.trim() || gerarSenhaTemporaria();
  if (senha.length < 8) {
    return { erro: "A senha precisa ter ao menos 8 caracteres." };
  }
  const email = opts?.email?.trim().toLowerCase();
  if (!email || !emailValido(email)) {
    return { erro: "Informe um e-mail válido para o sócio." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.schema("gps").rpc(
    "admin_adicionar_socio",
    {
      p_ambiente_aluno_id: ambienteAlunoId,
      p_socio_aluno_id: socioAlunoId,
      p_email: email,
      p_senha: senha,
    },
  );

  if (error) {
    return { erro: traduzirErroBanco("admin/adicionarSocioAluno", error) };
  }

  const { data: socio } = await supabase
    .from("thb_alunos")
    .select("nome")
    .eq("id", socioAlunoId)
    .maybeSingle();

  const envio = await enviarCredenciaisAcesso({
    para: email,
    nome: socio?.nome ?? null,
    senha,
    precisaConfirmar: false,
  });

  revalidatePath("/admin", "layout");
  return {
    email: (data as { email?: string })?.email ?? email,
    senha,
    emailEnviado: envio.ok,
  };
}

/**
 * Remove UM membro do ambiente (só sócio — a função recusa se `papel` for
 * titular). Apaga o login dele; o ambiente e os demais membros continuam.
 */
export async function excluirMembroAluno(
  membroId: string,
): Promise<{ erro?: string }> {
  if (!(await ehAdmin())) return { erro: "Sem permissão." };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .rpc("admin_excluir_membro", { p_membro_id: membroId });

  if (error) {
    return { erro: traduzirErroBanco("admin/excluirMembroAluno", error, { membroId }) };
  }

  revalidatePath("/admin", "layout");
  return {};
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
  if (error) {
    // Erro do GoTrue, não do Postgres: `traduzirErroBanco` não o conhece. A
    // frase para a tela continua a mesma; o que faltava era a linha no log.
    logErro("admin/enviarRedefinicaoSenha", error, { alunoId });
    return { erro: "Não foi possível enviar o e-mail." };
  }
  return { email: aluno.email };
}
