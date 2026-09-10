"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErroPainel } from "@/components/ui/erro-painel";

/**
 * Falha ao montar a administração do Plantão.
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
export default function AdminPlantaoError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErroPainel
      titulo="Não foi possível carregar o Plantão"
      descricao="Os plantões publicados e as inscrições não foram afetados. Foi esta tela que não montou."
      digest={error.digest}
    >
      <Button onClick={() => reset()}>Tentar de novo</Button>
      <Link href="/admin" className={buttonVariants({ variant: "outline" })}>
        Voltar para o painel
      </Link>
    </ErroPainel>
  );
}
