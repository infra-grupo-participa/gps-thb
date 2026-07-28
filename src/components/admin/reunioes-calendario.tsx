"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Copy,
  Ban,
  Undo2,
  CalendarClock,
  CalendarPlus,
  MessageCircle,
  Mail,
  Phone,
  User,
  Star,
  Lock,
  Unlock,
  X,
} from "lucide-react";
import type { ReuniaoAgendamentoDetalhe } from "@/lib/types";
import {
  HORARIOS_REUNIAO,
  faixaHorario,
  horaCurta,
  rotuloDataLongo,
  somarSemanas,
} from "@/lib/reuniao";
import { mascaraTelefone } from "@/lib/masks";
import { linkWhatsapp } from "@/lib/whatsapp";
import {
  bloquearQuarta,
  desbloquearQuarta,
  bloquearSlot,
  desbloquearSlot,
  cancelarReuniao,
} from "@/app/reuniao/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { AgendarAlunoModal } from "@/components/admin/agendar-aluno-modal";

/** Encurta a URL para exibição (mantém host + começo do caminho). */
function urlCurta(url: string): string {
  try {
    const u = new URL(url);
    const cauda = (u.pathname + u.search).replace(/\/$/, "");
    const texto = u.host + cauda;
    return texto.length > 48 ? texto.slice(0, 47) + "…" : texto;
  } catch {
    return url.length > 48 ? url.slice(0, 47) + "…" : url;
  }
}

export function ReunioesCalendario({
  quarta,
  agendamentos,
  bloqueada,
  horariosBloqueados,
}: {
  quarta: string;
  agendamentos: ReuniaoAgendamentoDetalhe[];
  bloqueada: boolean;
  /** horários "HH:MM" fechados pontualmente nesta quarta. */
  horariosBloqueados: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Slot alvo do modal de agendar aluno (null = fechado).
  const [agendarSlot, setAgendarSlot] = useState<string | null>(null);

  const porHorario = new Map<string, ReuniaoAgendamentoDetalhe>();
  for (const a of agendamentos) porHorario.set(horaCurta(a.horario), a);
  const slotFechado = new Set(horariosBloqueados.map(horaCurta));

  const ocupados = agendamentos.length;
  const total = HORARIOS_REUNIAO.length;

  function irPara(iso: string) {
    router.push(`/admin/reunioes?semana=${iso}`);
  }

  function copiar(texto: string) {
    navigator.clipboard?.writeText(texto);
    toast.success("Link copiado.");
  }

  function alternarBloqueioQuarta() {
    startTransition(async () => {
      const res = bloqueada
        ? await desbloquearQuarta(quarta)
        : await bloquearQuarta(quarta);
      if (res.erro) {
        toast.error(res.erro);
        return;
      }
      toast.success(bloqueada ? "Data liberada." : "Data bloqueada.");
      router.refresh();
    });
  }

  function alternarSlot(horario: string, fechado: boolean) {
    startTransition(async () => {
      const res = fechado
        ? await desbloquearSlot(quarta, horario)
        : await bloquearSlot(quarta, horario);
      if (res.erro) {
        toast.error(res.erro);
        return;
      }
      toast.success(fechado ? "Horário reaberto." : "Horário fechado.");
      router.refresh();
    });
  }

  function cancelar(alunoId: string) {
    startTransition(async () => {
      const res = await cancelarReuniao(alunoId);
      if (res.erro) {
        toast.error(res.erro);
        return;
      }
      toast.success("Reunião cancelada.");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4">
      {/* Cabeçalho: navegação + resumo do dia */}
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => irPara(somarSemanas(quarta, -1))}
              title="Semana anterior"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div className="flex items-center gap-2">
              <CalendarClock className="size-5 text-primary" />
              <div>
                <div className="font-semibold capitalize leading-tight">
                  {rotuloDataLongo(quarta)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {bloqueada
                    ? "Data bloqueada"
                    : `${ocupados} de ${total} horários ocupados · ${
                        total - ocupados
                      } livres`}
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => irPara(somarSemanas(quarta, 1))}
              title="Próxima semana"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => irPara(quarta)}>
              Hoje
            </Button>
            <Button
              variant={bloqueada ? "outline" : "ghost"}
              size="sm"
              onClick={alternarBloqueioQuarta}
              disabled={pending}
              className={
                bloqueada ? "" : "text-muted-foreground hover:text-destructive"
              }
            >
              {bloqueada ? (
                <>
                  <Undo2 className="size-4" /> Liberar data
                </>
              ) : (
                <>
                  <Ban className="size-4" /> Bloquear data
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {bloqueada ? (
        <div className="rounded-lg border border-dashed bg-muted/40 p-4 text-sm text-muted-foreground">
          Esta quarta está bloqueada — não aparece como disponível para os alunos.
        </div>
      ) : null}

      {/* Timeline vertical do dia */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        {HORARIOS_REUNIAO.map((h, i) => {
          const ag = porHorario.get(h);
          const fechado = slotFechado.has(h);
          const wpp = ag ? linkWhatsapp(ag.aluno_telefone) : null;
          return (
            <div
              key={h}
              className={
                "flex flex-col gap-3 p-4 sm:flex-row sm:gap-4 " +
                (i > 0 ? "border-t " : "") +
                (ag ? "bg-primary/[0.04]" : "")
              }
            >
              {/* Coluna do horário */}
              <div className="flex shrink-0 items-center gap-2 sm:w-32 sm:flex-col sm:items-start sm:gap-1">
                <span
                  className={
                    "inline-flex size-2.5 shrink-0 rounded-full " +
                    (ag
                      ? "bg-primary"
                      : fechado
                        ? "bg-muted-foreground/40"
                        : "bg-muted-foreground/25")
                  }
                  aria-hidden
                />
                <div>
                  <div className="text-base font-semibold tabular-nums leading-none">
                    {faixaHorario(h)}
                  </div>
                  <div
                    className={
                      "mt-1 text-xs font-medium " +
                      (ag
                        ? "text-primary"
                        : fechado
                          ? "text-muted-foreground"
                          : "text-muted-foreground")
                    }
                  >
                    {ag ? "Reservado" : fechado ? "Fechado" : "Livre"}
                  </div>
                </div>
              </div>

              {/* Dados do agendamento / ações */}
              {ag ? (
                <div className="min-w-0 flex-1 grid gap-3 sm:grid-cols-2">
                  {/* Aluno */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <User className="size-3.5" /> Aluno
                    </div>
                    <div className="mt-0.5 truncate font-semibold">
                      {ag.aluno_nome ?? ag.aluno_email ?? "—"}
                    </div>
                    <div className="mt-1 grid gap-0.5 text-sm text-muted-foreground">
                      {ag.aluno_telefone ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Phone className="size-3.5 shrink-0" />
                          {mascaraTelefone(ag.aluno_telefone)}
                          {wpp ? (
                            <a
                              href={wpp}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Abrir no WhatsApp"
                              className="text-green-600 hover:text-green-700"
                            >
                              <MessageCircle className="size-4" />
                            </a>
                          ) : null}
                        </span>
                      ) : null}
                      {ag.aluno_email ? (
                        <a
                          href={`mailto:${ag.aluno_email}`}
                          className="inline-flex items-center gap-1.5 truncate hover:text-foreground"
                          title={ag.aluno_email}
                        >
                          <Mail className="size-3.5 shrink-0" />
                          <span className="truncate">{ag.aluno_email}</span>
                        </a>
                      ) : null}
                    </div>
                  </div>

                  {/* Cliente + link + ações */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <Star className="size-3.5" /> Cliente
                    </div>
                    <div className="mt-0.5 truncate font-semibold">
                      {ag.cliente_nome ?? (
                        <span className="font-normal text-muted-foreground">
                          Sem favorito ainda
                        </span>
                      )}
                    </div>
                    {ag.link_live ? (
                      <a
                        href={ag.link_live}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 block truncate text-sm text-primary underline-offset-2 hover:underline"
                        title={ag.link_live}
                      >
                        {urlCurta(ag.link_live)}
                      </a>
                    ) : (
                      <div className="mt-1 text-sm text-muted-foreground">
                        Link a definir (o aluno cola depois).
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {ag.link_live ? (
                        <>
                          <a
                            href={ag.link_live}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={buttonVariants({
                              variant: "default",
                              size: "sm",
                            })}
                          >
                            <ExternalLink className="size-4" /> Abrir live
                          </a>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copiar(ag.link_live as string)}
                          >
                            <Copy className="size-4" /> Copiar
                          </Button>
                        </>
                      ) : null}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAgendarSlot(h)}
                        disabled={pending}
                        title="Remarcar / trocar o aluno deste horário"
                      >
                        <CalendarClock className="size-4" /> Remarcar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => cancelar(ag.aluno_id)}
                        disabled={pending}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="size-4" /> Cancelar
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">
                    {fechado
                      ? "Horário fechado — indisponível para os alunos."
                      : "Nenhum aluno agendado neste horário."}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {!fechado ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAgendarSlot(h)}
                        disabled={pending || bloqueada}
                      >
                        <CalendarPlus className="size-4" /> Agendar aluno
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => alternarSlot(h, fechado)}
                      disabled={pending || bloqueada}
                      className={
                        fechado ? "" : "text-muted-foreground hover:text-foreground"
                      }
                      title={
                        fechado ? "Reabrir este horário" : "Fechar só este horário"
                      }
                    >
                      {fechado ? (
                        <>
                          <Unlock className="size-4" /> Reabrir
                        </>
                      ) : (
                        <>
                          <Lock className="size-4" /> Fechar horário
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal de agendar/remarcar por aluno */}
      <AgendarAlunoModal
        open={agendarSlot !== null}
        onOpenChange={(v) => {
          if (!v) setAgendarSlot(null);
        }}
        data={quarta}
        horario={agendarSlot ?? HORARIOS_REUNIAO[0]}
      />
    </div>
  );
}
