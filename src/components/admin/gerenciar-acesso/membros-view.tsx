"use client";

/**
 * Quem tem acesso a este ambiente: titular e sócios, com o DIAGNÓSTICO de cada
 * um e os remédios (senha, e-mail, remover).
 *
 * 🔑 A linha só FALA quando há problema (sem senha, e-mail pendente, nunca
 * entrou). Estado bom é silencioso: o e-mail, o papel e a data do último
 * acesso bastam. Ações são ícones com `aria-label` — rótulo por extenso em
 * três botões quebrava a linha em quatro andares no diálogo (03/10/2026).
 *
 * 🔑 O titular NÃO tem o ícone de senha na linha: a senha dele é o formulário
 * logo abaixo, que devolve a credencial pronta para o WhatsApp. Duas portas
 * para a mesma ação confundiam.
 *
 * Só lista e avisa: nenhuma escrita mora aqui. Quem chama é o
 * `GerenciarAcesso`, que confirma a remoção num diálogo à parte e mantém esta
 * linha montada atrás dele — é assim que o foco volta ao botão "Remover".
 */

import { KeyRound, Mail, UserMinus, UserPlus, Users } from "lucide-react";
import type { MembroAcesso, StatusAcesso } from "@/lib/acesso-tipos";
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
  onTrocarEmail,
}: {
  status: StatusAcesso | null;
  carregando: boolean;
  pending: boolean;
  onAdicionarSocio: () => void;
  onExcluirMembro: (m: MembroAcesso) => void;
  /** F.3 — abre a tela de senha do membro (só sócio com login). */
  onDefinirSenhaMembro: (m: MembroAcesso) => void;
  /** Troca o e-mail do login deste membro (só quem já tem login). */
  onTrocarEmail: (m: MembroAcesso) => void;
}) {
  if (carregando) {
    return <p className="text-sm text-muted-foreground">Conferindo o acesso…</p>;
  }
  if (!status) return null;

  return (
    <section aria-label="Membros do ambiente" className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-medium">
          <Users className="size-4 text-muted-foreground" aria-hidden />
          Membros
          <span className="text-muted-foreground tabular-nums">
            {status.qtdMembros}
          </span>
          {status.solicitacaoPendente ? (
            <Badge variant="outline" className="text-[10px]">
              solicitação pendente
            </Badge>
          ) : null}
        </h3>
        <Button type="button" variant="ghost" size="sm" onClick={onAdicionarSocio}>
          <UserPlus className="size-4" /> Sócio
        </Button>
      </div>

      <ul className="divide-y rounded-md border">
        {status.membros.map((m) => {
          const titular = m.papel === "titular";
          const alertas = [
            m.userId && !m.temSenha ? "sem senha" : null,
            m.userId && !m.emailConfirmado ? "e-mail pendente" : null,
            !m.userId ? "sem login" : null,
          ].filter(Boolean) as string[];
          return (
            <li key={m.membroId} className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="truncate text-sm font-medium"
                    title={m.email ?? undefined}
                  >
                    {m.email ?? "sem e-mail"}
                  </span>
                  <Badge
                    variant={titular ? "secondary" : "outline"}
                    className="shrink-0 text-[10px]"
                  >
                    {titular ? "titular" : "sócio"}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span
                    title={
                      m.ultimoAcesso
                        ? `Último acesso: ${formatarDataHora(m.ultimoAcesso)}`
                        : undefined
                    }
                  >
                    {m.ultimoAcesso
                      ? `entrou ${formatarData(m.ultimoAcesso)}`
                      : "nunca entrou"}
                  </span>
                  {alertas.map((a) => (
                    <span key={a} className="font-medium text-destructive">
                      {a}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex shrink-0 items-center">
                {/* Sem `userId` não há conta em `auth.users`: os ícones SOMEM
                    em vez de aparecer desabilitados — a linha já diz "sem login". */}
                {m.userId && !titular ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={pending}
                    onClick={() => onDefinirSenhaMembro(m)}
                    aria-label={`Definir senha de ${m.email ?? "sócio"}`}
                    title="Definir senha"
                  >
                    <KeyRound className="size-4" />
                  </Button>
                ) : null}
                {m.userId ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={pending}
                    onClick={() => onTrocarEmail(m)}
                    aria-label={`Trocar e-mail de ${m.email ?? "membro"}`}
                    title="Trocar e-mail"
                  >
                    <Mail className="size-4" />
                  </Button>
                ) : null}
                {!titular ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    disabled={pending}
                    onClick={() => onExcluirMembro(m)}
                    aria-label={`Remover ${m.email ?? "sócio"} do ambiente`}
                    title="Remover sócio"
                  >
                    <UserMinus className="size-4" />
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
