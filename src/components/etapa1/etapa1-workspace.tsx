"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import type {
  ClienteEtapa1,
  ProgressoTarefa,
  StatusCliente,
} from "@/lib/types";
import {
  META_CLIENTES,
  META_REUNIOES,
  TAREFAS_ETAPA1,
  STATUS_CLIENTE,
  calcularMetricasEtapa1,
  type TarefaDef,
} from "@/lib/etapa1";
import { mascaraTelefone } from "@/lib/masks";
import {
  atualizarCliente,
  criarCliente,
  marcarTarefa,
  mudarStatusCliente,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | StatusCliente>("todos");
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

  const contagemStatus = useMemo(
    () =>
      STATUS_CLIENTE.map((s) => ({
        ...s,
        qtd: clientes.filter((c) => c.status === s.id).length,
      })),
    [clientes],
  );

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return clientes.filter((c) => {
      if (filtro !== "todos" && c.status !== filtro) return false;
      if (!q) return true;
      return (
        (c.nome ?? "").toLowerCase().includes(q) ||
        (c.telefone ?? "").toLowerCase().includes(q)
      );
    });
  }, [clientes, busca, filtro]);

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

  function mudarStatus(cliente: ClienteEtapa1, novo: StatusCliente) {
    const anterior = cliente.status;
    setClientes((prev) =>
      prev.map((c) => (c.id === cliente.id ? { ...c, status: novo } : c)),
    );
    startTransition(async () => {
      const res = await mudarStatusCliente(cliente.id, alunoId, novo);
      if (res.erro) {
        setClientes((prev) =>
          prev.map((c) =>
            c.id === cliente.id ? { ...c, status: anterior } : c,
          ),
        );
        toast.error("Erro ao mudar o status.");
      }
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

      {/* Checklist com tutoriais */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Checklist da Etapa 01</CardTitle>
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

      {/* Central de clientes */}
      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base">
                Central de clientes
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Controle o contato com cada cliente ao longo do processo.
              </p>
            </div>
            <Button onClick={addCliente} disabled={pending}>
              Adicionar cliente
            </Button>
          </div>

          {/* Funil / filtro por status */}
          <div className="flex flex-wrap gap-2">
            <FiltroChip
              ativo={filtro === "todos"}
              onClick={() => setFiltro("todos")}
              rotulo="Todos"
              qtd={clientes.length}
            />
            {contagemStatus.map((s) => (
              <FiltroChip
                key={s.id}
                ativo={filtro === s.id}
                onClick={() => setFiltro(s.id)}
                rotulo={s.rotulo}
                qtd={s.qtd}
              />
            ))}
          </div>

          {clientes.length > 0 ? (
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome ou telefone..."
              className="max-w-xs"
            />
          ) : null}
        </CardHeader>

        <CardContent>
          {clientes.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nenhum cliente ainda. Clique em{" "}
              <span className="font-medium">Adicionar cliente</span> para
              começar sua lista de 30.
            </div>
          ) : filtrados.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nenhum cliente encontrado com esse filtro/busca.
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
                  {filtrados.map((c, i) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-muted-foreground">
                        {i + 1}
                      </TableCell>
                      <TableCell className="font-medium">
                        {c.nome || (
                          <span className="text-muted-foreground">
                            Sem nome
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {c.telefone ? mascaraTelefone(c.telefone) : "—"}
                      </TableCell>
                      <TableCell className="capitalize">
                        {c.nivel_relacionamento ?? "—"}
                      </TableCell>
                      <TableCell>
                        {c.problemas.length > 0 ? (
                          <Badge variant="secondary">{c.problemas.length}</Badge>
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
                        <Select
                          value={c.status}
                          onValueChange={(v) =>
                            v && mudarStatus(c, v as StatusCliente)
                          }
                        >
                          <SelectTrigger
                            size="sm"
                            className="h-7 w-[130px] text-xs"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_CLIENTE.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.rotulo}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
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
                  ))}
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

function TarefaItem({
  tarefa: t,
  concluida,
  pending,
  onToggle,
}: {
  tarefa: TarefaDef;
  concluida: boolean;
  pending: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md px-2 py-2.5 hover:bg-muted/50">
      <Checkbox
        checked={concluida}
        disabled={t.automatica || pending}
        onCheckedChange={(v) => onToggle(Boolean(v))}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
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

        {t.tutorialUrl || t.modelo ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            {t.tutorialUrl ? (
              <a
                href={t.tutorialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                ▶ Ver tutorial
              </a>
            ) : null}
            {t.modelo ? (
              t.modelo.url ? (
                <a
                  href={t.modelo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  ⬇ Modelo: {t.modelo.nome}
                </a>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Modelo: {t.modelo.nome}
                </span>
              )
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FiltroChip({
  ativo,
  onClick,
  rotulo,
  qtd,
}: {
  ativo: boolean;
  onClick: () => void;
  rotulo: string;
  qtd: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition " +
        (ativo
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:bg-muted")
      }
    >
      {rotulo}
      <span
        className={
          "rounded-full px-1.5 text-[10px] " +
          (ativo ? "bg-primary-foreground/20" : "bg-muted")
        }
      >
        {qtd}
      </span>
    </button>
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
