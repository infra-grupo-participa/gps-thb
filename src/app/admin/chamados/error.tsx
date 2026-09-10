"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErroPainel } from "@/components/ui/erro-painel";

/**
 * Falha ao montar a fila de chamados da equipe.
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
export default function AdminChamadosError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErroPainel
      titulo="Não foi possível carregar a fila de chamados"
      descricao="Nenhum chamado foi perdido — a fila é que não veio agora."
      digest={error.digest}
    >
      <Button onClick={() => reset()}>Tentar de novo</Button>
      <Link href="/admin" className={buttonVariants({ variant: "outline" })}>
        Voltar para o painel
      </Link>
    </ErroPainel>
  );
}
