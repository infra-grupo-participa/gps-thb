import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { origemPublica } from "@/lib/origem-publica";

/**
 * Fallback server-side do "Sair".
 *
 * Quem chama é o `catch` de `logout-button.tsx` (e o `auto-logout`), quando o
 * chunk do SDK do Supabase não baixa e o `signOut` no navegador não acontece.
 * É o MESMO ato de sair — logo, o MESMO escopo.
 *
 * 🔑 `scope: "local"` encerra só ESTA sessão. Sem ele o `signOut()` do
 * servidor é GLOBAL e revoga os refresh tokens de todos os dispositivos:
 * o titular que clica em "Sair" no celular derrubaria o sócio no computador —
 * e derrubaria a si mesmo nos outros portais do grupo, porque `auth.users` é
 * compartilhado. O caminho normal já usa `local`; o fallback fazia o contrário
 * justamente na hora em que o usuário não escolheu nada diferente.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  // 🔴 `origemPublica`, nunca `request.url` (23/09/2026): atrás do proxy da
  // Hostinger o `request.url` traz o host INTERNO, e o `Location` saía como
  // `https://0.0.0.0:3000/login` — endereço que o navegador não resolve.
  // Medido em produção: era isto que fazia "Sair" morrer em tela de erro.
  return NextResponse.redirect(new URL("/login", origemPublica(request)), {
    status: 303,
  });
}
