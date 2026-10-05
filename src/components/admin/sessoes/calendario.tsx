"use client";

/**
 * Calendário do mês de `/admin/sessoes` — a mesma grade do Plantão
 * (`plantao-calendario/grade-mes.tsx`), só de LEITURA.
 *
 * Pedido de 03/10/2026: a equipe enxergar as Reuniões Preliminares marcadas
 * sem rolar a lista. Por isso abre filtrado em "Reunião Preliminar" e a
 * célula já diz hora + cliente; o clique no dia abre o que tem naquele dia.
 *
 * 🔑 Não tem ação nenhuma. Cancelar, falta, concluir, link e briefing
 * continuam SÓ na lista abaixo — duas portas para a mesma escrita viram duas
 * regras para manter. O diálogo do dia aponta para a lista.
 *
 * Cor = ESTADO (agendada, realizada, cancelada/falta riscada), igual ao
 * plantão; o TIPO é o filtro do topo, para a cor não ter de dizer duas
 * coisas ao mesmo tempo.
 */

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
} from "lucide-react";

import {
  diasDaGrade,
  mesAnterior,
  paramMes,
  proximoMes,
} from "@/components/admin/plantao-calendario/datas-da-serie";
import { rotuloMes } from "@/components/plantao/calendario-mes";
import {
  horaDeTime,
  horaFimDeBloco,
  rotuloDoDia,
} from "@/components/sessoes/grade";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FUSO } from "@/lib/datas";
import { formatarNome } from "@/lib/nomes";
import {
  ROTULO_ESTADO_SESSAO,
  TIPO_CROQUI_ESTRUTURAL,
  TIPO_ENTREVISTA_PREVIA,
  TIPO_REUNIAO_PRELIMINAR,
  TIPO_SESSAO_VIABILIDADE,
  type EstadoSessao,
  type SessaoAgendamento,
} from "@/lib/sessoes-tipos";
import { cn } from "@/lib/utils";

type Filtro = "preliminar" | "entrevista" | "viabilidade" | "croqui" | "todas";

const FILTROS: { valor: Filtro; rotulo: string }[] = [
  { valor: "preliminar", rotulo: "Reunião Preliminar" },
  { valor: "entrevista", rotulo: "Entrevista Prévia" },
  { valor: "viabilidade", rotulo: "Sessão de Viabilidade" },
  { valor: "croqui", rotulo: "Croqui Estrutural" },
  { valor: "todas", rotulo: "Todas" },
];

const NOME_DO_TIPO: Record<number, string> = {
  [TIPO_ENTREVISTA_PREVIA]: "Entrevista Prévia",
  [TIPO_REUNIAO_PRELIMINAR]: "Reunião Preliminar",
  [TIPO_SESSAO_VIABILIDADE]: "Sessão de Viabilidade",
  [TIPO_CROQUI_ESTRUTURAL]: "Croqui Estrutural",
};

/** A cor de cada estado — a mesma linguagem do calendário do plantão. */
const COR_DO_ESTADO: Record<EstadoSessao, string> = {
  agendado: "bg-accent text-accent-foreground",
  realizado: "bg-sucesso text-sucesso-foreground",
  cancelado: "bg-risco text-risco-foreground line-through",
  falta: "bg-risco text-risco-foreground line-through",
};

function passaNoFiltro(s: SessaoAgendamento, filtro: Filtro): boolean {
  if (filtro === "preliminar") return s.tipo_id === TIPO_REUNIAO_PRELIMINAR;
  if (filtro === "entrevista") return s.tipo_id === TIPO_ENTREVISTA_PREVIA;
  if (filtro === "viabilidade") return s.tipo_id === TIPO_SESSAO_VIABILIDADE;
  if (filtro === "croqui") return s.tipo_id === TIPO_CROQUI_ESTRUTURAL;
  return true;
}

function hojeNoFuso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date());
}

function assinarNada(): () => void {
  return () => {};
}

/** "Michele Guerra" → "Michele". A célula tem ~90 px de largura útil. */
function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

export function CalendarioDeSessoes({
  ano,
  mes,
  sessoes,
  nomeDoCliente,
  nomeDaResponsavel,
  truncado,
}: {
  ano: number;
  mes: number;
  /** Só as do mês (`getSessoesDoMes`), em qualquer estado. */
  sessoes: SessaoAgendamento[];
  nomeDoCliente: Map<string, string>;
  nomeDaResponsavel: Map<string, string | null>;
  truncado: boolean;
}) {
  const [filtro, setFiltro] = useState<Filtro>("preliminar");
  const [diaAberto, setDiaAberto] = useState<string | null>(null);
  const grade = useMemo(() => diasDaGrade(ano, mes), [ano, mes]);
  const anterior = mesAnterior(ano, mes);
  const proximo = proximoMes(ano, mes);
  // Mesmo motivo do plantão: "hoje" só existe no cliente; no SSR é `null`.
  const hoje = useSyncExternalStore(assinarNada, hojeNoFuso, () => null);

  const porDia = useMemo(() => {
    const mapa = new Map<string, SessaoAgendamento[]>();
    for (const s of sessoes) {
      if (!passaNoFiltro(s, filtro)) continue;
      const lista = mapa.get(s.data) ?? [];
      lista.push(s);
      mapa.set(s.data, lista);
    }
    return mapa;
  }, [sessoes, filtro]);

  const agendadasNoMes = sessoes.filter(
    (s) => passaNoFiltro(s, filtro) && s.estado === "agendado",
  ).length;

  const nomeCliente = (id: string) =>
    formatarNome(nomeDoCliente.get(id) ?? null) ?? "Cliente sem nome";
  const doDiaAberto = diaAberto ? (porDia.get(diaAberto) ?? []) : [];

  return (
    <div className="grid gap-3">
      <div
        role="group"
        aria-label="Tipo de sessão"
        className="flex flex-wrap items-center gap-1.5"
      >
        {FILTROS.map((f) => (
          <button
            key={f.valor}
            type="button"
            onClick={() => setFiltro(f.valor)}
            aria-pressed={filtro === f.valor}
            className={cn(
              "foco-visivel rounded-full border px-3 py-1 text-xs font-medium transition",
              filtro === f.valor
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {f.rotulo}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground" aria-live="polite">
          {agendadasNoMes}{" "}
          {agendadasNoMes === 1 ? "agendada" : "agendadas"} neste mês
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 rounded-xl border bg-card p-3 shadow-(--shadow-raised)">
        <Link
          href={`/admin/sessoes?m=${paramMes(anterior.ano, anterior.mes)}`}
          scroll={false}
          className="foco-visivel inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label="Mês anterior"
        >
          <ChevronLeftIcon className="size-4" aria-hidden />
        </Link>
        <div className="flex items-center gap-1.5 font-heading font-semibold">
          <CalendarDaysIcon className="size-4 text-primary" aria-hidden />
          {rotuloMes(mes, ano)}
        </div>
        <Link
          href={`/admin/sessoes?m=${paramMes(proximo.ano, proximo.mes)}`}
          scroll={false}
          className="foco-visivel inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label="Próximo mês"
        >
          <ChevronRightIcon className="size-4" aria-hidden />
        </Link>
      </div>

      {truncado ? (
        <p className="corpo-sm text-muted-foreground">
          Este mês tem mais sessões do que o calendário carrega de uma vez.
          Use a lista abaixo para ver todas.
        </p>
      ) : null}

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
                <div
                  key={`vazio-${i}`}
                  className="aspect-square border-r border-b bg-superficie-afundada sm:aspect-auto sm:h-24"
                />
              );
            const doDia = porDia.get(iso) ?? [];
            const numeroDia = Number(iso.slice(-2));
            const ehHoje = iso === hoje;
            const primeira = doDia[0];
            const vivas = doDia.filter((s) => s.estado === "agendado").length;
            return (
              <button
                key={iso}
                type="button"
                onClick={() => setDiaAberto(iso)}
                disabled={doDia.length === 0}
                aria-current={ehHoje ? "date" : undefined}
                className={cn(
                  "foco-visivel relative flex aspect-square flex-col items-center gap-0.5 border-r border-b p-1 text-sm transition enabled:hover:bg-muted sm:aspect-auto sm:h-24 sm:items-stretch sm:gap-1 sm:p-1.5 sm:text-left",
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

                {primeira ? (
                  <span
                    aria-hidden
                    className="hidden min-w-0 flex-1 flex-col gap-0.5 overflow-hidden text-[11px] leading-tight sm:flex"
                  >
                    <span
                      className={cn(
                        "truncate rounded px-1 py-0.5 font-medium",
                        COR_DO_ESTADO[primeira.estado],
                      )}
                    >
                      {horaDeTime(primeira.hora_inicio)}{" "}
                      {primeiroNome(nomeCliente(primeira.cliente_id))}
                    </span>
                    {doDia.length > 1 ? (
                      <span className="truncate text-muted-foreground">
                        +{doDia.length - 1}{" "}
                        {doDia.length - 1 === 1 ? "sessão" : "sessões"}
                      </span>
                    ) : null}
                  </span>
                ) : null}

                {/* Celular: não cabe texto, fica o ponto + a contagem. */}
                {doDia.length > 0 ? (
                  <span
                    aria-hidden
                    className="flex items-center gap-1 text-[11px] text-muted-foreground sm:hidden"
                  >
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        vivas > 0 ? "bg-primary" : "bg-neutro-foreground",
                      )}
                    />
                    {doDia.length}
                  </span>
                ) : null}

                <span className="sr-only">
                  {doDia.length === 0
                    ? "sem sessão"
                    : `${doDia.length} ${doDia.length === 1 ? "sessão" : "sessões"}, ${vivas} ${vivas === 1 ? "agendada" : "agendadas"}`}
                  {ehHoje ? ", hoje" : ""}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <ItemLegenda cor="bg-accent inset-ring inset-ring-accent-foreground/30">
          agendada
        </ItemLegenda>
        <ItemLegenda cor="bg-sucesso inset-ring inset-ring-sucesso-foreground/30">
          realizada
        </ItemLegenda>
        <ItemLegenda cor="bg-risco inset-ring inset-ring-risco-foreground/30">
          cancelada ou falta
        </ItemLegenda>
        <ItemLegenda cor="bg-accent/40 inset-ring-2 inset-ring-primary">
          hoje
        </ItemLegenda>
      </div>

      <Dialog
        open={diaAberto !== null}
        onOpenChange={(aberto) => !aberto && setDiaAberto(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{diaAberto ? rotuloDoDia(diaAberto) : ""}</DialogTitle>
            <DialogDescription>
              Para cancelar, marcar falta, concluir ou colar o link, use a
              lista de sessões abaixo do calendário.
            </DialogDescription>
          </DialogHeader>
          <ul className="divide-y divide-borda-fina border border-borda-fina">
            {doDiaAberto.map((s) => {
              const responsavel = formatarNome(
                nomeDaResponsavel.get(s.responsavel_id) ?? null,
              );
              return (
                <li key={s.id} className="grid gap-1 px-3 py-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="numero font-semibold">
                      {horaDeTime(s.hora_inicio)}–
                      {horaFimDeBloco(s.hora_inicio, s.duracao_min)}
                    </span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[11px] font-medium",
                        COR_DO_ESTADO[s.estado],
                      )}
                    >
                      {ROTULO_ESTADO_SESSAO[s.estado]}
                    </span>
                  </div>
                  <p className="font-medium">{nomeCliente(s.cliente_id)}</p>
                  <p className="corpo-sm text-muted-foreground">
                    {NOME_DO_TIPO[s.tipo_id] ?? "Sessão"}
                    {responsavel ? ` · com ${responsavel}` : ""}
                  </p>
                  {s.link_reuniao && s.estado === "agendado" ? (
                    <a
                      href={s.link_reuniao}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="foco-visivel inline-flex w-fit items-center gap-1 corpo-sm font-medium text-primary underline-offset-2 hover:underline"
                    >
                      Abrir link da reunião
                      <ExternalLinkIcon className="size-3.5" aria-hidden />
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ItemLegenda({
  cor,
  children,
}: {
  cor: string;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cn("size-3 rounded", cor)} />
      {children}
    </span>
  );
}
