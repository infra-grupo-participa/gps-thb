"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ClienteEtapa1, StatusCliente } from "@/lib/types";
import { STATUS_CLIENTE, META_CLIENTES } from "@/lib/etapa1";
import { mascaraTelefone } from "@/lib/masks";
import {
  criarCliente,
  mudarStatusCliente,
  removerCliente,
} from "@/app/etapa-1/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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

export function ClientesManager({
  alunoId,
  clientesIniciais,
  basePath,
}: {
  alunoId: string;
  clientesIniciais: ClienteEtapa1[];
  /** "" para aluno; "/admin/aluno/<id>" para admin. */
  basePath: string;
}) {
  const router = useRouter();
  const [clientes, setClientes] = useState<ClienteEtapa1[]>(clientesIniciais);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | StatusCliente>("todos");
  const [pending, startTransition] = useTransition();

  const fichaHref = (id: string) => `${basePath}/clientes/${id}`;

  const contagemStatus = useMemo(
    () =>
      STATUS_CLIENTE.map((s) => ({
        ...s,
        qtd: clientes.filter((c) => c.status === s.id).length,
      })),
    [clientes],
  );

  const preenchidos = clientes.filter((c) => c.nome.trim() !== "").length;

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

  function addCliente() {
    startTransition(async () => {
      const res = await criarCliente(alunoId);
      if (res.erro || !res.id) {
        toast.error("Erro ao adicionar cliente.");
        return;
      }
      router.push(fichaHref(res.id));
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

  function excluir(id: string) {
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

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base">Meus clientes</CardTitle>
            <p className="text-sm text-muted-foreground">
              {preenchidos} de {META_CLIENTES} preenchidos · gerencie o contato e
              os documentos de cada cliente.
            </p>
          </div>
          <Button onClick={addCliente} disabled={pending}>
            Adicionar cliente
          </Button>
        </div>

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
            <span className="font-medium">Adicionar cliente</span> para começar.
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
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Nível</TableHead>
                  <TableHead className="text-right">Perda inércia</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reunião</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={fichaHref(c.id)}
                        className="hover:text-primary hover:underline"
                      >
                        {c.nome || "Sem nome"}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {c.telefone ? mascaraTelefone(c.telefone) : "—"}
                    </TableCell>
                    <TableCell className="capitalize">
                      {c.nivel_relacionamento ?? "—"}
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
                        <SelectTrigger size="sm" className="h-7 w-[130px] text-xs">
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
                        <Link
                          href={fichaHref(c.id)}
                          className={buttonVariants({
                            variant: "ghost",
                            size: "sm",
                          })}
                        >
                          Abrir ficha
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => excluir(c.id)}
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
