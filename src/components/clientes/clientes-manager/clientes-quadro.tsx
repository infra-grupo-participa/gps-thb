"use client";

/**
 * Visão "Quadro": uma coluna por fase, com arrastar e soltar. O estado do
 * arraste (`arrastando`/`sobre`) é só daqui e desceu junto no corte da Onda 3.
 *
 * ⚠️ O quadro NÃO ordena: a coluna já é a ordem. Ele recebe a lista filtrada
 * pela busca, nunca a ordenada.
 */

import { useState } from "react";
import Link from "next/link";
import type { ClienteEtapa1, FaseCliente } from "@/lib/types";
import { FASES_CLIENTE } from "@/lib/etapa1";
import { mascaraTelefone } from "@/lib/masks";
import { brl } from "@/lib/moeda";
import { linkWhatsapp } from "@/lib/whatsapp";
import { Badge } from "@/components/ui/badge";
import {
  EstrelaTravada,
  GrauChip,
  MarcaRecusou,
  StarButton,
  WhatsappLink,
} from "./clientes-chips";
import { fasesDisponiveis, travadoPelaEquipe } from "./ordenacao";

export function Kanban({
  clientes,
  fichaHref,
  existeConfirmado,
  onMover,
  onToggleEquipe,
}: {
  clientes: ClienteEtapa1[];
  fichaHref: (id: string) => string;
  /** Ver `ClientesTabela`: com um confirmado no ambiente, a estrela some dos outros. */
  existeConfirmado: boolean;
  onMover: (c: ClienteEtapa1, f: FaseCliente) => void;
  onToggleEquipe: (c: ClienteEtapa1) => void;
}) {
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<FaseCliente | null>(null);

  const emArraste = clientes.find((c) => c.id === arrastando) ?? null;
  /**
   * A coluna aceita o que está sendo arrastado? Cliente confirmado pela equipe
   * não volta para "Prospecção" — o banco recusa com 42501. A coluna se recusa
   * ANTES do solto, com a razão escrita: soltar e receber erro é o mesmo que um
   * botão que falha.
   */
  const aceita = (fase: FaseCliente) =>
    !emArraste || fasesDisponiveis(emArraste).some((f) => f.id === fase);

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max gap-3">
        {FASES_CLIENTE.map((coluna) => {
          const itens = clientes.filter((c) => c.fase === coluna.id);
          const recusa = !aceita(coluna.id);
          const destaque = sobre === coluna.id && !recusa;
          return (
            <div
              key={coluna.id}
              onDragOver={(e) => {
                if (recusa) return;
                e.preventDefault();
                setSobre(coluna.id);
              }}
              onDragLeave={() => setSobre((s) => (s === coluna.id ? null : s))}
              onDrop={() => {
                const c = clientes.find((x) => x.id === arrastando);
                if (c && !recusa) onMover(c, coluna.id);
                setArrastando(null);
                setSobre(null);
              }}
              className={
                "flex w-64 shrink-0 flex-col rounded-lg border bg-muted/30 p-2 transition " +
                (destaque ? "border-primary ring-1 ring-primary " : "") +
                // Estado "não aceita" por FORMA (borda tracejada), nunca por
                // `opacity` na coluna inteira.
                (recusa ? "border-dashed border-borda-forte" : "")
              }
            >
              <div className="mb-2 px-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{coluna.coluna}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {itens.length}
                  </Badge>
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  {coluna.ajuda}
                </p>
                {recusa ? (
                  <p className="mt-1 text-[11px] leading-snug font-medium text-atencao-foreground">
                    A equipe acompanha este cliente — a fase não volta para
                    Prospecção.
                  </p>
                ) : null}
              </div>
              <div className="flex flex-1 flex-col gap-2">
                {itens.map((c) => {
                  const wpp = linkWhatsapp(c.telefone);
                  return (
                    <div
                      key={c.id}
                      draggable
                      onDragStart={() => setArrastando(c.id)}
                      onDragEnd={() => setArrastando(null)}
                      className={
                        "cursor-grab rounded-md border bg-background p-2.5 shadow-sm active:cursor-grabbing " +
                        (c.acompanhado_equipe ? "border-primary" : "")
                      }
                    >
                      <div className="flex items-start justify-between gap-1">
                        <Link
                          href={fichaHref(c.id)}
                          className="line-clamp-2 text-sm font-medium hover:text-accent-foreground hover:underline"
                        >
                          {c.nome || "Sem nome"}
                        </Link>
                        {travadoPelaEquipe(c) ? (
                          <EstrelaTravada
                            desde={c.acompanhamento_confirmado_em}
                          />
                        ) : existeConfirmado ? null : (
                          <StarButton
                            ativo={c.acompanhado_equipe}
                            onClick={() => onToggleEquipe(c)}
                          />
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <GrauChip grau={c.grau_relacao} />
                        <MarcaRecusou cliente={c} className="" />
                      </div>
                      {c.perda_inercia != null ? (
                        <div className="mt-1 text-xs tabular-nums text-muted-foreground">
                          {brl(c.perda_inercia)}
                        </div>
                      ) : null}
                      {/* Honorários no card da coluna "Contratados" — o número
                          que a equipe procura fica onde o cliente está.
                          `null` NUNCA vira R$ 0,00: quem não informou não
                          fechou por zero. */}
                      {c.valor_honorarios != null ? (
                        <div className="mt-1 text-xs font-medium tabular-nums text-accent-foreground">
                          Honorários: {brl(c.valor_honorarios)}
                          {c.fase === "contratado" ? "" : " (fora da meta)"}
                        </div>
                      ) : null}
                      <div className="mt-2 flex items-center gap-2">
                        {c.telefone ? (
                          <span className="text-xs text-muted-foreground">
                            {mascaraTelefone(c.telefone)}
                          </span>
                        ) : null}
                        {wpp ? <WhatsappLink href={wpp} /> : null}
                      </div>
                    </div>
                  );
                })}
                {itens.length === 0 ? (
                  <div className="rounded-md border border-dashed p-3 text-center text-[11px] text-muted-foreground">
                    Arraste aqui
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
