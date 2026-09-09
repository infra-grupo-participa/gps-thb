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
  setInscritosAbertos,
}: {
  /** Slot cujos inscritos estão à mostra; `null` = diálogo fechado. */
  inscritosAbertos: SlotAdmin | null;
  inscritosPorSlot: Record<string, InscritoAdmin[]>;
  setInscritosAbertos: (slot: SlotAdmin | null) => void;
}) {
  return (
    <Dialog
      open={inscritosAbertos !== null}
      onOpenChange={(v) => {
        if (!v) setInscritosAbertos(null);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Inscritos</DialogTitle>
          <DialogDescription>
            {inscritosAbertos
              ? `${faixaHorario(inscritosAbertos.horaInicio, inscritosAbertos.duracaoMin)} · ${inscritosAbertos.mentoraNome}`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <PlantaoInscritos
          inscritos={inscritosAbertos ? (inscritosPorSlot[inscritosAbertos.slotId] ?? []) : []}
        />
      </DialogContent>
    </Dialog>
  );
}
