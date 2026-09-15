"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErroPainel } from "@/components/ui/erro-painel";

/**
 * Falha ao montar a fila de ligações. Boundary de SEGMENTO — mesmo padrão de
 * `admin/clientes/error.tsx`: sem este arquivo a exceção sobe para
 * `src/app/error.tsx`, que substitui a página inteira e leva junto o header.
 */
export default function AdminFilaError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErroPainel
      titulo="Não foi possível carregar a fila de ligações"
      descricao="Nenhum registro foi perdido — a leitura é que falhou agora."
      digest={error.digest}
    >
      <Button onClick={() => reset()}>Tentar de novo</Button>
      <Link href="/admin" className={buttonVariants({ variant: "outline" })}>
        Voltar para o painel
      </Link>
    </ErroPainel>
  );
}
