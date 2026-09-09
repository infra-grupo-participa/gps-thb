"use client";

/**
 * Tabela de clientes do DESKTOP (`hidden … sm:block`; no celular quem manda é
 * o `ClienteCardLista`).
 *
 * Sem estado: recebe a lista já filtrada e ordenada e devolve os cliques. As
 * escritas continuam todas no `ClientesManager`, numa transição só — é o
 * `pending` dele que desabilita "Excluir" enquanto uma action roda.
 */

import Link from "next/link";
import type { ClienteEtapa1, FaseCliente } from "@/lib/types";
import { FASES_CLIENTE } from "@/lib/etapa1";
import { formatarDataSoDia } from "@/lib/datas";
import { mascaraTelefone } from "@/lib/masks";
import { brlOuTraco } from "@/lib/moeda";
import { linkWhatsapp } from "@/lib/whatsapp";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MarcaRecusou, StarButton, WhatsappLink } from "./clientes-chips";

export function ClientesTabela({
  listaOrdenada,
  fichaHref,
  pending,
  mudarFase,
  toggleEquipe,
  setErroDialogo,
  setExcluindo,
}: {
  /** Já filtrada pela busca/fase e ordenada — ver `ordenacao.ts`. */
  listaOrdenada: ClienteEtapa1[];
  fichaHref: (id: string) => string;
  pending: boolean;
  mudarFase: (c: ClienteEtapa1, nova: FaseCliente) => void;
  toggleEquipe: (c: ClienteEtapa1) => void;
  setErroDialogo: (erro: string | null) => void;
  setExcluindo: (c: ClienteEtapa1) => void;
}) {
  return (
    <div className="hidden overflow-x-auto sm:block">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8"></TableHead>
          <TableHead>Nome</TableHead>
          <TableHead>Telefone</TableHead>
          <TableHead className="text-right">Perda inércia</TableHead>
          <TableHead>Fase</TableHead>
          <TableHead>Reunião</TableHead>
          <TableHead className="text-right">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {listaOrdenada.map((c) => {
          const wpp = linkWhatsapp(c.telefone);
          return (
            <TableRow
              key={c.id}
              className={c.acompanhado_equipe ? "bg-primary/5" : ""}
            >
              <TableCell>
                <StarButton
                  ativo={c.acompanhado_equipe}
                  onClick={() => toggleEquipe(c)}
                />
              </TableCell>
              <TableCell className="font-medium">
                <Link
                  href={fichaHref(c.id)}
                  className="hover:text-accent-foreground hover:underline"
                >
                  {c.nome || "Sem nome"}
                </Link>
                {c.acompanhado_equipe ? (
                  <Badge className="ml-2 text-[10px]">Equipe</Badge>
                ) : null}
                <MarcaRecusou cliente={c} />
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <div className="flex items-center gap-2">
                  {c.telefone ? mascaraTelefone(c.telefone) : "—"}
                  {wpp ? <WhatsappLink href={wpp} /> : null}
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {brlOuTraco(c.perda_inercia)}
              </TableCell>
              <TableCell>
                <Select
                  value={c.fase}
                  onValueChange={(v) =>
                    v && mudarFase(c, v as FaseCliente)
                  }
                >
                  <SelectTrigger
                    size="sm"
                    className="h-7 w-[140px] text-xs"
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
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {formatarDataSoDia(c.data_reuniao_preliminar) ?? "—"}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Link
                    href={fichaHref(c.id)}
                    className={buttonVariants({
                      variant: "ghost",
                      size: "sm",
                    })}
                  >
                    Abrir ficha
                  </Link>
                  {/* PL9 — separador + margem: o destrutivo estava
                      encostado em "Abrir ficha" e o erro de mira
                      apagava a linha inteira. */}
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Excluir ${c.nome || "cliente sem nome"}`}
                    className="ml-3 border-l pl-3 text-destructive hover:text-destructive"
                    onClick={() => {
                      setErroDialogo(null);
                      setExcluindo(c);
                    }}
                    disabled={pending}
                  >
                    Excluir
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
    </div>
  );
}
