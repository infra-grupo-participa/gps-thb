"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErroPainel } from "@/components/ui/erro-painel";

/**
 * Falha ao montar a aba Clientes. Boundary de segmento (e não só o da raiz)
 * porque a falha aqui é localizada — `getClientesEtapa1` cai, o resto do
 * portal continua de pé — e "Tentar de novo" refaz só esta página.
 */
export default function ClientesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErroPainel
      titulo="Não foi possível carregar seus clientes"
      descricao="A lista não veio agora. Nada do que você cadastrou foi perdido — tente de novo em instantes."
      digest={error.digest}
    >
      <Button onClick={() => reset()}>Tentar de novo</Button>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        Ir para o início
      </Link>
    </ErroPainel>
  );
}
