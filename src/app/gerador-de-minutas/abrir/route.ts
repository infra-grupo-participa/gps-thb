import { NextResponse, type NextRequest } from "next/server";
import { getContextoSessao } from "@/lib/auth";
import { ehSessaoIndeterminada } from "@/lib/auth-erros";
import { logErro } from "@/lib/log";
import { GERADOR_DASHBOARD_URL, urlDoGeradorComAcessoUnico } from "@/lib/gerador-sso";

/**
 * "Abrir em tela cheia" do Gerador de minutas (migração …358).
 *
 * O token do iframe é de uso único: reaproveitá-lo no botão falharia. Aqui
 * cada clique gera um token NOVO e responde 302 para `…/sso#t=…`. Uma RPC por
 * clique, nenhuma por página.
 *
 * Mesmas portas de `page.tsx`: sem sessão → `/login`; admin → `/dashboard`
 * simples (o login do gerador é pessoal); erro → `/dashboard` simples.
 * `no-store`: a resposta carrega o token no `Location`. Referer: vale o
 * `strict-origin-when-cross-origin` global do `next.config.ts` (header de rota
 * é sobrescrito por ele, medido em 24/09) — cross-origin sai só a ORIGEM do
 * GPS, que é o que o gerador exige para entrar sozinho (trava de login CSRF,
 * kirad 07/10). O token vai no fragmento, que nunca entra no Referer.
 */
function redirecionar(destino: string | URL): NextResponse {
  const resp = NextResponse.redirect(destino, 302);
  resp.headers.set("Cache-Control", "no-store");
  return resp;
}

export async function GET(request: NextRequest) {
  let ctx;
  try {
    ctx = await getContextoSessao();
  } catch (e) {
    if (!ehSessaoIndeterminada(e)) throw e;
    logErro("gerador-de-minutas/abrir", e, { etapa: "sessao" });
    return redirecionar(new URL("/login", request.url));
  }
  if (!ctx) return redirecionar(new URL("/login", request.url));
  if (ctx.papel !== "aluno" || !ctx.alunoId) return redirecionar(GERADOR_DASHBOARD_URL);

  return redirecionar(await urlDoGeradorComAcessoUnico());
}
