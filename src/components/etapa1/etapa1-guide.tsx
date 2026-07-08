"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { ClienteEtapa1, ProgressoTarefa } from "@/lib/types";
import {
  META_CLIENTES,
  META_REUNIOES,
  TAREFAS_ETAPA1,
  calcularMetricasEtapa1,
} from "@/lib/etapa1";
import { marcarTarefa, salvarDataAgendamento } from "@/app/etapa-1/actions";
import { TarefaItem } from "@/components/etapa/tarefa-item";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function Etapa1Guide({
  alunoId,
  clientesIniciais,
  progressoInicial,
  dataAgendamentoInicial,
  clientesHref,
}: {
  alunoId: string;
  clientesIniciais: ClienteEtapa1[];
  progressoInicial: ProgressoTarefa[];
  dataAgendamentoInicial: string | null;
  clientesHref: string;
}) {
  const [manual, setManual] = useState<Record<number, boolean>>(() => {
    const m: Record<number, boolean> = {};
    for (const p of progressoInicial) m[p.tarefa] = p.concluida;
    return m;
  });
  const [dataAgendamento, setDataAgendamento] = useState(
    dataAgendamentoInicial ?? "",
  );
  const [pending, startTransition] = useTransition();

  const {
    preenchidos,
    agendados,
    perdaTotal,
    totalConcluidas,
    pct: progressoPct,
    tarefaConcluida,
  } = useMemo(
    () => calcularMetricasEtapa1(clientesIniciais, manual),
    [clientesIniciais, manual],
  );

  function toggleTarefa(num: number, val: boolean) {
    setManual((prev) => ({ ...prev, [num]: val }));
    startTransition(async () => {
      const res = await marcarTarefa(alunoId, 1, num, val);
      if (res.erro) {
        setManual((prev) => ({ ...prev, [num]: !val }));
        toast.error("Erro ao atualizar tarefa.");
      }
    });
  }

  function salvarData(valor: string) {
    setDataAgendamento(valor);
    startTransition(async () => {
      const res = await salvarDataAgendamento(alunoId, valor || null);
      if (res.erro) toast.error("Erro ao salvar a data.");
      else toast.success("Data de agendamento salva.");
    });
  }

  return (
    <div className="grid gap-6">
      {/* Progresso */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          titulo="Progresso da etapa"
          valor={`${progressoPct}%`}
          detalhe={`${totalConcluidas} de ${TAREFAS_ETAPA1.length} tarefas`}
        >
          <Progress value={progressoPct} className="mt-2" />
        </MetricCard>
        <MetricCard
          titulo="Clientes listados"
          valor={`${preenchidos}/${META_CLIENTES}`}
          detalhe="meta de 30 clientes"
        />
        <MetricCard
          titulo="Reuniões agendadas"
          valor={`${agendados}/${META_REUNIOES}`}
          detalhe="meta de 15 reuniões"
          destaque={agendados >= META_REUNIOES}
        />
        <MetricCard
          titulo="Perda pela inércia (total)"
          valor={brl.format(perdaTotal)}
          detalhe="soma dos seus clientes"
        />
      </div>

      {/* CTA: gestão fica na aba Clientes */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div>
            <div className="font-medium">
              A lista e a gestão dos clientes ficam na aba{" "}
              <span className="text-primary">Clientes</span>.
            </div>
            <p className="text-sm text-muted-foreground">
              Aqui você acompanha o passo a passo; lá você cadastra, controla o
              contato e guarda os documentos de cada cliente.
            </p>
          </div>
          <Link href={clientesHref} className={buttonVariants()}>
            Ir para Clientes
          </Link>
        </CardContent>
      </Card>

      {/* Passo a passo (guia) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Passo a passo da Etapa 01
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Siga o roteiro. As tarefas marcadas como{" "}
            <span className="font-medium">automáticas</span> se completam conforme
            você preenche os clientes.
          </p>
        </CardHeader>
        <CardContent className="grid gap-1">
          {TAREFAS_ETAPA1.map((t) => (
            <TarefaItem
              key={t.num}
              tarefa={t}
              concluida={tarefaConcluida(t.num)}
              pending={pending}
              onToggle={(v) => toggleTarefa(t.num, v)}
            />
          ))}
        </CardContent>
      </Card>

      {/* Data de agendamento */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Data disponível para agendamento
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-2">
              <Label htmlFor="data-agendamento">Sua data</Label>
              <Input
                id="data-agendamento"
                type="date"
                value={dataAgendamento}
                onChange={(e) => salvarData(e.target.value)}
                className="w-48"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Data que você disponibiliza para os clientes agendarem a reunião
              preliminar.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  titulo,
  valor,
  detalhe,
  destaque,
  children,
}: {
  titulo: string;
  valor: string;
  detalhe: string;
  destaque?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {titulo}
        </div>
        <div
          className={
            "mt-1 text-2xl font-semibold " + (destaque ? "text-primary" : "")
          }
        >
          {valor}
        </div>
        <div className="text-xs text-muted-foreground">{detalhe}</div>
        {children}
      </CardContent>
    </Card>
  );
}
