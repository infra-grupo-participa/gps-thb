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
        <Label htmlFor="senha">Senha</Label>
        <InputSenha
          id="senha"
          name="senha"
          autoComplete="current-password"
          required
        />
        {/* 🔑 A ORIENTAÇÃO FICA AQUI, embaixo do campo — é onde a dúvida
            acontece, não num aviso no rodapé que ninguém lê.
            Sutil de propósito: quem já tem senha não pode achar que precisa
            trocar de caminho. Por isso "primeiro acesso", e não um convite
            a todo mundo usar o código. */}
        <p className="corpo-sm text-muted-foreground">
          Primeiro acesso ou esqueceu a senha? Use o código que a equipe
          passou aqui mesmo, neste campo.
        </p>
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

      {/* 🔑 AS DUAS VIAS, LADO A LADO E EXPLICADAS (10/09/2026).
          Abaixo do botão, não ao lado do campo: quem chega aqui tenta entrar
          PRIMEIRO e só procura ajuda depois de falhar.

          Cada uma resolve um caso diferente, e a diferença precisa estar
          ESCRITA — senão a pessoa escolhe a errada e conclui que o sistema
          não funciona:

          · e-mail  → para quem TEM conta e esqueceu a senha. Depende de o
                      e-mail chegar (SMTP embutido do Supabase; entrega
                      baixa, pendência F.5 do projeto).
          · código  → resolve na hora, sem depender de e-mail, e CRIA a conta
                      para quem nunca teve. Medido em 10/09: 12 titulares
                      sem login nenhum, todos com CPF — todos se resolvem
                      por aqui. */}
      {/* Discreto: o caminho principal agora é o próprio campo de senha
          acima. Estes ficam para quem prefere outro jeito. */}
      <p className="text-center corpo-sm text-muted-foreground">
        <Link
          href="/esqueci-senha"
          className="underline-offset-4 hover:text-accent-foreground hover:underline"
        >
          Receber um link por e-mail
        </Link>
        {" · "}
        <Link
          href="/resgate"
          className="underline-offset-4 hover:text-accent-foreground hover:underline"
        >
          Recuperar com e-mail e CPF
        </Link>
      </p>
    </form>
  );
}
