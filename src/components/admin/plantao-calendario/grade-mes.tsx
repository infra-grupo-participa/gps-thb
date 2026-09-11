"use client";

/**
 * A grade do mês: a barra de navegação (mês anterior/próximo) e o quadro de 7
 * colunas em que cada dia é um botão que abre o diálogo do dia.
 *
 * Não tem estado de dado nenhum: recebe o mapa `data → plantões` já montado
 * pelo calendário e devolve o clique. A aritmética de dia/mês vive em
 * `datas-da-serie.ts`, sem React, e é a mesma do arquivo original.
 *
 * 🎨 Onda B (B16) — a célula PASSA A DIZER O QUE TEM.
 * Era a tela com o maior vazio de informação do sistema: 420 px de altura em
 * que o dia com plantão mostrava **um ponto de 6 px e o número "1"**. Nem
 * mentora, nem horário, nem inscritos — para saber qualquer coisa era preciso
 * clicar dia a dia. Agora a célula traz hora, primeiro nome de quem apresenta
 * e quantos se inscreveram; a **legenda** dos estados existe (o ponto laranja,
 * o cinza e o ícone riscado não estavam escritos em lugar nenhum); "hoje" tem
 * anel; e os dias fora do mês ficam na superfície afundada, em vez de branco
 * puro, que fazia a grade parecer tabela não preenchida.
 */

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CalendarDaysIcon,
  CalendarOffIcon,
} from "lucide-react";
import type { SlotAdmin } from "@/lib/plantao-tipos";
import { rotuloMes } from "@/components/plantao/calendario-mes";
import { FUSO } from "@/lib/datas";
import { cn } from "@/lib/utils";
import {
  diasDaGrade,
  mesAnterior,
  paramMes,
  proximoMes,
} from "./datas-da-serie";

/** O dia de hoje no fuso do produto, "YYYY-MM-DD". */
function hojeNoFuso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date());
}

/** A data de hoje não muda enquanto a tela está aberta: nada a assinar. */
function assinarNada(): () => void {
  return () => {};
}

/** "Isabela Nogueira" → "Isabela". A célula tem ~90 px de largura útil. */
function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

/** Um item da legenda — forma + palavra, porque cor sozinha não informa. */
function ItemLegenda({
  marca,
  children,
}: {
  marca: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {marca}
      {children}
    </span>
  );
}

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

  // "Hoje" é um valor do CLIENTE: no servidor o snapshot é `null` e o anel
  // simplesmente não sai no HTML inicial. É por isso que ele vem de
  // `useSyncExternalStore` e não de um `new Date()` no corpo do componente —
  // que divergiria entre SSR e hidratação na virada do dia — nem de um
  // `setState` dentro de `useEffect`, que dispara render em cascata.
  // `en-CA` dá "YYYY-MM-DD", o mesmo formato de `plantao_slots.data`, e o fuso
  // é o do PRODUTO (`FUSO`), não o da máquina de quem abriu a tela.
  const hoje = useSyncExternalStore(assinarNada, hojeNoFuso, () => null);

  return (
    <>
      <div className="flex items-center justify-between gap-2 rounded-xl border bg-card p-3 shadow-(--shadow-raised)">
        <Link
          href={`/admin/plantao?m=${paramMes(anterior.ano, anterior.mes)}`}
          className="foco-visivel inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label="Mês anterior"
        >
          <ChevronLeftIcon className="size-4" aria-hidden />
        </Link>
        {/* `capitalize` maiúsculizava toda palavra e a tela dizia
            "Setembro De 2026". Mesmo bug, mesma correção do calendário
            público: o rótulo vem pronto de `rotuloMes()`. */}
        <div className="flex items-center gap-1.5 font-heading font-semibold">
          <CalendarDaysIcon className="size-4 text-primary" aria-hidden />
          {rotuloMes(mes, ano)}
        </div>
        <Link
          href={`/admin/plantao?m=${paramMes(proximo.ano, proximo.mes)}`}
          className="foco-visivel inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label="Próximo mês"
        >
          <ChevronRightIcon className="size-4" aria-hidden />
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-(--shadow-raised)">
        <div className="grid grid-cols-7 border-b bg-superficie-afundada text-center text-xs font-medium text-muted-foreground">
          {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map((d) => (
            <div key={d} className="py-1.5">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {grade.map((iso, i) => {
            if (!iso)
              return (
                // Dia fora do mês: superfície afundada. Em branco puro a grade
                // parecia uma tabela por preencher.
                <div
                  key={`vazio-${i}`}
                  className="aspect-square border-r border-b bg-superficie-afundada sm:aspect-auto sm:h-24"
                />
              );
            const doDia = porDia.get(iso) ?? [];
            const publicados = doDia.filter((s) => s.publicado).length;
            const cancelados = doDia.filter((s) => s.canceladoEm !== null).length;
            const numeroDia = Number(iso.slice(-2));
            const ehHoje = iso === hoje;
            const primeiro = doDia[0];
            return (
              <button
                key={iso}
                type="button"
                onClick={() => abrirDia(iso)}
                aria-current={ehHoje ? "date" : undefined}
                className={cn(
                  "foco-visivel relative flex aspect-square flex-col items-center gap-0.5 border-r border-b p-1 text-sm transition hover:bg-muted sm:aspect-auto sm:h-24 sm:items-stretch sm:gap-1 sm:p-1.5 sm:text-left",
                  // O anel de "hoje" é `inset` para não ser cortado pela
                  // borda da célula nem empurrar a grade.
                  ehHoje && "bg-accent/40 inset-ring-2 inset-ring-primary",
                )}
              >
                <span
                  className={cn(
                    "numero shrink-0 font-semibold",
                    ehHoje && "text-accent-foreground",
                  )}
                >
                  {numeroDia}
                </span>

                {primeiro ? (
                  <span
                    aria-hidden
                    className="hidden min-w-0 flex-1 flex-col gap-0.5 overflow-hidden text-[11px] leading-tight sm:flex"
                  >
                    <span
                      className={cn(
                        "truncate rounded px-1 py-0.5 font-medium",
                        cancelados > 0
                          ? "bg-risco text-risco-foreground line-through"
                          : publicados > 0
                            ? "bg-accent text-accent-foreground"
                            : "bg-neutro text-neutro-foreground",
                      )}
                    >
                      {primeiro.horaInicio} {primeiroNome(primeiro.mentoraNome)}
                    </span>
                    <span className="truncate text-muted-foreground">
                      {primeiro.inscritosQtd}{" "}
                      {primeiro.inscritosQtd === 1 ? "inscrito" : "inscritos"}
                      {doDia.length > 1 ? ` · +${doDia.length - 1}` : ""}
                    </span>
                  </span>
                ) : null}

                {/* Celular: não cabe texto, fica o resumo de sempre. */}
                {doDia.length > 0 ? (
                  <span
                    aria-hidden
                    className="flex items-center gap-1 text-[11px] text-muted-foreground sm:hidden"
                  >
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        publicados > 0 ? "bg-primary" : "bg-neutro-foreground",
                      )}
                    />
                    {doDia.length}
                    {cancelados > 0 ? (
                      <CalendarOffIcon className="size-3 text-risco-foreground" />
                    ) : null}
                  </span>
                ) : null}

                <span className="sr-only">
                  {doDia.length === 0
                    ? "sem plantão"
                    : `${doDia.length} plantão(ões)${cancelados > 0 ? `, ${cancelados} cancelado(s)` : ""}`}
                  {ehHoje ? ", hoje" : ""}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* LEGENDA — três estados que a grade já usava e que não estavam
          escritos em lugar nenhum da tela. É copy nova de propósito: o plano
          permite exatamente as strings que hoje não existem. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <ItemLegenda
          marca={
            <span
              aria-hidden
              className="size-3 rounded bg-accent inset-ring inset-ring-accent-foreground/30"
            />
          }
        >
          publicado (o parceiro vê)
        </ItemLegenda>
        <ItemLegenda
          marca={
            <span
              aria-hidden
              className="size-3 rounded bg-neutro inset-ring inset-ring-neutro-foreground/30"
            />
          }
        >
          rascunho (fora do ar)
        </ItemLegenda>
        <ItemLegenda
          marca={
            <CalendarOffIcon
              aria-hidden
              className="size-3.5 text-risco-foreground"
            />
          }
        >
          cancelado (inscritos avisados)
        </ItemLegenda>
        <ItemLegenda
          marca={
            <span
              aria-hidden
              className="size-3 rounded bg-accent/40 inset-ring-2 inset-ring-primary"
            />
          }
        >
          hoje
        </ItemLegenda>
      </div>
    </>
  );
}
