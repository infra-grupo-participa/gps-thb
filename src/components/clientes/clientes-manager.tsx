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
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import type { ClienteEtapa1, FaseCliente } from "@/lib/types";
import {
  FASES_CLIENTE,
  META_CLIENTES,
  resumoHonorarios,
} from "@/lib/etapa1";
import { formatarDataSoDia } from "@/lib/datas";
import { mascaraTelefone } from "@/lib/masks";
import { brl, brlOuTraco } from "@/lib/moeda";
import { linkWhatsapp } from "@/lib/whatsapp";
import {
  criarCliente,
  definirClienteEquipe,
  mudarFaseCliente,
  removerCliente,
} from "@/app/etapa-1/actions";
import { MetaHonorarios } from "@/components/etapa1/meta-honorarios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";
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
  const [filtro, setFiltro] = useState<"todos" | FaseCliente>("todos");
  const [view, setView] = useState<"lista" | "quadro">("lista");
  const [ordenacao, setOrdenacao] = useState<Ordenacao>("recentes");
  /** Cliente aguardando confirmação de exclusão (PL9). `null` = sem diálogo. */
  const [excluindo, setExcluindo] = useState<ClienteEtapa1 | null>(null);
  /** Cliente aguardando confirmação de desfavoritar (PL11). */
  const [desfavoritando, setDesfavoritando] = useState<ClienteEtapa1 | null>(
    null,
  );
  const [erroDialogo, setErroDialogo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const fichaHref = (id: string) => `${basePath}/clientes/${id}`;
  const preenchidos = clientes.filter((c) => c.nome.trim() !== "").length;

  // Tudo em memória, sobre os ≤ 30 clientes já carregados: nenhuma ida nova ao
  // banco para contar, somar ou filtrar por fase. A meta usa `clientes` (a
  // lista inteira), NUNCA a lista filtrada: filtrar por fase não pode mudar o
  // faturamento do ambiente.
  const honorarios = useMemo(() => resumoHonorarios(clientes), [clientes]);

  const contagemFase = useMemo(
    () =>
      FASES_CLIENTE.map((f) => ({
        ...f,
        qtd: clientes.filter((c) => c.fase === f.id).length,
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
      (c) => filtro === "todos" || c.fase === filtro,
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

  function mudarFase(cliente: ClienteEtapa1, nova: FaseCliente) {
    if (cliente.fase === nova) return;
    const anterior = cliente.fase;
    setClientes((prev) =>
      prev.map((c) => (c.id === cliente.id ? { ...c, fase: nova } : c)),
    );
    startTransition(async () => {
      const res = await mudarFaseCliente(cliente.id, alunoId, nova);
      if (res.erro) {
        setClientes((prev) =>
          prev.map((c) => (c.id === cliente.id ? { ...c, fase: anterior } : c)),
        );
        toast.error("Erro ao mudar a fase.");
      }
    });
  }

  /**
   * PL11 — DESMARCAR a estrela re-trava os passos 4 a 8 da Etapa 01 e some com
   * o banner verde, e isso acontecia em silêncio (o toast só existia ao
   * ativar), a 8 px do nome do cliente na tabela. Ativar continua num clique:
   * é reversível e é o caminho que o produto quer.
   */
  function toggleEquipe(cliente: ClienteEtapa1) {
    if (cliente.acompanhado_equipe) {
      setErroDialogo(null);
      setDesfavoritando(cliente);
      return;
    }
    aplicarEquipe(cliente);
  }

  function aplicarEquipe(cliente: ClienteEtapa1) {
    const ativar = !cliente.acompanhado_equipe;
    setClientes((prev) =>
      prev.map((c) => ({
        ...c,
        acompanhado_equipe: c.id === cliente.id ? ativar : false,
      })),
    );
    startTransition(async () => {
      const res = await definirClienteEquipe(cliente.id, alunoId, ativar);
      if (res.erro) {
        // Desfaz o otimismo: sem isto a estrela ficava mentindo na tela.
        setClientes((prev) =>
          prev.map((c) =>
            c.id === cliente.id
              ? { ...c, acompanhado_equipe: !ativar }
              : c,
          ),
        );
        setErroDialogo("Erro ao mudar o cliente da equipe.");
        toast.error("Erro ao marcar o cliente da equipe.");
        return;
      }
      setDesfavoritando(null);
      if (ativar) {
        toast.success(
          `A equipe vai acompanhar ${cliente.nome || "este cliente"}. Os próximos passos da Etapa 01 estão liberados.`,
        );
      } else {
        toast.success(
          `${cliente.nome || "O cliente"} não é mais acompanhado pela equipe. Os passos 4 a 8 da Etapa 01 voltaram a ficar travados.`,
        );
      }
    });
  }

  /**
   * PL9 — `removerCliente` faz DELETE: vão junto nome, telefone, perda pela
   * inércia, registro do contato, honorários e link do contrato. O botão fica
   * encostado em "Abrir ficha", e não havia confirmação nenhuma.
   */
  function excluir(cliente: ClienteEtapa1) {
    startTransition(async () => {
      const res = await removerCliente(cliente.id, alunoId);
      if (res.erro) {
        setErroDialogo("Erro ao excluir o cliente.");
        toast.error("Erro ao remover cliente.");
        return;
      }
      setExcluindo(null);
      setClientes((prev) => prev.filter((c) => c.id !== cliente.id));
      toast.success(`${cliente.nome || "Cliente"} excluído.`);
    });
  }

  const favorito = clientes.find((c) => c.acompanhado_equipe) ?? null;

  return (
    <div className="grid gap-4">
      {favorito ? (
        <ConfirmacaoEquipe
          cliente={favorito}
          etapa1Href={`${basePath}/etapa/1`}
        />
      ) : null}
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

        {/* Meta de faturamento do ambiente (B8) — some da tela de ninguém:
            os três estados de `MetaHonorarios` cobrem "sem contratado",
            "contratado sem valor" e "com valor". */}
        <MetaHonorarios
          resumo={honorarios}
          className="rounded-lg border bg-muted/30 p-3"
        />

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
            {contagemFase.map((f) => (
              <FiltroChip
                key={f.id}
                ativo={filtro === f.id}
                onClick={() => setFiltro(f.id)}
                rotulo={f.rotulo}
                titulo={f.ajuda}
                qtd={f.qtd}
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
            onMover={mudarFase}
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
                  onFase={mudarFase}
                  onEquipe={toggleEquipe}
                  onExcluir={(c) => {
                    setErroDialogo(null);
                    setExcluindo(c);
                  }}
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
                  <TableHead>Fase</TableHead>
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
                          className="hover:text-accent-foreground hover:underline"
                        >
                          {c.nome || "Sem nome"}
                        </Link>
                        {c.acompanhado_equipe ? (
                          <Badge className="ml-2 text-[10px]">Equipe</Badge>
                        ) : null}
                        <MarcaRecusou cliente={c} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {c.telefone ? mascaraTelefone(c.telefone) : "—"}
                          {wpp ? <WhatsappLink href={wpp} /> : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {brlOuTraco(c.perda_inercia)}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={c.fase}
                          onValueChange={(v) =>
                            v && mudarFase(c, v as FaseCliente)
                          }
                        >
                          <SelectTrigger
                            size="sm"
                            className="h-7 w-[140px] text-xs"
                            aria-label={`Fase de ${c.nome || "cliente sem nome"}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FASES_CLIENTE.map((f) => (
                              <SelectItem key={f.id} value={f.id}>
                                {f.rotulo}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatarDataSoDia(c.data_reuniao_preliminar) ?? "—"}
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
                          {/* PL9 — separador + margem: o destrutivo estava
                              encostado em "Abrir ficha" e o erro de mira
                              apagava a linha inteira. */}
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Excluir ${c.nome || "cliente sem nome"}`}
                            className="ml-3 border-l pl-3 text-destructive hover:text-destructive"
                            onClick={() => {
                              setErroDialogo(null);
                              setExcluindo(c);
                            }}
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

      {/* PL9 — a linha do cliente continua na lista atrás do diálogo: é o que
          faz o foco voltar ao botão "Excluir" quando se cancela. */}
      {excluindo ? (
        <DialogoConfirmacao
          aberto
          titulo="Excluir este cliente?"
          descricao={excluindo.nome || "Cliente sem nome"}
          consequencia={
            <>
              Apaga nome, telefone, registro do contato, perda pela inércia,
              honorários e link do contrato de{" "}
              <strong>{excluindo.nome || "este cliente"}</strong>.{" "}
              <strong>Não dá para desfazer.</strong>
              {excluindo.acompanhado_equipe ? (
                <>
                  {" "}
                  Ele é o cliente acompanhado pela equipe: excluir também volta
                  a travar os passos 4 a 8 da Etapa 01.
                </>
              ) : null}
            </>
          }
          rotuloConfirmar="Excluir cliente"
          rotuloConfirmando="Excluindo…"
          confirmando={pending}
          erro={erroDialogo}
          onConfirmar={() => excluir(excluindo)}
          onCancelar={() => {
            setExcluindo(null);
            setErroDialogo(null);
          }}
        />
      ) : null}

      {/* PL11 — desmarcar a estrela re-trava 5 passos da Etapa 01. */}
      {desfavoritando ? (
        <DialogoConfirmacao
          aberto
          titulo="Tirar este cliente do acompanhamento da equipe?"
          descricao={desfavoritando.nome || "Cliente sem nome"}
          consequencia={
            <>
              Sem cliente acompanhado, os{" "}
              <strong>passos 4 a 8 da Etapa 01 voltam a ficar travados</strong>{" "}
              e o destaque na sua página inicial some. Nenhum dado do cliente é
              apagado — dá para escolher outro (ou o mesmo) a qualquer momento.
            </>
          }
          rotuloConfirmar="Tirar do acompanhamento"
          rotuloConfirmando="Salvando…"
          confirmando={pending}
          erro={erroDialogo}
          onConfirmar={() => aplicarEquipe(desfavoritando)}
          onCancelar={() => {
            setDesfavoritando(null);
            setErroDialogo(null);
          }}
        />
      ) : null}
    </div>
  );
}

// ---------- Confirmação do cliente da equipe ----------

function ConfirmacaoEquipe({
  cliente,
  etapa1Href,
}: {
  cliente: ClienteEtapa1;
  etapa1Href: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
        <div>
          <div className="text-sm font-semibold text-emerald-800">
            A equipe vai acompanhar {cliente.nome || "este cliente"}
          </div>
          <p className="text-xs text-emerald-700/80">
            Cliente confirmado para o apoio da equipe. Os próximos passos da
            Etapa 01 (do passo 4 em diante) estão liberados.
          </p>
        </div>
      </div>
      <Link
        href={etapa1Href}
        className={buttonVariants({ size: "sm" }) + " shrink-0"}
      >
        Continuar na Etapa 01 <ArrowRight className="size-4" />
      </Link>
    </div>
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
  onMover: (c: ClienteEtapa1, f: FaseCliente) => void;
  onToggleEquipe: (c: ClienteEtapa1) => void;
}) {
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<FaseCliente | null>(null);

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max gap-3">
        {FASES_CLIENTE.map((coluna) => {
          const itens = clientes.filter((c) => c.fase === coluna.id);
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
              <div className="mb-2 px-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{coluna.coluna}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {itens.length}
                  </Badge>
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  {coluna.ajuda}
                </p>
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
                          className="line-clamp-2 text-sm font-medium hover:text-accent-foreground hover:underline"
                        >
                          {c.nome || "Sem nome"}
                        </Link>
                        <StarButton
                          ativo={c.acompanhado_equipe}
                          onClick={() => onToggleEquipe(c)}
                        />
                      </div>
                      <MarcaRecusou cliente={c} className="mt-1" />
                      {c.perda_inercia != null ? (
                        <div className="mt-1 text-xs tabular-nums text-muted-foreground">
                          {brl(c.perda_inercia)}
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
  onFase,
  onEquipe,
  onExcluir,
  pending,
}: {
  cliente: ClienteEtapa1;
  fichaHref: (id: string) => string;
  onFase: (c: ClienteEtapa1, f: FaseCliente) => void;
  onEquipe: (c: ClienteEtapa1) => void;
  onExcluir: (c: ClienteEtapa1) => void;
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
            className="truncate font-medium hover:text-accent-foreground hover:underline"
          >
            {c.nome || "Sem nome"}
          </Link>
          <MarcaRecusou cliente={c} />
        </div>
        {c.perda_inercia != null ? (
          <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
            {brl(c.perda_inercia)}
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
        {c.telefone ? mascaraTelefone(c.telefone) : "sem telefone"}
        {wpp ? <WhatsappLink href={wpp} /> : null}
        {c.data_reuniao_preliminar ? (
          <span className="ml-auto text-xs">
            {formatarDataSoDia(c.data_reuniao_preliminar)}
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Select
          value={c.fase}
          onValueChange={(v) => v && onFase(c, v as FaseCliente)}
        >
          <SelectTrigger
            size="sm"
            className="h-8 flex-1 text-xs"
            aria-label={`Fase de ${c.nome || "cliente sem nome"}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FASES_CLIENTE.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.rotulo}
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
          aria-label={`Excluir ${c.nome || "cliente sem nome"}`}
          className="ml-2 border-l pl-3 text-destructive hover:text-destructive"
          onClick={() => onExcluir(c)}
          disabled={pending}
        >
          Excluir
        </Button>
      </div>
    </div>
  );
}

// ---------- Auxiliares ----------

/**
 * Vestígio do modelo antigo de 5 status: sem esta marca, o cliente que disse
 * "não" sumiria dentro de "Prospecção" e o aluno o reprospectaria. Some
 * sozinha quando a coluna `status` for removida do banco.
 */
function MarcaRecusou({
  cliente,
  className = "ml-2",
}: {
  cliente: ClienteEtapa1;
  className?: string;
}) {
  if (cliente.status !== "recusou") return null;
  return (
    <span
      title="Registro anterior às fases: este cliente foi marcado como “Recusou” no modelo antigo de status, que saiu do ar."
      className={
        "inline-flex shrink-0 items-center rounded-full border border-destructive/30 px-1.5 py-0.5 align-middle text-[10px] font-medium text-destructive " +
        className
      }
    >
      Recusou
    </span>
  );
}

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
          ? "text-accent-foreground"
          : "text-muted-foreground/40 hover:text-muted-foreground")
      }
    >
      <Star className={"size-4 " + (ativo ? "fill-accent-foreground" : "")} />
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
  titulo,
  qtd,
}: {
  ativo: boolean;
  onClick: () => void;
  rotulo: string;
  titulo?: string;
  qtd: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      aria-pressed={ativo}
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
