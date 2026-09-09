"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { SlotAdmin } from "@/lib/plantao-tipos";
import { faixaHorario, rotuloData } from "@/lib/plantao";
import { cancelarSlot } from "@/app/admin/plantao/actions";
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Mesmo teto do motivo da recusa de solicitação (`solicitacao-card.tsx`). */
const MAX_MOTIVO = 300;

/**
 * Cancelar é diferente de remover: o plantão fica na agenda com o motivo, as
 * inscrições ativas caem e cada inscrito recebe um e-mail. Por isso o diálogo
 * diz quantas pessoas serão avisadas ANTES do clique e quantas foram avisadas
 * DEPOIS — e-mail que falha não desfaz o cancelamento, e alguém precisa avisar
 * essa pessoa por fora.
 *
 * 🔑 Esta tela foi a ORIGEM do `DialogoConfirmacao` (consequência escrita,
 * botão nomeado, foco de volta) e agora consome o componente, como as outras
 * cinco. O campo de motivo entra por `children`, no padrão do
 * `SolicitacaoCard`. `destrutivo={false}` de propósito: cancelar um plantão é
 * reversível (republica-se outro) e o botão nunca foi vermelho aqui.
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
    <DialogoConfirmacao
      aberto
      titulo="Cancelar este plantão?"
      descricao={`${rotuloData(slot.data)} · ${faixaHorario(slot.horaInicio, slot.duracaoMin)} · ${slot.mentoraNome}`}
      consequencia={
        <>
          {slot.inscritosQtd === 0
            ? "Ninguém está inscrito neste plantão."
            : `${slot.inscritosQtd} inscrito(s) serão avisados por e-mail e a inscrição deles será cancelada.`}{" "}
          O plantão sai do ar para os alunos, mas continua aqui no histórico.
        </>
      }
      rotuloConfirmar="Cancelar plantão"
      rotuloConfirmando="Cancelando..."
      destrutivo={false}
      confirmando={salvando}
      erro={erro}
      onConfirmar={confirmar}
      onCancelar={() => onFechar(false)}
    >
      <div className="grid gap-2">
        <Label htmlFor="cancelar-motivo">Motivo (opcional)</Label>
        <Textarea
          id="cancelar-motivo"
          value={motivo}
          maxLength={MAX_MOTIVO}
          rows={3}
          disabled={salvando}
          aria-describedby="cancelar-motivo-ajuda"
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ex.: a mentora precisou remarcar; volta na semana que vem."
        />
        <p id="cancelar-motivo-ajuda" className="text-xs text-muted-foreground">
          Vai no e-mail dos inscritos. Até {MAX_MOTIVO} caracteres (
          {motivo.length}/{MAX_MOTIVO}).
        </p>
      </div>
    </DialogoConfirmacao>
  );
}
