"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErroPainel } from "@/components/ui/erro-painel";

/**
 * Falha ao montar o acervo de materiais.
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
export default function MateriaisError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErroPainel
      titulo="Não foi possível carregar os materiais"
      descricao="As aulas e modelos continuam disponíveis — foi esta tela que não montou. Tente de novo."
      digest={error.digest}
    >
      <Button onClick={() => reset()}>Tentar de novo</Button>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        Ir para o início
      </Link>
    </ErroPainel>
  );
}
