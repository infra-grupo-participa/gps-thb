"use client";

import { useState } from "react";
import type { SlotAdmin, MentoraAdmin } from "@/lib/plantao-tipos";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CLASSE_SELECT } from "./tipos";

/**
 * "Quem apresenta" — troca a mentora de UM dia sem abrir o formulário inteiro.
 *
 * O `<select>` NÃO dispara a troca sozinho no `onChange`: no Windows, navegar
 * pelas opções com as setas emite um `change` por opção, e cada um viraria uma
 * escrita no banco (e um `aviso_mentora_em` zerado). A confirmação fica num
 * botão, que só aparece quando a escolha muda de verdade.
 *
 * A mentora atual é casada pelo NOME contra a lista (`SlotAdmin` não carrega o
 * uuid). Mentora inativa continua listada enquanto for a do plantão — senão o
 * seletor mostraria outra pessoa como se fosse ela.
 */
export function TrocaDeMentora({
  slot,
  mentoras,
  pending,
  emAcao,
  onTrocar,
}: {
  slot: SlotAdmin;
  mentoras: MentoraAdmin[];
  pending: boolean;
  emAcao: boolean;
  onTrocar: (mentoraId: string) => void;
}) {
  const atualId = slot.mentoraId;
  const [escolhida, setEscolhida] = useState(atualId);
  const mudou = escolhida !== "" && escolhida !== atualId;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`mentora-slot-${slot.slotId}`} className="text-xs">
          Quem apresenta
        </Label>
        <select
          id={`mentora-slot-${slot.slotId}`}
          className={CLASSE_SELECT}
          value={escolhida}
          disabled={pending}
          onChange={(e) => setEscolhida(e.target.value)}
        >
          {atualId ? null : (
            <option value="">{slot.mentoraNome || "Escolha a mentora…"}</option>
          )}
          {mentoras
            .filter((m) => m.ativa || m.id === slot.mentoraId)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
        </select>
      </div>
      {mudou ? (
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => onTrocar(escolhida)}
        >
          {emAcao ? "Trocando..." : "Trocar"}
        </Button>
      ) : null}
    </div>
  );
}
