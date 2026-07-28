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
} from "lucide-react";
import type { ReuniaoAgendamentoDetalhe } from "@/lib/types";
import {
  HORARIOS_REUNIAO,
  faixaHorario,
  horaCurta,
  rotuloDataLongo,
  somarSemanas,
} from "@/lib/reuniao";
import { bloquearQuarta, desbloquearQuarta } from "@/app/reuniao/actions";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function ReunioesCalendario({
  quarta,
  agendamentos,
  bloqueada,
}: {
  quarta: string;
  agendamentos: ReuniaoAgendamentoDetalhe[];
  bloqueada: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const porHorario = new Map<string, ReuniaoAgendamentoDetalhe>();
  for (const a of agendamentos) porHorario.set(horaCurta(a.horario), a);

  function irPara(iso: string) {
    router.push(`/admin/reunioes?semana=${iso}`);
  }

  function alternarBloqueio() {
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

  return (
    <div className="grid gap-4">
      {/* Navegação */}
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
          <div className="min-w-56 text-center">
            <div className="flex items-center justify-center gap-1.5 font-medium capitalize">
              <CalendarClock className="size-4 text-primary" />
              {rotuloDataLongo(quarta)}
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

        <Button
          variant={bloqueada ? "outline" : "ghost"}
          size="sm"
          onClick={alternarBloqueio}
          disabled={pending}
          className={bloqueada ? "" : "text-muted-foreground hover:text-destructive"}
        >
          {bloqueada ? (
            <>
              <Undo2 className="size-4" /> Liberar esta data
            </>
          ) : (
            <>
              <Ban className="size-4" /> Bloquear esta data
            </>
          )}
        </Button>
      </div>

      {bloqueada ? (
        <div className="rounded-lg border border-dashed bg-muted/40 p-4 text-sm text-muted-foreground">
          Esta quarta está bloqueada — não aparece como disponível para os alunos.
        </div>
      ) : null}

      {/* Grade dos 4 horários */}
      <div className="grid gap-3 sm:grid-cols-2">
        {HORARIOS_REUNIAO.map((h) => {
          const ag = porHorario.get(h);
          return (
            <Card
              key={h}
              className={ag ? "border-primary/40 bg-primary/5" : ""}
            >
              <CardContent className="grid gap-2 pt-5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{faixaHorario(h)}</span>
                  {ag ? (
                    <Badge className="text-[10px]">Reservado</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">
                      Livre
                    </Badge>
                  )}
                </div>

                {ag ? (
                  <div className="grid gap-1.5 text-sm">
                    <div>
                      <span className="text-muted-foreground">Aluno: </span>
                      <span className="font-medium">
                        {ag.aluno_nome ?? ag.aluno_email ?? "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Cliente: </span>
                      <span className="font-medium">
                        {ag.cliente_nome ?? "—"}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <a
                        href={ag.link_live}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonVariants({
                          variant: "outline",
                          size: "sm",
                        })}
                      >
                        <ExternalLink className="size-4" /> Abrir link
                      </a>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard?.writeText(ag.link_live);
                          toast.success("Link copiado.");
                        }}
                      >
                        <Copy className="size-4" /> Copiar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nenhum aluno agendado neste horário.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
