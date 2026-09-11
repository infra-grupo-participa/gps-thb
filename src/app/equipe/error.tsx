"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErroPainel } from "@/components/ui/erro-painel";

/**
 * Falha ao montar a aba Equipe.
 *
 * Boundary de SEGMENTO (não o da raiz): a navegação continua de pé, e
 * "Tentar de novo" refaz só este trecho — mesmo padrão de
 * `src/app/chamados/error.tsx`.
 */
export default function EquipeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErroPainel
      titulo="Não foi possível carregar a Equipe"
      descricao="Ninguém foi removido nem convidado — a tela é que não veio agora. Tente de novo."
      digest={error.digest}
    >
      <Button onClick={() => reset()}>Tentar de novo</Button>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        Ir para o início
      </Link>
    </ErroPainel>
  );
}
