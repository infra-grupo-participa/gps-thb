"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Lock, Unlock } from "lucide-react";
import type { Etapa } from "@/lib/types";
import { definirEtapaLiberada } from "@/app/admin/etapas-actions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function EtapasControle({ etapasIniciais }: { etapasIniciais: Etapa[] }) {
  const [etapas, setEtapas] = useState<Etapa[]>(etapasIniciais);
  const [pending, startTransition] = useTransition();

  function alternar(etapa: Etapa) {
    const nova = !etapa.liberada;
    setEtapas((prev) =>
      prev.map((e) => (e.id === etapa.id ? { ...e, liberada: nova } : e)),
    );
    startTransition(async () => {
      const res = await definirEtapaLiberada(etapa.id, nova);
      if (res.erro) {
        setEtapas((prev) =>
          prev.map((e) =>
            e.id === etapa.id ? { ...e, liberada: !nova } : e,
          ),
        );
        toast.error("Erro ao atualizar a etapa.");
        return;
      }
      toast.success(
        nova ? "Etapa liberada para os alunos." : "Etapa bloqueada.",
      );
    });
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Controle quais etapas ficam disponíveis para <strong>todos</strong> os
        alunos.
      </p>
      {etapas.map((etapa) => (
        <Card key={etapa.id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-3">
              <span
                className={
                  "flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold " +
                  (etapa.liberada
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground")
                }
              >
                {etapa.ordem}
              </span>
              <div>
                <div className="text-sm font-medium">{etapa.nome}</div>
                {etapa.liberada ? (
                  <Badge variant="secondary" className="mt-0.5 text-[10px]">
                    Liberada
                  </Badge>
                ) : (
                  <Badge variant="outline" className="mt-0.5 gap-1 text-[10px]">
                    <Lock className="size-3" /> Bloqueada
                  </Badge>
                )}
              </div>
            </div>
            <Button
              variant={etapa.liberada ? "outline" : "default"}
              size="sm"
              onClick={() => alternar(etapa)}
              disabled={pending}
            >
              {etapa.liberada ? (
                <>
                  <Lock className="size-4" /> Bloquear
                </>
              ) : (
                <>
                  <Unlock className="size-4" /> Liberar
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
