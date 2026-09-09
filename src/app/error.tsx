"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErroPainel } from "@/components/ui/erro-painel";

/**
 * Boundary de erro da raiz. Pega qualquer falha de render abaixo do root
 * layout que não tenha boundary mais próximo.
 *
 * O `error` era recebido e descartado: a tela não dizia nada e o log do
 * servidor não tinha como ser encontrado a partir da queixa. Agora o
 * `error.digest` aparece na tela. `error.message` continua fora — em produção
 * o Next já o substitui por texto genérico, mas em erro de cliente ele carrega
 * o texto cru da exceção, que não é para o aluno ler.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErroPainel
      titulo="Não foi possível carregar"
      descricao="Tivemos um problema momentâneo. Tente novamente ou volte ao início."
      digest={error.digest}
    >
      <Button onClick={() => reset()}>Tentar de novo</Button>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        Ir para o início
      </Link>
    </ErroPainel>
  );
}
