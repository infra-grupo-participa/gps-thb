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
 *
 * 🔑 `DialogoTrocarEmail` (11/09/2026) — a mesma lógica, para a troca de
 * e-mail do login. Quando `emailJaEmUso` é `true` NÃO é confirmação: é erro
 * dentro do próprio diálogo, sem botão de confirmar — `admin_trocar_email_login`
 * nunca funde identidade (P0003), então não há "trocar mesmo assim" possível.
 */

import type { MembroAcesso } from "@/lib/acesso-tipos";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

/**
 * Confirma a troca de e-mail do login (nomeando origem → destino, os portais
 * afetados, se cai sessão, se sai senha nova e se o cadastro é alinhado
 * junto). Quando `emailJaEmUso` é `true`, não há o que confirmar — a RPC
 * recusa com P0003 e não funde identidade; o diálogo vira aviso de erro, sem
 * botão de confirmar, com a instrução do que fazer.
 */
export function DialogoTrocarEmail({
  emailAntigo,
  emailNovo,
  programas,
  gerarSenha,
  alinharCadastro,
  emailJaEmUso,
  pending,
  erro,
  onConfirmar,
  onCancelar,
}: {
  emailAntigo: string | null;
  emailNovo: string;
  /** Portais do grupo onde esta conta também tem papel (fora do "programa"). */
  programas: string[];
  gerarSenha: boolean;
  alinharCadastro: boolean;
  emailJaEmUso: boolean;
  pending: boolean;
  erro: string | null;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  if (emailJaEmUso) {
    return (
      <Dialog open onOpenChange={(v) => !v && onCancelar()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Este e-mail já tem outra conta</DialogTitle>
            <DialogDescription>{emailNovo}</DialogDescription>
          </DialogHeader>
          <p className="text-sm">
            <strong>{emailNovo}</strong> já é o login de outra conta no grupo.
            A troca não funde identidades — remova o acesso duplicado antes
            (em &ldquo;Gerenciar acesso&rdquo; daquele outro ambiente) ou use
            um endereço diferente para este membro.
          </p>
          <p aria-live="assertive" className="text-xs text-destructive empty:hidden">
            {erro}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={onCancelar}>
              Voltar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <DialogoConfirmacao
      aberto
      destrutivo={programas.length > 0}
      titulo="Trocar o e-mail do login?"
      descricao={`${emailAntigo ?? "sem e-mail"} → ${emailNovo}`}
      consequencia={
        <>
          O login passa de <strong>{emailAntigo ?? "sem e-mail"}</strong>{" "}
          para <strong>{emailNovo}</strong>.{" "}
          {programas.length > 0 ? (
            <>
              Esta conta também é usada em:{" "}
              <strong>{programas.join(", ")}</strong>. A troca vale para
              todos os portais do grupo.{" "}
            </>
          ) : null}
          As sessões abertas desta pessoa caem, e ela só entra de novo com o
          e-mail novo.{" "}
          {gerarSenha
            ? "Uma senha nova também será gerada."
            : "A senha atual é mantida."}{" "}
          {alinharCadastro
            ? "O e-mail do cadastro é atualizado junto."
            : "O e-mail do cadastro não muda."}
        </>
      }
      rotuloConfirmar="Trocar e-mail"
      rotuloConfirmando="Trocando…"
      confirmando={pending}
      erro={erro}
      onConfirmar={onConfirmar}
      onCancelar={onCancelar}
    />
  );
}
