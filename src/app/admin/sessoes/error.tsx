"use client";

import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { ErroPainel } from "@/components/ui/erro-painel";

/**
 * Falha ao montar `/admin/sessoes`. Boundary de SEGMENTO — sem este arquivo a
 * exceção sobe para `src/app/error.tsx` e derruba o header e a navegação
 * inteira junto (mesmo raciocínio de `src/app/sessoes/error.tsx`, fatia 4).
 *
 * A copy não afirma causa: diz o que se sabe (esta tela não montou) e o que
 * continua valendo (nada foi cancelado nem alterado).
 */
export default function AdminSessoesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErroPainel
      titulo="Não foi possível carregar as sessões"
      descricao="Nenhuma sessão foi alterada — foi esta tela que não montou."
      digest={error.digest}
    >
      <Button onClick={() => reset()}>Tentar de novo</Button>
      <Link href="/admin" className={buttonVariants({ variant: "outline" })}>
        Voltar para o painel
      </Link>
    </ErroPainel>
  );
}
