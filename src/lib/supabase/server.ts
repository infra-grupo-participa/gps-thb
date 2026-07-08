import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cliente Supabase para uso no servidor (Server Components, Route Handlers,
 * Server Actions). Lê/escreve a sessão nos cookies da requisição.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Chamado a partir de um Server Component — pode ser ignorado se
            // houver middleware atualizando a sessão do usuário.
          }
        },
      },
    },
  );
}
