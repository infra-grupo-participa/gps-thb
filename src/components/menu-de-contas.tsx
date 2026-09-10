"use client";

/**
 * O menu do canto superior direito — perfil, trocar de conta, sair.
 *
 * Pedido do Marcio (10/09/2026): "eu quero alternar entre contas existentes,
 * mudar rápido de um acesso pra outro... prefiro que ela fique na parte do
 * perfil ali, quando a gente clicar no perfil dele, no canto superior
 * direito".
 *
 * 🔴 SEM BIBLIOTECA DE PROPÓSITO. A primeira versão usava `DropdownMenu`
 * (Base UI, via shadcn) e o menu simplesmente NÃO ABRIA — o Marcio ficou
 * sem conseguir sair nem trocar de conta o dia inteiro. A primeira causa
 * (o gerador do shadcn escreveu `import { cn } from "cn"`, módulo
 * inexistente) foi corrigida e NÃO BASTOU.
 *
 * Depois de esgotar a investigação (estrutura Portal→Positioner→Popup,
 * conflito de classes `w-*`, CSS global, versão do pacote) sem achar a
 * causa, a decisão foi REMOVER A DEPENDÊNCIA. Um menu de 3 itens não
 * justifica portal, âncora e camada de posicionamento — e não justifica,
 * de jeito nenhum, bloquear o logout.
 *
 * ⚠️ NÃO reintroduzir `DropdownMenu` aqui sem antes provar, no navegador,
 * que ele abre.
 *
 * O que tem: Esc fecha (e devolve o foco ao gatilho), clique fora fecha,
 * `aria-expanded`/`aria-haspopup`, `role="menu"`/`role="menuitem"`.
 * O que NÃO tem, por escolha: navegação por setas — três itens são
 * alcançáveis por Tab, e a alternativa era manter o que quebrou.
 *
 * 🔑 As contas vêm de um cookie `httpOnly` — este componente recebe id,
 * e-mail e nome, NUNCA o refresh token. A troca acontece no servidor.
 *
 * 🔴 Só aparece a seção "trocar de conta" quando há OUTRA conta guardada.
 * Um menu que anuncia uma função e a mostra vazia é pior do que não ter a
 * função: a pessoa clica esperando algo e não encontra nada.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, UserRound, Repeat2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const router = useRouter();

  const caixaRef = useRef<HTMLDivElement>(null);
  const gatilhoRef = useRef<HTMLButtonElement>(null);

  // Esc fecha e devolve o foco ao gatilho — quem abriu pelo teclado não
  // pode ficar com o foco perdido no corpo da página.
  useEffect(() => {
    if (!aberto) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setAberto(false);
        gatilhoRef.current?.focus();
      }
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberto]);

  // Clique fora fecha.
  useEffect(() => {
    if (!aberto) return;
    function aoClicar(e: MouseEvent) {
      if (!caixaRef.current?.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", aoClicar);
    return () => document.removeEventListener("mousedown", aoClicar);
  }, [aberto]);

  const itemBase =
    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left corpo-sm transition hover:bg-superficie-afundada focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

  function trocar(userId: string) {
    setErro(null);
    iniciar(async () => {
      const r = await trocarDeConta(userId);
      if (r?.erro) {
        setErro(r.erro);
        router.refresh();
        return;
      }
      // 🔑 Quem navega é o CLIENTE. A action não chama `redirect()`: ele
      // funciona lançando uma exceção, e dentro de um `useTransition` que dá
      // `await` no retorno isso quebrava a navegação — o clique caía em
      // "rota não encontrada".
      //
      // `router.replace` (não `push`): a tela anterior era da conta que
      // acabou de sair; deixá-la no histórico faria o "voltar" do navegador
      // mostrar dados de outra conta.
      setAberto(false);
      router.replace(r?.destino ?? "/");
      router.refresh();
    });
  }

  return (
    <div ref={caixaRef} className="relative">
      <button
        ref={gatilhoRef}
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label="Sua conta"
        className="flex min-w-0 items-center gap-2 rounded-lg p-1 pr-2 transition hover:bg-superficie-afundada focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
        <ChevronDown
          aria-hidden
          className={
            "size-4 shrink-0 text-muted-foreground transition-transform " +
            (aberto ? "rotate-180" : "")
          }
        />
      </button>

      {aberto ? (
        <div
          role="menu"
          aria-label="Sua conta"
          className="absolute top-full right-0 z-50 mt-2 w-72 rounded-xl border border-borda-fina bg-card p-1.5 shadow-lg"
        >
          <div className="grid gap-0.5 px-2 py-1.5">
            <span className="truncate corpo font-medium">{nome ?? email}</span>
            <span className="truncate corpo-sm text-muted-foreground">
              {email}
            </span>
            <Badge variant="secondary" className="mt-1 w-fit">
              {papelRotulo}
            </Badge>
          </div>

          <div className="my-1 h-px bg-borda-fina" />

          {/* 🔴 "Seu perfil" some para o admin: `/perfil` redireciona quem é
              admin para `/admin`, então o clique EJETAVA a pessoa da tela em
              que ela estava. Item que leva para outro lugar não é item. */}
          {papelRotulo === "Admin" ? null : (
            <Link
              href="/perfil"
              role="menuitem"
              className={itemBase}
              onClick={() => setAberto(false)}
            >
              <UserRound aria-hidden className="size-4" />
              Seu perfil
            </Link>
          )}

          {outrasContas.length > 0 ? (
            <>
              <div className="my-1 h-px bg-borda-fina" />
              <p className="px-2 py-1 corpo-sm text-muted-foreground">
                Trocar de conta
              </p>

              {outrasContas.map((c) => (
                <div key={c.userId} className="flex items-center gap-1">
                  <button
                    type="button"
                    role="menuitem"
                    disabled={pendente}
                    onClick={() => trocar(c.userId)}
                    className={itemBase + " min-w-0 flex-1"}
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center rounded bg-superficie-afundada text-[10px] font-bold">
                      {iniciais(c.nome, c.email)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
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
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                  </button>

                  <button
                    type="button"
                    aria-label={`Esquecer ${c.email} neste navegador`}
                    title="Esquecer neste navegador"
                    disabled={pendente}
                    className="shrink-0 rounded p-1 text-muted-foreground transition hover:bg-superficie-afundada hover:text-risco-foreground focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
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
            <p
              role="alert"
              className="px-2 py-1.5 corpo-sm text-risco-foreground"
            >
              {erro}
            </p>
          ) : null}

          <div className="my-1 h-px bg-borda-fina" />

          <button
            type="button"
            role="menuitem"
            disabled={pendente}
            className={itemBase}
            onClick={() =>
              iniciar(async () => {
                const r = await sairDeTodas();
                setAberto(false);
                router.replace(r?.destino ?? "/login");
                router.refresh();
              })
            }
          >
            <LogOut aria-hidden className="size-4" />
            {pendente ? "Saindo…" : "Sair"}
          </button>

          {outrasContas.length > 0 ? (
            <p className="px-2 pt-1 pb-0.5 text-xs text-muted-foreground">
              Sair encerra esta sessão e esquece as outras contas deste
              navegador.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
