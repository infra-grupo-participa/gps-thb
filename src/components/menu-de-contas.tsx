"use client";

/**
 * O menu do canto superior direito — perfil, trocar de conta, sair.
 *
 * Pedido do Marcio (10/09/2026): "eu quero alternar entre contas existentes,
 * mudar rápido de um acesso pra outro... prefiro que ela fique na parte do
 * perfil ali, quando a gente clicar no perfil dele, no canto superior
 * direito".
 *
 * 🔑 As contas vêm de um cookie `httpOnly` — este componente recebe id,
 * e-mail e nome, NUNCA o refresh token. A troca acontece no servidor.
 *
 * 🔴 Só aparece a seção "trocar de conta" quando há OUTRA conta guardada.
 * Um menu que anuncia uma função e a mostra vazia é pior do que não ter a
 * função: a pessoa clica esperando algo e não encontra nada.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, UserRound, Repeat2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  esquecerContaDoMenu,
  sairDeTodas,
  trocarDeConta,
} from "@/app/contas/actions";

export interface ContaDoMenu {
  userId: string;
  email: string;
  nome: string | null;
}

function iniciais(nome: string | null, email: string): string {
  const base = (nome ?? email).trim();
  const partes = base.split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

export function MenuDeContas({
  nome,
  email,
  papelRotulo,
  outrasContas,
}: {
  nome: string | null;
  email: string | null;
  papelRotulo: string;
  /** As demais contas guardadas neste navegador. Sem a atual. */
  outrasContas: ContaDoMenu[];
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const router = useRouter();

  function trocar(userId: string) {
    setErro(null);
    iniciar(async () => {
      const r = await trocarDeConta(userId);
      // Sucesso redireciona no servidor; só volta aqui quando falha.
      if (r?.erro) {
        setErro(r.erro);
        router.refresh();
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex min-w-0 items-center gap-2 rounded-lg p-1 pr-2 transition hover:bg-superficie-afundada focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        aria-label="Sua conta"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-marca-solida text-xs font-bold text-white">
          {iniciais(nome, email ?? "")}
        </span>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block truncate text-sm leading-tight font-medium">
            {nome ?? email}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {email}
          </span>
        </span>
        <ChevronDown aria-hidden className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="grid gap-0.5">
          <span className="truncate corpo font-medium">{nome ?? email}</span>
          <span className="truncate corpo-sm font-normal text-muted-foreground">
            {email}
          </span>
          <Badge variant="secondary" className="mt-1 w-fit">
            {papelRotulo}
          </Badge>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem render={<Link href="/perfil" />}>
          <UserRound aria-hidden />
          Seu perfil
        </DropdownMenuItem>

        {outrasContas.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="corpo-sm font-normal text-muted-foreground">
              Trocar de conta
            </DropdownMenuLabel>

            {outrasContas.map((c) => (
              <div key={c.userId} className="flex items-center gap-1 pr-1">
                <DropdownMenuItem
                  className="min-w-0 flex-1"
                  disabled={pendente}
                  onSelect={(e) => {
                    e.preventDefault();
                    trocar(c.userId);
                  }}
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded bg-superficie-afundada text-[10px] font-bold">
                    {iniciais(c.nome, c.email)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate corpo-sm font-medium">
                      {c.nome ?? c.email}
                    </span>
                    {c.nome ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {c.email}
                      </span>
                    ) : null}
                  </span>
                  <Repeat2
                    aria-hidden
                    className="ml-auto size-4 shrink-0 text-muted-foreground"
                  />
                </DropdownMenuItem>

                <button
                  type="button"
                  aria-label={`Esquecer ${c.email} neste navegador`}
                  title="Esquecer neste navegador"
                  disabled={pendente}
                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-superficie-afundada hover:text-risco-foreground focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                  onClick={() =>
                    iniciar(async () => {
                      await esquecerContaDoMenu(c.userId);
                      router.refresh();
                    })
                  }
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              </div>
            ))}
          </>
        ) : null}

        {erro ? (
          <p role="alert" className="px-2 py-1.5 corpo-sm text-risco-foreground">
            {erro}
          </p>
        ) : null}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          disabled={pendente}
          onSelect={(e) => {
            e.preventDefault();
            iniciar(async () => {
              await sairDeTodas();
            });
          }}
        >
          <LogOut aria-hidden />
          Sair
        </DropdownMenuItem>

        {outrasContas.length > 0 ? (
          <p className="px-2 pb-1 text-xs text-muted-foreground">
            Sair encerra esta sessão e esquece as outras contas deste
            navegador.
          </p>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
