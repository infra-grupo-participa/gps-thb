"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Copy } from "lucide-react";
import { convidarSocio } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Formulário "Convidar meu sócio" — só o titular vê (a página decide quem
 * monta este componente). Um único campo: e-mail.
 *
 * Depois de criar o convite, a tela SEMPRE mostra o link (mesmo quando o
 * e-mail saiu certo): é o padrão de `enviarConviteSocio`
 * (`{ ok, erro? }`, nunca lança) — falha de envio não pode deixar o titular
 * sem nenhum jeito de levar o convite ao sócio.
 */
export function ConviteSocioForm() {
  const [state, formAction, pendente] = useActionState(convidarSocio, {});
  const [copiado, setCopiado] = useState(false);

  if (state.ok && state.link) {
    return (
      <div className="grid gap-3 rounded-lg border border-dashed bg-muted/40 p-4">
        <div className="flex items-start gap-2">
          <CheckCircle2
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-sucesso-foreground"
          />
          <p className="text-sm">
            {state.emailEnviado === false ? (
              <>
                Convite criado, mas não conseguimos enviar o e-mail agora.
                Copie o link abaixo e mande você mesmo para o seu sócio.
              </>
            ) : (
              <>
                Convite enviado! Se preferir, copie o link abaixo e mande
                direto pelo WhatsApp.
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md border bg-background px-2.5 py-1.5 text-xs">
            {state.link}
          </code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(state.link!).then(() => {
                setCopiado(true);
                setTimeout(() => setCopiado(false), 2000);
              });
            }}
          >
            <Copy aria-hidden className="size-3.5" />
            {copiado ? "Copiado!" : "Copiar link"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          O link vale por 7 dias. Se expirar, é só reenviar aqui na aba Equipe.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="grid gap-3 sm:flex sm:items-end sm:gap-2">
      <div className="grid flex-1 gap-1.5">
        <Label htmlFor="email-convite">E-mail do seu sócio</Label>
        <Input
          id="email-convite"
          name="email"
          type="text"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="email"
          placeholder="socio@exemplo.com"
          required
        />
      </div>
      <Button type="submit" disabled={pendente}>
        {pendente ? "Enviando…" : "Convidar meu sócio"}
      </Button>
      {state.erro ? (
        <p role="alert" className="text-sm text-destructive sm:basis-full">
          {state.erro}
        </p>
      ) : null}
    </form>
  );
}
