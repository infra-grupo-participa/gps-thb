"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

/**
 * Logout robusto atrás de proxy (LiteSpeed/Hostinger): encerra a sessão pelo
 * cliente do navegador e navega com recarga total para /login — sem depender de
 * redirect de server action / route handler (que quebravam por causa do host
 * interno do proxy).
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
  const supabase = createClient();
  const [saindo, setSaindo] = useState(false);

  async function sair() {
    setSaindo(true);
    try {
      await supabase.auth.signOut();
    } finally {
      window.location.assign("/login");
    }
  }

  if (linkStyle) {
    return (
      <button
        type="button"
        onClick={sair}
        disabled={saindo}
        className={className ?? "text-sm text-primary underline"}
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
