"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErroPainel } from "@/components/ui/erro-painel";

/**
 * Falha ao montar o painel do admin.
 *
 * 🔑 BOUNDARY DE SEGMENTO, não o da raiz. Sem este arquivo a exceção sobe
 * para `src/app/error.tsx`, que **substitui a página inteira** — some o
 * header, somem as abas, e a pessoa lê isso como "o sistema caiu". Aqui a
 * falha fica contida nesta área: a navegação continua de pé e "Tentar de
 * novo" refaz só este trecho.
 *
 * Motivo de existir (10/09/2026): o log de produção mostrou
 * `TypeError: fetch failed` intermitente na saída de rede da Hostinger.
 * Uma falha de rede de UMA consulta não pode parecer queda do portal.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErroPainel
      titulo="Não foi possível carregar o painel"
      descricao="Nenhum dado de aluno foi alterado. Foi a tela que não montou — tente de novo."
      digest={error.digest}
    >
      <Button onClick={() => reset()}>Tentar de novo</Button>
      <Link href="/admin" className={buttonVariants({ variant: "outline" })}>
        Recarregar o painel
      </Link>
    </ErroPainel>
  );
}
