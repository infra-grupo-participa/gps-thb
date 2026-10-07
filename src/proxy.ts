import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Todas as rotas, exceto assets estáticos, imagens e o service worker
     * dos avisos (`/sw.js`): o navegador rebusca o script sem sessão e
     * recusa registro/atualização atrás de redirect para o /login.
     */
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
