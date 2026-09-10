"use client";

/**
 * Interruptor geral das escritas do aluno no Plantão (`gps.config`, chave
 * `plantao_inscricao_aberta`): a barra de estado + o botão + o diálogo que
 * confirma a PAUSA (reabrir não precisa de confirmação — não tira nada de
 * ninguém).
 *
 * 🔑 A transição vem do calendário por prop, não é criada aqui: o `pending`
 * que desabilita os botões de cada plantão precisa continuar cobrindo esta
 * escrita, senão dava para pausar as inscrições no meio de um "publicar".
 * O resto do estado (confirmação, aviso, "salvando") é só desta barra e
 * desceu junto com ela.
 */

import { useRef, useState, type TransitionStartFunction } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PauseIcon, PlayIcon } from "lucide-react";
import { definirInscricoesAbertas } from "@/app/admin/plantao/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { devolverFoco } from "./foco";

export function InterruptorInscricoes({
  inscricoesAbertas,
  pending,
  startTransition,
}: {
  /**
   * Lido no servidor por `lerInscricoesAbertas()`. Pausado = ninguém se
   * inscreve, cancela ou revela o link; os plantões continuam visíveis.
   */
  inscricoesAbertas: boolean;
  pending: boolean;
  /** A MESMA transição do calendário — ver o 🔑 do cabeçalho. */
  startTransition: TransitionStartFunction;
}) {
  const router = useRouter();
  const [confirmandoPausa, setConfirmandoPausa] = useState(false);
  /** Texto do `aria-live` da barra do interruptor. */
  const [avisoInterruptor, setAvisoInterruptor] = useState("");
  const [alternandoInscricoes, setAlternandoInscricoes] = useState(false);
  const gatilhoInterruptorRef = useRef<HTMLButtonElement | null>(null);

  function fecharConfirmacaoPausa() {
    setConfirmandoPausa(false);
    devolverFoco(gatilhoInterruptorRef);
  }

  function alternarInscricoes(aberta: boolean) {
    setAlternandoInscricoes(true);
    startTransition(async () => {
      const res = await definirInscricoesAbertas(aberta);
      setAlternandoInscricoes(false);
      if (!res.ok) {
        toast.error(res.erro);
        setAvisoInterruptor(res.erro);
        return;
      }
      toast.success(aberta ? "Inscrições reabertas." : "Inscrições pausadas.");
      setAvisoInterruptor(
        aberta
          ? "Inscrições reabertas. Os alunos voltam a se inscrever e cancelar."
          : "Inscrições pausadas. Ninguém consegue se inscrever, cancelar ou revelar o link.",
      );
      if (!aberta) fecharConfirmacaoPausa();
      router.refresh();
    });
  }

  return (
    <>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3 shadow-sm">
      <div className="flex min-w-0 items-start gap-2.5">
        <span
          className={
            "mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium " +
            // O laranja da marca (#ff6300) não passa 4.5:1 como texto —
            // entra só no ponto (decorativo); o rótulo usa a cor de texto.
            // Pausado é estado de ATENÇÃO e usa o par semântico medido
            // (#8A5300 sobre #FFF4E0 = 5,81:1), o mesmo do `Badge warning` e
            // do `AvisoInline` — não o âmbar cru do Tailwind, que nunca passou
            // por medição de contraste nesta tela.
            (inscricoesAbertas
              ? "border-primary/40 bg-primary/10 text-foreground"
              : "border-atencao-foreground/30 bg-atencao text-atencao-foreground")
          }
        >
          <span
            className={
              "size-1.5 rounded-full " +
              (inscricoesAbertas ? "bg-primary" : "bg-atencao-foreground")
            }
            aria-hidden
          />
          {inscricoesAbertas ? "Inscrições abertas" : "Inscrições pausadas"}
        </span>
        <p className="text-xs text-muted-foreground">
          {inscricoesAbertas
            ? "Os alunos conseguem se inscrever, cancelar e revelar o link da sala."
            : "Ninguém consegue se inscrever, cancelar ou revelar o link. Os plantões continuam visíveis."}
        </p>
      </div>
      <Button
        ref={gatilhoInterruptorRef}
        variant="outline"
        size="sm"
        disabled={pending || alternandoInscricoes}
        onClick={() => {
          if (inscricoesAbertas) {
            setConfirmandoPausa(true);
            return;
          }
          alternarInscricoes(true);
        }}
      >
        {inscricoesAbertas ? (
          <PauseIcon className="size-4" />
        ) : (
          <PlayIcon className="size-4" />
        )}
        {alternandoInscricoes
          ? "Salvando..."
          : inscricoesAbertas
            ? "Pausar inscrições"
            : "Reabrir inscrições"}
      </Button>
      <p aria-live="polite" className="sr-only">
        {avisoInterruptor}
      </p>
    </div>

    <Dialog
      open={confirmandoPausa}
      onOpenChange={(v) => {
        if (!v && !alternandoInscricoes) fecharConfirmacaoPausa();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pausar as inscrições?</DialogTitle>
          <DialogDescription>
            Ninguém consegue se inscrever, cancelar ou revelar o link até você
            reabrir. Os plantões continuam visíveis.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={fecharConfirmacaoPausa}
            disabled={alternandoInscricoes}
          >
            Voltar
          </Button>
          <Button onClick={() => alternarInscricoes(false)} disabled={alternandoInscricoes}>
            {alternandoInscricoes ? "Pausando..." : "Pausar inscrições"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
