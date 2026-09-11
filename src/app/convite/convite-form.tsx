"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { aceitarConvite } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputSenha } from "@/components/ui/input-senha";
import { SENHA_MINIMO } from "@/lib/senha-regras";

/**
 * Aceite do convite: e-mail + senha. O token chega da URL (`?t=`) e vai num
 * campo oculto — nunca em cookie, nunca em estado do componente que
 * sobreviva além desta tela.
 */
export function ConviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [state, formAction, pendente] = useActionState(aceitarConvite, {});

  useEffect(() => {
    if (state.ok) {
      router.replace("/login?ok=convite");
    }
  }, [state.ok, router]);

  if (state.ok) {
    return (
      <p className="text-sm text-muted-foreground">
        Conta criada! Levando você para a entrada…
      </p>
    );
  }

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="token" value={token} />

      <div className="grid gap-2">
        <Label htmlFor="email">Seu e-mail</Label>
        <Input
          id="email"
          name="email"
          type="text"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="email"
          placeholder="voce@exemplo.com"
          required
          autoFocus
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="senha">Crie sua senha</Label>
        <InputSenha
          id="senha"
          name="senha"
          autoComplete="new-password"
          placeholder={`Mínimo de ${SENHA_MINIMO} caracteres`}
          required
          minLength={SENHA_MINIMO}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="confirmar">Repita a senha</Label>
        <InputSenha id="confirmar" name="confirmar" autoComplete="new-password" required />
      </div>

      {state.erro ? (
        <p role="alert" className="text-sm text-destructive">
          {state.erro}
        </p>
      ) : null}

      <Button type="submit" disabled={pendente}>
        {pendente ? "Criando conta…" : "Aceitar convite e criar minha conta"}
      </Button>
    </form>
  );
}
