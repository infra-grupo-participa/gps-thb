"use client";

/**
 * O diálogo de exclusão da tela de clientes. Fica num arquivo à parte porque é
 * CONVERSA, não lista: existe para dizer o que a ação apaga antes de ela
 * acontecer.
 *
 * O irmão dele, `DialogoDesfavoritar`, mudou para
 * `src/components/clientes/dialogo-desfavoritar.tsx` — a ficha do cliente tem
 * a mesma estrela e precisa da mesma conversa.
 *
 * 🔑 Quem confirma continua sendo o `ClientesManager` — `onConfirmar` e
 * `onCancelar` chegam prontos de lá. É por isso que a linha do cliente
 * continua montada na lista atrás do diálogo: é ela que devolve o foco ao
 * botão que abriu a conversa.
 */

import type { ClienteEtapa1 } from "@/lib/types";
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";

/** PL9 — excluir cliente era um clique, sem confirmação e sem rastro. */
export function DialogoExcluirCliente({
  excluindo,
  pending,
  erroDialogo,
  onConfirmar,
  onCancelar,
}: {
  excluindo: ClienteEtapa1;
  pending: boolean;
  erroDialogo: string | null;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  return (
<DialogoConfirmacao
  aberto
  titulo="Excluir este cliente?"
  descricao={excluindo.nome || "Cliente sem nome"}
  consequencia={
    <>
      Apaga nome, telefone, registro do contato, honorários e link do
      contrato de{" "}
      <strong>{excluindo.nome || "este cliente"}</strong>.{" "}
      <strong>Não dá para desfazer.</strong>
      {excluindo.acompanhado_equipe ? (
        <>
          {" "}
          Ele é o cliente acompanhado pela equipe: excluir também volta
          a travar os passos 4 a 8 da Etapa 01.
        </>
      ) : null}
    </>
  }
  rotuloConfirmar="Excluir cliente"
  rotuloConfirmando="Excluindo…"
  confirmando={pending}
  erro={erroDialogo}
      onConfirmar={onConfirmar}
      onCancelar={onCancelar}
    />
  );
}
