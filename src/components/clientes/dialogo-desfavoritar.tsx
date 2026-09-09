"use client";

/**
 * PL11 — desmarcar a estrela re-trava os passos 4 a 8 da Etapa 01.
 *
 * Mora fora de `clientes-manager/` porque a estrela existe em DOIS lugares: a
 * lista/quadro (`ClientesManager`) e a ficha do cliente (`ClienteFicha`). O
 * diálogo estava só no primeiro, então a ficha desligava o acompanhamento —
 * e travava 5 passos da etapa — num clique sem aviso.
 *
 * 🔑 Ele é só a conversa: quem confirma é o chamador, que guarda "o que está
 * sendo desfavoritado" no estado e mantém o botão da estrela MONTADO atrás do
 * diálogo — é ele que recebe o foco de volta quando alguém desiste.
 */

import type { ClienteEtapa1 } from "@/lib/types";
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";

export function DialogoDesfavoritar({
  desfavoritando,
  pending,
  erroDialogo,
  onConfirmar,
  onCancelar,
}: {
  desfavoritando: ClienteEtapa1;
  pending: boolean;
  erroDialogo: string | null;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  return (
    <DialogoConfirmacao
      aberto
      titulo="Tirar este cliente do acompanhamento da equipe?"
      descricao={desfavoritando.nome || "Cliente sem nome"}
      consequencia={
        <>
          Sem cliente acompanhado, os{" "}
          <strong>passos 4 a 8 da Etapa 01 voltam a ficar travados</strong> e o
          destaque na sua página inicial some. Nenhum dado do cliente é apagado
          — dá para escolher outro (ou o mesmo) a qualquer momento.
        </>
      }
      rotuloConfirmar="Tirar do acompanhamento"
      rotuloConfirmando="Salvando…"
      confirmando={pending}
      erro={erroDialogo}
      onConfirmar={onConfirmar}
      onCancelar={onCancelar}
    />
  );
}
