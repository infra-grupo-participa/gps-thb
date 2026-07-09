"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Star,
  MessageCircle,
  CalendarClock,
  Trash2,
  Check,
  ArrowRight,
} from "lucide-react";
import type { ClienteEtapa1, ReuniaoJanela } from "@/lib/types";
import { STATUS_CLIENTE } from "@/lib/etapa1";
import { mascaraTelefone } from "@/lib/masks";
import { linkWhatsapp } from "@/lib/whatsapp";
import {
  adicionarJanela,
  escolherJanela,
  removerJanela,
} from "@/app/reuniao/actions";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function fmtData(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function FavoritoDestaque({
  alunoId,
  cliente,
  janelas,
  isAdmin,
  basePath,
}: {
  alunoId: string;
  cliente: ClienteEtapa1;
  janelas: ReuniaoJanela[];
  isAdmin: boolean;
  basePath: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [novaData, setNovaData] = useState("");
  const [novoHorario, setNovoHorario] = useState("");

  const status = STATUS_CLIENTE.find((s) => s.id === cliente.status);
  const wpp = linkWhatsapp(cliente.telefone);
  const escolhida = janelas.find((j) => j.escolhida) ?? null;

  function addJanela() {
    if (!novaData) return;
    startTransition(async () => {
      const res = await adicionarJanela(alunoId, novaData, novoHorario);
      if (res.erro) {
        toast.error("Erro ao adicionar a data.");
        return;
      }
      setNovaData("");
      setNovoHorario("");
      router.refresh();
    });
  }

  function removJanela(id: string) {
    startTransition(async () => {
      const res = await removerJanela(id, alunoId);
      if (res.erro) {
        toast.error("Erro ao remover a data.");
        return;
      }
      router.refresh();
    });
  }

  function escolher(id: string) {
    startTransition(async () => {
      const res = await escolherJanela(id, alunoId);
      if (res.erro) {
        toast.error("Erro ao escolher a data.");
        return;
      }
      router.refresh();
    });
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

        {/* Agendamento com a equipe */}
        <div className="rounded-lg border bg-background p-4">
          <div className="mb-3 flex items-center gap-2">
            <CalendarClock className="size-4 text-primary" />
            <span className="text-sm font-semibold">Reunião com a equipe</span>
          </div>

          {escolhida ? (
            <div className="mb-3 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
              <Check className="size-4 text-primary" />
              <span className="font-medium">Data definida:</span>
              <span>
                {fmtData(escolhida.data)}
                {escolhida.horario ? ` · ${escolhida.horario}` : ""}
              </span>
            </div>
          ) : null}

          {isAdmin ? (
            <div className="grid gap-3">
              <p className="text-xs text-muted-foreground">
                Disponibilize os dias em que a equipe pode participar. O aluno
                escolhe um deles para oferecer ao cliente.
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <Input
                  type="date"
                  value={novaData}
                  onChange={(e) => setNovaData(e.target.value)}
                  className="w-44"
                />
                <Input
                  type="text"
                  value={novoHorario}
                  onChange={(e) => setNovoHorario(e.target.value)}
                  placeholder="Horário (opcional)"
                  className="w-40"
                />
                <Button onClick={addJanela} disabled={pending || !novaData}>
                  Adicionar data
                </Button>
              </div>
              {janelas.length ? (
                <ul className="grid gap-1.5">
                  {janelas.map((j) => (
                    <li
                      key={j.id}
                      className={
                        "flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm " +
                        (j.escolhida ? "border-primary bg-primary/5" : "")
                      }
                    >
                      <span className="flex items-center gap-2">
                        {fmtData(j.data)}
                        {j.horario ? (
                          <span className="text-muted-foreground">
                            · {j.horario}
                          </span>
                        ) : null}
                        {j.escolhida ? (
                          <Badge className="text-[10px]">
                            Escolhida pelo aluno
                          </Badge>
                        ) : null}
                      </span>
                      <button
                        type="button"
                        onClick={() => removJanela(j.id)}
                        disabled={pending}
                        title="Remover"
                        className="text-muted-foreground transition hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhuma data disponibilizada ainda.
                </p>
              )}
            </div>
          ) : janelas.length ? (
            <div className="grid gap-2">
              <p className="text-xs text-muted-foreground">
                A equipe disponibilizou estes horários. Escolha um para oferecer
                ao cliente:
              </p>
              <div className="flex flex-wrap gap-2">
                {janelas.map((j) => (
                  <button
                    key={j.id}
                    type="button"
                    onClick={() => escolher(j.id)}
                    disabled={pending}
                    className={
                      "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition " +
                      (j.escolhida
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:border-primary/50 hover:bg-muted")
                    }
                  >
                    {j.escolhida ? <Check className="size-4" /> : null}
                    {fmtData(j.data)}
                    {j.horario ? (
                      <span className="opacity-80">· {j.horario}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              A equipe ainda não disponibilizou datas para esta reunião. Assim
              que houver, você poderá escolher aqui.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
