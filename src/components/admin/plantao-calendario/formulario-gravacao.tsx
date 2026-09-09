"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLinkIcon } from "lucide-react";
import type { SlotAdmin } from "@/lib/plantao-tipos";
import { salvarGravacao } from "@/app/admin/plantao/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FormularioGravacao({ slot, pending }: { slot: SlotAdmin; pending: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [url, setUrl] = useState(slot.gravacaoUrl ?? "");
  const [salvando, setSalvando] = useState(false);

  function salvar() {
    setSalvando(true);
    startTransition(async () => {
      const res = await salvarGravacao(slot.slotId, url);
      setSalvando(false);
      if (!res.ok) {
        toast.error(res.erro);
        return;
      }
      toast.success("Gravação salva.");
      router.refresh();
    });
  }

  return (
    <div className="mt-3 flex items-end gap-2 border-t pt-3">
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor={`gravacao-${slot.slotId}`} className="text-xs">
          URL da gravação (opcional)
        </Label>
        <Input
          id={`gravacao-${slot.slotId}`}
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          disabled={pending || salvando}
        />
      </div>
      <Button size="sm" onClick={salvar} disabled={pending || salvando}>
        {salvando ? "Salvando..." : "Salvar"}
      </Button>
      {slot.gravacaoUrl ? (
        <a
          href={slot.gravacaoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          title="Abrir gravação"
        >
          <ExternalLinkIcon className="size-4" />
        </a>
      ) : null}
    </div>
  );
}
