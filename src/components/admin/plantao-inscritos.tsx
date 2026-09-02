"use client";

/**
 * Plantão de Dúvidas — Acelera Holding. Lista de inscritos de UM slot (admin).
 *
 * ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
 * (commit b457005) e PROIBIDO de reconstruir.
 *
 * A lista chega PRONTA por prop (carregada no Server Component
 * `src/app/admin/plantao/page.tsx`, via `getInscritosDoSlot`, só para os
 * slots que já têm algum inscrito) — este componente não busca dado.
 * `plantao-data.ts` tem `import "server-only"`, então não pode ser chamado
 * daqui (client); sem Server Action dedicada de leitura on-demand no
 * contrato do backend para este caso, ver observação no relato final.
 */

import { UserRoundIcon, CheckCircle2Icon, CircleIcon } from "lucide-react";
import type { InscritoAdmin } from "@/lib/plantao-tipos";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export function PlantaoInscritos({ inscritos }: { inscritos: InscritoAdmin[] }) {
  if (inscritos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum inscrito neste plantão ainda.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Aluno</TableHead>
          <TableHead>Presença</TableHead>
          <TableHead>NPS</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {inscritos.map((i) => (
          <TableRow key={i.email}>
            <TableCell>
              <div className="flex items-center gap-1.5">
                <UserRoundIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0">
                  <div className="truncate font-medium">{i.nome}</div>
                  <div className="truncate text-xs text-muted-foreground">{i.email}</div>
                </div>
              </div>
            </TableCell>
            <TableCell>
              {i.presencaEm ? (
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2Icon className="size-3" /> Presente
                </Badge>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <CircleIcon className="size-3" /> Sem registro
                </span>
              )}
            </TableCell>
            <TableCell>
              {i.npsNota !== null ? (
                <span className="font-medium tabular-nums">{i.npsNota}</span>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
