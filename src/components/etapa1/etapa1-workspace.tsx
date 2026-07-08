"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import type { ClienteEtapa1, ProgressoTarefa } from "@/lib/types";
import {
  META_CLIENTES,
  META_REUNIOES,
  TAREFAS_ETAPA1,
  STATUS_CLIENTE,
  calcularMetricasEtapa1,
} from "@/lib/etapa1";
import {
  atualizarCliente,
  criarCliente,
  marcarTarefa,
  removerCliente,
  salvarDataAgendamento,
  type PatchCliente,
} from "@/app/etapa-1/actions";
import { ClienteDialog } from "./cliente-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function statusInfo(id: string) {
  return STATUS_CLIENTE.find((s) => s.id === id) ?? STATUS_CLIENTE[0];
}

export function Etapa1Workspace({
  alunoId,
  clientesIniciais,
  progressoInicial,
  dataAgendamentoInicial,
}: {
  alunoId: string;
  clientesIniciais: ClienteEtapa1[];
  progressoInicial: ProgressoTarefa[];
  dataAgendamentoInicial: string | null;
}) {
  const [clientes, setClientes] = useState<ClienteEtapa1[]>(clientesIniciais);
  const [manual, setManual] = useState<Record<number, boolean>>(() => {
    const m: Record<number, boolean> = {};
    for (const p of progressoInicial) m[p.tarefa] = p.concluida;
    return m;
  });
  const [dataAgendamento, setDataAgendamento] = useState(
    dataAgendamentoInicial ?? "",
  );
  const [editando, setEditando] = useState<ClienteEtapa1 | null>(null);
  const [pending, startTransition] = useTransition();

  // ---- Métricas / tarefas automáticas ----
  const {
    preenchidos,
    agendados,
    perdaTotal,
    totalConcluidas,
    pct: progressoPct,
    tarefaConcluida,
  } = useMemo(
    () => calcularMetricasEtapa1(clientes, manual),
    [clientes, manual],
  );

  // ---- Ações ----
  function addCliente() {
    startTransition(async () => {
      const res = await criarCliente(alunoId);
      if (res.erro) {
        toast.error("Erro ao adicionar cliente.");
        return;
      }
      const novo: ClienteEtapa1 = {
        id: res.id!,
        aluno_id: alunoId,
        nome: "",
        telefone: null,
        nivel_relacionamento: null,
        problemas: [],
        perda_inercia: null,
        registro_contato: null,
        mensagem_padrao_enviada: false,
        estudo_caso_enviado: false,
        ligacao_realizada: false,
        status: "pendente",
        data_reuniao_preliminar: null,
        aderiu_reuniao: false,
        perfil_disc: null,
        ordem: clientes.length + 1,
      };
      setClientes((prev) => [...prev, novo]);
      setEditando(novo);
    });
  }

  function salvarCliente(patch: PatchCliente) {
    if (!editando) return;
    const id = editando.id;
    startTransition(async () => {
      const res = await atualizarCliente(id, alunoId, patch);
      if (res.erro) {
        toast.error("Erro ao salvar cliente.");
        return;
      }
      setClientes((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      );
      setEditando(null);
      toast.success("Cliente salvo.");
    });
  }

  function excluirCliente(id: string) {
    startTransition(async () => {
      const res = await removerCliente(id, alunoId);
      if (res.erro) {
        toast.error("Erro ao remover cliente.");
        return;
      }
      setClientes((prev) => prev.filter((c) => c.id !== id));
      toast.success("Cliente removido.");
    });
  }

  function toggleTarefa(num: number, val: boolean) {
    setManual((prev) => ({ ...prev, [num]: val }));
    startTransition(async () => {
      const res = await marcarTarefa(alunoId, num, val);
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
      {/* Métricas */}
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
          detalhe="soma dos clientes listados"
        />
      </div>

      {/* Checklist */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Checklist da Etapa 01</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1">
          {TAREFAS_ETAPA1.map((t) => {
            const concluida = tarefaConcluida(t.num);
            return (
              <div
                key={t.num}
                className="flex items-start gap-3 rounded-md px-2 py-2.5 hover:bg-muted/50"
              >
                <Checkbox
                  checked={concluida}
                  disabled={t.automatica || pending}
                  onCheckedChange={(v) => toggleTarefa(t.num, Boolean(v))}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        "text-sm font-medium " +
                        (concluida ? "text-muted-foreground line-through" : "")
                      }
                    >
                      {t.num}. {t.titulo}
                    </span>
                    {t.automatica ? (
                      <Badge variant="outline" className="text-[10px]">
                        automática
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">{t.descricao}</p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Data de agendamento do aluno */}
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

      {/* Tabela dos 30 clientes */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base">Clientes potenciais</CardTitle>
            <p className="text-sm text-muted-foreground">
              {preenchidos} de {META_CLIENTES} preenchidos
            </p>
          </div>
          <Button onClick={addCliente} disabled={pending}>
            Adicionar cliente
          </Button>
        </CardHeader>
        <CardContent>
          {clientes.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nenhum cliente ainda. Clique em{" "}
              <span className="font-medium">Adicionar cliente</span> para
              começar sua lista de 30.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Nível</TableHead>
                    <TableHead>Problemas</TableHead>
                    <TableHead className="text-right">Perda inércia</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reunião</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientes.map((c, i) => {
                    const si = statusInfo(c.status);
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="text-muted-foreground">
                          {i + 1}
                        </TableCell>
                        <TableCell className="font-medium">
                          {c.nome || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>{c.telefone ?? "—"}</TableCell>
                        <TableCell className="capitalize">
                          {c.nivel_relacionamento ?? "—"}
                        </TableCell>
                        <TableCell>
                          {c.problemas.length > 0 ? (
                            <Badge variant="secondary">
                              {c.problemas.length}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {c.perda_inercia != null
                            ? brl.format(c.perda_inercia)
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <span
                            className={
                              "inline-flex rounded-full px-2 py-0.5 text-xs font-medium " +
                              si.cor
                            }
                          >
                            {si.rotulo}
                          </span>
                        </TableCell>
                        <TableCell>
                          {c.data_reuniao_preliminar
                            ? new Date(
                                c.data_reuniao_preliminar + "T00:00:00",
                              ).toLocaleDateString("pt-BR")
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditando(c)}
                            >
                              Editar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => excluirCliente(c.id)}
                              disabled={pending}
                            >
                              Excluir
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {editando ? (
        <ClienteDialog
          key={editando.id}
          cliente={editando}
          open={!!editando}
          onOpenChange={(v) => !v && setEditando(null)}
          onSalvar={salvarCliente}
          salvando={pending}
        />
      ) : null}
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
