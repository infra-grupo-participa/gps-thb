"use client";

import * as React from "react";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/**
 * Campo de senha único do portal — mascarado por padrão, com um olho por campo.
 *
 * Existia uma implementação por tela (login, redefinir, perfil) e uma que nem
 * mascarava (a "Nova senha do titular" em `gerenciar-acesso.tsx`, texto puro).
 * Aqui a decisão é uma só e vale em todo lugar.
 *
 * Não aceita `type` (é o componente que manda) e não controla `value`:
 * funciona controlado (`value`/`onChange`) e não-controlado (`name`, para
 * `useActionState` em `login-form.tsx`).
 */
export function InputSenha({
  className,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "type">): React.JSX.Element {
  const [ver, setVer] = useState(false);

  return (
    <div className="relative">
      <Input
        type={ver ? "text" : "password"}
        className={cn("pr-10", className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVer((v) => !v)}
        aria-label={ver ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={ver}
        aria-controls={props.id}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {ver ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}
