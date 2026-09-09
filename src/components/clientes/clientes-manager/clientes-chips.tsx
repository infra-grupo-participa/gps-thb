"use client";

/**
 * Os controles pequenos e repetidos da tela de clientes: chip de filtro,
 * alternador lista/quadro, estrela do cliente da equipe, atalho de WhatsApp e
 * a marca do cliente que recusou. Ficam juntos porque são a mesma família
 * visual e aparecem nas TRÊS visões (tabela, quadro e card do celular).
 */

import { MessageCircle, Star } from "lucide-react";
import type { ClienteEtapa1 } from "@/lib/types";

/**
 * Vestígio do modelo antigo de 5 status: sem esta marca, o cliente que disse
 * "não" sumiria dentro de "Prospecção" e o aluno o reprospectaria. Some
 * sozinha quando a coluna `status` for removida do banco.
 */
export function MarcaRecusou({
  cliente,
  className = "ml-2",
}: {
  cliente: ClienteEtapa1;
  className?: string;
}) {
  if (cliente.status !== "recusou") return null;
  return (
    <span
      title="Registro anterior às fases: este cliente foi marcado como “Recusou” no modelo antigo de status, que saiu do ar."
      className={
        "inline-flex shrink-0 items-center rounded-full border border-destructive/30 px-1.5 py-0.5 align-middle text-[10px] font-medium text-destructive " +
        className
      }
    >
      Recusou
    </span>
  );
}

export function WhatsappLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Abrir no WhatsApp"
      className="inline-flex items-center text-green-600 hover:text-green-700"
      onClick={(e) => e.stopPropagation()}
    >
      <MessageCircle className="size-4" />
    </a>
  );
}

export function StarButton({
  ativo,
  onClick,
}: {
  ativo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={
        ativo ? "Cliente acompanhado pela equipe" : "Marcar como cliente da equipe"
      }
      className={
        "shrink-0 transition " +
        (ativo
          ? "text-accent-foreground"
          : "text-muted-foreground/40 hover:text-muted-foreground")
      }
    >
      <Star className={"size-4 " + (ativo ? "fill-accent-foreground" : "")} />
    </button>
  );
}

export function ViewButton({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition " +
        (ativo
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground")
      }
    >
      {children}
    </button>
  );
}

export function FiltroChip({
  ativo,
  onClick,
  rotulo,
  titulo,
  qtd,
}: {
  ativo: boolean;
  onClick: () => void;
  rotulo: string;
  titulo?: string;
  qtd: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      aria-pressed={ativo}
      className={
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition " +
        (ativo
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:bg-muted")
      }
    >
      {rotulo}
      <span
        className={
          "rounded-full px-1.5 text-[10px] " +
          (ativo ? "bg-primary-foreground/20" : "bg-muted")
        }
      >
        {qtd}
      </span>
    </button>
  );
}
