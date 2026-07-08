"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cadastrar, type CadastroState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  mascaraCpfCnpj,
  mascaraTelefone,
  soDigitos,
  tipoDocumento,
} from "@/lib/masks";

export function CadastroForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<CadastroState, FormData>(
    cadastrar,
    {},
  );
  const [documento, setDocumento] = useState("");
  const [telefone, setTelefone] = useState("");
  const [senhaVisivel, setSenhaVisivel] = useState(false);

  const digitosDoc = soDigitos(documento);
  const tipo = tipoDocumento(documento);
  const docValido = digitosDoc.length === 11 || digitosDoc.length === 14;

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
        <div className="relative">
          <Input
            id="documento"
            name="documento"
            inputMode="numeric"
            placeholder="000.000.000-00"
            value={documento}
            onChange={(e) => setDocumento(mascaraCpfCnpj(e.target.value))}
            aria-invalid={documento.length > 0 && !docValido}
            required
            autoFocus
          />
          {tipo ? (
            <span
              className={
                "absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium " +
                (docValido ? "text-primary" : "text-muted-foreground")
              }
            >
              {tipo}
            </span>
          ) : null}
        </div>
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
        <div className="relative">
          <Input
            id="senha"
            name="senha"
            type={senhaVisivel ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Mínimo de 6 caracteres"
            required
            minLength={6}
          />
          <button
            type="button"
            onClick={() => setSenhaVisivel((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
          >
            {senhaVisivel ? "ocultar" : "mostrar"}
          </button>
        </div>
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
              inputMode="tel"
              placeholder="(00) 00000-0000"
              autoComplete="tel"
              value={telefone}
              onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
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
