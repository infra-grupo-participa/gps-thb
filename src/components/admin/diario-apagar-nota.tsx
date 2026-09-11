"use client";

/**
 * Apagar uma nota do diário — só para quem está na lista.
 *
 * Pedido do Marcio (10/09/2026): "tem que ser possível apagar a nota, somente
 * marcio@, elaine@ e isabela@ podem apagar a nota do histórico do aluno".
 *
 * 🔴 É DELETE de verdade. Nota do Diário pode ter dado pessoal de TERCEIRO
 * (cliente do aluno, situação familiar) — foi por isso que a tabela nasceu
 * só-admin. Marcar como "apagada" e manter a linha não cumpriria o pedido.
 *
 * 🔑 O botão só aparece para quem pode, mas isso é CONVENIÊNCIA, não
 * segurança: `gps.admin_apagar_nota` confere a mesma lista no servidor e
 * devolve 42501 para os outros. Esconder botão nunca foi fronteira.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";
import { apagarNota } from "@/app/admin/diario-actions";

export function DiarioApagarNota({
  notaId,
  alunoId,
  trecho,
}: {
  notaId: string;
  alunoId: string;
  /** O começo da nota, para a confirmação dizer O QUE vai sumir. */
  trecho: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();
  const router = useRouter();

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        disabled={pendente}
        aria-label="Apagar esta nota"
        title="Apagar esta nota"
        className="rounded p-1 text-muted-foreground transition hover:bg-superficie-afundada hover:text-risco-foreground focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
      >
        <Trash2 aria-hidden className="size-3.5" />
      </button>

      <DialogoConfirmacao
        aberto={aberto}
        titulo="Apagar esta nota?"
        descricao={
          <span className="italic">
            “{trecho}
            {trecho.length >= 120 ? "…" : ""}”
          </span>
        }
        consequencia="A nota é apagada de vez — não dá para desfazer. Fica registrado no histórico do parceiro que você a apagou, e quando."
        rotuloConfirmar="Apagar a nota"
        rotuloConfirmando="Apagando…"
        confirmando={pendente}
        onCancelar={() => setAberto(false)}
        onConfirmar={() =>
          iniciar(async () => {
            const r = await apagarNota(notaId, alunoId);
            setAberto(false);
            if (!r.ok) {
              toast.error(r.erro);
              return;
            }
            toast.success("Nota apagada.");
            router.refresh();
          })
        }
      />
    </>
  );
}
