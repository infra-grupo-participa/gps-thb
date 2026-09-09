"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, type LoginState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputSenha } from "@/components/ui/input-senha";
import { Label } from "@/components/ui/label";

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    login,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="redirect" value={redirectTo} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="voce@exemplo.com"
          required
          autoFocus
        />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="senha">Senha</Label>
          <Link
            href="/esqueci-senha"
            className="text-xs text-muted-foreground underline-offset-4 hover:text-accent-foreground hover:underline"
          >
            Esqueci minha senha
          </Link>
        </div>
        <InputSenha
          id="senha"
          name="senha"
          autoComplete="current-password"
          required
        />
      </div>

      {/* `role="alert"` — sem ele o leitor de tela nunca anuncia a falha de
          login: o texto aparece na tela e o usuário cego fica sem retorno
          nenhum ao enviar o formulário (WCAG 3.3.1 / 4.1.3). */}
      {state.erro ? (
        <p role="alert" className="text-sm text-destructive">
          {state.erro}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}
