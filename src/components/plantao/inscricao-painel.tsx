"use client";

/**
 * Plantão de Dúvidas — Acelera Holding. Painel do dia (dentro do dialog do
 * calendário): lista os plantões do dia e permite se inscrever.
 *
 * ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
 * (commit b457005) e PROIBIDO de reconstruir.
 *
 * Regra de negócio: 1 inscrição ativa por vez — só escolhe outra depois que
 * a anterior passar. Sem limite de vagas: nunca mostra contagem para o
 * aluno nem estado "esgotado".
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserRoundIcon, ClockIcon } from "lucide-react";
import type { SlotPublico, MinhaInscricao } from "@/lib/plantao-tipos";
import { faixaHorario, rotuloData } from "@/lib/plantao";
import { inscrever } from "@/app/p/plantao/actions";
import { Button } from "@/components/ui/button";

export function InscricaoPainel({
  slots,
  minhaInscricaoAtiva,
  onConcluido,
}: {
  slots: SlotPublico[];
  /** Inscrição ativa (não encerrada) do aluno, em QUALQUER dia — trava escolher outro plantão. */
  minhaInscricaoAtiva: MinhaInscricao | null;
  onConcluido: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const temInscricaoAtiva = minhaInscricaoAtiva !== null;
  const minha = slots.find((s) => s.minhaInscricao);

  function inscreverNoSlot(slot: SlotPublico) {
    startTransition(async () => {
      const res = await inscrever(slot.slotId);
      if (!res.ok) {
        toast.error(res.erro);
        return;
      }
      toast.success(
        `Inscrição confirmada: ${rotuloData(slot.data)} às ${slot.horaInicio} com ${slot.mentoraNome}.`,
      );
      router.refresh();
      onConcluido();
    });
  }

  if (slots.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum plantão liberado neste dia.
      </p>
    );
  }

  // Compreendida, não só sofrida: explica o motivo e qual é a inscrição
  // vigente, em vez de só desabilitar o botão.
  if (temInscricaoAtiva && !minha && minhaInscricaoAtiva) {
    return (
      <p className="rounded-lg border border-dashed bg-muted/40 p-3 text-sm text-muted-foreground">
        Você já está inscrito no plantão de {rotuloData(minhaInscricaoAtiva.data)}{" "}
        às {minhaInscricaoAtiva.horaInicio} com {minhaInscricaoAtiva.mentoraNome}{" "}
        — poderá escolher outro depois que ele acontecer.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {slots.map((slot) => {
        const ehMinha = slot.minhaInscricao;
        return (
          <div
            key={slot.slotId}
            className={
              "flex items-center justify-between gap-3 rounded-lg border p-3 " +
              (ehMinha ? "border-primary/40 bg-primary/[0.04]" : "")
            }
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <ClockIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                {faixaHorario(slot.horaInicio, slot.duracaoMin)}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                <UserRoundIcon className="size-3.5 shrink-0" aria-hidden />
                {slot.mentoraNome}
              </div>
            </div>

            {ehMinha ? (
              <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                Você está aqui
              </span>
            ) : slot.encerrado ? (
              <span className="shrink-0 text-xs text-muted-foreground">
                Encerrado
              </span>
            ) : (
              <Button
                size="sm"
                disabled={pending || temInscricaoAtiva}
                onClick={() => inscreverNoSlot(slot)}
              >
                Inscrever
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
