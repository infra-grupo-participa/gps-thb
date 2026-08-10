"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { ArrowLeft } from "lucide-react";
import {
  login,
  criarSenhaEEntrar,
  verificarEmail,
  type LoginState,
  type PassoEmail,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Login em duas etapas: primeiro o e-mail, depois o que ele exige.
 * Quem nunca entrou cria a senha na hora e já acessa — sem verificação.
 */
export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const [passo, setPasso] = useState<PassoEmail | null>(null);
  const [email, setEmail] = useState("");
  const [erroEmail, setErroEmail] = useState<string | null>(null);
  const [checando, iniciarChecagem] = useTransition();

  function checarEmail(e: React.FormEvent) {
    e.preventDefault();
    setErroEmail(null);
    iniciarChecagem(async () => {
      const res = await verificarEmail(email);
      if (res.erro) {
        setErroEmail(res.erro);
        return;
      }
      if (res.resultado) setPasso(res.resultado);
    });
  }

  function voltar() {
    setPasso(null);
    setErroEmail(null);
  }

  // ---------- Etapa 1: e-mail ----------
  if (!passo) {
    return (
      <form onSubmit={checarEmail} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="voce@exemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Use o mesmo e-mail do seu cadastro.
          </p>
        </div>

        {erroEmail ? (
          <p className="text-sm text-destructive">{erroEmail}</p>
        ) : null}

        <Button type="submit" disabled={checando} className="mt-2">
          {checando ? "Verificando..." : "Continuar"}
        </Button>
      </form>
    );
  }

  // ---------- Etapa 2c: e-mail sem cadastro ----------
  if (passo.passo === "sem-cadastro") {
    return (
      <div className="flex flex-col gap-4">
        <CabecalhoEmail email={passo.email} onVoltar={voltar} />
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Não encontramos esse e-mail. Confira se digitou certo — ou faça seu
          cadastro para entrar no programa.
        </div>
        <Link href="/cadastro" className="w-full">
          <Button type="button" className="w-full">
            Fazer meu cadastro
          </Button>
        </Link>
      </div>
    );
  }

  // ---------- Etapa 2a: primeiro acesso, cria a senha ----------
  if (passo.passo === "criar-senha") {
    return (
      <CriarSenhaForm
        email={passo.email}
        redirectTo={redirectTo}
        onVoltar={voltar}
      />
    );
  }

  // ---------- Etapa 2b: já tem senha ----------
  return (
    <SenhaForm email={passo.email} redirectTo={redirectTo} onVoltar={voltar} />
  );
}

function CabecalhoEmail({
  email,
  onVoltar,
}: {
  email: string;
  onVoltar: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-muted/60 px-3 py-2">
      <span className="truncate text-sm font-medium">{email}</span>
      <button
        type="button"
        onClick={onVoltar}
        className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="size-3" /> trocar
      </button>
    </div>
  );
}

function CriarSenhaForm({
  email,
  redirectTo,
  onVoltar,
}: {
  email: string;
  redirectTo: string;
  onVoltar: () => void;
}) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    criarSenhaEEntrar,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="redirect" value={redirectTo} />
      <input type="hidden" name="email" value={email} />

      <CabecalhoEmail email={email} onVoltar={onVoltar} />

      <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
        <strong>Primeiro acesso.</strong> Crie a sua senha abaixo para entrar.
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="senha">Crie sua senha</Label>
        <Input
          id="senha"
          name="senha"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          autoFocus
        />
        <p className="text-xs text-muted-foreground">Ao menos 8 caracteres.</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="confirma">Repita a senha</Label>
        <Input
          id="confirma"
          name="confirma"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>

      {state.erro ? (
        <p className="text-sm text-destructive">{state.erro}</p>
      ) : null}

      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Entrando..." : "Criar senha e entrar"}
      </Button>
    </form>
  );
}

function SenhaForm({
  email,
  redirectTo,
  onVoltar,
}: {
  email: string;
  redirectTo: string;
  onVoltar: () => void;
}) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    login,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="redirect" value={redirectTo} />
      <input type="hidden" name="email" value={email} />

      <CabecalhoEmail email={email} onVoltar={onVoltar} />

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="senha">Senha</Label>
          <Link
            href="/esqueci-senha"
            className="text-xs text-muted-foreground hover:text-primary hover:underline"
          >
            Esqueci minha senha
          </Link>
        </div>
        <Input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
        />
      </div>

      {state.erro ? (
        <p className="text-sm text-destructive">{state.erro}</p>
      ) : null}

      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}
