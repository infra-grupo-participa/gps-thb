"use client";

import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { ErroPainel } from "@/components/ui/erro-painel";

/**
 * Falha ao montar a tela de sessões com a equipe.
 *
 * 🔑 BOUNDARY DE SEGMENTO, não o da raiz. Sem este arquivo a exceção sobe
 * para `src/app/error.tsx`, que **substitui a página inteira** — some o
 * header, somem as abas, e a pessoa lê isso como "o sistema caiu". Aqui a
 * falha fica contida: a navegação continua de pé e "Tentar de novo" refaz só
 * este trecho.
 *
 * 🔴 A COPY NÃO AFIRMA CAUSA. Diz o que se sabe ("foi esta tela que não
 * montou") e o que continua valendo ("sua sessão, se você tiver uma,
 * continua marcada") — porque é verdade em qualquer causa. Atribuir a falha a
 * "outro sistema" ou a "instabilidade" é o erro que o portal já registrou
 * como pendência em `financeiro/error.tsx`, e que custou uma tentativa do
 * Marcio em 11/09.
 *
 * `error.digest` é o único fio entre a queixa do aluno e a linha do log;
 * `error.message` continua fora da tela.
 */
export default function SessoesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErroPainel
      titulo="Não foi possível carregar as sessões"
      descricao="Sua sessão, se você já tiver uma marcada, continua valendo — e nada foi agendado nem cancelado agora. Foi esta tela que não montou."
      digest={error.digest}
    >
      <Button onClick={() => reset()}>Tentar de novo</Button>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        Ir para o início
      </Link>
    </ErroPainel>
  );
}
