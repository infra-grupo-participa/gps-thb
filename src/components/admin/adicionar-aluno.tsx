"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Aluno } from "@/lib/types";
import { buscarAlunos, adicionarAlunoGps } from "@/app/admin/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AdicionarAluno() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<Aluno[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [pending, startTransition] = useTransition();

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    if (termo.trim().length < 2) return;
    setBuscando(true);
    try {
      setResultados(await buscarAlunos(termo));
    } finally {
      setBuscando(false);
    }
  }

  function adicionar(aluno: Aluno) {
    startTransition(async () => {
      const res = await adicionarAlunoGps(aluno.id);
      if (res.erro) {
        toast.error("Erro ao adicionar aluno.");
        return;
      }
      toast.success(`${aluno.nome ?? "Aluno"} adicionado ao GPS.`);
      setResultados((prev) => prev.filter((a) => a.id !== aluno.id));
      router.refresh();
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Adicionar aluno</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar aluno ao GPS</DialogTitle>
          <DialogDescription>
            Busque pelo nome ou e-mail do aluno já cadastrado no Time Holding
            Brasil.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={buscar} className="flex gap-2">
          <Input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Nome ou e-mail"
            autoFocus
          />
          <Button type="submit" variant="secondary" disabled={buscando}>
            {buscando ? "Buscando..." : "Buscar"}
          </Button>
        </form>

        <div className="max-h-72 overflow-y-auto">
          {resultados.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {termo.trim().length >= 2 && !buscando
                ? "Nenhum aluno encontrado (ou já está no GPS)."
                : "Digite ao menos 2 caracteres e busque."}
            </p>
          ) : (
            <ul className="divide-y">
              {resultados.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-2 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {a.nome ?? "—"}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {a.email}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => adicionar(a)}
                  >
                    Adicionar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
