"use server";

/**
 * Aceite do convite de sócio — rota PÚBLICA (`/convite?t=<token>`), sem
 * sessão. Molde de `src/app/resgate/actions.ts`: cliente Supabase sem
 * cookie, porque quem chega aqui ainda não tem conta.
 *
 * Contrato com o banco (outro agente, em paralelo):
 *   gps.socio_convite_aceitar(p_token, p_email, p_senha) — PÚBLICA.
 *
 * Decisão #5 do plano da feature (Marcio, 11/09/2026): sócio que já tem
 * login no grupo é INSTRUÍDO A ENTRAR com a senha atual — nunca adotado. A
 * tela não tenta adivinhar isso; é a RPC quem recusa e devolve a frase certa,
 * traduzida por `traduzirErroBanco`.
 */

import { createClient as createStatelessClient } from "@supabase/supabase-js";
import { normalizarEmail, normalizarSenhaColada } from "@/lib/texto";
import { SENHA_MINIMO, MSG_SENHA_MINIMO } from "@/lib/senha-regras";
import { traduzirErroBanco } from "@/lib/erros";

function anon() {
  return createStatelessClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export interface AceitarConviteResultado {
  erro?: string;
  ok?: boolean;
}

export async function aceitarConvite(
  _prev: unknown,
  formData: FormData,
): Promise<AceitarConviteResultado> {
  const token = String(formData.get("token") ?? "").trim();
  const email = normalizarEmail(String(formData.get("email") ?? ""));
  const senha = normalizarSenhaColada(String(formData.get("senha") ?? ""));
  const confirmar = normalizarSenhaColada(String(formData.get("confirmar") ?? ""));

  if (!token) {
    return { erro: "Este link de convite não é válido. Peça um novo ao seu titular." };
  }
  if (!email || !senha) {
    return { erro: "Preencha o e-mail e a senha." };
  }
  if (senha.length < SENHA_MINIMO) {
    return { erro: MSG_SENHA_MINIMO };
  }
  // Conferência das duas senhas mora AQUI (erro de digitação), não no banco —
  // mesmo padrão de `concluirResgate`.
  if (senha !== confirmar) {
    return { erro: "As duas senhas não são iguais." };
  }

  const { error } = await anon().schema("gps").rpc("socio_convite_aceitar", {
    p_token: token,
    p_email: email,
    p_senha: senha,
  });

  if (error) {
    return { erro: traduzirErroBanco("convite/aceitar", error, { email }) };
  }

  return { ok: true };
}
