"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cadastrar, type CadastroState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CadastroForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<CadastroState, FormData>(
    cadastrar,
    {},
  );

  useEffect(() => {
    if (state.sucesso && !state.precisaConfirmar) {
      router.replace("/");
    }
  }, [state, router]);

  if (state.sucesso && state.precisaConfirmar) {
    return (
      <div className="rounded-md border bg-muted/40 p-4 text-sm">
        <p className="font-medium">Cadastro recebido!</p>
        <p className="mt-1 text-muted-foreground">
          Enviamos um e-mail de confirmação. Confirme seu e-mail e depois faça
          login para acompanhar sua solicitação de acesso.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="nome">Nome completo</Label>
        <Input id="nome" name="nome" required autoFocus />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="voce@exemplo.com"
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="telefone">WhatsApp / Telefone</Label>
        <Input
          id="telefone"
          name="telefone"
          placeholder="(00) 00000-0000"
          autoComplete="tel"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="senha">Senha</Label>
        <Input
          id="senha"
          name="senha"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
        />
      </div>

      {state.erro ? (
        <p className="text-sm text-destructive">{state.erro}</p>
      ) : null}

      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Enviando..." : "Solicitar acesso"}
      </Button>
    </form>
  );
}
