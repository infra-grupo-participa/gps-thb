"use client";

/**
 * A trilha deste aluno: o painel de liberação (visível, todas as etapas de
 * uma vez — `PainelEtapasAluno`) e, no bloco de correção, as 6 etapas com a
 * liberação já resolvida (`coalesce(override, global)`), quem decidiu, por
 * quê e quando, mais "Reabrir etapa".
 *
 * 🔑 **Nada de checkbox de tarefa aqui.** "Abrir a etapa" leva ao `TarefaItem`
 * que já existe: marcar tarefa tem uma porta só, e é a do aluno. Duas telas
 * escrevendo o mesmo progresso é como os dois painéis de status do CNHF
 * passaram a divergir.
 */

import Link from "next/link";
import { ExternalLink, RotateCcw } from "lucide-react";
import type { EtapaDiagnostico } from "@/lib/data/central";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatarDataHora } from "@/lib/datas";
import { PainelEtapasAluno } from "@/components/admin/etapas-liberacao/painel-etapas-aluno";
import type { EtapaInfo } from "@/components/admin/etapas-liberacao/seletor-etapas";
import { BlocoDeCorrecao } from "./bloco-de-correcao";
import { rotuloEtapa } from "./tipos";

/** O que a origem do estado da etapa quer dizer, em português. */
function fraseDeOrigem(e: EtapaDiagnostico): string {
  if (e.origem === "liberada_para_este_aluno") {
    return "Liberada só para este parceiro pela equipe";
  }
  if (e.origem === "travada_para_este_aluno") {
    return "Travada só para este parceiro pela equipe";
  }
  return e.global
    ? "Segue a regra geral: liberada para todos"
    : "Segue a regra geral: bloqueada para todos";
}

export function SecaoTrilha({
  etapas,
  progresso,
  alunoId,
  nomeAluno,
  aberto,
  pendente,
  onReabrir,
}: {
  etapas: EtapaDiagnostico[];
  progresso: { etapa: number; concluidas: number }[];
  alunoId: string;
  nomeAluno: string | null;
  aberto: boolean;
  pendente: boolean;
  onReabrir: (e: EtapaDiagnostico, concluidas: number) => void;
}) {
  if (etapas.length === 0) return null;
  const concluidasDe = (n: number) =>
    progresso.find((p) => p.etapa === n)?.concluidas ?? 0;

  // Mesmos dados do diagnóstico: `global` é o valor cru de `gps.etapas` e
  // `origem` diz se há exceção — nenhuma consulta nova.
  const info: EtapaInfo[] = etapas.map((e) => ({
    numero: e.etapa,
    titulo: e.nome,
    liberadaGlobal: e.global,
    override:
      e.origem === "liberada_para_este_aluno"
        ? true
        : e.origem === "travada_para_este_aluno"
          ? false
          : null,
  }));

  return (
    <>
      <div className="mt-4">
        <h3 className="mb-2 corpo font-medium">Liberar ou travar etapas</h3>
        <PainelEtapasAluno
          alunoId={alunoId}
          nomeAluno={nomeAluno}
          etapas={info}
        />
      </div>
      <BlocoDeCorrecao
        aberto={aberto}
        titulo="Histórico das etapas e reabertura"
        ajuda="Quem decidiu, por quê e quando; e a reabertura de etapa já concluída."
      >
        <ul className="grid gap-2.5">
          {etapas.map((e) => {
            const concluidas = concluidasDe(e.etapa);
            const temExcecao = e.origem !== "global";
            return (
              <li
                key={e.etapa}
                className="rounded-lg border border-borda-fina bg-card p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="corpo font-medium">
                    {rotuloEtapa(e.etapa)} — {e.nome}
                  </span>
                  <Badge variant={e.liberada ? "success" : "neutral"}>
                    {e.liberada ? "liberada" : "bloqueada"}
                  </Badge>
                  {temExcecao ? (
                    <Badge variant="warning">regra própria</Badge>
                  ) : null}
                </div>

                <p className="mt-1 corpo-sm text-muted-foreground">
                  {fraseDeOrigem(e)}
                  {e.motivo ? ` · motivo: ${e.motivo}` : ""}
                  {e.em ? ` · em ${formatarDataHora(e.em)}` : ""}
                  {` · ${concluidas} ${concluidas === 1 ? "tarefa concluída" : "tarefas concluídas"}`}
                </p>

                <div className="mt-2.5 flex flex-wrap gap-2">
                  <Link
                    href={`/admin/aluno/${alunoId}/etapa/${e.etapa}`}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                    })}
                  >
                    <ExternalLink className="size-4" /> Abrir a etapa
                  </Link>

                  {concluidas > 0 ? (
                    <Button
                      size="sm"
                      variant="ghost-danger"
                      disabled={pendente}
                      onClick={() => onReabrir(e, concluidas)}
                    >
                      <RotateCcw className="size-4" /> Reabrir a etapa (
                      {concluidas})
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </BlocoDeCorrecao>
    </>
  );
}
