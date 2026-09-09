"use client";

/**
 * As duas confirmações do "Gerenciar acesso". Ficam em arquivo próprio porque
 * são CONVERSA, não formulário: cada uma existe para dizer o que a ação faz
 * antes de ela acontecer.
 *
 * 🔑 PL10 — remover sócio APAGA o login da pessoa e ficava a um clique, ao
 * lado de "Excluir ambiente", que exige digitar EXCLUIR. Duas ações
 * irreversíveis não podem ter dois níveis de atrito opostos.
 *
 * 🔑 Pentest de 09/09 — a conta do membro pode ser privilegiada em OUTRO
 * portal do grupo (`auth.users` é compartilhado por 7 sistemas). A action
 * devolve `precisaConfirmar` SEM ter mudado nada; é o segundo diálogo que
 * transforma isso em decisão consciente do admin.
 */

import type { MembroAcesso } from "@/app/admin/senha-actions";
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";

export function DialogoRemoverSocio({
  removendo,
  pending,
  erroRemocao,
  onConfirmar,
  onCancelar,
}: {
  removendo: MembroAcesso;
  pending: boolean;
  erroRemocao: string | null;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  return (
<DialogoConfirmacao
  aberto
  titulo="Remover este sócio do ambiente?"
  descricao={`${removendo.email ?? "Sócio sem e-mail"} · sócio deste ambiente`}
  consequencia={
    <>
      Remove o acesso de{" "}
      <strong>{removendo.email ?? "este sócio"}</strong> a este ambiente
      e <strong>apaga o login dele</strong>. Os clientes, o progresso e
      o histórico do ambiente continuam com o titular. Não dá para
      desfazer: para voltar, é preciso adicionar o sócio de novo e
      definir uma senha nova.
    </>
  }
  rotuloConfirmar="Remover sócio"
  rotuloConfirmando="Removendo…"
  confirmando={pending}
  erro={erroRemocao}
      onConfirmar={onConfirmar}
      onCancelar={onCancelar}
    />
  );
}

export function DialogoOutrosPortais({
  confirmaOutros,
  pending,
  onConfirmar,
  onCancelar,
}: {
  confirmaOutros: { membro: MembroAcesso; programas: string[] };
  pending: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  return (
<DialogoConfirmacao
  aberto
  destrutivo={false}
  titulo="Esta conta é usada em outros portais"
  descricao={confirmaOutros.membro.email ?? "Membro sem e-mail"}
  consequencia={
    <>
      Esta conta também é usada em:{" "}
      <strong>{confirmaOutros.programas.join(", ")}</strong>. Trocar a
      senha aqui derruba as sessões dela em todos os portais e a senha
      antiga deixa de funcionar em qualquer um deles. Avise a pessoa.
    </>
  }
  rotuloConfirmar="Trocar mesmo assim"
  rotuloConfirmando="Trocando…"
  confirmando={pending}
      onConfirmar={onConfirmar}
      onCancelar={onCancelar}
    />
  );
}
