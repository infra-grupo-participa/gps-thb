"use client";

/**
 * Os inscritos de um plantão, em diálogo próprio. Os dados já vieram
 * pré-carregados pela página (só dos slots com `inscritosQtd > 0`): abrir este
 * diálogo não faz consulta nenhuma.
 */

import type { SlotAdmin, InscritoAdmin } from "@/lib/plantao-tipos";
import { faixaHorario } from "@/lib/plantao";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PlantaoInscritos } from "@/components/admin/plantao-inscritos";

export function DialogoInscritos({
  inscritosAbertos,
  inscritosPorSlot,
  totalInscritosPorSlot,
  setInscritosAbertos,
}: {
  /** Slot cujos inscritos estão à mostra; `null` = diálogo fechado. */
  inscritosAbertos: SlotAdmin | null;
  inscritosPorSlot: Record<string, InscritoAdmin[]>;
  /** Total REAL no banco por slot — pode ser maior que a lista (teto de 500). */
  totalInscritosPorSlot: Record<string, number>;
  setInscritosAbertos: (slot: SlotAdmin | null) => void;
}) {
  return (
    <Dialog
      open={inscritosAbertos !== null}
      onOpenChange={(v) => {
        if (!v) setInscritosAbertos(null);
      }}
    >
      {/*
        🔑 `max-h` + `flex-col` no container e `overflow-y-auto` na lista: o
        `DialogContent` não limita altura por conta própria, então com 23
        inscritos (o número real do primeiro plantão, 09/09/2026) a tabela
        crescia para fora da tela e não havia como chegar ao fim da lista.
        O cabeçalho fica fixo (`shrink-0`) e só a lista rola.
      */}
      <DialogContent className="flex max-h-[85vh] flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Inscritos</DialogTitle>
          <DialogDescription>
            {inscritosAbertos
              ? `${faixaHorario(inscritosAbertos.horaInicio, inscritosAbertos.duracaoMin)} · ${inscritosAbertos.mentoraNome}`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {inscritosAbertos ? (
            <PlantaoInscritos
              slotId={inscritosAbertos.slotId}
              inscritos={inscritosPorSlot[inscritosAbertos.slotId] ?? []}
              totalInscritos={
                totalInscritosPorSlot[inscritosAbertos.slotId] ??
                (inscritosPorSlot[inscritosAbertos.slotId] ?? []).length
              }
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
