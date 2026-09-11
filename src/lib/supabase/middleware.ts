import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
// `@/lib/nav` só importa TIPOS (`import type`) e exporta funções puras: nada
// dele vai parar no bundle do proxy além do próprio validador.
import { destinoInterno } from "@/lib/nav";

/**
 * Atualiza a sessão do Supabase a cada requisição e protege rotas.
 * Rotas públicas: /login, /resgate, /entrar, /convite, /auth/*, assets, /p/*
 * (Plantão de Dúvidas — tem identidade PRÓPRIA, isolada de `auth.users`; ver
 * `src/lib/plantao-tipos.ts`). Todo o resto exige sessão.
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

  const { pathname } = request.nextUrl;
  const isPublic =
    pathname === "/login" ||
    pathname === "/cadastro" ||
    pathname === "/esqueci-senha" ||
    // 🔑 O resgate TEM de ser público: quem chega nele é justamente quem não
    // consegue logar. Se cair na guarda de sessão, o proxy manda para o
    // `/login` e a tela vira inalcançável para o seu único público.
    pathname === "/resgate" ||
    // 🔑 `/entrar` é a porta principal durante o evento de acessos: e-mail +
    // código do grupo, sem senha. Se cair na guarda de sessão, o proxy manda
    // para o `/login` e a tela vira inalcançável para quem ela atende.
    pathname === "/entrar" ||
    // 🔴 Feature Equipe (11/09/2026): quem chega em `/convite?t=<token>` é
    // exatamente quem AINDA NÃO TEM CONTA no portal — o convidado a virar
    // sócio. Se cair na guarda de sessão, o proxy manda para `/login` e o
    // link do e-mail vira inalcançável para o único público que ele atende.
    pathname === "/convite" ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    // Plantão de Dúvidas: rota pública embedada em iframe na Hotmart, com
    // rota PÚBLICA de verdade desde 08/09/2026: sem login, sem cookie, sem
    // sessão. A identidade é o e-mail, conferido dentro das RPCs.
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

  // ═══════════════════════════════════════════════════════════════════════
  // 🔑 ROTA PÚBLICA NÃO PAGA A IDA AO GoTrue (10/09/2026)
  // ═══════════════════════════════════════════════════════════════════════
  //
  // `getUser()` é uma REQUISIÇÃO DE REDE ao GoTrue — medido em 10/09:
  // ~390 ms, constantes. Até aqui ela rodava ANTES desta linha, ou seja,
  // `/resgate`, `/cadastro`, `/esqueci-senha` e `/p/plantao` pagavam esse
  // custo sem ter o que fazer com o resultado.
  //
  // Pior que a lentidão: é essa chamada que aparece no log de produção como
  // `failed to get redirect response TypeError: fetch failed`. Quando a rede
  // da Hostinger engasga, ela derrubava o `/p/plantao` (que fica embedado na
  // Hotmart, para 421 pessoas) e o `/resgate`, que existe justamente para
  // quem não consegue entrar — as duas telas que menos podem depender de
  // uma consulta de sessão que elas nem usam.
  //
  // ⚠️ DUAS PÚBLICAS CONTINUAM CHAMANDO — e pular qualquer uma delas quebra
  //    comportamento de verdade:
  //
  //    `/login`  — precisa saber se já há sessão para mandar quem já entrou
  //                para o destino, em vez de mostrar o formulário de novo.
  //    `/auth/*` — é ONDE o token do e-mail vira sessão (`/auth/confirm`,
  //                `/auth/redefinir`). Sem o `getUser()`, os cookies novos
  //                não são gravados por `setAll` e o link de redefinir senha
  //                pararia de funcionar.
  //
  //    O que sai da rede é o resto: `/resgate`, `/cadastro`,
  //    `/esqueci-senha`, `/p/plantao`, `/favicon.ico`, `/_next/*` e o job
  //    do plantão — nenhum deles usa `user` para nada.
  const publicaQuePrecisaDeSessao =
    pathname === "/login" || pathname.startsWith("/auth");

  if (isPublic && !publicaQuePrecisaDeSessao) return supabaseResponse;

  // IMPORTANTE: não colocar código entre createServerClient e getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Já logado abrindo `/login?redirect=/clientes`: honra o destino do link em
  // vez de jogar em "/". `destinoInterno()` é o MESMO validador do formulário
  // de login (`src/lib/nav.ts`) — `//evil.com`, `/\evil.com` e esquema no meio
  // do caminho caem em "/", então o parâmetro não vira open redirect.
  // `new URL(destino, request.url)` preserva query e hash do destino.
  if (user && pathname === "/login") {
    const destino = destinoInterno(request.nextUrl.searchParams.get("redirect"));
    return NextResponse.redirect(new URL(destino, request.url));
  }

  return supabaseResponse;
}
