"use client";

/**
 * Uma linha por etapa, com o estado atual e um grupo de rádio para escolher o
 * que fazer. Componente CONTROLADO e sem rede: quem decide o que fazer com a
 * escolha (salvar um aluno, salvar um lote) é o dono do estado.
 *
 * Reusado pelo painel de um aluno (`painel-etapas-aluno.tsx`) e pelo lote do
 * `/admin` — por isso o contrato (`opcoes`, `rotuloRegra`) é fixo.
 *
 * Acessibilidade: cada etapa é um `role="radiogroup"` nomeado pelo título e
 * descrito pelo estado atual, com rádios nativos (setas navegam, rótulo clicável). O foco aparece no rótulo inteiro.
 */

import { useId } from "react";
import { cn } from "@/lib/utils";

export type EscolhaEtapa = "regra" | "liberar" | "travar";

export type EtapaInfo = {
  numero: number;
  titulo: string;
  /** O que `gps.etapas.liberada` diz para todo mundo. */
  liberadaGlobal: boolean;
  /** Exceção deste aluno: true liberada, false travada, null sem exceção. */
  override: boolean | null;
};

const TODAS: EscolhaEtapa[] = ["regra", "liberar", "travar"];

function estadoAtual(e: EtapaInfo): string {
  if (e.override === true) return "Exceção: liberada para este aluno";
  if (e.override === false) return "Exceção: travada para este aluno";
  return e.liberadaGlobal ? "Liberada para todos" : "Travada para todos";
}

export function SeletorEtapas({
  etapas,
  valor,
  onChange,
  opcoes = TODAS,
  rotuloRegra = "Seguir regra geral",
  disabled = false,
}: {
  etapas: EtapaInfo[];
  valor: Record<number, EscolhaEtapa>;
  onChange: (v: Record<number, EscolhaEtapa>) => void;
  opcoes?: EscolhaEtapa[];
  rotuloRegra?: string;
  disabled?: boolean;
}) {
  const base = useId();
  const rotulos: Record<EscolhaEtapa, string> = {
    regra: rotuloRegra,
    liberar: "Liberar",
    travar: "Travar",
  };
  const ordem = TODAS.filter((o) => opcoes.includes(o));

  return (
    <ul className="divide-y divide-borda-fina border-y border-borda-fina">
      {etapas.map((e) => {
        const nome = `${base}-${e.numero}`;
        const escolha = valor[e.numero] ?? "regra";
        return (
          <li key={e.numero} className="py-2">
            <div
              role="radiogroup"
              aria-labelledby={`${nome}-t`}
              aria-describedby={`${nome}-e`}
              className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <p id={`${nome}-t`} className="corpo font-medium">
                  {String(e.numero).padStart(2, "0")} — {e.titulo}
                </p>
                <p
                  id={`${nome}-e`}
                  className={cn(
                    "corpo-sm",
                    e.override === null
                      ? "text-muted-foreground"
                      : "font-medium text-accent-foreground",
                  )}
                >
                  {estadoAtual(e)}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ordem.map((o) => {
                  const marcado = escolha === o;
                  return (
                    <label
                      key={o}
                      className={cn(
                        "flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 corpo-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring has-[:focus-visible]:outline-solid",
                        marcado
                          ? "border-primary bg-superficie-afundada font-medium"
                          : "border-borda-fina",
                        disabled && "cursor-not-allowed opacity-60",
                      )}
                    >
                      <input
                        type="radio"
                        name={nome}
                        value={o}
                        checked={marcado}
                        disabled={disabled}
                        onChange={() => onChange({ ...valor, [e.numero]: o })}
                        className="size-3.5 accent-[#C74600]"
                      />
                      {rotulos[o]}
                    </label>
                  );
                })}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
