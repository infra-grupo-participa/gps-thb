"use server";

/**
 * Resgate de acesso — "não consigo entrar", resolvido pela própria pessoa.
 *
 * Pedido do Marcio (10/09/2026): *"se elas digitarem 1 a 8 (12345678), elas
 * podem redefinir sua senha... ele será avisado no grupo"* e *"independente
 * se ele tem senha ou não... ele vai poder mudar a senha e acessar o sistema
 * sozinho"*.
 *
 * 🔑 O CÓDIGO NÃO É SENHA. Ele não entra em `auth.users` e não abre nada —
 * só diz "existe um caminho de resgate" e leva à tela de criar a senha.
 * Quem confirma a identidade são o **e-mail** e o **CPF**.
 *
 * 🔴 O CPF É O QUE SEGURA A PORTA. O código vai ser anunciado no grupo, ou
 * seja, é público entre os alunos por desenho. Sem a segunda prova, um
 * aluno trocaria a senha de um colega sabendo só o e-mail — e como
 * `auth.users` é dos 7 sistemas do grupo, derrubaria o dono no Workbook, na
 * Rede e na Central junto.
 *
 * Toda a regra vive no banco (`gps.resgate_iniciar` / `gps.resgate_concluir`,
 * migração `…237`): interruptor sem deploy, rate limit por IP, recusa de
 * conta da equipe, token de uso único e a criação do login para quem nunca
 * teve. Estas actions só carregam o IP e traduzem o erro.
 */

import { headers } from "next/headers";
import { createClient as createStatelessClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { traduzirErroBanco } from "@/lib/erros";
import { normalizarEmail, normalizarSenhaColada } from "@/lib/texto";
import { SENHA_MINIMO, MSG_SENHA_MINIMO } from "@/lib/senha-regras";

/**
 * Cliente sem sessão: o resgate acontece por quem NÃO está logado, e o
 * caminho não pode depender de cookie nenhum.
 */
function anon() {
  return createStatelessClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * O IP, em hash — é balde de rate limit, não identificação de pessoa.
 *
 * ⚠️ Atrás do proxy LiteSpeed da Hostinger o IP real vem em
 * `x-forwarded-for`; `x-real-ip` é o fallback. Sem IP nenhum a RPC usa um
 * balde comum ('sem-ip') em vez de deixar passar sem limite.
 */
async function ipHash(): Promise<string | null> {
  const h = await headers();
  const bruto = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip");
  if (!bruto) return null;
  return createHash("sha256").update(bruto).digest("hex").slice(0, 32);
}

export async function iniciarResgate(
  _estado: unknown,
  form: FormData,
): Promise<{ erro?: string; token?: string }> {
  const codigo = String(form.get("codigo") ?? "").trim();
  // Quem chega no resgate é quem JÁ não conseguiu entrar — é a última tela
  // que pode recusar por espaço invisível colado do WhatsApp.
  const email = normalizarEmail(String(form.get("email") ?? ""));
  const documento = String(form.get("documento") ?? "").trim();

  if (!codigo || !email || !documento) {
    return { erro: "Preencha o código, o e-mail e o CPF." };
  }

  const { data, error } = await anon().schema("gps").rpc("resgate_iniciar", {
    p_codigo: codigo,
    p_email: email,
    p_documento: documento,
    p_ip_hash: await ipHash(),
  });

  if (error) {
    // 🔑 O e-mail vai para o LOG (`traduzirErroBanco` o registra), nunca
    // para a tela: a frase de recusa é genérica de propósito — código
    // errado, e-mail inexistente, CPF errado e conta de equipe dizem a
    // mesma coisa. Frases distintas deixariam descobrir quem tem cadastro
    // testando e-mails com o código do grupo.
    return { erro: traduzirErroBanco("resgate/iniciar", error, { email }) };
  }

  const token = (data as { token?: string } | null)?.token;
  if (!token) return { erro: "Não confere. Confira o código, o e-mail e o CPF." };
  return { token };
}

export async function concluirResgate(
  _estado: unknown,
  form: FormData,
): Promise<{ erro?: string; ok?: boolean; email?: string }> {
  const token = String(form.get("token") ?? "");
  const senha = normalizarSenhaColada(String(form.get("senha") ?? ""));
  const confirmar = String(form.get("confirmar") ?? "");

  if (senha.length < SENHA_MINIMO) return { erro: MSG_SENHA_MINIMO };
  // A conferência das duas senhas mora AQUI e não no banco: é erro de
  // digitação, não regra de negócio — e a pessoa precisa da resposta sem
  // gastar o token, que é de uso único.
  if (senha !== confirmar) return { erro: "As duas senhas não são iguais." };

  const { data, error } = await anon().schema("gps").rpc("resgate_concluir", {
    p_token: token,
    p_senha: senha,
  });

  if (error) {
    return { erro: traduzirErroBanco("resgate/concluir", error) };
  }

  return { ok: true, email: (data as { email?: string } | null)?.email };
}
