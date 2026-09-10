import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { destinoInterno } from "@/lib/nav";
import { logErro } from "@/lib/log";

/**
 * Confirma links de e-mail do Supabase (recuperação de senha, etc.).
 * Aceita tanto o fluxo PKCE (`code`) quanto o de token_hash (`token_hash`+`type`).
 *
 * 🔒 `next` passa por `destinoInterno()` — o MESMO validador do `/login`. O
 * teste anterior (`next.startsWith("/")`) aceitava `//evil.com` e `/\evil.com`,
 * que o browser resolve como host externo: open redirect numa rota PÚBLICA
 * cujo link chega por e-mail. Ter duas regras para a mesma pergunta era o
 * defeito; agora é uma só, com os testes de `src/lib/nav.ts`.
 *
 * 🔴 ERRO NÃO É SILÊNCIO. Link expirado ou já usado devolvia `code`/`token_hash`
 * inválido, o erro era descartado e a pessoa caía no formulário de nova senha
 * SEM sessão: digitava duas vezes para só então descobrir. Agora a falha
 * redireciona para `/esqueci-senha?erro=link`, onde ela pede outro link.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = destinoInterno(searchParams.get("next"));

  const supabase = await createClient();

  const resultado = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
      : null;

  if (!resultado || resultado.error) {
    // Sem PII no log: `type` é um enum do GoTrue, nunca o token nem o e-mail.
    logErro("auth/confirm", resultado?.error ?? "link sem code nem token_hash", {
      fluxo: code ? "code" : tokenHash ? "token_hash" : "ausente",
      tipo: type ?? null,
    });
    return NextResponse.redirect(new URL("/esqueci-senha?erro=link", origin));
  }

  return NextResponse.redirect(new URL(next, origin));
}
