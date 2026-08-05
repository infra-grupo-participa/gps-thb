"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, CalendarX2, AlertTriangle } from "lucide-react";
import { confirmarReuniao, recusarReuniao } from "@/app/reuniao/actions";
import { faixaHorario, rotuloDataLongo } from "@/lib/reuniao";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Resposta da equipe a uma solicitação: confirmar presença ou avisar que não
 * consegue participar. A recusa pede um motivo (o aluno lê) e permite fechar
 * aquele horário para todos, quando o impedimento é da agenda da equipe.
 */
export function ReuniaoResponder({
  alunoId,
  alunoNome,
  data,
  horario,
  tamanho = "sm",
  jaConfirmada = false,
}: {
  alunoId: string;
  alunoNome: string;
  data: string;
  horario: string;
  tamanho?: "sm" | "default";
  /** true = reunião já confirmada: só resta a saída de "não vou conseguir". */
  jaConfirmada?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [fecharHorario, setFecharHorario] = useState(false);

  function confirmar() {
    startTransition(async () => {
      const res = await confirmarReuniao(alunoId);
      if (res.erro) {
        toast.error(res.erro);
        return;
      }
      toast.success(`Presença confirmada com ${alunoNome}.`);
      router.refresh();
    });
  }

  function recusar() {
    startTransition(async () => {
      const res = await recusarReuniao({ alunoId, motivo, fecharHorario });
      if (res.erro) {
        toast.error(res.erro);
        return;
      }
      toast.success("O aluno foi avisado e vai escolher outro horário.");
      setRecusando(false);
      setMotivo("");
      setFecharHorario(false);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {!jaConfirmada ? (
          <Button size={tamanho} onClick={confirmar} disabled={pending}>
            <Check className="size-4" /> Confirmar presença
          </Button>
        ) : null}
        <Button
          variant={jaConfirmada ? "ghost" : "outline"}
          size={tamanho}
          onClick={() => setRecusando(true)}
          disabled={pending}
          className={
            jaConfirmada
              ? "text-muted-foreground hover:text-destructive"
              : "border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive"
          }
        >
          <CalendarX2 className="size-4" /> Não vou conseguir
        </Button>
      </div>

      <Dialog open={recusando} onOpenChange={setRecusando}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarX2 className="size-4 text-destructive" />
              Não vou conseguir participar
            </DialogTitle>
            <DialogDescription className="capitalize">
              {alunoNome} · {rotuloDataLongo(data)} · {faixaHorario(horario)}
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              A reunião <strong>deixa de valer</strong> e o horário volta a ficar
              livre. O aluno recebe um e-mail com o motivo e escolhe outra data.
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="motivo-recusa">
              Motivo{" "}
              <span className="font-normal text-muted-foreground">
                (o aluno vai ler)
              </span>
            </Label>
            <Textarea
              id="motivo-recusa"
              rows={3}
              maxLength={500}
              autoFocus
              placeholder="Ex.: nesta quarta a equipe está em evento. Pode escolher qualquer horário da semana seguinte."
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>

          <label className="flex items-start gap-2.5 rounded-lg border p-3 text-sm">
            <Checkbox
              checked={fecharHorario}
              onCheckedChange={(v) => setFecharHorario(v === true)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">
                Fechar este horário para todos os alunos
              </span>
              <span className="block text-muted-foreground">
                Marque quando o impedimento for da agenda da equipe — senão outro
                aluno vai pedir o mesmo horário. Dá para reabrir no calendário.
              </span>
            </span>
          </label>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setRecusando(false)}
              disabled={pending}
            >
              Voltar
            </Button>
            <Button variant="destructive" onClick={recusar} disabled={pending}>
              Recusar e avisar o aluno
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
