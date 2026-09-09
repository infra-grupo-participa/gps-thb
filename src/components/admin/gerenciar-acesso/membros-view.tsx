"use client";

/**
 * Quem tem acesso a este ambiente: titular e sócios, com o DIAGNÓSTICO de cada
 * um (tem senha? e-mail confirmado? último acesso?) e os dois remédios —
 * definir senha e remover.
 *
 * 🔑 Só lista e avisa: nenhuma escrita mora aqui. Quem chama é o
 * `GerenciarAcesso`, que confirma a remoção num diálogo à parte e mantém esta
 * linha montada atrás dele — é assim que o foco volta ao botão "Remover".
 */

import { KeyRound, Users, UserPlus, UserMinus } from "lucide-react";
import type {
  MembroAcesso,
  StatusAcesso,
} from "@/app/admin/senha-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatarData, formatarDataHora } from "@/lib/datas";

export function MembrosView({
  status,
  carregando,
  pending,
  onAdicionarSocio,
  onExcluirMembro,
  onDefinirSenhaMembro,
}: {
  status: StatusAcesso | null;
  carregando: boolean;
  pending: boolean;
  onAdicionarSocio: () => void;
  onExcluirMembro: (m: MembroAcesso) => void;
  /** F.3 — abre a tela de senha do membro (só quem já tem login). */
  onDefinirSenhaMembro: (m: MembroAcesso) => void;
}) {
  if (carregando) {
    return (
      <p className="text-sm text-muted-foreground">Conferindo o acesso…</p>
    );
  }
  if (!status) return null;

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Users className="size-4 text-muted-foreground" />
          {status.qtdMembros > 1
            ? `Ambiente compartilhado — ${status.qtdMembros} pessoas`
            : "Ambiente individual"}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAdicionarSocio}
        >
          <UserPlus className="size-4" /> Adicionar sócio
        </Button>
      </div>

      <ul className="grid gap-2">
        {status.membros.map((m) => (
          <li
            key={m.membroId}
            className="flex flex-wrap items-center justify-between gap-2 rounded border px-2.5 py-2 text-sm"
          >
            {/* `flex-wrap` + `min-w-0`: com dois botões rotulados na linha
                (Definir senha · Remover) e um e-mail longo, no diálogo do
                celular a linha quebra em vez de espremer o e-mail a 3 letras. */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-medium">
                  {m.email ?? "sem e-mail"}
                </span>
                <Badge
                  variant={m.papel === "titular" ? "secondary" : "outline"}
                  className="text-[10px]"
                >
                  {m.papel === "titular" ? "titular" : "sócio"}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {m.temSenha ? "tem senha" : "sem senha"} ·{" "}
                {m.emailConfirmado ? "e-mail confirmado" : "e-mail não confirmado"}
                {m.ultimoAcesso
                  ? ` · último acesso ${formatarData(m.ultimoAcesso)}`
                  : " · nunca entrou"}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {/* Sem `userId` não há conta em `auth.users` para receber senha:
                  o botão SOME em vez de aparecer desabilitado sem explicação —
                  o diagnóstico da linha acima já diz "sem senha/nunca entrou". */}
              {m.userId ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => onDefinirSenhaMembro(m)}
                >
                  <KeyRound className="size-4" /> Definir senha
                </Button>
              ) : null}
              {m.papel === "socio" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={pending}
                  onClick={() => onExcluirMembro(m)}
                >
                  <UserMinus className="size-4" /> Remover
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-xs text-muted-foreground">
        {status.ultimoAcesso
          ? `Último acesso do titular: ${formatarDataHora(status.ultimoAcesso)}`
          : "O titular nunca entrou no portal."}
        {status.solicitacaoPendente ? " · há solicitação pendente" : ""}
      </p>
    </div>
  );
}
