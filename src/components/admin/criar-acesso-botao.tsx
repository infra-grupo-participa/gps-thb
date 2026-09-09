"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * "Criar acesso" — só o BOTÃO é estático.
 *
 * O corpo do diálogo (`criar-acesso.tsx` + `cadastrar-aluno-form.tsx`, ~840
 * linhas, mais `CredenciaisView` e as actions de `admin/actions`) entra por
 * `next/dynamic`: o `/admin` é a tela que a equipe abre o dia inteiro para
 * OLHAR a lista, e criar acesso é o evento raro. Quem nunca clica não baixa
 * esse código.
 *
 * `ssr: false` porque o diálogo não renderiza nada antes do clique — não há
 * conteúdo a hidratar nem espaço a reservar, então não existe skeleton a
 * mostrar nem layout a deslocar.
 *
 * 🔑 Depois do primeiro clique o painel FICA montado (só o `open` muda). É o
 * que devolve o foco a este botão quando o diálogo fecha; desmontá-lo jogaria
 * o foco para o `<body>`. Cada NOVA abertura troca a `key`, então o painel
 * remonta zerado — o `reset()` que o botão antigo chamava antes de abrir.
 */
const CriarAcessoPainel = dynamic(
  () => import("./criar-acesso").then((m) => m.CriarAcessoPainel),
  { ssr: false },
);

export function CriarAcesso() {
  /** 0 = nunca abriu. Cada abertura incrementa e vira a `key` do painel. */
  const [abertura, setAbertura] = useState(0);
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => {
          setAbertura((n) => n + 1);
          setOpen(true);
        }}
      >
        <UserPlus className="size-4" /> Criar acesso
      </Button>

      {abertura > 0 ? (
        <CriarAcessoPainel key={abertura} open={open} onOpenChange={setOpen} />
      ) : null}
    </>
  );
}
