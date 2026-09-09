"use client";

import { useState } from "react";
import { NotebookPen } from "lucide-react";
import { DiarioForm } from "@/components/admin/diario-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Nota rápida no card do painel `/admin` — escreve no Diário sem sair da lista.
 *
 * 🔴 Só existe dentro de `/admin`. `gps.aluno_notas` é EXCLUSIVA DO ADMIN
 * (migração 20260908000001, LGPD: o texto livre carrega dado de terceiro) —
 * nenhuma tela do aluno pode montar este componente.
 *
 * Zero action nova: reusa `DiarioForm`, que já chama `registrarNota` e já
 * revalida `/admin` — a nota aparece no card sem F5.
 *
 * `DialogTrigger` (em vez de um `Button` com `onClick` e estado solto) é o que
 * garante o foco de volta ao botão que abriu o diálogo quando ele fecha; sem
 * ele, o teclado volta para o `<body>` e a pessoa recomeça a navegação do topo
 * de uma lista de 100 cards.
 *
 * Anúncio do resultado: o erro é um `role="alert"` dentro do próprio
 * `DiarioForm` (fica na tela, ao lado do campo); o sucesso é o toast do Sonner,
 * que já é região viva. Não duplicamos aqui para o leitor de tela não ouvir a
 * mesma frase duas vezes.
 */
export function NotaRapida({
  alunoId,
  nomeDoAluno,
}: {
  alunoId: string;
  /** Só para rotular o botão e o diálogo — nunca vai para o banco. */
  nomeDoAluno: string;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={<Button type="button" variant="outline" size="sm" />}
        // O rótulo visível ("Nota rápida") se repete em todo card: sem o nome
        // no nome acessível, o leitor de tela lista 100 botões idênticos.
        aria-label={`Nota rápida no diário de ${nomeDoAluno}`}
      >
        <NotebookPen className="size-3.5" /> Nota rápida
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nota rápida — {nomeDoAluno}</DialogTitle>
          <DialogDescription>
            Fica no Diário do aluno. O aluno não vê.
          </DialogDescription>
        </DialogHeader>

        <DiarioForm
          alunoId={alunoId}
          variante="embutido"
          aoRegistrar={() => setAberto(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
