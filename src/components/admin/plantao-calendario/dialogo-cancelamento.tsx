"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { SlotAdmin } from "@/lib/plantao-tipos";
import { faixaHorario, rotuloData } from "@/lib/plantao";
import { cancelarSlot } from "@/app/admin/plantao/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

/**
 * Cancelar é diferente de remover: o plantão fica na agenda com o motivo, as
 * inscrições ativas caem e cada inscrito recebe um e-mail. Por isso o diálogo
 * diz quantas pessoas serão avisadas ANTES do clique e quantas foram avisadas
 * DEPOIS — e-mail que falha não desfaz o cancelamento, e alguém precisa avisar
 * essa pessoa por fora.
 */
export function DialogoCancelamento({
  slot,
  onFechar,
  onResultado,
}: {
  slot: SlotAdmin;
  onFechar: (cancelou: boolean) => void;
  onResultado: (msg: string) => void;
}) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function confirmar() {
    setSalvando(true);
    setErro("");
    const res = await cancelarSlot(slot.slotId, motivo.trim());
    setSalvando(false);
    if (!res.ok) {
      setErro(res.erro);
      toast.error(res.erro);
      return;
    }
    // Contadores opcionais no contrato do servidor: sem eles, cai no que a
    // tela já sabe (`inscritosQtd`) em vez de escrever "undefined".
    const inscritos = res.inscritos ?? slot.inscritosQtd;
    const avisados = res.avisados ?? 0;
    const falhas = res.falhas ?? 0;
    onResultado(
      `Plantão cancelado. ${avisados} de ${inscritos} inscrito(s) avisados por e-mail.` +
        (falhas > 0
          ? ` ${falhas} e-mail(s) não saíram — avise essas pessoas por fora.`
          : ""),
    );
    toast.success("Plantão cancelado.");
    router.refresh();
    onFechar(true);
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !salvando) onFechar(false);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar este plantão?</DialogTitle>
          <DialogDescription>
            {rotuloData(slot.data)} · {faixaHorario(slot.horaInicio, slot.duracaoMin)} ·{" "}
            {slot.mentoraNome}
          </DialogDescription>
        </DialogHeader>

        <p className="text-sm">
          {slot.inscritosQtd === 0
            ? "Ninguém está inscrito neste plantão."
            : `${slot.inscritosQtd} inscrito(s) serão avisados por e-mail e a inscrição deles será cancelada.`}{" "}
          O plantão sai do ar para os alunos, mas continua aqui no histórico.
        </p>

        <div className="flex flex-col gap-2">
          <Label htmlFor="cancelar-motivo">Motivo (opcional)</Label>
          <Textarea
            id="cancelar-motivo"
            value={motivo}
            maxLength={300}
            rows={3}
            disabled={salvando}
            aria-describedby="cancelar-motivo-ajuda"
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: a mentora precisou remarcar; volta na semana que vem."
          />
          <p id="cancelar-motivo-ajuda" className="text-xs text-muted-foreground">
            Vai no e-mail dos inscritos. Até 300 caracteres ({motivo.length}/300).
          </p>
        </div>

        <p aria-live="assertive" className="text-xs text-destructive empty:hidden">
          {erro}
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onFechar(false)} disabled={salvando}>
            Voltar
          </Button>
          <Button onClick={confirmar} disabled={salvando}>
            {salvando ? "Cancelando..." : "Cancelar plantão"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
