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

  // 🔴 O E-MAIL TEM DE SOBREVIVER AO ERRO (10/09/2026).
  //
  // Caso real: o Helton recebeu login e senha da equipe, digitou, e relatou
  // *"quando digito essa senha apaga o e-mail informado e diz senha ou
  // e-mail não confere"*. A senha estava CERTA — provado direto no GoTrue,
  // que devolveu token. O que falhava era a tela: sem `defaultValue`, o
  // React remonta o formulário a cada retorno da action e o campo volta
  // vazio. A pessoa lê isso como "o sistema apagou o que eu digitei" e
  // conclui que a senha está errada.
  //
  // `state.email` é devolvido pela action SEMPRE que há erro — nunca a
  // senha, que não volta ao cliente em hipótese nenhuma.

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="redirect" value={redirectTo} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          // ⚠️ `type="text"`, não `type="email"`: a validação nativa do
          // navegador REJEITA antes de enviar quando sobra um espaço colado
          // do WhatsApp ou o teclado do celular capitaliza a primeira letra
          // — a tela pisca e nada acontece, sem mensagem nenhuma. O servidor
          // já faz `trim()` e a conferência de verdade é o GoTrue.
          type="text"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="voce@exemplo.com"
          defaultValue={state.email ?? ""}
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

      {/* 🔑 Abaixo do botão, não ao lado do campo de senha: quem chega aqui
          tenta entrar PRIMEIRO e só procura ajuda depois de falhar. E fala
          em "criar a senha", não "redefinir" — 19 dos 137 titulares nunca
          tiveram login, e para eles não há o que redefinir. */}
      <p className="text-center text-sm text-muted-foreground">
        Não consegue entrar?{" "}
        <Link
          href="/resgate"
          className="font-medium text-accent-foreground underline-offset-4 hover:underline"
        >
          Crie sua senha com o código da equipe
        </Link>
      </p>
    </form>
  );
}
