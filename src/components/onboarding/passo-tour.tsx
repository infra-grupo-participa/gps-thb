"use client";

import { Compass } from "lucide-react";

import { IconeChip } from "@/components/ui/kpi-card";
import { FRASE_DA_ABA } from "./tipos";

/**
 * O tour — uma tela curta por aba, **iterando as abas REAIS da pessoa**.
 *
 * 🔴 A lista NUNCA é fixa. `abas` vem de `navDoAluno(ctx)`, que é o único lugar
 * da regra do sócio (B7-b): o sócio não tem Financeiro, e um tour com lista
 * fixa mostraria a ele uma aba que não existe — exatamente a mentira que a
 * prévia "como o aluno vê" já teve de corrigir. Aba sem frase em
 * `FRASE_DA_ABA` fica de fora: descrição inventada para item novo de menu é
 * pior do que aba não apresentada.
 */
export function abasDoTour(abas: { href: string; label: string }[]) {
  return abas.filter((a) => FRASE_DA_ABA[a.label]);
}

export function PassoTour({
  aba,
  indice,
  total,
}: {
  aba: { href: string; label: string };
  indice: number;
  total: number;
}) {
  return (
    <div className="grid gap-3">
      <p className="rotulo text-muted-foreground">
        Conhecendo o portal · {indice + 1} de {total}
      </p>
      <div className="flex items-start gap-3">
        <IconeChip destaque>
          <Compass />
        </IconeChip>
        <div className="min-w-0">
          <h2 className="font-heading titulo-h2">{aba.label}</h2>
          <p className="mt-1 corpo text-muted-foreground text-pretty">
            {FRASE_DA_ABA[aba.label]}
          </p>
        </div>
      </div>
    </div>
  );
}
