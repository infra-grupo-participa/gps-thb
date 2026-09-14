"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErroPainel } from "@/components/ui/erro-painel";

/**
 * Falha ao montar a lista consolidada de clientes.
 *
 * Boundary de SEGMENTO, não o da raiz — mesmo padrão de
 * `admin/videos/error.tsx` e `admin/chamados/error.tsx`. Sem este arquivo a
 * exceção sobe para `src/app/error.tsx`, que substitui a página inteira: some
 * o header, somem as abas do admin.
 */
export default function AdminClientesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErroPainel
      titulo="Não foi possível carregar a lista de clientes"
      descricao="Nenhum cliente foi perdido — a leitura é que falhou agora."
      digest={error.digest}
    >
      <Button onClick={() => reset()}>Tentar de novo</Button>
      <Link href="/admin" className={buttonVariants({ variant: "outline" })}>
        Voltar para o painel
      </Link>
    </ErroPainel>
  );
}
