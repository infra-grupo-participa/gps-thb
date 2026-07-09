"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  MessageCircle,
  Star,
  LayoutGrid,
  List as ListIcon,
} from "lucide-react";
import type { ClienteEtapa1, StatusCliente } from "@/lib/types";
import { STATUS_CLIENTE, META_CLIENTES } from "@/lib/etapa1";
import { mascaraTelefone } from "@/lib/masks";
import { linkWhatsapp } from "@/lib/whatsapp";
import {
  criarCliente,
  definirClienteEquipe,
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

type Ordenacao = "recentes" | "nome" | "perda" | "reuniao";

export function ClientesManager({
  alunoId,
  clientesIniciais,
  basePath,
}: {
  alunoId: string;
  clientesIniciais: ClienteEtapa1[];
  basePath: string;
}) {
  const router = useRouter();
  const [clientes, setClientes] = useState<ClienteEtapa1[]>(clientesIniciais);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | StatusCliente>("todos");
  const [view, setView] = useState<"lista" | "quadro">("lista");
  const [ordenacao, setOrdenacao] = useState<Ordenacao>("recentes");
  const [pending, startTransition] = useTransition();

  const fichaHref = (id: string) => `${basePath}/clientes/${id}`;
  const preenchidos = clientes.filter((c) => c.nome.trim() !== "").length;

  const contagemStatus = useMemo(
    () =>
      STATUS_CLIENTE.map((s) => ({
        ...s,
        qtd: clientes.filter((c) => c.status === s.id).length,
      })),
    [clientes],
  );

  const buscaFiltrada = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter(
      (c) =>
        (c.nome ?? "").toLowerCase().includes(q) ||
        (c.telefone ?? "").toLowerCase().includes(q),
    );
  }, [clientes, busca]);

  const listaOrdenada = useMemo(() => {
    const arr = buscaFiltrada.filter(
      (c) => filtro === "todos" || c.status === filtro,
    );
    const copia = [...arr];
    switch (ordenacao) {
      case "nome":
        copia.sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
        break;
      case "perda":
        copia.sort((a, b) => (b.perda_inercia ?? 0) - (a.perda_inercia ?? 0));
        break;
      case "reuniao":
        copia.sort((a, b) =>
          (a.data_reuniao_preliminar ?? "9999").localeCompare(
            b.data_reuniao_preliminar ?? "9999",
          ),
        );
        break;
    }
    return copia;
  }, [buscaFiltrada, filtro, ordenacao]);

  // ---- Ações ----
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
    if (cliente.status === novo) return;
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

  function toggleEquipe(cliente: ClienteEtapa1) {
    const ativar = !cliente.acompanhado_equipe;
    setClientes((prev) =>
      prev.map((c) => ({
        ...c,
        acompanhado_equipe: c.id === cliente.id ? ativar : false,
      })),
    );
    startTransition(async () => {
      const res = await definirClienteEquipe(cliente.id, alunoId, ativar);
      if (res.erro) toast.error("Erro ao marcar o cliente da equipe.");
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
              os documentos.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border p-0.5">
              <ViewButton
                ativo={view === "lista"}
                onClick={() => setView("lista")}
              >
                <ListIcon className="size-4" /> Lista
              </ViewButton>
              <ViewButton
                ativo={view === "quadro"}
                onClick={() => setView("quadro")}
              >
                <LayoutGrid className="size-4" /> Quadro
              </ViewButton>
            </div>
            <Button onClick={addCliente} disabled={pending}>
              Adicionar
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou telefone..."
            className="max-w-xs"
          />
          {view === "lista" ? (
            <Select
              value={ordenacao}
              onValueChange={(v) => v && setOrdenacao(v as Ordenacao)}
            >
              <SelectTrigger size="sm" className="w-[190px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recentes">Ordenar: mais recentes</SelectItem>
                <SelectItem value="nome">Ordenar: nome</SelectItem>
                <SelectItem value="perda">Ordenar: maior perda</SelectItem>
                <SelectItem value="reuniao">Ordenar: data da reunião</SelectItem>
              </SelectContent>
            </Select>
          ) : null}
        </div>

        {view === "lista" ? (
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
        ) : null}
      </CardHeader>

      <CardContent>
        {clientes.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nenhum cliente ainda. Clique em{" "}
            <span className="font-medium">Adicionar</span> para começar.
          </div>
        ) : view === "quadro" ? (
          <Kanban
            clientes={buscaFiltrada}
            fichaHref={fichaHref}
            onMover={mudarStatus}
            onToggleEquipe={toggleEquipe}
          />
        ) : listaOrdenada.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nenhum cliente encontrado com esse filtro/busca.
          </div>
        ) : (
          <>
            {/* Mobile: cards */}
            <div className="grid gap-2 sm:hidden">
              {listaOrdenada.map((c) => (
                <ClienteCardLista
                  key={c.id}
                  cliente={c}
                  fichaHref={fichaHref}
                  onStatus={mudarStatus}
                  onEquipe={toggleEquipe}
                  onExcluir={excluir}
                  pending={pending}
                />
              ))}
            </div>
            {/* Desktop: tabela */}
            <div className="hidden overflow-x-auto sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead className="text-right">Perda inércia</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reunião</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listaOrdenada.map((c) => {
                  const wpp = linkWhatsapp(c.telefone);
                  return (
                    <TableRow
                      key={c.id}
                      className={c.acompanhado_equipe ? "bg-primary/5" : ""}
                    >
                      <TableCell>
                        <StarButton
                          ativo={c.acompanhado_equipe}
                          onClick={() => toggleEquipe(c)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <Link
                          href={fichaHref(c.id)}
                          className="hover:text-primary hover:underline"
                        >
                          {c.nome || "Sem nome"}
                        </Link>
                        {c.acompanhado_equipe ? (
                          <Badge className="ml-2 text-[10px]">Equipe</Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {c.telefone ? mascaraTelefone(c.telefone) : "—"}
                          {wpp ? <WhatsappLink href={wpp} /> : null}
                        </div>
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
                  );
                })}
              </TableBody>
            </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Kanban ----------

function Kanban({
  clientes,
  fichaHref,
  onMover,
  onToggleEquipe,
}: {
  clientes: ClienteEtapa1[];
  fichaHref: (id: string) => string;
  onMover: (c: ClienteEtapa1, s: StatusCliente) => void;
  onToggleEquipe: (c: ClienteEtapa1) => void;
}) {
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<StatusCliente | null>(null);

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max gap-3">
        {STATUS_CLIENTE.map((coluna) => {
          const itens = clientes.filter((c) => c.status === coluna.id);
          const destaque = sobre === coluna.id;
          return (
            <div
              key={coluna.id}
              onDragOver={(e) => {
                e.preventDefault();
                setSobre(coluna.id);
              }}
              onDragLeave={() => setSobre((s) => (s === coluna.id ? null : s))}
              onDrop={() => {
                const c = clientes.find((x) => x.id === arrastando);
                if (c) onMover(c, coluna.id);
                setArrastando(null);
                setSobre(null);
              }}
              className={
                "flex w-64 shrink-0 flex-col rounded-lg border bg-muted/30 p-2 transition " +
                (destaque ? "border-primary ring-1 ring-primary" : "")
              }
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-sm font-medium">{coluna.rotulo}</span>
                <Badge variant="secondary" className="text-[10px]">
                  {itens.length}
                </Badge>
              </div>
              <div className="flex flex-1 flex-col gap-2">
                {itens.map((c) => {
                  const wpp = linkWhatsapp(c.telefone);
                  return (
                    <div
                      key={c.id}
                      draggable
                      onDragStart={() => setArrastando(c.id)}
                      onDragEnd={() => setArrastando(null)}
                      className={
                        "cursor-grab rounded-md border bg-background p-2.5 shadow-sm active:cursor-grabbing " +
                        (c.acompanhado_equipe ? "border-primary" : "")
                      }
                    >
                      <div className="flex items-start justify-between gap-1">
                        <Link
                          href={fichaHref(c.id)}
                          className="line-clamp-2 text-sm font-medium hover:text-primary hover:underline"
                        >
                          {c.nome || "Sem nome"}
                        </Link>
                        <StarButton
                          ativo={c.acompanhado_equipe}
                          onClick={() => onToggleEquipe(c)}
                        />
                      </div>
                      {c.perda_inercia != null ? (
                        <div className="mt-1 text-xs tabular-nums text-muted-foreground">
                          {brl.format(c.perda_inercia)}
                        </div>
                      ) : null}
                      <div className="mt-2 flex items-center gap-2">
                        {c.telefone ? (
                          <span className="text-xs text-muted-foreground">
                            {mascaraTelefone(c.telefone)}
                          </span>
                        ) : null}
                        {wpp ? <WhatsappLink href={wpp} /> : null}
                      </div>
                    </div>
                  );
                })}
                {itens.length === 0 ? (
                  <div className="rounded-md border border-dashed p-3 text-center text-[11px] text-muted-foreground">
                    Arraste aqui
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Card da lista (mobile) ----------

function ClienteCardLista({
  cliente: c,
  fichaHref,
  onStatus,
  onEquipe,
  onExcluir,
  pending,
}: {
  cliente: ClienteEtapa1;
  fichaHref: (id: string) => string;
  onStatus: (c: ClienteEtapa1, s: StatusCliente) => void;
  onEquipe: (c: ClienteEtapa1) => void;
  onExcluir: (id: string) => void;
  pending: boolean;
}) {
  const wpp = linkWhatsapp(c.telefone);
  return (
    <div
      className={
        "rounded-lg border p-3 " + (c.acompanhado_equipe ? "border-primary bg-primary/5" : "")
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <StarButton ativo={c.acompanhado_equipe} onClick={() => onEquipe(c)} />
          <Link
            href={fichaHref(c.id)}
            className="truncate font-medium hover:text-primary hover:underline"
          >
            {c.nome || "Sem nome"}
          </Link>
        </div>
        {c.perda_inercia != null ? (
          <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
            {brl.format(c.perda_inercia)}
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
        {c.telefone ? mascaraTelefone(c.telefone) : "sem telefone"}
        {wpp ? <WhatsappLink href={wpp} /> : null}
        {c.data_reuniao_preliminar ? (
          <span className="ml-auto text-xs">
            {new Date(
              c.data_reuniao_preliminar + "T00:00:00",
            ).toLocaleDateString("pt-BR")}
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Select
          value={c.status}
          onValueChange={(v) => v && onStatus(c, v as StatusCliente)}
        >
          <SelectTrigger size="sm" className="h-8 flex-1 text-xs">
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
        <Link
          href={fichaHref(c.id)}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Ficha
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => onExcluir(c.id)}
          disabled={pending}
        >
          Excluir
        </Button>
      </div>
    </div>
  );
}

// ---------- Auxiliares ----------

function WhatsappLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Abrir no WhatsApp"
      className="inline-flex items-center text-green-600 hover:text-green-700"
      onClick={(e) => e.stopPropagation()}
    >
      <MessageCircle className="size-4" />
    </a>
  );
}

function StarButton({
  ativo,
  onClick,
}: {
  ativo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={
        ativo ? "Cliente acompanhado pela equipe" : "Marcar como cliente da equipe"
      }
      className={
        "shrink-0 transition " +
        (ativo
          ? "text-primary"
          : "text-muted-foreground/40 hover:text-muted-foreground")
      }
    >
      <Star className={"size-4 " + (ativo ? "fill-primary" : "")} />
    </button>
  );
}

function ViewButton({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition " +
        (ativo
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground")
      }
    >
      {children}
    </button>
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
