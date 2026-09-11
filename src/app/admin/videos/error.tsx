"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErroPainel } from "@/components/ui/erro-painel";

/**
 * Falha ao montar a biblioteca de vídeos.
 *
 * 🔑 BOUNDARY DE SEGMENTO, não o da raiz — mesmo padrão de
 * `admin/chamados/error.tsx` e `admin/plantao/error.tsx`. Sem este arquivo a
 * exceção sobe para `src/app/error.tsx`, que substitui a página inteira: some
 * o header, somem as abas.
 */
export default function AdminVideosError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErroPainel
      titulo="Não foi possível carregar os vídeos"
      descricao="Nenhum vídeo foi perdido — a lista é que não veio agora."
      digest={error.digest}
    >
      <Button onClick={() => reset()}>Tentar de novo</Button>
      <Link href="/admin" className={buttonVariants({ variant: "outline" })}>
        Voltar para o painel
      </Link>
    </ErroPainel>
  );
}
