"use client";

/**
 * "Troca de cliente" — decisão #1 do briefing (11/09/2026): o cliente ATUAL
 * vem TRAVADO (o sistema já sabe quem é, ninguém digita) e o NOVO é escolhido
 * numa lista do PRÓPRIO ambiente, com busca (até 110 clientes — não é um
 * `<select>` simples). Nada de texto livre: nome digitado errado vira
 * retrabalho para a equipe.
 */

import { Label } from "@/components/ui/label";
import {
  SeletorCliente,
  type OpcaoCliente,
} from "@/components/chamados/seletor-cliente";

export function CampoTrocaCliente({
  id,
  clienteAtualId,
  clienteAtualNome,
  clientes,
  novo,
  onEscolherNovo,
  desabilitado,
  invalido,
}: {
  id: string;
  clienteAtualId: string | null;
  clienteAtualNome: string | null;
  clientes: OpcaoCliente[];
  novo: OpcaoCliente | null;
  onEscolherNovo: (c: OpcaoCliente) => void;
  desabilitado?: boolean;
  invalido?: boolean;
}) {
  if (!clienteAtualId) {
    return (
      <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
        Você ainda não marcou um cliente como favorito da equipe. Marque a
        estrela na aba Clientes antes de pedir a troca.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <span className="rotulo text-muted-foreground" id={`${id}-atual-rotulo`}>
          Cliente atual
        </span>
        <p
          aria-labelledby={`${id}-atual-rotulo`}
          className="rounded-lg border border-input bg-muted px-2.5 py-1.5 text-sm text-muted-foreground"
        >
          {clienteAtualNome || "Cliente sem nome"}
        </p>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-novo`}>Trocar para</Label>
        <SeletorCliente
          id={`${id}-novo`}
          clientes={clientes}
          excluirId={clienteAtualId}
          valor={novo}
          onEscolher={onEscolherNovo}
          desabilitado={desabilitado}
          invalido={invalido}
          placeholder="Digite o nome do novo cliente…"
        />
      </div>
    </div>
  );
}
