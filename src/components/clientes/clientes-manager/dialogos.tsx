"use client";

/**
 * Os dois diálogos de confirmação da tela de clientes. Ficam num arquivo à
 * parte porque são CONVERSA, não lista: cada um existe para dizer o que a
 * ação apaga ou trava antes de ela acontecer.
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
      Apaga nome, telefone, registro do contato, perda pela inércia,
      honorários e link do contrato de{" "}
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

/** PL11 — desmarcar a estrela re-trava os passos 4 a 8 da Etapa 01. */
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
      <strong>passos 4 a 8 da Etapa 01 voltam a ficar travados</strong>{" "}
      e o destaque na sua página inicial some. Nenhum dado do cliente é
      apagado — dá para escolher outro (ou o mesmo) a qualquer momento.
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
