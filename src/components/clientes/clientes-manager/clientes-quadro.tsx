"use client";

/**
 * Visão "Quadro": uma coluna por fase (`FASES_CLIENTE`), só leitura: a fase é
 * calculada pelo banco a partir das etapas marcadas na ficha, então não há
 * arrastar para mudar.
 *
 * ⚠️ O quadro NÃO ordena: a coluna já é a ordem. Ele recebe a lista filtrada
 * pela busca, nunca a ordenada.
 */

import Link from "next/link";
import type { ClienteEtapa1 } from "@/lib/types";
import { FASES_CLIENTE, faseContaHonorario } from "@/lib/etapa1";
import { mascaraTelefone } from "@/lib/masks";
import { brl } from "@/lib/moeda";
import { linkWhatsapp } from "@/lib/whatsapp";
import { Badge } from "@/components/ui/badge";
import {
  Estrela,
  GrauChip,
  MarcaRecusou,
  MarcaSemDados,
  WhatsappLink,
} from "./clientes-chips";
import { modoEstrela, type CtxEstrela } from "./ordenacao";

export function Kanban({
  clientes,
  fichaHref,
  ctxEstrela,
  onToggleEquipe,
}: {
  clientes: ClienteEtapa1[];
  fichaHref: (id: string) => string;
  /** Ver `ClientesTabela`: havendo favorito, a estrela some dos outros. */
  ctxEstrela: CtxEstrela;
  onToggleEquipe: (c: ClienteEtapa1) => void;
}) {
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max gap-3">
        {FASES_CLIENTE.map((coluna) => {
          const itens = clientes.filter((c) => c.fase === coluna.id);
          return (
            <div
              key={coluna.id}
              className={
                "flex w-64 shrink-0 flex-col rounded-lg border bg-muted/30 p-2"
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
              </div>
              <div className="flex flex-1 flex-col gap-2">
                {itens.map((c) => {
                  const wpp = linkWhatsapp(c.telefone);
                  return (
                    <div
                      key={c.id}
                      className={
                        "rounded-md border bg-background p-2.5 shadow-sm " +
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
                        <Estrela
                          cliente={c}
                          modo={modoEstrela(c, ctxEstrela)}
                          onToggle={onToggleEquipe}
                        />
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <GrauChip grau={c.grau_relacao} />
                        {c.selecionado_entrevista ? (
                          <span className="shrink-0 rounded-full border border-borda-forte px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            Entrevista
                          </span>
                        ) : null}
                        <MarcaSemDados cliente={c} className="" />
                        <MarcaRecusou cliente={c} className="" />
                      </div>
                      {/* "Perda pela inércia" (bloco abaixo dos chips)
                          REMOVIDA por decisão do Marcio (10/09/2026). */}
                      {/* Honorários no card da coluna "Contratados" — o número
                          que a equipe procura fica onde o cliente está.
                          `null` NUNCA vira R$ 0,00: quem não informou não
                          fechou por zero. */}
                      {c.valor_honorarios != null ? (
                        <div className="mt-1 text-xs font-medium tabular-nums text-accent-foreground">
                          Honorários: {brl(c.valor_honorarios)}
                          {faseContaHonorario(c.fase) ? "" : " (fora da meta)"}
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
                    Nenhum cliente nesta fase
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
