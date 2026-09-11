"use client";

import { useActionState, useState, useTransition } from "react";
import { Clock, Mail } from "lucide-react";
import {
  reenviarConvite,
  revogarConvite,
  type ReenviarConviteResultado,
} from "./actions";
import type { ConvitePendente } from "@/lib/data/equipe";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";
import { formatarData } from "@/lib/datas";

/**
 * O convite pendente: e-mail convidado, prazo, "Reenviar" e "Revogar".
 *
 * Só o titular vê os botões — a página monta este componente já sabendo que
 * quem está olhando é o titular; a guarda de verdade continua na action
 * (papel ≠ titular → erro).
 */
export function ConvitePendenteCard({ convite }: { convite: ConvitePendente }) {
  const [reenvio, agirReenvio, pendenteReenvio] = useActionState<
    ReenviarConviteResultado,
    FormData
  >(reenviarConvite, {});
  const [revogando, iniciarRevogacao] = useTransition();
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [erroRevogar, setErroRevogar] = useState<string | null>(null);

  const expiraEm = convite.expiraEm ? formatarData(convite.expiraEm) : null;

  return (
    <Card>
      <CardContent className="grid gap-3">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
          >
            <Mail className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">Convite enviado</p>
            <p className="truncate text-sm text-muted-foreground">
              {convite.email}
            </p>
            {expiraEm ? (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <Clock aria-hidden className="size-3.5" />
                Expira em {expiraEm}
              </p>
            ) : null}
          </div>
        </div>

        {reenvio.ok && reenvio.link ? (
          <div className="rounded-md border border-dashed bg-muted/40 p-3 text-xs">
            {/* 🔴 `emailEnviado` era devolvido pela action e IGNORADO aqui
                (auditoria de 11/09/2026). O formulário de convite
                (`convite-socio-form.tsx`) já tratava; o REENVIO não — então o
                titular clicava "Reenviar", via "Novo link gerado" e ia embora
                achando que o sócio tinha recebido. O link abaixo é o único
                caminho quando o e-mail não sai. */}
            <p className="mb-1 font-medium text-foreground">
              {reenvio.emailEnviado === false
                ? "O e-mail não saiu — envie este link ao seu sócio"
                : "Novo link gerado"}
            </p>
            <code className="block truncate">{reenvio.link}</code>
          </div>
        ) : null}
        {reenvio.erro ? (
          <p role="alert" className="text-xs text-destructive">
            {reenvio.erro}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <form action={agirReenvio}>
            <input type="hidden" name="conviteId" value={convite.id} />
            <input type="hidden" name="email" value={convite.email} />
            <Button type="submit" variant="outline" size="sm" disabled={pendenteReenvio}>
              {pendenteReenvio ? "Reenviando…" : "Reenviar"}
            </Button>
          </form>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setErroRevogar(null);
              setDialogoAberto(true);
            }}
          >
            Revogar
          </Button>
        </div>
      </CardContent>

      <DialogoConfirmacao
        aberto={dialogoAberto}
        titulo="Revogar convite"
        descricao={convite.email}
        consequencia="O link deixa de funcionar imediatamente. Se o seu sócio tentar usá-lo depois disso, vai ver que o convite não é mais válido — você pode convidar de novo quando quiser."
        rotuloConfirmar="Revogar convite"
        rotuloConfirmando="Revogando…"
        confirmando={revogando}
        erro={erroRevogar}
        onCancelar={() => setDialogoAberto(false)}
        onConfirmar={() => {
          iniciarRevogacao(async () => {
            const r = await revogarConvite(convite.id);
            if (r.erro) {
              setErroRevogar(r.erro);
              return;
            }
            setDialogoAberto(false);
          });
        }}
      />
    </Card>
  );
}
