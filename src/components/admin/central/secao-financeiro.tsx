"use client";

/**
 * Financeiro — os contratos ÓRFÃOS do sistema de origem que casam com este
 * cadastro (por e-mail ou por documento) e o desfazer do vínculo.
 *
 * 🔑 Nada aqui é calculado na tela. O casamento é do banco (a mesma função que
 * a RPC de vincular reconfere na hora de gravar), o valor sai de
 * `src/lib/moeda.ts` e o documento aparece **só com os 4 últimos dígitos** —
 * é CPF/CNPJ de gente real numa tela de suporte.
 *
 * ⚠️ Casar por e-mail e por documento não é a mesma coisa: um CNPJ de empresa
 * pode ter DUAS pessoas diferentes (caso Marisa Tiedt / Gilton Silva), então a
 * linha diz **por onde casou** antes de o admin decidir.
 */

import { Link2, Link2Off } from "lucide-react";
import type { CandidatoFinanceiro } from "@/lib/data/central";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatarData } from "@/lib/datas";
import { brlOuTraco } from "@/lib/moeda";
import { BlocoDeCorrecao } from "./bloco-de-correcao";

/** Contrato JÁ ligado a este ambiente — o alvo do desvincular. */
export interface ContratoVinculado {
  contatoHmId: string;
  produto: string | null;
  plano: string | null;
  valorPrograma: number | null;
}

export function CandidatosFinanceiro({
  candidatos,
  pendente,
  onVincular,
}: {
  candidatos: CandidatoFinanceiro[];
  pendente: boolean;
  onVincular: (c: CandidatoFinanceiro) => void;
}) {
  if (candidatos.length === 0) return null;

  return (
    <ul className="grid gap-2.5">
      {candidatos.map((c) => (
        <li
          key={c.contatoHmId}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-borda-fina bg-card p-3"
        >
          <div className="min-w-0">
            <p className="corpo font-medium">
              {c.produto ?? "Contrato sem produto"}
              {c.plano ? (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · {c.plano}
                </span>
              ) : null}
            </p>
            <p className="corpo-sm text-muted-foreground">
              Casou pelo {c.casouPor}
              {c.email ? ` · ${c.email}` : ""}
              {c.documentoFinal ? ` · documento final ${c.documentoFinal}` : ""}
              {c.turma ? ` · ${c.turma}` : ""}
              {c.criadoEm ? ` · de ${formatarData(c.criadoEm)}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="neutral" icone={false}>
              {brlOuTraco(c.valorTotal)}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              disabled={pendente}
              onClick={() => onVincular(c)}
            >
              <Link2 className="size-4" /> Vincular
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function DesfazerVinculoFinanceiro({
  contratos,
  pendente,
  onDesvincular,
}: {
  contratos: ContratoVinculado[];
  pendente: boolean;
  onDesvincular: (c: ContratoVinculado) => void;
}) {
  if (contratos.length === 0) return null;

  return (
    <BlocoDeCorrecao
      // Nasce fechado: a linha está VERDE. O admin que precisa desfazer sabe o
      // que veio fazer; quem só está diagnosticando não tropeça no botão.
      aberto={false}
      titulo="Desfazer o vínculo de um contrato"
      ajuda="O vínculo pode ter vindo do sistema de origem, e não daqui. Desfazer tira o Financeiro do titular."
    >
      <ul className="grid gap-2.5">
        {contratos.map((c) => (
          <li
            key={c.contatoHmId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-borda-fina bg-card p-3"
          >
            <div className="min-w-0">
              <p className="corpo font-medium">
                {c.produto ?? "Contrato sem produto"}
              </p>
              <p className="corpo-sm text-muted-foreground">
                {c.plano ?? "sem plano"} · {brlOuTraco(c.valorPrograma)}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost-danger"
              disabled={pendente}
              onClick={() => onDesvincular(c)}
            >
              <Link2Off className="size-4" /> Desvincular
            </Button>
          </li>
        ))}
      </ul>
    </BlocoDeCorrecao>
  );
}
