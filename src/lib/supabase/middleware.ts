import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Atualiza a sessão do Supabase a cada requisição e protege rotas.
 * Rotas públicas: /login, /auth/*, assets, /p/* (Plantão de Dúvidas — tem
 * identidade PRÓPRIA, isolada de `auth.users`; ver `src/lib/plantao-tipos.ts`).
 * Todo o resto exige sessão.
 *
 * ⚠️ `/p/` com a barra: sem a barra, `pathname.startsWith("/p")` tornaria
 * `/perfil` e `/pasta` públicas também.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANTE: não colocar código entre createServerClient e getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic =
    pathname === "/login" ||
    pathname === "/cadastro" ||
    pathname === "/esqueci-senha" ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    // Plantão de Dúvidas: rota pública embedada em iframe na Hotmart, com
    // login próprio (cookie gps_plantao_sessao), fora do Supabase Auth.
    pathname.startsWith("/p/") ||
    // Job diário do plantão, chamado por pg_cron via HTTP — sem sessão
    // Supabase, por definição. Sem esta linha o proxy devolvia 307 para
    // /login ANTES do handler rodar, e o pg_net não segue redirect nem
    // acusa erro: o job falharia em silêncio para sempre (NPS nunca
    // enviado, sessões e eventos nunca expurgados).
    //
    // ⚠️ Rota EXATA, nunca o prefixo `/api/`: a rota se protege sozinha
    // pelo header `x-plantao-segredo` mais o segredo conferido dentro das
    // RPCs. Liberar `/api/` inteiro abriria o que vier depois.
    pathname === "/api/plantao/manutencao";

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
