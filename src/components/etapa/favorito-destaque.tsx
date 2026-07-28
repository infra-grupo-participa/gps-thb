"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Star,
  MessageCircle,
  CalendarClock,
  Check,
  ArrowRight,
  ExternalLink,
  Copy,
  CalendarPlus,
  X,
} from "lucide-react";
import type { ClienteEtapa1, ReuniaoAgendamento } from "@/lib/types";
import type { DiaGrade } from "@/lib/reuniao";
import { faixaHorario, horaCurta, rotuloData } from "@/lib/reuniao";
import { STATUS_CLIENTE } from "@/lib/etapa1";
import { mascaraTelefone } from "@/lib/masks";
import { linkWhatsapp } from "@/lib/whatsapp";
import { cancelarReuniao } from "@/app/reuniao/actions";
import { ReuniaoAgendarModal } from "@/components/etapa/reuniao-agendar-modal";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function FavoritoDestaque({
  alunoId,
  cliente,
  agendamento,
  grade,
  isAdmin,
  basePath,
}: {
  alunoId: string;
  cliente: ClienteEtapa1;
  agendamento: ReuniaoAgendamento | null;
  grade: DiaGrade[];
  isAdmin: boolean;
  basePath: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [modalAberto, setModalAberto] = useState(false);

  const status = STATUS_CLIENTE.find((s) => s.id === cliente.status);
  const wpp = linkWhatsapp(cliente.telefone);

  function cancelar() {
    startTransition(async () => {
      const res = await cancelarReuniao(isAdmin ? alunoId : undefined);
      if (res.erro) {
        toast.error(res.erro);
        return;
      }
      toast.success("Reunião cancelada.");
      router.refresh();
    });
  }

  function copiarLink() {
    if (!agendamento) return;
    navigator.clipboard?.writeText(agendamento.link_live);
    toast.success("Link copiado.");
  }

  return (
    <Card className="border-primary/40 bg-primary/5 shadow-sm">
      <CardContent className="grid gap-5 pt-6">
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Star className="size-5 fill-primary" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-primary">
                Cliente acompanhado pela equipe
              </div>
              <div className="text-lg font-semibold">
                {cliente.nome || "Sem nome"}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {status ? (
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-xs font-medium " + status.cor
                    }
                  >
                    {status.rotulo}
                  </span>
                ) : null}
                {cliente.telefone ? (
                  <span className="inline-flex items-center gap-1">
                    {mascaraTelefone(cliente.telefone)}
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
                {cliente.perda_inercia != null ? (
                  <span className="tabular-nums">
                    Perda: {brl.format(cliente.perda_inercia)}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <Link
            href={`${basePath}/clientes/${cliente.id}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Abrir ficha <ArrowRight className="size-4" />
          </Link>
        </div>

        {/* Reunião com a equipe */}
        <div className="rounded-lg border bg-background p-4">
          <div className="mb-3 flex items-center gap-2">
            <CalendarClock className="size-4 text-primary" />
            <span className="text-sm font-semibold">Reunião com a equipe</span>
          </div>

          {agendamento ? (
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                <Check className="size-4 text-primary" />
                <span className="font-medium capitalize">
                  {rotuloData(agendamento.data)}
                </span>
                <span className="text-muted-foreground">
                  · {faixaHorario(agendamento.horario)}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={agendamento.link_live}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <ExternalLink className="size-4" /> Abrir link da reunião
                </a>
                <Button variant="ghost" size="sm" onClick={copiarLink}>
                  <Copy className="size-4" /> Copiar link
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setModalAberto(true)}
                  disabled={pending}
                >
                  <CalendarClock className="size-4" /> Remarcar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={cancelar}
                  disabled={pending}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="size-4" /> Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-3">
              <p className="text-xs text-muted-foreground">
                {isAdmin
                  ? "O aluno ainda não marcou a reunião. Você pode marcar por ele."
                  : "Escolha um horário na agenda da equipe e informe o link da sua sala de reunião com o cliente."}
              </p>
              <div>
                <Button onClick={() => setModalAberto(true)} disabled={pending}>
                  <CalendarPlus className="size-4" /> Agendar reunião
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>

      <ReuniaoAgendarModal
        open={modalAberto}
        onOpenChange={setModalAberto}
        grade={grade}
        alunoId={isAdmin ? alunoId : undefined}
        linkInicial={agendamento?.link_live ?? ""}
        slotInicial={
          agendamento
            ? { data: agendamento.data, horario: horaCurta(agendamento.horario) }
            : null
        }
      />
    </Card>
  );
}
