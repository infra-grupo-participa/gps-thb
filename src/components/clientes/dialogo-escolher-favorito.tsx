"use client";

/**
 * A conversa de UMA VEZ SÓ: escolher o cliente que a equipe vai acompanhar.
 *
 * 🔴 **Migração ...304 (23/09/2026)** — marcar a estrela é reversível ENQUANTO
 * o cliente estiver em Prospecção sem reunião marcada. A partir do momento em
 * que o caso anda (sai de Prospecção ou ganha data de reunião preliminar), o
 * banco recusa (42501) desmarcá-la, marcar outro ou apagar o marcado, e a troca
 * passa a ser da equipe, por chamado.
 *
 * O diálogo continua existindo porque a escolha AINDA tem consequência: ela
 * endurece sozinha quando o aluno avança o cliente, e ele precisa saber disso
 * antes, não depois.
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
          {/* 🔴 A COPY MUDOU DUAS VEZES, e as duas por medida:
              (a) 10/09/2026 — dizia "definitiva" desde o clique e a trava só
              valia depois da confirmação da equipe. Dos 5 chamados do primeiro
              dia de uso, os 5 eram sobre isso.
              (b) 23/09/2026 — dizia "enquanto a equipe não assumir", e a equipe
              NUNCA assumia: 37 clientes escolhidos, 0 confirmados em 3 meses.
              A frase prometia um marco que não chegava, e vieram 7 chamados.

              Agora ela nomeia o que o próprio aluno faz e vê acontecer: mover
              o cliente de fase ou marcar a reunião. */}
          Este é o cliente que a equipe vai acompanhar em todo o progresso da
          sua primeira holding. Você pode trocar enquanto ele estiver em{" "}
          <strong>Prospecção e sem reunião preliminar marcada</strong>; assim
          que o caso avançar, a troca passa a ser pelo Suporte.
          {/* 🔴 A escolha só acontece no BOTÃO (23/09/2026). Quem lê a
              consequência e fecha no X não marca ninguém, e entende que o
              sistema recusou — foi o chamado da T53 ("não aceita marcar o
              cliente principal") num ambiente sem nenhuma trava. A frase
              nomeia o botão porque é ele que decide, não a estrela. */}
          <span className="mt-2 block">
            Para confirmar, clique em{" "}
            <strong>&ldquo;Escolher este cliente&rdquo;</strong> abaixo.
          </span>
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
