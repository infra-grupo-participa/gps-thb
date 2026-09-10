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
            <p className="corpo-sm text-muted-foreground">
              Agora entre com {passo2.email ? <strong>{passo2.email}</strong> : "seu e-mail"} e a
              senha que você acabou de escolher.
            </p>
          </div>
        </div>
        {/* `Button` deste repo não tem `asChild` — o padrão da casa para
            "link com cara de botão" é `buttonVariants` no `Link`. */}
        <Link href="/login" className={buttonVariants()}>
          Ir para a entrada
        </Link>
      </div>
    );
  }

  // ─── Passo 2: escolher a senha ─────────────────────────────────────────
  if (token) {
    return (
      <form action={agirPasso2} className="grid gap-4">
        <input type="hidden" name="token" value={token} />

        <p className="corpo-sm text-muted-foreground">
          Confirmamos que é você. Agora escolha a sua senha — ela é só sua, e ninguém da equipe a
          vê.
        </p>

        <div className="grid gap-2">
          <Label htmlFor="senha">Nova senha</Label>
          <InputSenha id="senha" name="senha" autoComplete="new-password" required autoFocus />
          <p className="corpo-sm text-muted-foreground">
            Ao menos {SENHA_MINIMO} caracteres.
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="confirmar">Repita a senha</Label>
          <InputSenha id="confirmar" name="confirmar" autoComplete="new-password" required />
        </div>

        {passo2.erro ? (
          <p role="alert" className="corpo-sm text-risco-foreground">
            {passo2.erro}
          </p>
        ) : null}

        <Button type="submit" disabled={pendente2}>
          {pendente2 ? "Salvando…" : "Criar senha e entrar"}
        </Button>

        {/* ⚠️ O prazo é dito ANTES de a pessoa descobrir no clique. */}
        <p className="corpo-sm text-muted-foreground">
          Você tem 15 minutos para concluir. Passou disso, é só recomeçar.
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
        <p className="corpo-sm text-muted-foreground">
          É o código que a equipe passou no grupo.
        </p>
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
        <p className="corpo-sm text-muted-foreground">
          O mesmo que você usou na compra do programa.
        </p>
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
        <p className="corpo-sm text-muted-foreground">
          É ele que confirma que é você, e não outra pessoa do grupo.
        </p>
      </div>

      {passo1.erro ? (
        <p role="alert" className="corpo-sm text-risco-foreground">
          {passo1.erro}
        </p>
      ) : null}

      <Button type="submit" disabled={pendente1}>
        {pendente1 ? "Conferindo…" : "Continuar"}
      </Button>
    </form>
  );
}
