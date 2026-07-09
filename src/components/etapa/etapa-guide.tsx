"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import type { ModoEnfase, ProgressoTarefa } from "@/lib/types";
import type { TarefaDef } from "@/lib/etapa1";
import { calcularEnfases } from "@/lib/enfase";
import { definirEnfaseTarefa, marcarTarefa } from "@/app/etapa-1/actions";
import { TarefaItem } from "@/components/etapa/tarefa-item";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export function EtapaGuide({
  alunoId,
  etapa,
  tarefas,
  meta,
  progressoInicial,
  enfasesIniciais = {},
  isAdmin = false,
}: {
  alunoId: string;
  etapa: number;
  tarefas: TarefaDef[];
  meta?: string;
  progressoInicial: ProgressoTarefa[];
  enfasesIniciais?: Record<number, ModoEnfase>;
  isAdmin?: boolean;
}) {
  const [feitas, setFeitas] = useState<Record<number, boolean>>(() => {
    const m: Record<number, boolean> = {};
    for (const p of progressoInicial) m[p.tarefa] = p.concluida;
    return m;
  });
  const [overrides, setOverrides] =
    useState<Record<number, ModoEnfase>>(enfasesIniciais);
  const [pending, startTransition] = useTransition();

  const { concluidas, pct } = useMemo(() => {
    const c = tarefas.filter((t) => feitas[t.num]).length;
    return {
      concluidas: c,
      pct: tarefas.length ? Math.round((c / tarefas.length) * 100) : 0,
    };
  }, [tarefas, feitas]);

  const enfases = useMemo(
    () => calcularEnfases(tarefas, (num) => Boolean(feitas[num]), overrides),
    [tarefas, feitas, overrides],
  );

  function toggle(num: number, val: boolean) {
    setFeitas((prev) => ({ ...prev, [num]: val }));
    startTransition(async () => {
      const res = await marcarTarefa(alunoId, etapa, num, val);
      if (res.erro) {
        setFeitas((prev) => ({ ...prev, [num]: !val }));
        toast.error("Erro ao atualizar tarefa.");
      }
    });
  }

  function setEnfase(num: number, modo: ModoEnfase | null) {
    setOverrides((prev) => {
      const next = { ...prev };
      if (modo === null) delete next[num];
      else next[num] = modo;
      return next;
    });
    startTransition(async () => {
      const res = await definirEnfaseTarefa(alunoId, etapa, num, modo);
      if (res.erro) toast.error("Erro ao atualizar o destaque.");
    });
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardContent className="pt-6">
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium">Progresso da etapa</span>
            <span className="text-muted-foreground">
              {concluidas} de {tarefas.length} tarefas · {pct}%
            </span>
          </div>
          <Progress value={pct} />
          {meta ? (
            <p className="mt-3 text-sm font-medium text-primary">{meta}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Passo a passo</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1">
          {tarefas.map((t) => (
            <TarefaItem
              key={t.num}
              tarefa={t}
              concluida={Boolean(feitas[t.num])}
              pending={pending}
              onToggle={(v) => toggle(t.num, v)}
              enfase={enfases[t.num]}
              isAdmin={isAdmin}
              overrideAtual={overrides[t.num] ?? null}
              onEnfase={(modo) => setEnfase(t.num, modo)}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
