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

  if (state.sucesso) {
    return (
      <div className="rounded-md border bg-muted/40 p-4 text-sm">
        <p className="font-medium">Cadastro concluído!</p>
        <p className="mt-1 text-muted-foreground">
          {state.precisaConfirmar
            ? "Enviamos um e-mail de confirmação. Confirme seu e-mail e faça login para acessar o programa."
            : "Redirecionando para o seu portal..."}
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="documento">CPF ou CNPJ</Label>
        <Input
          id="documento"
          name="documento"
          inputMode="numeric"
          placeholder="Somente números"
          required
          autoFocus
        />
        <p className="text-xs text-muted-foreground">
          Usamos seu CPF/CNPJ para localizar seu cadastro no Time Holding Brasil.
        </p>
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
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">
          Não é aluno ainda? Informe seus dados
        </summary>
        <div className="mt-3 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="nome">Nome completo</Label>
            <Input id="nome" name="nome" />
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
        </div>
      </details>

      {state.erro ? (
        <p className="text-sm text-destructive">{state.erro}</p>
      ) : null}

      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Criando..." : "Criar minha conta"}
      </Button>
    </form>
  );
}
