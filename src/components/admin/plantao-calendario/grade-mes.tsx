"use client";

/**
 * A grade do mês: a barra de navegação (mês anterior/próximo) e o quadro de 7
 * colunas em que cada dia é um botão que abre o diálogo do dia.
 *
 * Não tem estado nenhum: recebe o mapa `data → plantões` já montado pelo
 * calendário e devolve o clique. A aritmética de dia/mês vive em
 * `datas-da-serie.ts`, sem React, e é a mesma do arquivo original.
 */

import { useMemo } from "react";
import Link from "next/link";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CalendarDaysIcon,
  CalendarOffIcon,
} from "lucide-react";
import type { SlotAdmin } from "@/lib/plantao-tipos";
import { rotuloMes } from "@/components/plantao/calendario-mes";
import {
  diasDaGrade,
  mesAnterior,
  paramMes,
  proximoMes,
} from "./datas-da-serie";

export function GradeMes({
  ano,
  mes,
  porDia,
  abrirDia,
}: {
  ano: number;
  mes: number;
  /** `"2026-09-15"` → plantões daquele dia. Montado uma vez no calendário. */
  porDia: Map<string, SlotAdmin[]>;
  abrirDia: (iso: string) => void;
}) {
  const grade = useMemo(() => diasDaGrade(ano, mes), [ano, mes]);
  const anterior = mesAnterior(ano, mes);
  const proximo = proximoMes(ano, mes);

  return (
    <>
    <div className="flex items-center justify-between gap-2 rounded-xl border bg-card p-3 shadow-sm">
      <Link
        href={`/admin/plantao?m=${paramMes(anterior.ano, anterior.mes)}`}
        className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label="Mês anterior"
      >
        <ChevronLeftIcon className="size-4" />
      </Link>
      {/* `capitalize` maiúsculizava toda palavra e a tela dizia
          "Setembro De 2026". Mesmo bug, mesma correção do calendário
          público: o rótulo vem pronto de `rotuloMes()`. */}
      <div className="flex items-center gap-1.5 font-medium">
        <CalendarDaysIcon className="size-4 text-primary" aria-hidden />
        {rotuloMes(mes, ano)}
      </div>
      <Link
        href={`/admin/plantao?m=${paramMes(proximo.ano, proximo.mes)}`}
        className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label="Próximo mês"
      >
        <ChevronRightIcon className="size-4" />
      </Link>
    </div>

    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-medium text-muted-foreground">
        {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map((d) => (
          <div key={d} className="py-1.5">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {grade.map((iso, i) => {
          if (!iso) return <div key={`vazio-${i}`} className="aspect-square sm:aspect-auto sm:h-20" />;
          const doDia = porDia.get(iso) ?? [];
          const publicados = doDia.filter((s) => s.publicado).length;
          const cancelados = doDia.filter((s) => s.canceladoEm !== null).length;
          const numeroDia = Number(iso.slice(-2));
          return (
            <button
              key={iso}
              type="button"
              onClick={() => abrirDia(iso)}
              className="flex aspect-square flex-col items-center justify-center gap-0.5 border-b border-r p-1 text-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:aspect-auto sm:h-20 sm:items-start sm:justify-start sm:gap-1"
            >
              <span className="font-medium">{numeroDia}</span>
              {doDia.length > 0 ? (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <span
                    className={
                      "size-1.5 rounded-full " +
                      (publicados > 0 ? "bg-primary" : "bg-muted-foreground/40")
                    }
                    aria-hidden
                  />
                  {doDia.length}
                  {cancelados > 0 ? (
                    <CalendarOffIcon className="size-3 text-destructive" aria-hidden />
                  ) : null}
                </span>
              ) : null}
              <span className="sr-only">
                {doDia.length === 0
                  ? "sem plantão"
                  : `${doDia.length} plantão(ões)${cancelados > 0 ? `, ${cancelados} cancelado(s)` : ""}`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
    </>
  );
}
