"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock, Plus, Trash2, Settings2, Info } from "lucide-react";
import type { ReuniaoHorario } from "@/lib/types";
import { faixaHorario } from "@/lib/reuniao";
import {
  criarHorarioReuniao,
  definirHorarioAtivo,
  removerHorarioReuniao,
} from "@/app/reuniao/actions";
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

/**
 * Disponibilidade padrão da equipe: quais horários existem na grade de **toda**
 * quarta. Fechar uma data específica ou um horário de uma quarta continua sendo
 * feito no calendário (bloqueios) — aqui é a regra que vale para todas.
 */
export function DisponibilidadeHorarios({
  horarios,
}: {
  horarios: ReuniaoHorario[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pending, startTransition] = useTransition();
  const [novo, setNovo] = useState("");

  const ativos = horarios.filter((h) => h.ativo).length;

  function alternar(horario: string, ativo: boolean) {
    startTransition(async () => {
      const res = await definirHorarioAtivo(horario, ativo);
      if (res.erro) {
        toast.error(res.erro);
        return;
      }
      toast.success(
        ativo
          ? `${faixaHorario(horario)} aberto em todas as quartas.`
          : `${faixaHorario(horario)} fechado — some da grade dos alunos.`,
      );
      router.refresh();
    });
  }

  function criar() {
    const h = novo.trim();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(h)) {
      toast.error("Informe o horário no formato HH:MM (ex.: 19:00).");
      return;
    }
    startTransition(async () => {
      const res = await criarHorarioReuniao(h);
      if (res.erro) {
        toast.error(res.erro);
        return;
      }
      toast.success(`Horário ${faixaHorario(h)} criado.`);
      setNovo("");
      router.refresh();
    });
  }

  function remover(horario: string) {
    if (
      !window.confirm(
        `Remover o horário ${faixaHorario(horario)} da grade? Se já houve reunião nele, desative em vez de remover.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await removerHorarioReuniao(horario);
      if (res.erro) {
        toast.error(res.erro);
        return;
      }
      toast.success("Horário removido da grade.");
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
        <Settings2 className="size-4" /> Disponibilidade
        <span className="text-muted-foreground">
          ({ativos} {ativos === 1 ? "horário" : "horários"})
        </span>
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="size-4 text-primary" />
              Disponibilidade das quartas
            </DialogTitle>
            <DialogDescription>
              Os horários que a equipe oferece em toda quarta-feira. Vale para
              todas as semanas.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            <div>
              Para fechar <strong>só uma quarta</strong> (feriado) ou{" "}
              <strong>um horário de uma semana</strong>, use os botões do
              calendário. Desativar aqui tira o horário de todas as semanas
              seguintes, sem apagar o histórico.
            </div>
          </div>

          <ul className="divide-y rounded-lg border">
            {horarios.map((h) => (
              <li
                key={h.horario}
                className="flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <div>
                  <div className="font-medium tabular-nums">
                    {faixaHorario(h.horario)}
                  </div>
                  <div
                    className={
                      "text-xs " +
                      (h.ativo ? "text-emerald-700" : "text-muted-foreground")
                    }
                  >
                    {h.ativo ? "Aberto para os alunos" : "Fechado"}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant={h.ativo ? "ghost" : "outline"}
                    size="sm"
                    onClick={() => alternar(h.horario, !h.ativo)}
                    disabled={pending}
                  >
                    {h.ativo ? "Fechar" : "Abrir"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => remover(h.horario)}
                    disabled={pending}
                    title="Remover da grade"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
            {!horarios.length ? (
              <li className="px-3 py-3 text-sm text-muted-foreground">
                Nenhum horário na grade — os alunos não conseguem solicitar
                reunião. Crie ao menos um.
              </li>
            ) : null}
          </ul>

          <div className="grid gap-1.5">
            <Label htmlFor="novo-horario">Novo horário</Label>
            <div className="flex gap-2">
              <Input
                id="novo-horario"
                type="time"
                step={900}
                value={novo}
                onChange={(e) => setNovo(e.target.value)}
                className="max-w-36"
              />
              <Button onClick={criar} disabled={pending || !novo}>
                <Plus className="size-4" /> Adicionar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Cada reunião ocupa 2 horas a partir do horário de início.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
