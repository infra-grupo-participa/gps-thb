"use client";

/**
 * Plantão de Dúvidas — Acelera Holding. Grade mensal PÚBLICA.
 *
 * ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
 * (commit b457005) e PROIBIDO de reconstruir.
 *
 * PORTA o padrão de grade/estado/dialog/toast de
 * `git show b457005^:src/components/admin/reunioes-calendario.tsx`, adaptado
 * de "timeline de um dia" para "grade de um mês": cada dia com plantão ganha
 * um marcador; clicar abre o painel de inscrição daquele dia num `Dialog`.
 *
 * Sem "lotado": não há capacidade neste produto. Estados por slot: livre,
 * encerrado, meu (o aluno já está inscrito nele).
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, CalendarDaysIcon } from "lucide-react";
import type { SlotPublico, MinhaInscricao } from "@/lib/plantao-tipos";
import { rotuloData, hojeSaoPaulo } from "@/lib/plantao";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { InscricaoPainel } from "@/components/plantao/inscricao-painel";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function mesAnterior(ano: number, mes: number): { ano: number; mes: number } {
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
}

function proximoMes(ano: number, mes: number): { ano: number; mes: number } {
  return mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };
}

function paramMes(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

/** Dias do mês em grade de semana (domingo–sábado), com espaços em branco antes/depois. */
function diasDaGrade(ano: number, mes: number): (string | null)[] {
  const primeiro = new Date(Date.UTC(ano, mes - 1, 1));
  const totalDias = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const diaSemanaInicio = primeiro.getUTCDay();

  const dias: (string | null)[] = Array(diaSemanaInicio).fill(null);
  for (let d = 1; d <= totalDias; d++) {
    dias.push(`${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (dias.length % 7 !== 0) dias.push(null);
  return dias;
}

export function CalendarioMes({
  ano,
  mes,
  slots,
  minhaInscricaoAtiva,
}: {
  ano: number;
  mes: number;
  slots: SlotPublico[];
  /** Inscrição ativa (não encerrada) do aluno, ou null. Trava escolher outro plantão. */
  minhaInscricaoAtiva: MinhaInscricao | null;
}) {
  const [diaAberto, setDiaAberto] = useState<string | null>(null);

  const porDia = useMemo(() => {
    const mapa = new Map<string, SlotPublico[]>();
    for (const s of slots) {
      const lista = mapa.get(s.data) ?? [];
      lista.push(s);
      mapa.set(s.data, lista);
    }
    return mapa;
  }, [slots]);

  const grade = useMemo(() => diasDaGrade(ano, mes), [ano, mes]);
  const anterior = mesAnterior(ano, mes);
  const proximo = proximoMes(ano, mes);
  // Hoje sempre no fuso de São Paulo — nunca `new Date().getUTCDate()`, que
  // mente o dia entre 21h e meia-noite no Brasil (lição registrada no projeto).
  const hojeIso = hojeSaoPaulo();

  const slotsDoDiaAberto = diaAberto ? (porDia.get(diaAberto) ?? []) : [];

  return (
    <div className="grid gap-3">
      {/* Cabeçalho: navegação do mês */}
      <div className="flex items-center justify-between gap-2 rounded-xl border bg-card p-3 shadow-sm">
        <Link
          href={`/p/plantao?m=${paramMes(anterior.ano, anterior.mes)}`}
          className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label="Mês anterior"
        >
          <ChevronLeftIcon className="size-4" />
        </Link>
        <div className="flex items-center gap-1.5 font-medium capitalize">
          <CalendarDaysIcon className="size-4 text-primary" aria-hidden />
          {MESES[mes - 1]} de {ano}
        </div>
        <Link
          href={`/p/plantao?m=${paramMes(proximo.ano, proximo.mes)}`}
          className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label="Próximo mês"
        >
          <ChevronRightIcon className="size-4" />
        </Link>
      </div>

      {slots.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/40 p-6 text-center text-sm text-muted-foreground">
          Nenhum plantão liberado neste mês ainda.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          {/* Cabeçalho dos dias da semana — iniciais para caber em iframe estreito. */}
          <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-[11px] font-medium text-muted-foreground">
            {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
              <div key={i} className="py-1.5">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {grade.map((iso, i) => {
              if (!iso) {
                return <div key={`vazio-${i}`} className="aspect-square" />;
              }
              const slotsDoDia = porDia.get(iso) ?? [];
              const temSlot = slotsDoDia.length > 0;
              const temMeu = slotsDoDia.some((s) => s.minhaInscricao);
              const todosEncerrados =
                temSlot && slotsDoDia.every((s) => s.encerrado);
              const numeroDia = Number(iso.slice(-2));
              const ehHoje = iso === hojeIso;

              return (
                <button
                  key={iso}
                  type="button"
                  disabled={!temSlot}
                  onClick={() => setDiaAberto(iso)}
                  aria-label={
                    temSlot
                      ? `${rotuloData(iso)}: ${slotsDoDia.length} plantão(ões)`
                      : rotuloData(iso)
                  }
                  className={
                    "relative flex aspect-square flex-col items-center justify-center gap-0.5 border-b border-r text-sm transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 " +
                    (temSlot
                      ? "cursor-pointer hover:bg-muted"
                      : "cursor-default text-muted-foreground/50")
                  }
                >
                  <span
                    className={
                      ehHoje
                        ? "flex size-6 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary"
                        : ""
                    }
                  >
                    {numeroDia}
                  </span>
                  {temSlot ? (
                    <span
                      aria-hidden
                      className={
                        "size-1.5 rounded-full " +
                        (temMeu
                          ? "bg-primary"
                          : todosEncerrados
                            ? "bg-muted-foreground/40"
                            : "bg-primary/60")
                      }
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Legenda curta — sem "lotado": este produto não tem capacidade. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-primary/60" aria-hidden />
          livre
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-primary" aria-hidden />
          seu plantão
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="size-1.5 rounded-full bg-muted-foreground/40"
            aria-hidden
          />
          encerrado
        </span>
      </div>

      <Dialog
        open={diaAberto !== null}
        onOpenChange={(v) => {
          if (!v) setDiaAberto(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {diaAberto ? rotuloData(diaAberto) : ""}
            </DialogTitle>
            <DialogDescription>
              Plantões disponíveis neste dia.
            </DialogDescription>
          </DialogHeader>
          <InscricaoPainel
            slots={slotsDoDiaAberto}
            minhaInscricaoAtiva={minhaInscricaoAtiva}
            onConcluido={() => setDiaAberto(null)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
