"use client";

/** Uma linha da lista no CELULAR (a tabela só aparece a partir de `sm`). */

import Link from "next/link";
import type { ClienteEtapa1, FaseCliente } from "@/lib/types";
import { FASES_CLIENTE } from "@/lib/etapa1";
import { formatarDataSoDia } from "@/lib/datas";
import { mascaraTelefone } from "@/lib/masks";
import { brl } from "@/lib/moeda";
import { linkWhatsapp } from "@/lib/whatsapp";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MarcaRecusou, StarButton, WhatsappLink } from "./clientes-chips";

export function ClienteCardLista({
  cliente: c,
  fichaHref,
  onFase,
  onEquipe,
  onExcluir,
  pending,
}: {
  cliente: ClienteEtapa1;
  fichaHref: (id: string) => string;
  onFase: (c: ClienteEtapa1, f: FaseCliente) => void;
  onEquipe: (c: ClienteEtapa1) => void;
  onExcluir: (c: ClienteEtapa1) => void;
  pending: boolean;
}) {
  const wpp = linkWhatsapp(c.telefone);
  return (
    <div
      className={
        "rounded-lg border p-3 " + (c.acompanhado_equipe ? "border-primary bg-primary/5" : "")
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <StarButton ativo={c.acompanhado_equipe} onClick={() => onEquipe(c)} />
          <Link
            href={fichaHref(c.id)}
            className="truncate font-medium hover:text-accent-foreground hover:underline"
          >
            {c.nome || "Sem nome"}
          </Link>
          <MarcaRecusou cliente={c} />
        </div>
        {c.perda_inercia != null ? (
          <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
            {brl(c.perda_inercia)}
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
        {c.telefone ? mascaraTelefone(c.telefone) : "sem telefone"}
        {wpp ? <WhatsappLink href={wpp} /> : null}
        {c.data_reuniao_preliminar ? (
          <span className="ml-auto text-xs">
            {formatarDataSoDia(c.data_reuniao_preliminar)}
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Select
          value={c.fase}
          onValueChange={(v) => v && onFase(c, v as FaseCliente)}
        >
          <SelectTrigger
            size="sm"
            className="h-8 flex-1 text-xs"
            aria-label={`Fase de ${c.nome || "cliente sem nome"}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FASES_CLIENTE.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.rotulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Link
          href={fichaHref(c.id)}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Ficha
        </Link>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Excluir ${c.nome || "cliente sem nome"}`}
          className="ml-2 border-l pl-3 text-destructive hover:text-destructive"
          onClick={() => onExcluir(c)}
          disabled={pending}
        >
          Excluir
        </Button>
      </div>
    </div>
  );
}
