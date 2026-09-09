"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * "Tentar de novo" da tela de erro da Central.
 *
 * `router.refresh()` dentro de `useTransition`: sem a transição o clique não
 * dá sinal nenhum de que algo está acontecendo, e o admin clica três vezes
 * achando que o botão está morto. `aria-busy` + a troca do rótulo cobrem quem
 * enxerga e quem ouve.
 */
export function BotaoRecarregar() {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  return (
    <Button
      onClick={() => iniciar(() => router.refresh())}
      disabled={pendente}
      aria-busy={pendente || undefined}
    >
      <RefreshCw className="size-4" />
      {pendente ? "Conferindo…" : "Tentar de novo"}
    </Button>
  );
}
