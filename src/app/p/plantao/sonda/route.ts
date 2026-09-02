/**
 * Plantão de Dúvidas — Acelera Holding. Sonda de cookie bloqueado.
 *
 * ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
 * (commit b457005) e PROIBIDO de reconstruir.
 *
 * Embedado em iframe de terceiro (Hotmart), o cookie `gps_plantao_sessao`
 * (`SameSite=None; Partitioned`) pode ser bloqueado pelo navegador do aluno
 * (modo privado, extensão, política de terceiros). Sem isso, a UI não
 * distingue "senha errada" de "cookie bloqueado" e o aluno entra em loop de
 * login. Fluxo: GET grava um cookie de teste com os MESMOS atributos do
 * cookie de sessão; POST verifica se ele voltou na requisição.
 */

import { NextResponse, type NextRequest } from "next/server";

const COOKIE_TESTE = "gps_plantao_sonda";

const COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: "none" as const,
  partitioned: true,
  path: "/p",
  maxAge: 60, // 1 minuto — só para o teste de ida e volta
};

export async function GET() {
  const resposta = NextResponse.json({ ok: true });
  resposta.cookies.set(COOKIE_TESTE, "1", COOKIE_OPTS);
  return resposta;
}

export async function POST(request: NextRequest) {
  const voltou = request.cookies.get(COOKIE_TESTE)?.value === "1";
  const resposta = NextResponse.json({ cookieOk: voltou });
  // Limpa o cookie de teste independentemente do resultado.
  resposta.cookies.delete({ name: COOKIE_TESTE, path: "/p" });
  return resposta;
}
