"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * PF1 — por que `import()` no submit e NÃO Server Action.
 *
 * As duas tiram os 62 KB gzip do SDK do carregamento inicial (medido: o chunk
 * some da lista de `<script>` que o HTML de `/esqueci-senha` pede). A Server
 * Action, porém, mudaria o mecanismo: o `redirectTo` do link de redefinição
 * passaria a ser montado no servidor, a partir de env ou de header de origem —
 * exatamente a classe de coisa que já quebrou atrás do proxy LiteSpeed da
 * Hostinger (ver o comentário do `logout-button.tsx`). Aqui o
 * `window.location.origin` é a fonte da verdade e funciona igual em local,
 * preview e produção. Mesmo número de KB, menos risco: fica o `import()`.
 */
export function EsqueciForm() {
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const { error } = await createClient().auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        {
          redirectTo: `${window.location.origin}/auth/confirm?next=/auth/redefinir`,
        },
      );
      if (error) {
        setErro("Não foi possível enviar. Tente novamente em instantes.");
        return;
      }
      setEnviado(true);
    } catch {
      // O `import()` acontece na hora do clique: se a rede cair entre abrir a
      // página e enviar, o chunk não baixa e a promessa rejeita. Sem este
      // `catch` o botão voltaria ao normal sem dizer nada.
      setErro("Não foi possível enviar. Tente novamente em instantes.");
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      // PL13 — a frase condicional ("se existir uma conta") FICA: dizer
      // "enviamos" confirmaria a existência do e-mail para quem estivesse
      // sondando a base. O que faltava era o prazo: o envio sai pelo SMTP
      // embutido do Supabase (baixa entrega, limite por hora), e a pessoa que
      // não recebia em 10 segundos concluía que o portal estava quebrado.
      <div role="status" className="rounded-md border bg-muted/40 p-4 text-sm">
        <p className="font-medium">Verifique seu e-mail</p>
        <p className="mt-1 text-muted-foreground">
          Se existir uma conta com <strong>{email}</strong>, enviamos um link
          para você criar uma nova senha. Pode levar alguns minutos; confira o
          spam.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-mail da conta</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@exemplo.com"
          required
          autoFocus
        />
      </div>
      {/* Anunciado pelo leitor de tela (WCAG 3.3.1 / 4.1.3). */}
      {erro ? (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      ) : null}
      <Button type="submit" disabled={enviando} className="mt-2">
        {enviando ? "Enviando..." : "Enviar link de redefinição"}
      </Button>
    </form>
  );
}
