"use client";

/**
 * A trilha deste aluno: as 6 etapas com a liberação já resolvida
 * (`coalesce(override, global)`), quem decidiu, por quê e quando — e as três
 * correções de etapa (liberar/travar só para ele, voltar à regra geral e
 * reabrir).
 *
 * 🔑 **Nada de checkbox de tarefa aqui.** "Abrir a etapa" leva ao `TarefaItem`
 * que já existe: marcar tarefa tem uma porta só, e é a do aluno. Duas telas
 * escrevendo o mesmo progresso é como os dois painéis de status do CNHF
 * passaram a divergir.
 */

import Link from "next/link";
import { ExternalLink, LockOpen, RotateCcw, Undo2 } from "lucide-react";
import type { EtapaDiagnostico } from "@/lib/data/central";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatarDataHora } from "@/lib/datas";
import { BlocoDeCorrecao } from "./bloco-de-correcao";
import { rotuloEtapa } from "./tipos";

/** O que a origem do estado da etapa quer dizer, em português. */
function fraseDeOrigem(e: EtapaDiagnostico): string {
  if (e.origem === "liberada_para_este_aluno") {
    return "Liberada só para este aluno pela equipe";
  }
  if (e.origem === "travada_para_este_aluno") {
    return "Travada só para este aluno pela equipe";
  }
  return e.global
    ? "Segue a regra geral: liberada para todos"
    : "Segue a regra geral: bloqueada para todos";
}

export function SecaoTrilha({
  etapas,
  progresso,
  alunoId,
  aberto,
  pendente,
  onLiberar,
  onTravar,
  onVoltarRegraGeral,
  onReabrir,
}: {
  etapas: EtapaDiagnostico[];
  progresso: { etapa: number; concluidas: number }[];
  alunoId: string;
  aberto: boolean;
  pendente: boolean;
  onLiberar: (e: EtapaDiagnostico) => void;
  onTravar: (e: EtapaDiagnostico) => void;
  onVoltarRegraGeral: (e: EtapaDiagnostico) => void;
  onReabrir: (e: EtapaDiagnostico, concluidas: number) => void;
}) {
  if (etapas.length === 0) return null;
  const concluidasDe = (n: number) =>
    progresso.find((p) => p.etapa === n)?.concluidas ?? 0;

  return (
    <BlocoDeCorrecao
      aberto={aberto}
      titulo="Ajustar as etapas deste aluno"
      ajuda="A liberação individual vale só para este ambiente; a regra geral continua valendo para os demais. Toda mudança pede motivo e entra na trilha do aluno."
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
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <ExternalLink className="size-4" /> Abrir a etapa
                </Link>

                {/* O terceiro estado (`liberada = null`) só aparece quando há
                    exceção: sem ela, "voltar à regra geral" não teria efeito e
                    seria um botão que não faz nada. */}
                {temExcecao ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pendente}
                    onClick={() => onVoltarRegraGeral(e)}
                  >
                    <Undo2 className="size-4" /> Voltar à regra geral
                  </Button>
                ) : null}

                {e.liberada ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pendente}
                    onClick={() => onTravar(e)}
                  >
                    Travar só para este aluno
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pendente}
                    onClick={() => onLiberar(e)}
                  >
                    <LockOpen className="size-4" /> Liberar só para este aluno
                  </Button>
                )}

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
  );
}
