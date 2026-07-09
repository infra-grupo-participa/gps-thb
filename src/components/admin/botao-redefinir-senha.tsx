"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { enviarRedefinicaoSenha } from "@/app/admin/senha-actions";
import { Button } from "@/components/ui/button";

export function BotaoRedefinirSenha({ alunoId }: { alunoId: string }) {
  const [pending, startTransition] = useTransition();

  function enviar() {
    startTransition(async () => {
      const res = await enviarRedefinicaoSenha(alunoId);
      if (res.erro) {
        toast.error(res.erro);
        return;
      }
      toast.success(`E-mail de redefinição enviado para ${res.email}.`);
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={enviar} disabled={pending}>
      <KeyRound className="size-4" /> Redefinir senha
    </Button>
  );
}
