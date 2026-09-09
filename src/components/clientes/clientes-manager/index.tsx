"use client";

/**
 * CRM do aluno: a lista/quadro dos 30 clientes da Etapa 01, com busca, fase,
 * cliente da equipe (a estrela), meta de faturamento e exclusão.
 *
 * ONDA 3 (09/09/2026) — o arquivo tinha 905 linhas e cinco assuntos juntos
 * (CD5). Foi cortado POR RESPONSABILIDADE, sem uma linha de lógica nova:
 *
 *   clientes-tabela.tsx      a tabela do desktop
 *   clientes-quadro.tsx      o quadro por fase, com arrastar e soltar
 *   cliente-card-lista.tsx   a mesma lista no celular
 *   clientes-chips.tsx       chip, estrela, WhatsApp, "Recusou", lista/quadro
 *   confirmacao-equipe.tsx   o banner verde do cliente acompanhado
 *   dialogos.tsx             excluir cliente e tirar do acompanhamento
 *   ordenacao.ts             busca, filtro e ordem — sem React, testáveis
 *   tipos.ts                 o tipo `Ordenacao`
 *
 * 🔑 Aqui ficou o que É compartilhado: a lista em estado (`clientes`), as
 * QUATRO escritas (criar, mudar fase, cliente da equipe, excluir) e os dois
 * diálogos de confirmação. Todas as escritas usam a MESMA `useTransition`,
 * para que o `pending` desabilite os botões das três visões enquanto uma
 * delas roda — e as duas com desfazer otimista (fase e estrela) revertem o
 * estado local quando a action falha.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LayoutGrid, List as ListIcon } from "lucide-react";
import type { ClienteEtapa1, FaseCliente } from "@/lib/types";
import { META_CLIENTES, resumoHonorarios } from "@/lib/etapa1";
import {
  criarCliente,
  definirClienteEquipe,
  mudarFaseCliente,
  removerCliente,
} from "@/app/clientes/actions";
import { MetaHonorarios } from "@/components/etapa1/meta-honorarios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClienteCardLista } from "./cliente-card-lista";
import { FiltroChip, ViewButton } from "./clientes-chips";
import { Kanban } from "./clientes-quadro";
import { ClientesTabela } from "./clientes-tabela";
import { ConfirmacaoEquipe } from "./confirmacao-equipe";
import { DialogoExcluirCliente } from "./dialogos";
import { DialogoDesfavoritar } from "../dialogo-desfavoritar";
import { contarPorFase, filtrarPorBusca, ordenarClientes } from "./ordenacao";
import { ROTULO_ORDENACAO, type Ordenacao } from "./tipos";

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

  const contagemFase = useMemo(() => contarPorFase(clientes), [clientes]);

  const buscaFiltrada = useMemo(
    () => filtrarPorBusca(clientes, busca),
    [clientes, busca],
  );

  const listaOrdenada = useMemo(
    () => ordenarClientes(buscaFiltrada, filtro, ordenacao),
    [buscaFiltrada, filtro, ordenacao],
  );

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
                <SelectValue>
                  {(v: Ordenacao) => `Ordenar: ${ROTULO_ORDENACAO[v]}`}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(
                  Object.keys(ROTULO_ORDENACAO) as Ordenacao[]
                ).map((o) => (
                  <SelectItem key={o} value={o}>
                    Ordenar: {ROTULO_ORDENACAO[o]}
                  </SelectItem>
                ))}
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
            <ClientesTabela
              listaOrdenada={listaOrdenada}
              fichaHref={fichaHref}
              pending={pending}
              mudarFase={mudarFase}
              toggleEquipe={toggleEquipe}
              setErroDialogo={setErroDialogo}
              setExcluindo={setExcluindo}
            />
          </>
        )}
      </CardContent>
    </Card>

      {/* PL9 — a linha do cliente continua na lista atrás do diálogo: é o que
          faz o foco voltar ao botão "Excluir" quando se cancela. */}
      {excluindo ? (
        <DialogoExcluirCliente
          excluindo={excluindo}
          pending={pending}
          erroDialogo={erroDialogo}
          onConfirmar={() => excluir(excluindo)}
          onCancelar={() => {
            setExcluindo(null);
            setErroDialogo(null);
          }}
        />
      ) : null}

      {/* PL11 — desmarcar a estrela re-trava 5 passos da Etapa 01. */}
      {desfavoritando ? (
        <DialogoDesfavoritar
          desfavoritando={desfavoritando}
          pending={pending}
          erroDialogo={erroDialogo}
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
