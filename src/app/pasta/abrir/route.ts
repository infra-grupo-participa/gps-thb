import { NextResponse, type NextRequest } from "next/server";
import { getContextoSessao } from "@/lib/auth";
import { ehSessaoIndeterminada } from "@/lib/auth-erros";
import { logErro } from "@/lib/log";
import { getAmbiente } from "@/lib/data";
import { ehUrlDoDrive } from "@/lib/pasta";

/**
 * Destino da aba "Pasta" do aluno (25/09/2026, pedido do João): a aba abre em
 * NOVA aba do navegador e cai direto na pasta do Drive do ambiente.
 *
 * - Sem sessão → `/login` (o proxy já barra; aqui é a segunda trava).
 * - Admin → `/admin` (a pasta dele é por aluno, na assistência).
 * - Aluno sem link → `/pasta`, que mostra "sua pasta está sendo preparada".
 *
 * Redirect 307 (padrão do `NextResponse.redirect`). Uma consulta por CLIQUE,
 * nenhuma por página: por isso o link do Drive não vai direto no `href` da aba — isso custaria ler `gps.ambientes` em toda
 * tela do aluno só para pintar o menu.
 *
 * 🔴 A URL vem do banco, mas é reconferida (`ehUrlDoDrive`) antes do
 * redirect: sem isso, um valor gravado fora da action de admin viraria
 * redirecionamento aberto para qualquer domínio.
 */
export async function GET(request: NextRequest) {
  let ctx;
  try {
    ctx = await getContextoSessao();
  } catch (e) {
    if (!ehSessaoIndeterminada(e)) throw e;
    // Mesmo molde de `clientes/.../documento/.../route.ts`: sessão que não se
    // resolve nunca vira acesso — e não pode virar 500 numa aba nova.
    logErro("pasta/abrir", e, { etapa: "sessao" });
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (!ctx) return NextResponse.redirect(new URL("/login", request.url));
  if (ctx.papel === "admin") return NextResponse.redirect(new URL("/admin", request.url));
  if (ctx.papel !== "aluno" || !ctx.alunoId) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const ambiente = await getAmbiente(ctx.alunoId);
  const url = ambiente?.pasta_drive_url;
  if (url && ehUrlDoDrive(url)) return NextResponse.redirect(url);
  if (url) {
    // Link gravado fora do formato: a equipe vê o link na assistência e o
    // aluno vê "sendo preparada". Sem este log, ninguém descobre.
    logErro("pasta/abrir", new Error("pasta_drive_url fora do formato do Drive"), {
      alunoId: ctx.alunoId,
    });
  }

  return NextResponse.redirect(new URL("/pasta", request.url));
}
