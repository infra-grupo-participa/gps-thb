"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Logout robusto atrás de proxy (LiteSpeed/Hostinger): encerra a sessão pelo
 * cliente do navegador e navega com recarga total para /login — sem depender de
 * redirect de server action / route handler (que quebravam por causa do host
 * interno do proxy).
 *
 * ⚠️ O MECANISMO NÃO MUDA. O `signOut({ scope: "local" })` no navegador e o
 * `window.location.assign` continuam exatamente como estão — trocá-los por
 * route handler/Server Action já quebrou atrás do proxy uma vez.
 *
 * PF1 — o que mudou é só QUANDO o SDK chega: `@/lib/supabase/client` puxa
 * `AuthClient`/`GoTrue`/`Realtime` (62 KB gzip) e este botão está em TODO
 * `AppHeader`, ou seja, em toda página autenticada. Com o `import()` dentro do
 * handler, esse chunk sai do carregamento inicial e só é buscado por quem
 * clica em "Sair" — uma vez por sessão, com a página já pronta.
 */
export function LogoutButton({
  className,
  linkStyle,
  children = "Sair",
}: {
  className?: string;
  /** aparência de link (para telas sem botão). */
  linkStyle?: boolean;
  children?: React.ReactNode;
}) {
  const [saindo, setSaindo] = useState(false);

  async function sair() {
    setSaindo(true);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      // Escopo LOCAL: encerra só esta sessão. Assim, se mais de uma pessoa
      // está na mesma conta, sair aqui NÃO desloga as outras.
      await createClient().auth.signOut({ scope: "local" });
    } catch {
      // Pentest 09/09 (BAIXO): se o chunk do SDK não baixar, navegar para
      // /login com a sessão ainda viva seria "sair" só na aparência. O
      // fallback é a rota server-side, que limpa os cookies sem depender do
      // SDK no navegador. Só se ELA também falhar é que o usuário fica na
      // tela, avisado — nunca com a impressão falsa de que saiu.
      const ok = await fetch("/auth/signout", {
        method: "POST",
        redirect: "manual",
        credentials: "same-origin",
      })
        .then((r) => r.ok || r.type === "opaqueredirect" || r.status === 0)
        .catch(() => false);
      if (!ok) {
        setSaindo(false);
        window.alert("Não foi possível sair agora. Verifique a conexão e tente de novo.");
        return;
      }
    }
    window.location.assign("/login");
  }

  if (linkStyle) {
    return (
      <button
        type="button"
        onClick={sair}
        disabled={saindo}
        className={className ?? "text-sm text-accent-foreground underline underline-offset-4"}
      >
        {saindo ? "Saindo..." : children}
      </button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={sair}
      disabled={saindo}
      className={className}
    >
      {saindo ? "Saindo..." : children}
    </Button>
  );
}
