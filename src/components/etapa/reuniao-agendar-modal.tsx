"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Link2, Info, ClipboardList } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";

/** Mínimo de contexto que o aluno escreve para a equipe decidir e se preparar. */
const MIN_PAUTA = 15;
const MAX_PAUTA = 500;

export function ReuniaoAgendarModal({
  open,
  onOpenChange,
  grade,
  alunoId,
  linkInicial,
  pautaInicial,
  slotInicial,
  isAdmin = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  grade: DiaGrade[];
  /** só o admin (modo assistência) passa alunoId; o aluno logado age por si. */
  alunoId?: string;
  linkInicial?: string;
  pautaInicial?: string;
  slotInicial?: { data: string; horario: string } | null;
  /** true = a equipe agendando (já nasce confirmada); false = o aluno solicitando. */
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sel, setSel] = useState<{ data: string; horario: string } | null>(
    slotInicial ?? null,
  );
  const [link, setLink] = useState(linkInicial ?? "");
  const [pauta, setPauta] = useState(pautaInicial ?? "");

  // Reabrir o modal parte sempre do que está gravado hoje.
  useEffect(() => {
    if (open) {
      setSel(slotInicial ?? null);
      setLink(linkInicial ?? "");
      setPauta(pautaInicial ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function selecionavel(estado: string) {
    return estado === "livre" || estado === "meu";
  }

  function confirmar() {
    if (!sel) {
      toast.error("Escolha um horário.");
      return;
    }
    if (!isAdmin) {
      if (!linkLiveValido(link)) {
        toast.error("Informe um link válido (começando com https://).");
        return;
      }
      if (pauta.trim().length < MIN_PAUTA) {
        toast.error(
          "Conte em uma frase o que você precisa resolver na reunião — a equipe usa isso para se preparar.",
        );
        return;
      }
    }
    startTransition(async () => {
      const res = await agendarReuniao({
        alunoId,
        data: sel.data,
        horario: sel.horario,
        linkLive: link,
        pauta,
      });
      if (res.erro) {
        toast.error(res.erro);
        return;
      }
      toast.success(
        isAdmin
          ? "Reunião agendada e confirmada para o aluno."
          : "Solicitação enviada! A equipe vai confirmar.",
      );
      onOpenChange(false);
      router.refresh();
    });
  }

  const semHorario = grade.every(
    (d) => d.bloqueado || !d.slots.some((s) => selecionavel(s.estado)),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="size-4 text-primary" />
            {isAdmin ? "Agendar reunião do aluno" : "Solicitar reunião com a equipe"}
          </DialogTitle>
          <DialogDescription>
            {isAdmin
              ? "Agendado pela equipe já fica confirmado para o aluno."
              : "Escolha o horário que serve para você e para o cliente. A equipe confirma se consegue participar."}
          </DialogDescription>
        </DialogHeader>

        {/* O aluno precisa entender que isto é um pedido, não uma reserva. */}
        {!isAdmin ? (
          <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <Info className="mt-0.5 size-4 shrink-0" />
            <div>
              <strong>Isto é uma solicitação.</strong> O horário fica reservado
              para você enquanto a equipe analisa. Só considere a reunião marcada
              quando o status virar <strong>Confirmada</strong> — você recebe um
              e-mail com a resposta.
            </div>
          </div>
        ) : null}

        {/* Grade de quartas × horários */}
        <div className="grid gap-1.5">
          <Label>Horário</Label>
          <div className="max-h-56 space-y-3 overflow-y-auto rounded-lg border p-3">
            {grade.map((dia) => {
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
                              ? "Horário já reservado por outro aluno"
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
            {semHorario ? (
              <p className="text-sm text-muted-foreground">
                Não há horários livres nas próximas semanas. Fale com a equipe.
              </p>
            ) : null}
          </div>
        </div>

        {/* O que será tratado — é o que a equipe lê para decidir e se preparar. */}
        {!isAdmin ? (
          <div className="grid gap-1.5">
            <Label htmlFor="pauta-reuniao" className="flex items-center gap-1.5">
              <ClipboardList className="size-3.5" />
              O que você precisa resolver nesta reunião
            </Label>
            <Textarea
              id="pauta-reuniao"
              rows={3}
              maxLength={MAX_PAUTA}
              placeholder="Ex.: cliente tem 3 imóveis alugados e um filho fora do negócio; travei na hora de explicar a economia com o inventário."
              value={pauta}
              onChange={(e) => setPauta(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              A equipe lê isto antes de confirmar. Quanto mais claro o cenário do
              cliente e onde você travou, melhor ela chega preparada.
            </p>
          </div>
        ) : null}

        {/* Link da live */}
        <div className="grid gap-1.5">
          <Label htmlFor="link-live" className="flex items-center gap-1.5">
            <Link2 className="size-3.5" />
            Link da reunião
            {isAdmin ? (
              <span className="font-normal text-muted-foreground">(opcional)</span>
            ) : null}
          </Label>
          <Input
            id="link-live"
            type="url"
            inputMode="url"
            placeholder="https://meet.google.com/..."
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
          {!isAdmin ? (
            <p className="text-xs text-muted-foreground">
              É a sala que você cria e envia para o cliente. A equipe entra por ela.
            </p>
          ) : null}
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
            {isAdmin ? "Agendar e confirmar" : "Enviar solicitação"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
