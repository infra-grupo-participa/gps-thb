"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { darBaixaPendencia } from "@/app/admin/diario-actions";
import { Button } from "@/components/ui/button";

/** Botão "dar baixa" de uma pendência aberta do diário. */
export function DiarioBaixaButton({ notaId }: { notaId: string }) {
  const [pending, startTransition] = useTransition();

  function darBaixa() {
    startTransition(async () => {
      const res = await darBaixaPendencia(notaId);
      if (!res.ok) {
        toast.error(res.erro);
        return;
      }
      toast.success("Baixa registrada.");
    });
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={darBaixa}
      disabled={pending}
    >
      {pending ? "Dando baixa..." : "Dar baixa"}
    </Button>
  );
}
