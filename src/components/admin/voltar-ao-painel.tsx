"use client";

/**
 * A VOLTA ao painel — o par de peças que faz "← Voltar aos alunos" devolver a
 * mesma tela de onde o admin saiu. A regra e o saneamento estão em
 * `painel-url.ts`.
 *
 * `RegistrarUrlDoPainel` fica montado em `/admin` e grava a URL a cada
 * mudança de estado; `VoltarAoPainel` (e a aba "Alunos" do header, via
 * `useUrlDoPainel`) lê a chave e navega para lá.
 *
 * 🔑 Por que um observador de URL, e não uma chamada em cada `setEstado`:
 * quem escreve o endereço são DOIS componentes independentes
 * (`useEstadoDoPainel` cuida de `q`/`ordem`/`f`, `AbasPainel` cuida de `aba`)
 * e o servidor cuida de `mais`. Observar o resultado — a URL — pega os três
 * sem espalhar gravação por três arquivos, e continua certo no dia em que
 * aparecer um quarto parâmetro.
 */

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";
import { gravarUrlDoPainel, lerUrlDoPainel, URL_PAINEL_PADRAO } from "./painel-url";

/** Grava a URL do painel enquanto o admin está nele. Não desenha nada. */
export function RegistrarUrlDoPainel() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Guarda de caminho: este componente só é montado em `/admin`, mas quem
    // grava a chave define para onde o "Voltar" vai — a condição fica explícita.
    if (pathname !== "/admin") return;
    const q = searchParams.toString().replace(/%2C/g, ",");
    gravarUrlDoPainel(q ? `/admin?${q}` : "/admin");
  }, [pathname, searchParams]);

  return null;
}

/**
 * `sessionStorage` não emite evento na própria aba, e quem escreve a chave é
 * outra rota (`/admin`). Não há a que se inscrever: a leitura acontece quando
 * o componente renderiza, e é isso que a tela precisa.
 */
const semAssinatura = () => () => {};

/**
 * A URL para onde "voltar ao painel" deve levar.
 *
 * 🔑 `useSyncExternalStore`, e não `useState` + `useEffect`: `sessionStorage`
 * é um sistema EXTERNO ao React e não existe no servidor. O snapshot de
 * servidor é o padrão (`/admin?aba=ativos`), então o HTML entregue já traz um
 * link válido — nem o Tab nem um clique rápido caem no vazio — e a troca pelo
 * valor real acontece sem `setState` dentro de efeito (que dispara
 * renderização em cascata e é reprovado pelo lint da casa).
 */
export function useUrlDoPainel(): string {
  return useSyncExternalStore(
    semAssinatura,
    lerUrlDoPainel,
    () => URL_PAINEL_PADRAO,
  );
}

/**
 * O link "← Voltar aos alunos" das telas do modo assistência.
 *
 * `<Link>` de verdade (não um `<button>` com `router.push`): abrir em nova aba,
 * copiar o endereço e o menu de contexto continuam funcionando, e o destino é
 * sempre um caminho interno saneado.
 */
export function VoltarAoPainel({
  rotulo = "← Voltar aos alunos",
  className,
}: {
  rotulo?: string;
  className?: string;
}) {
  const href = useUrlDoPainel();
  return (
    <Link
      href={href}
      prefetch={false}
      className={cn(
        "previa-oculta foco-visivel rounded-sm text-sm text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {rotulo}
    </Link>
  );
}
