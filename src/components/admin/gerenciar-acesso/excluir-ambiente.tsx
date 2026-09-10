"use client";

/**
 * A caixa vermelha "Excluir o ambiente inteiro". Fica em arquivo próprio pela
 * mesma razão que ela exige digitar EXCLUIR: é a ação mais destrutiva da tela
 * e não pode ficar diluída no meio do formulário de senha.
 *
 * 🔑 O texto digitado continua no estado do `GerenciarAcesso`, não aqui: é o
 * `abrir()` dele que zera a caixa a cada vez que o diálogo é aberto. Guardar
 * aqui faria a caixa se rearmar sozinha ao ir e voltar da tela do sócio.
 */

import { ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ExcluirAmbiente({
  pending,
  confirmaExclusao,
  setConfirmaExclusao,
  excluirAmbiente,
}: {
  pending: boolean;
  confirmaExclusao: string;
  setConfirmaExclusao: (texto: string) => void;
  excluirAmbiente: () => void;
}) {
  return (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <div className="mb-1 flex items-center gap-2 text-sm font-medium text-destructive">
            <ShieldAlert className="size-4" /> Excluir o ambiente inteiro
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Apaga tudo que existe no programa (clientes, progresso,
            diário, chamados) e o login de <strong>todos os membros</strong>{" "}
            (titular e sócios) — exceto o login que também tenha registro em
            outro portal do grupo, que é preservado e avisado ao final. O
            cadastro de cada um na base do Time Holding Brasil é preservado. Não tem volta — para digitar{" "}
            <span className="font-mono font-medium">EXCLUIR</span> e
            confirmar.
          </p>
          <div className="flex gap-2">
            <Input
              value={confirmaExclusao}
              onChange={(e) => setConfirmaExclusao(e.target.value)}
              placeholder="EXCLUIR"
              className="font-mono"
              autoComplete="off"
            />
            <Button
              variant="destructive"
              onClick={excluirAmbiente}
              disabled={pending || confirmaExclusao.trim() !== "EXCLUIR"}
            >
              <Trash2 className="size-4" /> Excluir ambiente
            </Button>
          </div>
        </div>
  );
}
