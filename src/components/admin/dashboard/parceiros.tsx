/**
 * Ranking de parceiros — a Fatia 5 do redesenho da Visão geral.
 *
 * Server Component, sem estado: os agregados vêm prontos de
 * `dados.parceiros` (`gps.admin_dashboard()`) e a lista JÁ chega ordenada
 * pelo banco (`clientes desc, nome`) — não se reordena aqui.
 *
 * 🔴 `itens` tem teto de 200 linhas; os 7 agregados do cabeçalho são
 * calculados no banco sobre TODOS os parceiros (hoje 86), não sobre o que
 * está na tela. Não somar `itens` para "conferir" a média — o 201º parceiro
 * mentiria.
 *
 * 🔴 `honorarios` é `number | null`. `null` nunca vira "R$ 0,00" — a célula
 * fica em branco (travessão), mesmo critério de `brlOuTraco`
 * (`src/lib/moeda.ts`): ausência de contratado com valor não é zero.
 *
 * 🔴 `dias_sem_abrir` pode vir negativo (registro com data futura). Um valor
 * `<= 0` não é "sem abrir" — é lido como "abriu hoje/recentemente", nunca
 * como "-3 dias".
 *
 * 🔑 O rótulo da coluna carrega o prazo ("sem abrir há 14+ dias") de
 * propósito: a tela já tem OUTROS dois cortes de tempo (7 dias para cliente
 * parado, 30 nos filtros antigos) — "parado", sozinho, faria os três
 * parecerem a mesma régua.
 */

import Link from "next/link";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { brlOuTraco } from "@/lib/moeda";
import { cn } from "@/lib/utils";
import type { DashboardParceiros } from "@/lib/data/dashboard";

/** O prazo de "parceiro sumiu", dito uma vez — nunca a palavra nua "parado". */
const PRAZO_SEM_ABRIR_DIAS = 14;

function celulaDiasSemAbrir(dias: number) {
  // `dias <= 0` cobre o negativo (data futura) e o "abriu agora": nenhum dos
  // dois é "sem abrir há N dias".
  if (dias <= 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span
      className={cn(
        "tabular-nums",
        dias >= PRAZO_SEM_ABRIR_DIAS && "font-medium text-destructive",
      )}
    >
      {dias}
    </span>
  );
}

export function RankingDeParceiros({
  parceiros,
}: {
  parceiros: DashboardParceiros;
}) {
  const {
    itens,
    totalParceiros,
    mediaClientes,
    maxClientes,
    com30OuMais,
    semMensagem,
    comContratado,
    semAbrir14d,
  } = parceiros;

  return (
    <section aria-labelledby="ranking-parceiros" className="grid gap-3">
      <h2 id="ranking-parceiros" className="sr-only">
        Ranking de parceiros
      </h2>

      {/* Cabeçalho denso: os 7 agregados como pares rótulo/valor, sem card
          nem ícone — a mesma leitura de sistema tradicional que o resto do
          dashboard usa para KPI. */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border bg-card p-3 sm:grid-cols-4 lg:grid-cols-7">
        <div>
          <dt className="corpo-sm text-muted-foreground">Parceiros</dt>
          <dd className="numero tabular-nums">{totalParceiros}</dd>
        </div>
        <div>
          <dt className="corpo-sm text-muted-foreground">Média de clientes</dt>
          {/* `null` = nenhum parceiro com cliente. Travessão, nunca "0" —
              média de conjunto vazio não é zero, é inexistente. Mesma
              convenção de `brlOuTraco` nos honorários abaixo. */}
          <dd className="numero tabular-nums">{mediaClientes ?? "—"}</dd>
        </div>
        <div>
          <dt className="corpo-sm text-muted-foreground">Máximo</dt>
          <dd className="numero tabular-nums">{maxClientes}</dd>
        </div>
        <div>
          <dt className="corpo-sm text-muted-foreground">Com 30 ou mais</dt>
          <dd className="numero tabular-nums">{com30OuMais}</dd>
        </div>
        <div>
          <dt className="corpo-sm text-muted-foreground">Sem mensagem</dt>
          <dd className="numero tabular-nums">{semMensagem}</dd>
        </div>
        <div>
          <dt className="corpo-sm text-muted-foreground">Com contratado</dt>
          <dd className="numero tabular-nums">{comContratado}</dd>
        </div>
        <div>
          <dt className="corpo-sm text-muted-foreground">
            Sem abrir há {PRAZO_SEM_ABRIR_DIAS}+ dias
          </dt>
          <dd className="numero tabular-nums">{semAbrir14d}</dd>
        </div>
      </dl>

      {/* `overflow-x-auto` só nesta caixa (celular 390px) — o `<main>` do
          portal nunca rola na horizontal. Mesmo padrão de
          `clientes-programa/tabela.tsx`. */}
      <div className="scrollbar-none -mx-(--card-spacing) overflow-x-auto rounded-xl border bg-card px-(--card-spacing)">
        <Table className="min-w-[52rem]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 text-right">#</TableHead>
              <TableHead>Parceiro</TableHead>
              <TableHead className="text-right">Clientes</TableHead>
              <TableHead className="text-right">Mensagens</TableHead>
              <TableHead className="text-right">Favoritos</TableHead>
              <TableHead className="text-right">Reuniões</TableHead>
              <TableHead className="text-right">Contratados</TableHead>
              <TableHead className="text-right">Honorários</TableHead>
              <TableHead className="text-right">
                Sem abrir há {PRAZO_SEM_ABRIR_DIAS}+ dias
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.map((p, i) => (
              // `relative`: a `TableRow` vira o retângulo do `after:inset-0`
              // do link na primeira célula — linha inteira clicável sem
              // aninhar `<a>` dentro de `<tr>` (HTML inválido).
              <TableRow key={p.alunoId} className="relative">
                <TableCell className="text-right text-muted-foreground tabular-nums">
                  {i + 1}
                </TableCell>
                <TableCell className="font-medium">
                  <Link
                    href={`/admin/aluno/${p.alunoId}`}
                    className="foco-visivel after:absolute after:inset-0 after:content-['']"
                  >
                    {p.nome || "Sem nome"}
                  </Link>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {p.clientes}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {p.mensagens}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {p.favoritos}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {p.reunioes}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {p.contratados}
                </TableCell>
                {/* `null` some da célula — nunca "R$ 0,00" (`brlOuTraco`
                    já resolve isso com travessão, mesma regra de
                    `DashboardHonorarios.totalReais`). */}
                <TableCell className="text-right tabular-nums">
                  {brlOuTraco(p.honorarios)}
                </TableCell>
                <TableCell className="text-right">
                  {celulaDiasSemAbrir(p.dias)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
