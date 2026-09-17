/**
 * Tabela da lista consolidada de clientes — SOMENTE LEITURA.
 *
 * 🔴 TABELA NOVA, separada de `clientes-manager/clientes-tabela.tsx` de
 * propósito: aquela tem um `<Select>` do Base UI POR LINHA (troca de fase) e
 * foi desenhada para o CRM do aluno, com no máximo ~30 clientes por ambiente.
 * Aqui a página inteira já pode ter 100 linhas — 100 instâncias de um
 * componente com portal (`Select` do Base UI monta um portal fora da árvore)
 * travariam a aba. Zero componente Radix/Base UI por linha aqui.
 *
 * Server Component: a tela não escreve nada, só lê.
 */

import Link from "next/link";
import { Star, TriangleAlert } from "lucide-react";
import type { ClienteDoPrograma } from "@/lib/data/clientes-admin";
import { FASES_CLIENTE, GRAUS_RELACAO_UI } from "@/lib/etapa1";
import { formatarDataSoDia, hojeSaoPaulo } from "@/lib/datas";
import { mascaraTelefone } from "@/lib/masks";
import { CopiarContato } from "@/components/admin/copiar-contato";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export function TabelaClientesPrograma({
  linhas,
}: {
  linhas: ClienteDoPrograma[];
}) {
  return (
    // `overflow-x-auto` só NESTA caixa — o `<main>` do portal nunca rola na
    // horizontal. `-mx-*`/`px-*`: a rolagem vai até a borda do card, senão a
    // última coluna some atrás do padding em vez de rolar (mesmo padrão de
    // `clientes-manager/clientes-tabela.tsx`).
    <div className="scrollbar-none -mx-(--card-spacing) overflow-x-auto rounded-xl border bg-card px-(--card-spacing)">
      <Table className="min-w-[56rem]">
        <TableHeader>
          <TableRow>
            <TableHead>Cliente</TableHead>
            <TableHead>Parceiro</TableHead>
            <TableHead>Fase</TableHead>
            <TableHead>Telefone</TableHead>
            <TableHead>Grau</TableHead>
            <TableHead>DISC</TableHead>
            <TableHead>Reunião</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {/* Mesmo corte de "vencida" da RPC (`data < hoje`): comparação de
              string YYYY-MM-DD, sem `Date` no meio (ver `datas.ts`). Calculado
              uma vez fora do loop — é o mesmo dia para as 100 linhas. */}
          {(() => {
            const hoje = hojeSaoPaulo();
            return linhas.map((c) => {
              const fase = FASES_CLIENTE.find((f) => f.id === c.fase);
              const grau = c.grauRelacao
                ? GRAUS_RELACAO_UI.find((g) => g.id === c.grauRelacao)?.rotulo
                : null;
              const dataReuniao = formatarDataSoDia(c.dataReuniaoPreliminar);
              const reuniaoVencida = Boolean(
                c.dataReuniaoPreliminar && c.dataReuniaoPreliminar < hoje,
              );
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <div className="flex min-w-0 items-center gap-1.5">
                      {/* Cliente acompanhado pela equipe: mesmo desenho do
                          card do parceiro (`aluno-card.tsx`) — estrela
                          preenchida com o token de marca, nunca `text-primary`
                          puro sem `fill` (não passaria contraste como sinal
                          sozinho, e aqui é reforço visual, não a única pista:
                          o nome continua ao lado). */}
                      {c.acompanhadoEquipe ? (
                        <Star
                          aria-hidden
                          className="size-3.5 shrink-0 fill-primary text-primary"
                        />
                      ) : null}
                      <span className="truncate" title={c.clienteNome}>
                        {c.clienteNome || "Sem nome"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/aluno/${c.alunoId}`}
                      className="hover:text-accent-foreground hover:underline"
                    >
                      {c.parceiroNome || "—"}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        fase?.cor ?? "bg-neutro text-neutro-foreground",
                      )}
                    >
                      {fase?.rotulo ?? c.fase}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <CopiarContato
                      valor={c.telefone}
                      rotuloAcessivel={`Copiar telefone de ${c.clienteNome || "cliente"}`}
                      formatar={mascaraTelefone}
                    />
                    {!c.telefone ? (
                      <span className="text-muted-foreground">—</span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {grau ?? (
                      <span className="text-xs text-muted-foreground">
                        Não informado
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{c.perfilDisc ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {dataReuniao ? (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1",
                          reuniaoVencida && "text-destructive",
                        )}
                      >
                        {reuniaoVencida ? (
                          <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
                        ) : null}
                        {dataReuniao}
                        {reuniaoVencida ? (
                          <span className="text-xs">(vencida)</span>
                        ) : null}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              );
            });
          })()}
        </TableBody>
      </Table>
    </div>
  );
}
