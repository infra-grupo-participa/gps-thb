"use client";

/**
 * A conversa de UMA VEZ SÓ: escolher o cliente que a equipe vai acompanhar.
 *
 * 🔴 Desde a migração ...215 marcar a estrela é IRREVERSÍVEL para o aluno — o
 * banco recusa (42501) desmarcá-la, marcar outro cliente ou apagar o marcado, e
 * a troca passa a ser da equipe, por chamado. Um clique sem aviso escolhendo
 * uma coisa que não se desfaz é exatamente o que o `DialogoConfirmacao` existe
 * para impedir.
 *
 * Não é `destrutivo`: nada é apagado e o botão principal é o caminho que o
 * produto quer. O peso está na CONSEQUÊNCIA escrita, não no vermelho.
 *
 * Mora fora de `clientes-manager/` porque a estrela existe em dois lugares — a
 * lista/quadro e a ficha do cliente —, como já acontece com o irmão
 * `DialogoDesfavoritar` (que hoje só o admin vê).
 */

import type { ClienteEtapa1 } from "@/lib/types";
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";

export function DialogoEscolherFavorito({
  cliente,
  pending,
  erro,
  onConfirmar,
  onCancelar,
}: {
  cliente: ClienteEtapa1;
  pending: boolean;
  erro: string | null;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  return (
    <DialogoConfirmacao
      aberto
      destrutivo={false}
      titulo="Este será o cliente que a equipe acompanha"
      descricao={cliente.nome || "Cliente sem nome"}
      consequencia={
        <>
          {/* 🔴 A COPY DIZIA QUE A ESCOLHA ERA DEFINITIVA, e não é mais
              (corrigido em 10/09/2026). A trava só vale DEPOIS que a equipe
              confirma que assumiu o cliente.

              O texto antigo custou caro: dos 5 chamados abertos no primeiro
              dia de uso, os 5 eram sobre isso. Um parceiro escreveu "achei
              que favoritar era apenas para sinalizar por onde queria
              começar" — ele leu "definitivo" e marcou assim mesmo, porque
              não havia como entender o peso da escolha. */}
          Este é o cliente que a equipe vai acompanhar em todo o progresso da
          sua primeira holding. Você pode trocar enquanto a equipe ainda não
          assumiu; <strong>depois que ela assumir</strong>, a troca passa a ser
          pelo Suporte.
        </>
      }
      rotuloConfirmar="Escolher este cliente"
      rotuloConfirmando="Salvando…"
      confirmando={pending}
      erro={erro}
      onConfirmar={onConfirmar}
      onCancelar={onCancelar}
    />
  );
}
