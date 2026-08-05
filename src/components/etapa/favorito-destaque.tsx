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
  Hourglass,
  CalendarX2,
  ClipboardList,
} from "lucide-react";
import type { ClienteEtapa1, ReuniaoAgendamento } from "@/lib/types";
import type { DiaGrade } from "@/lib/reuniao";
import { faixaHorario, horaCurta, rotuloData, ROTULO_STATUS } from "@/lib/reuniao";
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
  hojeIso,
}: {
  alunoId: string;
  cliente: ClienteEtapa1;
  agendamento: ReuniaoAgendamento | null;
  grade: DiaGrade[];
  isAdmin: boolean;
  basePath: string;
  /** "hoje" em São Paulo — para não deixar reunião vencida parecendo ativa. */
  hojeIso: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [modalAberto, setModalAberto] = useState(false);

  const status = STATUS_CLIENTE.find((s) => s.id === cliente.status);
  const wpp = linkWhatsapp(cliente.telefone);

  const statusReuniao = agendamento?.status ?? null;
  const infoStatus = statusReuniao ? ROTULO_STATUS[statusReuniao] : null;
  // Data vencida: a reunião não vale mais, independentemente do status.
  const venceu = !!agendamento && agendamento.data < hojeIso;

  function cancelar() {
    const pergunta =
      statusReuniao === "pendente"
        ? "Cancelar sua solicitação de reunião?"
        : "Cancelar a reunião com a equipe?";
    if (!window.confirm(pergunta)) return;
    startTransition(async () => {
      const res = await cancelarReuniao(isAdmin ? alunoId : undefined);
      if (res.erro) {
        toast.error(res.erro);
        return;
      }
      toast.success(
        statusReuniao === "pendente"
          ? "Solicitação cancelada."
          : "Reunião cancelada.",
      );
      router.refresh();
    });
  }

  function copiarLink() {
    if (!agendamento?.link_live) return;
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

          {agendamento && infoStatus ? (
            <div className="grid gap-3">
              {/* Status é a primeira coisa: solicitado ≠ marcado. */}
              <div className={"rounded-md border px-3 py-2 " + infoStatus.cor}>
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  {statusReuniao === "confirmada" ? (
                    <Check className="size-4" />
                  ) : statusReuniao === "pendente" ? (
                    <Hourglass className="size-4" />
                  ) : (
                    <CalendarX2 className="size-4" />
                  )}
                  {infoStatus.rotulo}
                </div>
                <div className="mt-1 text-sm capitalize">
                  {rotuloData(agendamento.data)} · {faixaHorario(agendamento.horario)}
                </div>
                <p className="mt-1 text-xs opacity-90">
                  {venceu
                    ? statusReuniao === "pendente"
                      ? "Esta data já passou e a equipe não respondeu a tempo. Solicite um novo horário."
                      : "Esta data já passou. Se precisar de outra reunião, solicite um novo horário."
                    : isAdmin
                      ? infoStatus.equipe
                      : infoStatus.aluno}
                </p>
                {statusReuniao === "recusada" && agendamento.motivo_recusa ? (
                  <p className="mt-1.5 border-t border-black/10 pt-1.5 text-xs">
                    <strong>Motivo:</strong> {agendamento.motivo_recusa}
                  </p>
                ) : null}
              </div>

              {agendamento.pauta ? (
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <ClipboardList className="size-3.5" /> O que será tratado
                  </div>
                  <p className="mt-1 whitespace-pre-line">{agendamento.pauta}</p>
                </div>
              ) : null}

              {statusReuniao === "recusada" || venceu ? (
                <div>
                  <Button onClick={() => setModalAberto(true)} disabled={pending}>
                    <CalendarPlus className="size-4" />
                    {venceu ? "Solicitar novo horário" : "Escolher outro horário"}
                  </Button>
                </div>
              ) : null}

              {statusReuniao !== "recusada" && !venceu ? (
                agendamento.link_live ? (
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
                ) : (
                  <div className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                    {isAdmin
                      ? "Sem link ainda — o aluno cola o link da sala pelo botão Remarcar."
                      : "Falta o link da sua sala. Toque em Remarcar para informá-lo."}
                  </div>
                )
              ) : null}

              <div className="flex flex-wrap gap-2">
                {statusReuniao !== "recusada" && !venceu ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setModalAberto(true)}
                    disabled={pending}
                    title={
                      !isAdmin && statusReuniao === "confirmada"
                        ? "Trocar de horário faz a reunião voltar para análise da equipe."
                        : undefined
                    }
                  >
                    <CalendarClock className="size-4" />
                    {isAdmin ? "Remarcar" : "Trocar horário"}
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={cancelar}
                  disabled={pending}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="size-4" />
                  {statusReuniao === "pendente"
                    ? "Cancelar solicitação"
                    : "Cancelar"}
                </Button>
              </div>

              {/* Remarcar uma reunião confirmada volta para a fila da equipe. */}
              {!isAdmin && statusReuniao === "confirmada" ? (
                <p className="text-xs text-muted-foreground">
                  Se trocar de horário, a reunião volta a ser uma solicitação e
                  precisa de nova confirmação da equipe.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-3">
              <p className="text-xs text-muted-foreground">
                {isAdmin
                  ? "O aluno ainda não pediu a reunião. Você pode marcar por ele — agendado pela equipe já fica confirmado."
                  : "Escolha um horário na agenda da equipe, conte o que precisa resolver e informe o link da sua sala. A equipe confirma se consegue participar."}
              </p>
              <div>
                <Button onClick={() => setModalAberto(true)} disabled={pending}>
                  <CalendarPlus className="size-4" />
                  {isAdmin ? "Agendar reunião" : "Solicitar reunião"}
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
        isAdmin={isAdmin}
        linkInicial={agendamento?.link_live ?? ""}
        pautaInicial={agendamento?.pauta ?? ""}
        slotInicial={
          // Depois de uma recusa, não pré-seleciona o horário recusado: a equipe
          // já disse que não consegue naquele horário.
          agendamento && agendamento.status !== "recusada"
            ? { data: agendamento.data, horario: horaCurta(agendamento.horario) }
            : null
        }
      />
    </Card>
  );
}
