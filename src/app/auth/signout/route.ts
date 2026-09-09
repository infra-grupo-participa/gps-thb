import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  return NextResponse.redirect(new URL("/login", request.url), {
    status: 303,
  });
}
