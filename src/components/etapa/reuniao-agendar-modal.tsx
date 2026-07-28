"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Link2 } from "lucide-react";
import type { DiaGrade } from "@/lib/reuniao";
import { faixaHorario, horaCurta, linkLiveValido, rotuloData } from "@/lib/reuniao";
import { agendarReuniao } from "@/app/reuniao/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ReuniaoAgendarModal({
  open,
  onOpenChange,
  grade,
  alunoId,
  linkInicial,
  slotInicial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  grade: DiaGrade[];
  /** só o admin (modo assistência) passa alunoId; o aluno logado age por si. */
  alunoId?: string;
  linkInicial?: string;
  slotInicial?: { data: string; horario: string } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sel, setSel] = useState<{ data: string; horario: string } | null>(
    slotInicial ?? null,
  );
  const [link, setLink] = useState(linkInicial ?? "");

  function selecionavel(estado: string) {
    return estado === "livre" || estado === "meu";
  }

  function confirmar() {
    if (!sel) {
      toast.error("Escolha um horário.");
      return;
    }
    if (!linkLiveValido(link)) {
      toast.error("Informe um link válido (começando com https://).");
      return;
    }
    startTransition(async () => {
      const res = await agendarReuniao({
        alunoId,
        data: sel.data,
        horario: sel.horario,
        linkLive: link,
      });
      if (res.erro) {
        toast.error(res.erro);
        return;
      }
      toast.success("Reunião agendada!");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="size-4 text-primary" />
            Agendar reunião com a equipe
          </DialogTitle>
          <DialogDescription>
            Escolha um horário livre e informe o link da sala (Google Meet, Zoom…)
            que você vai usar com o cliente.
          </DialogDescription>
        </DialogHeader>

        {/* Grade de quartas × horários */}
        <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
          {grade
            .filter((d) => d.slots.some((s) => selecionavel(s.estado)) || !d.bloqueado)
            .map((dia) => {
              const temLivre = dia.slots.some((s) => selecionavel(s.estado));
              if (dia.bloqueado || !temLivre) return null;
              return (
                <div key={dia.data}>
                  <div className="mb-1.5 text-xs font-semibold capitalize text-muted-foreground">
                    {rotuloData(dia.data)}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {dia.slots.map((s) => {
                      const ativo =
                        sel?.data === s.data &&
                        horaCurta(sel.horario) === horaCurta(s.horario);
                      const ok = selecionavel(s.estado);
                      return (
                        <button
                          key={s.horario}
                          type="button"
                          disabled={!ok || pending}
                          onClick={() =>
                            setSel({ data: s.data, horario: horaCurta(s.horario) })
                          }
                          className={
                            "rounded-lg border px-3 py-2 text-sm font-medium transition " +
                            (ativo
                              ? "border-primary bg-primary text-primary-foreground"
                              : ok
                                ? "border-border bg-background hover:border-primary/50 hover:bg-muted"
                                : "cursor-not-allowed border-dashed text-muted-foreground/50")
                          }
                          title={
                            s.estado === "ocupado"
                              ? "Horário já reservado"
                              : undefined
                          }
                        >
                          {faixaHorario(s.horario)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          {grade.every((d) => d.bloqueado || !d.slots.some((s) => selecionavel(s.estado))) ? (
            <p className="text-sm text-muted-foreground">
              Não há horários livres nas próximas semanas. Fale com a equipe.
            </p>
          ) : null}
        </div>

        {/* Link da live */}
        <div className="grid gap-1.5">
          <Label htmlFor="link-live" className="flex items-center gap-1.5">
            <Link2 className="size-3.5" />
            Link da reunião
          </Label>
          <Input
            id="link-live"
            type="url"
            inputMode="url"
            placeholder="https://meet.google.com/..."
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={pending || !sel}>
            Confirmar agendamento
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
