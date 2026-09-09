"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * "Gerenciar acesso" — só o BOTÃO é estático.
 *
 * O corpo do diálogo (`painel.tsx` e os seis arquivos desta pasta, mais
 * `credenciais-view` e `admin/senha-actions`) entra por `next/dynamic`. O
 * Modo Assistência é aberto o tempo todo para OLHAR o ambiente do aluno;
 * mexer no acesso dele é o evento raro.
 *
 * `ssr: false` porque nada disto renderiza antes do clique — não há conteúdo
 * a hidratar, então não há skeleton a mostrar nem altura a reservar.
 *
 * 🔑 Depois do primeiro clique o painel FICA montado (só o `open` muda): é o
 * que devolve o foco a este botão quando o diálogo fecha. Cada NOVA abertura
 * troca a `key`, então o painel remonta com o estado inicial — é o que o
 * `abrir()` antigo fazia à mão (tela principal, senha sugerida, status
 * recarregado), agora sem `setState` dentro de efeito.
 *
 * `previa-oculta` fica AQUI, no botão — é ele que a prévia "como o aluno vê"
 * precisa esconder, e ele continua no HTML inicial.
 */
const GerenciarAcessoPainel = dynamic(
  () => import("./painel").then((m) => m.GerenciarAcessoPainel),
  { ssr: false },
);

export function GerenciarAcesso({
  alunoId,
  nomeAluno,
}: {
  alunoId: string;
  nomeAluno?: string | null;
}) {
  /** 0 = nunca abriu. Cada abertura incrementa e vira a `key` do painel. */
  const [abertura, setAbertura] = useState(0);
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setAbertura((n) => n + 1);
          setOpen(true);
        }}
        className="previa-oculta"
      >
        <KeyRound className="size-4" /> Gerenciar acesso
      </Button>

      {abertura > 0 ? (
        <GerenciarAcessoPainel
          key={abertura}
          alunoId={alunoId}
          nomeAluno={nomeAluno}
          open={open}
          onOpenChange={setOpen}
        />
      ) : null}
    </>
  );
}
