"use client";

import Link from "next/link";
import {
  Hourglass,
  ClipboardList,
  User,
  Star,
  Phone,
  Mail,
  MessageCircle,
  ExternalLink,
  CalendarClock,
  Link2Off,
} from "lucide-react";
import type { ReuniaoAgendamentoDetalhe } from "@/lib/types";
import { faixaHorario, rotuloDataLongo } from "@/lib/reuniao";
import { mascaraTelefone } from "@/lib/masks";
import { linkWhatsapp } from "@/lib/whatsapp";
import { buttonVariants } from "@/components/ui/button";
import { ReuniaoResponder } from "@/components/admin/reuniao-responder";

/**
 * Fila de solicitações aguardando resposta da equipe — de hoje em diante,
 * inclusive de semanas que não estão abertas no calendário. Traz tudo que a
 * equipe precisa para decidir sem abrir outra tela: aluno, contato, cliente,
 * pauta e link da sala.
 */
export function SolicitacoesReuniao({
  pendentes,
  hojeIso,
}: {
  pendentes: ReuniaoAgendamentoDetalhe[];
  /** "hoje" em São Paulo, para marcar as solicitações que venceram sem resposta. */
  hojeIso: string;
}) {
  if (!pendentes.length) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
        Nenhuma solicitação aguardando resposta. Quando um aluno pedir uma
        reunião, ela aparece aqui até você confirmar ou recusar.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-amber-300 bg-amber-50/40 shadow-sm">
      <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-100/60 px-4 py-3">
        <Hourglass className="size-4 text-amber-700" />
        <span className="font-semibold text-amber-900">
          {pendentes.length}{" "}
          {pendentes.length === 1
            ? "solicitação aguardando sua resposta"
            : "solicitações aguardando sua resposta"}
        </span>
      </div>

      <ul className="divide-y divide-amber-200">
        {pendentes.map((s) => {
          const nome = s.aluno_nome ?? s.aluno_email ?? "Aluno";
          const wpp = linkWhatsapp(s.aluno_telefone);
          const venceu = s.data < hojeIso;
          return (
            <li key={s.id} className="grid gap-3 bg-background/60 p-4">
              {/* Quando + aluno */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold capitalize">
                    <CalendarClock className="size-4 text-primary" />
                    {rotuloDataLongo(s.data)} · {faixaHorario(s.horario)}
                    {venceu ? (
                      <span className="rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-xs font-semibold normal-case text-red-800">
                        Data já passou sem resposta
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-sm">
                    <User className="size-3.5 text-muted-foreground" />
                    <Link
                      href={`/admin/aluno/${s.aluno_id}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {nome}
                    </Link>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    {s.aluno_telefone ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Phone className="size-3.5" />
                        {mascaraTelefone(s.aluno_telefone)}
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
                    {s.aluno_email ? (
                      <a
                        href={`mailto:${s.aluno_email}`}
                        className="inline-flex items-center gap-1.5 hover:text-foreground"
                      >
                        <Mail className="size-3.5" />
                        {s.aluno_email}
                      </a>
                    ) : null}
                  </div>
                </div>

                <div className="min-w-0 text-sm">
                  <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Star className="size-3.5" /> Cliente
                  </div>
                  <div className="mt-0.5 font-medium">
                    {s.cliente_nome ?? (
                      <span className="font-normal text-muted-foreground">
                        Sem favorito
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Pauta: é o que a equipe lê para decidir e se preparar. */}
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <ClipboardList className="size-3.5" /> O que o aluno precisa resolver
                </div>
                <p className="mt-1 whitespace-pre-line">
                  {s.pauta ?? (
                    <span className="text-muted-foreground">
                      O aluno não descreveu a pauta (solicitação antiga).
                    </span>
                  )}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {s.link_live ? (
                  <a
                    href={s.link_live}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    <ExternalLink className="size-4" /> Sala do aluno
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Link2Off className="size-4" /> Sem link da sala ainda
                  </span>
                )}
                <ReuniaoResponder
                  alunoId={s.aluno_id}
                  alunoNome={nome}
                  data={s.data}
                  horario={s.horario}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
