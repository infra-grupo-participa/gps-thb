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
import { Trash2 } from "lucide-react";
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
import {
  EstrelaTravada,
  GrauChip,
  MarcaRecusou,
  StarButton,
  WhatsappLink,
} from "./clientes-chips";
import { fasesDisponiveis, travadoPelaEquipe } from "./ordenacao";

export function ClientesTabela({
  listaOrdenada,
  fichaHref,
  existeConfirmado,
  pending,
  mudarFase,
  toggleEquipe,
  setErroDialogo,
  setExcluindo,
}: {
  /** Já filtrada pela busca/fase/grau e ordenada — ver `ordenacao.ts`. */
  listaOrdenada: ClienteEtapa1[];
  fichaHref: (id: string) => string;
  /**
   * Há um cliente confirmado pela equipe neste ambiente? Com `true`, a estrela
   * some de TODAS as outras linhas: a Server Action falharia com 42501 do
   * banco, e botão que só sabe falhar é pior do que botão ausente.
   */
  existeConfirmado: boolean;
  pending: boolean;
  mudarFase: (c: ClienteEtapa1, nova: FaseCliente) => void;
  toggleEquipe: (c: ClienteEtapa1) => void;
  setErroDialogo: (erro: string | null) => void;
  setExcluindo: (c: ClienteEtapa1) => void;
}) {
  return (
    // `-mx-*`/`px-*`: a rolagem lateral vai até a borda do card, senão a
    // última coluna some atrás do padding em vez de rolar.
    <div className="scrollbar-none -mx-(--card-spacing) hidden overflow-x-auto px-(--card-spacing) sm:block">
    {/* +6rem por causa da coluna "Vínculo": sem isso a última coluna (Ações)
        sai da área rolável em 1366 px em vez de rolar. */}
    <Table className="min-w-[60rem]">
      <TableHeader>
        <TableRow>
          <TableHead className="w-8"></TableHead>
          <TableHead>Nome</TableHead>
          <TableHead>Vínculo</TableHead>
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
          const travado = travadoPelaEquipe(c);
          return (
            <TableRow
              key={c.id}
              className={
                c.acompanhado_equipe
                  ? "bg-accent/40 hover:bg-accent/60"
                  : "hover:bg-muted/60"
              }
            >
              <TableCell>
                {travado ? (
                  <EstrelaTravada desde={c.acompanhamento_confirmado_em} />
                ) : existeConfirmado ? null : (
                  <StarButton
                    ativo={c.acompanhado_equipe}
                    onClick={() => toggleEquipe(c)}
                  />
                )}
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
              <TableCell>
                {c.grau_relacao ? (
                  <GrauChip grau={c.grau_relacao} />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Não informado
                  </span>
                )}
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
                    {/* Função de render obrigatória: sem ela o Base UI imprime o VALOR
                        do banco, não o rótulo — a coluna mostrava
                        `prospeccao`/`fechamento`/`contratado`, minúsculo e sem
                        acento, na cara do aluno. */}
                    <SelectValue>
                      {(v: FaseCliente) =>
                        FASES_CLIENTE.find((f) => f.id === v)?.rotulo ?? v
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {/* Confirmado pela equipe não oferece "Prospecção": o
                        banco recusa a volta com 42501 (§B.5). */}
                    {fasesDisponiveis(c).map((f) => (
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
                  {/* "Excluir" aparecia escrito, em cor de destaque, OITO
                      vezes — a ação destrutiva estava mais visível que a ação
                      principal, e as ~72 px por linha eram o que empurrava a
                      coluna "Ações" para fora da tela em 1366 px. Vira ícone
                      com `aria-label` (o nome do cliente vai no rótulo, então
                      o leitor de tela ganha em precisão) e só ganha o vermelho
                      na intenção — `ghost-danger`.
                      PL9 — separador + margem: o destrutivo estava encostado
                      em "Abrir ficha" e o erro de mira apagava a linha.
                      🔴 Cliente confirmado pela equipe NÃO tem "Excluir": a
                      trigger `...203` recusa o DELETE com 42501. O caminho
                      existe e está escrito na ficha (Suporte). */}
                  {travado ? null : (
                    <Button
                      variant="ghost-danger"
                      size="icon-sm"
                      aria-label={`Excluir ${c.nome || "cliente sem nome"}`}
                      className="ml-2 disabled:opacity-40"
                      onClick={() => {
                        setErroDialogo(null);
                        setExcluindo(c);
                      }}
                      disabled={pending}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  )}
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
