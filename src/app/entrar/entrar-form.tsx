"use client";

/**
 * E-mail + código, e entra. Dois campos, um botão.
 *
 * Pedido do Marcio (10/09/2026): *"assim que eles colocarem essa senha,
 * independente se tem acesso ou não, ele pode alterar a senha depois de
 * logado; se ele já fez o onboarding, ele pula direto pra tela inicial"*.
 *
 * 🔑 O redirecionamento é do CLIENTE, não da action. `redirect()` funciona
 * lançando uma exceção, e dentro de `useActionState` isso vira "rota não
 * encontrada" — foi exatamente o que quebrou a troca de contas hoje mais
 * cedo. A action devolve `ok: true` e quem navega é este componente.
 *
 * `router.refresh()` antes do `replace`: sem ele o layout ainda carrega o
 * estado de deslogado e o portal pisca a tela de login antes de abrir.
 */

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { entrarPeloCodigo, type EntrarState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function EntrarForm({ destino }: { destino: string }) {
  const router = useRouter();
  const [state, agir, pendente] = useActionState<EntrarState, FormData>(
    entrarPeloCodigo,
    {},
  );

  useEffect(() => {
    if (state.ok) {
      router.refresh();
      router.replace(destino);
    }
  }, [state.ok, destino, router]);

  return (
    <form action={agir} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="email">Seu e-mail</Label>
        <Input
          id="email"
          name="email"
          // `type="text"`, não `email`: a validação nativa do navegador
          // rejeita, sem mensagem, quando sobra um espaço colado do WhatsApp.
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
        <p className="corpo-sm text-muted-foreground">
          O mesmo e-mail que você usou na compra do programa.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="codigo">Código de acesso</Label>
        <Input
          id="codigo"
          name="codigo"
          inputMode="numeric"
          autoComplete="off"
          placeholder="O código que a equipe passou"
          required
        />
      </div>

      {state.erro ? (
        <p role="alert" className="corpo-sm text-risco-foreground">
          {state.erro}
        </p>
      ) : null}

      <Button type="submit" disabled={pendente || state.ok}>
        {pendente || state.ok ? "Entrando…" : "Entrar"}
      </Button>

      <p className="text-center corpo-sm text-muted-foreground">
        Já tem uma senha?{" "}
        <Link
          href="/login"
          className="font-medium text-accent-foreground underline-offset-4 hover:underline"
        >
          Entrar com e-mail e senha
        </Link>
      </p>
    </form>
  );
}
