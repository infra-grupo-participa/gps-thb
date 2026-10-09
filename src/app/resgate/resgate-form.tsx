"use client";

/**
 * As duas etapas do resgate, numa tela só.
 *
 * 🔑 UMA TELA, DOIS PASSOS — não duas rotas. O token de resgate vale 15
 * minutos e é de uso único: mandá-lo pela URL o exporia no histórico do
 * navegador e no `Referer`. Ele fica no estado do componente e some quando
 * a aba fecha, que é exatamente a vida útil que ele deveria ter.
 *
 * A pessoa que chega aqui é a que JÁ não conseguiu entrar. Cada campo diz
 * onde encontrar o que se pede, e a mensagem de erro é a mesma para
 * qualquer recusa — o servidor não conta qual dos três dados falhou (senão
 * daria para descobrir quem tem cadastro testando e-mails com o código).
 */

import { useActionState, useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { iniciarResgate, concluirResgate } from "./actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputSenha } from "@/components/ui/input-senha";
import { mascaraCpfCnpj } from "@/lib/masks";
import { SENHA_MINIMO } from "@/lib/senha-regras";

export function ResgateForm() {
  const [token, setToken] = useState<string | null>(null);
  const [documento, setDocumento] = useState("");

  const [passo1, agirPasso1, pendente1] = useActionState<
    { erro?: string },
    FormData
  >(async (estado, form) => {
    const r = await iniciarResgate(estado, form);
    if (r.token) setToken(r.token);
    return { erro: r.erro };
  }, {});

  const [passo2, agirPasso2, pendente2] = useActionState<
    { erro?: string; ok?: boolean; email?: string },
    FormData
  >(concluirResgate, {});

  // ─── Pronto ────────────────────────────────────────────────────────────
  if (passo2.ok) {
    return (
      <div className="grid gap-4">
        <div className="flex items-start gap-3 rounded-xl border border-borda-fina bg-superficie-afundada p-4">
          <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-sucesso-foreground" />
          <div className="grid gap-1">
            <p className="corpo font-medium">Senha criada.</p>
            <p className="text-base text-muted-foreground">
              Agora entre com {passo2.email ? <strong>{passo2.email}</strong> : "seu e-mail"} e a
              nova senha.
            </p>
          </div>
        </div>
        {/* `Button` deste repo não tem `asChild` — o padrão da casa para
            "link com cara de botão" é `buttonVariants` no `Link`. */}
        <Link href="/login" className={buttonVariants()}>
          Entrar
        </Link>
      </div>
    );
  }

  // ─── Passo 2: escolher a senha ─────────────────────────────────────────
  if (token) {
    return (
      <form action={agirPasso2} className="grid gap-4">
        <input type="hidden" name="token" value={token} />

        <div className="grid gap-2">
          <Label htmlFor="senha">Nova senha</Label>
          <InputSenha id="senha" name="senha" autoComplete="new-password" required autoFocus />
          <p className="text-base text-muted-foreground">
            Mínimo de {SENHA_MINIMO} caracteres.
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="confirmar">Repita a senha</Label>
          <InputSenha id="confirmar" name="confirmar" autoComplete="new-password" required />
        </div>

        {passo2.erro ? (
          <p role="alert" className="text-base text-risco-foreground">
            {passo2.erro}
          </p>
        ) : null}

        <Button type="submit" disabled={pendente2}>
          {pendente2 ? "Salvando…" : "Criar senha e entrar"}
        </Button>

        {/* ⚠️ O prazo é dito ANTES de a pessoa descobrir no clique. */}
        <p className="text-base text-muted-foreground">
          Você tem 15 minutos para concluir.
        </p>
      </form>
    );
  }

  // ─── Passo 1: provar quem é ────────────────────────────────────────────
  return (
    <form action={agirPasso1} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="codigo">Código de acesso</Label>
        <Input
          id="codigo"
          name="codigo"
          inputMode="numeric"
          autoComplete="off"
          placeholder="O código que a equipe divulgou"
          required
          autoFocus
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="email">Seu e-mail</Label>
        <Input
          id="email"
          name="email"
          // Mesma lição do /login (10/09/2026): `type="email"` rejeita no
          // navegador, sem mensagem, quando sobra espaço colado do WhatsApp
          // ou o teclado do celular capitaliza. O servidor normaliza.
          type="text"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="email"
          placeholder="voce@exemplo.com"
          required
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="documento">Seu CPF</Label>
        <Input
          id="documento"
          name="documento"
          inputMode="numeric"
          autoComplete="off"
          placeholder="000.000.000-00"
          value={documento}
          onChange={(e) => setDocumento(mascaraCpfCnpj(e.target.value))}
          required
        />
      </div>

      {passo1.erro ? (
        <p role="alert" className="text-base text-risco-foreground">
          {passo1.erro}
        </p>
      ) : null}

      <Button type="submit" disabled={pendente1}>
        {pendente1 ? "Conferindo…" : "Continuar"}
      </Button>
    </form>
  );
}
