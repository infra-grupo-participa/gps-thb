/**
 * A origem PÚBLICA do portal, para montar `Location` de redirect.
 *
 * 🔴 POR QUE ISTO EXISTE (23/09/2026, falha em produção)
 *
 * `new URL("/login", request.url)` parecia certo e estava errado: atrás do
 * proxy LiteSpeed da Hostinger, `request.url` traz o host INTERNO do processo
 * Node, não o domínio que o usuário digitou. Medido em produção:
 *
 *   POST /auth/signout  ->  303
 *   Location: https://0.0.0.0:3000/login        ← o navegador não resolve
 *
 * Efeito para quem usa: clicar em "Sair" mandava para um endereço inexistente
 * e a tela morria em erro de navegação. O mesmo valia para o link de redefinir
 * senha quando ele expira (`/auth/confirm` -> `/esqueci-senha?erro=link`), ou
 * seja, justamente o caminho de quem já não consegue entrar.
 *
 * O `logout-button.tsx` já registrava essa armadilha para Server Action e
 * route handler — mas a rota de FALLBACK dele tinha exatamente o defeito que
 * o comentário descrevia.
 *
 * ⚠️ `NEXT_PUBLIC_APP_URL` é a fonte de verdade (é o mesmo valor que os
 * e-mails usam para montar link). Sem ela, cai no host do cabeçalho
 * `x-forwarded-host`, que o proxy preenche, e só então em `request.url`.
 *
 * Não confiar em `x-forwarded-host` sozinho: ele é cabeçalho de requisição e
 * pode ser forjado por quem chama direto. Aqui só serve de segundo recurso, e
 * o destino é sempre um caminho interno fixo — nunca vem do usuário.
 */
export function origemPublica(request: Request): string {
  const configurada = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
  if (configurada) return configurada.replace(/\/+$/, "");

  const encaminhado = request.headers.get("x-forwarded-host");
  if (encaminhado) {
    const protocolo =
      request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
      "https";
    return `${protocolo}://${encaminhado.split(",")[0].trim()}`;
  }

  // Último recurso: o que o Next enxerga. Em produção atrás do proxy isto é o
  // host interno — por isso é o ÚLTIMO, não o primeiro.
  return new URL(request.url).origin;
}
