"use client";

/**
 * "Excluir ambiente". Fica em arquivo próprio pela mesma razão que exige
 * digitar EXCLUIR: é a ação mais destrutiva da tela.
 *
 * 🔑 Fechada por padrão (03/10/2026): a caixa vermelha aberta com um parágrafo
 * de seis linhas era metade do diálogo, para uma ação rara. Agora é um botão
 * discreto; o aviso e a confirmação só aparecem quando alguém pede.
 * O que o aviso diz é o que muda a decisão (o que some e que não tem volta);
 * as exceções — login com outro portal preservado, cadastro na base THB
 * preservado — são avisadas no fim da própria ação.
 *
 * 🔑 O texto digitado continua no estado do `GerenciarAcesso`, não aqui: é o
 * `abrir()` dele que zera a caixa a cada vez que o diálogo é aberto. Guardar
 * aqui faria a caixa se rearmar sozinha ao ir e voltar da tela do sócio.
 */

import { useState } from "react";
import { Trash2 } from "lucide-react";
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
  const [aberto, setAberto] = useState(false);

  if (!aberto) {
    return (
      <div className="border-t pt-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="px-0 text-destructive hover:bg-transparent hover:text-destructive"
          onClick={() => setAberto(true)}
        >
          <Trash2 className="size-4" /> Excluir ambiente
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
      <p className="text-sm">
        <strong className="text-destructive">Sem volta.</strong> Apaga clientes,
        progresso, diário, chamados e o login de todos os membros.
      </p>
      <div className="flex gap-2">
        <Input
          value={confirmaExclusao}
          onChange={(e) => setConfirmaExclusao(e.target.value)}
          placeholder="digite EXCLUIR"
          aria-label="Digite EXCLUIR para confirmar"
          className="font-mono"
          autoComplete="off"
          autoFocus
        />
        <Button
          variant="destructive"
          onClick={excluirAmbiente}
          disabled={pending || confirmaExclusao.trim() !== "EXCLUIR"}
        >
          <Trash2 className="size-4" /> Excluir
        </Button>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="justify-self-start px-0 text-muted-foreground"
        onClick={() => {
          setConfirmaExclusao("");
          setAberto(false);
        }}
      >
        Cancelar
      </Button>
    </div>
  );
}
