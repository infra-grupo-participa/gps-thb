"use client";

import { useState } from "react";
import { ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PainelEtapasAluno } from "./painel-etapas-aluno";
import type { EtapaInfo } from "./seletor-etapas";

/**
 * Botão "Etapas deste aluno" do modo assistência: abre o painel num diálogo.
 * `previa-oculta` no botão — é ação só-admin que a prévia "como o aluno vê"
 * precisa esconder.
 */
export function EtapasAlunoDialogo({
  alunoId,
  nomeAluno,
  etapas,
}: {
  alunoId: string;
  nomeAluno: string | null;
  etapas: EtapaInfo[];
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        className="previa-oculta"
        onClick={() => setAberto(true)}
      >
        <ListChecks className="size-4" /> Etapas deste aluno
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Etapas deste aluno</DialogTitle>
            <DialogDescription>
              Liberar ou travar cada etapa só para {nomeAluno ?? "este aluno"}.
            </DialogDescription>
          </DialogHeader>
          <PainelEtapasAluno
            alunoId={alunoId}
            nomeAluno={nomeAluno}
            etapas={etapas}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
