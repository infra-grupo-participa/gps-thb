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
import Link from "next/link";
import { LayoutGrid, List as ListIcon, Plus, Users } from "lucide-react";
import type { ClienteEtapa1, FaseCliente, GrauRelacao } from "@/lib/types";
import {
  META_CLIENTES,
  calcularMetricasEtapa1,
  resumoHonorarios,
} from "@/lib/etapa1";
import {
  criarCliente,
  definirClienteEquipe,
  mudarFaseCliente,
  removerCliente,
} from "@/app/clientes/actions";
import { MetaHonorarios } from "@/components/etapa1/meta-honorarios";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Secao } from "@/components/ui/secao";
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
import { DialogoNovoCliente } from "./dialogo-novo-cliente";
import { DialogoDesfavoritar } from "../dialogo-desfavoritar";
import { DialogoEscolherFavorito } from "../dialogo-escolher-favorito";
import {
  contarPorFase,
  contarPorGrau,
  filtrarPorBusca,
  ordenarClientes,
  travadoPelaEquipe,
} from "./ordenacao";
import { ROTULO_ORDENACAO, type FiltroGrau, type Ordenacao } from "./tipos";

export function ClientesManager({
  alunoId,
  clientesIniciais,
  basePath,
  admin = false,
}: {
  alunoId: string;
  clientesIniciais: ClienteEtapa1[];
  basePath: string;
  /**
   * Modo assistência. É a EQUIPE quem troca e desmarca o cliente acompanhado
   * (migração ...215): com `false`, a estrela vira sinal assim que o aluno
   * escolhe e o "Excluir" some do escolhido. Quem autoriza de verdade é a
   * trigger do banco; esta prop decide o que a tela oferece.
   */
  admin?: boolean;
}) {
  const router = useRouter();
  const [clientes, setClientes] = useState<ClienteEtapa1[]>(clientesIniciais);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | FaseCliente>("todos");
  const [filtroGrau, setFiltroGrau] = useState<"todos" | FiltroGrau>("todos");
  const [view, setView] = useState<"lista" | "quadro">("lista");
  const [ordenacao, setOrdenacao] = useState<Ordenacao>("recentes");
  /** Cliente aguardando confirmação de exclusão (PL9). `null` = sem diálogo. */
  const [excluindo, setExcluindo] = useState<ClienteEtapa1 | null>(null);
  /** Cliente aguardando confirmação de desfavoritar (PL11). Só o admin chega aqui. */
  const [desfavoritando, setDesfavoritando] = useState<ClienteEtapa1 | null>(
    null,
  );
  /** Cliente aguardando a confirmação de ESCOLHA do aluno (migração ...215). */
  const [escolhendo, setEscolhendo] = useState<ClienteEtapa1 | null>(null);
  /** Diálogo "Novo cliente" aberto? Fase e grau nascem no padrão. */
  const [novoAberto, setNovoAberto] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novaFase, setNovaFase] = useState<FaseCliente>("prospeccao");
  const [novoGrau, setNovoGrau] = useState<string>("");
  const [erroDialogo, setErroDialogo] = useState<string | null>(null);
  /**
   * Falha de escrita FORA de diálogo (fase e estrela são um clique só). Fica na
   * tela com `role="alert"` e com a frase que a action já traduziu do banco —
   * "Erro ao mudar a fase" num toast apagaria justamente o que explica a trava.
   */
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const fichaHref = (id: string) => `${basePath}/clientes/${id}`;
  // PL3 — "um número, uma verdade": home, Etapa 01 e esta aba mostram
  // `comDados` (nome + telefone + nível), que é o que a tarefa 1 cobra;
  // `preenchidos` (só nome) vai como DETALHE. Enquanto esta tela contava só o
  // nome, o aluno lia "30 de 30" aqui com o passo 2 travado na Etapa 01.
  // A régua vem de `calcularMetricasEtapa1`, a mesma função das outras duas
  // telas — `{}` porque só os números derivados da LISTA interessam aqui
  // (o mapa de tarefas manuais não muda `preenchidos`/`comDados`).
  const { preenchidos, comDados } = useMemo(
    () => calcularMetricasEtapa1(clientes, {}),
    [clientes],
  );

  // Tudo em memória, sobre os ≤ 30 clientes já carregados: nenhuma ida nova ao
  // banco para contar, somar ou filtrar por fase. A meta usa `clientes` (a
  // lista inteira), NUNCA a lista filtrada: filtrar por fase não pode mudar o
  // faturamento do ambiente.
  const honorarios = useMemo(() => resumoHonorarios(clientes), [clientes]);

  const contagemFase = useMemo(() => contarPorFase(clientes), [clientes]);

  // Grau só entra na conta sobre a lista INTEIRA (como a fase): o chip precisa
  // dizer quantos existem, não quantos sobraram do outro filtro.
  const contagemGrau = useMemo(() => contarPorGrau(clientes), [clientes]);

  const buscaFiltrada = useMemo(
    () => filtrarPorBusca(clientes, busca),
    [clientes, busca],
  );

  const listaOrdenada = useMemo(
    () => ordenarClientes(buscaFiltrada, filtro, ordenacao, filtroGrau),
    [buscaFiltrada, filtro, ordenacao, filtroGrau],
  );

  /**
   * O cliente que a EQUIPE assumiu (§B.5). Enquanto ele existe:
   *   · a estrela não aparece em nenhum outro card/linha (o banco recusaria);
   *   · "Excluir" some nele;
   *   · "Prospecção" sai das fases oferecidas para ele.
   * Nada disto é a trava — a trava é a trigger `...203`. Isto é não oferecer o
   * que vai falhar.
   */
  const confirmado = clientes.find(travadoPelaEquipe) ?? null;
  const existeConfirmado = confirmado !== null;
  /** Já existe estrela no ambiente (confirmada ou só escolhida pelo aluno)? */
  const existeFavorito = clientes.some((c) => c.acompanhado_equipe);
  const ctxEstrela = { admin, existeFavorito, existeConfirmado };

  // ---- Ações ----
  function abrirNovo() {
    setErroDialogo(null);
    setNovoNome("");
    setNovaFase("prospeccao");
    setNovoGrau("");
    setNovoAberto(true);
  }

  /** Cria o cliente já com a fase e o vínculo escolhidos no diálogo (uma chamada). */
  function criarComFaseEGrau() {
    setErroDialogo(null);
    startTransition(async () => {
      const res = await criarCliente(alunoId, {
        nome: novoNome,
        fase: novaFase,
        grau_relacao: (novoGrau as GrauRelacao) || null,
      });
      if (res.erro || !res.id) {
        setErroDialogo(res.erro ?? "Não foi possível adicionar o cliente.");
        return;
      }
      setNovoAberto(false);
      router.push(fichaHref(res.id));
    });
  }

  function mudarFase(cliente: ClienteEtapa1, nova: FaseCliente) {
    if (cliente.fase === nova) return;
    const anterior = cliente.fase;
    setErroLista(null);
    setClientes((prev) =>
      prev.map((c) => (c.id === cliente.id ? { ...c, fase: nova } : c)),
    );
    startTransition(async () => {
      const res = await mudarFaseCliente(cliente.id, alunoId, nova);
      if (res.erro) {
        setClientes((prev) =>
          prev.map((c) => (c.id === cliente.id ? { ...c, fase: anterior } : c)),
        );
        setErroLista(res.erro);
      }
    });
  }

  /**
   * A estrela.
   *
   * 🔴 Para o ALUNO, marcar é ESCOLHA ÚNICA (migração ...215): pergunta antes,
   * com a consequência escrita, e depois não há mais botão nenhum — a troca é
   * por chamado. Desmarcar nem chega aqui: `modoEstrela` já não devolve botão.
   *
   * Para o ADMIN nada mudou: marcar é um clique (ele é quem troca) e desmarcar
   * passa pelo `DialogoDesfavoritar`, porque re-trava os passos 4 a 8 da Etapa
   * 01 de quem não pediu nada.
   */
  function toggleEquipe(cliente: ClienteEtapa1) {
    if (cliente.acompanhado_equipe) {
      if (!admin) return;
      setErroDialogo(null);
      setDesfavoritando(cliente);
      return;
    }
    if (!admin) {
      setErroDialogo(null);
      setEscolhendo(cliente);
      return;
    }
    aplicarEquipe(cliente);
  }

  function aplicarEquipe(cliente: ClienteEtapa1) {
    const ativar = !cliente.acompanhado_equipe;
    setErroLista(null);
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
        // A frase já vem traduzida do banco pela action — inclusive a da trava
        // do favorito, que diz o que fazer ("fale com a equipe pelo Suporte").
        setErroDialogo(res.erro);
        setErroLista(res.erro);
        return;
      }
      setDesfavoritando(null);
      setEscolhendo(null);
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
   * PL9 — `removerCliente` faz DELETE: vão junto nome, telefone, registro do
   * contato, honorários e link do contrato. O botão fica encostado em "Abrir
   * ficha", e não havia confirmação nenhuma.
   */
  function excluir(cliente: ClienteEtapa1) {
    setErroLista(null);
    startTransition(async () => {
      const res = await removerCliente(cliente.id, alunoId);
      if (res.erro) {
        setErroDialogo(res.erro);
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
          admin={admin}
        />
      ) : null}
      <Card>
      <CardHeader className="gap-4">
        {/* `Secao` no lugar do par CardTitle + parágrafo: a mesma cabeça de
            "Seu caminho" e "Passo a passo", com a régua amarrando o título ao
            conteúdo. Sem `numero` — "Meus clientes" não é passo de sequência
            nenhuma, e numeração decorativa é o clichê que o componente existe
            para não reintroduzir. */}
        <Secao
          icone={<Users />}
          titulo="Meus clientes"
          descricao={
            <>
              {comDados} de {META_CLIENTES} com dados · cadastre, controle o
              contato e anexe o contrato assinado.
              {/* Rodapé honesto do KPI: sem ele, quem tem 3 clientes REAIS (um
                  deles em execução) lê "3/30" como fracasso. A meta de 30 é da
                  tarefa 1 da Etapa 01; a aba é a central de todos.
                  🔴 O fichário de documentos por cliente saiu da UI em 07/2026:
                  o documento vive no Drive. Aqui se anexa UM arquivo — o
                  contrato assinado. */}
              <span className="mt-1 block text-xs text-muted-foreground">
                {preenchidos} com nome · {comDados} com nome e telefone.
                A meta de {META_CLIENTES} é da Etapa 01; clientes em andamento e
                em execução contam aqui também.
              </span>
            </>
          }
          acao={
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border p-0.5">
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
              <Button onClick={abrirNovo} disabled={pending}>
                Adicionar
              </Button>
            </div>
          }
        />

        {/* Meta de faturamento do ambiente (B8) — some da tela de ninguém:
            os três estados de `MetaHonorarios` cobrem "sem contratado",
            "contratado sem valor" e "com valor". */}
        <MetaHonorarios
          resumo={honorarios}
          className="rounded-lg bg-superficie-afundada p-3"
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
          <div className="grid gap-2">
            {/* Dois grupos de chips, dois `role="group"` com nome: sem isso são
                nove botões `aria-pressed` seguidos, e quem navega por leitor de
                tela não sabe onde a fase acaba e o vínculo começa. */}
            <div
              role="group"
              aria-label="Filtrar por fase"
              className="flex flex-wrap gap-2"
            >
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

            {/* Grau de relação. A linha inteira some quando ninguém tem grau
                preenchido E não há "não informado" a mostrar — filtro que só
                devolve vazio não é filtro. */}
            {contagemGrau.length > 0 ? (
              <div
                role="group"
                aria-label="Filtrar por grau de relação"
                className="flex flex-wrap items-center gap-2"
              >
                <span className="rotulo text-muted-foreground">Vínculo</span>
                <FiltroChip
                  ativo={filtroGrau === "todos"}
                  onClick={() => setFiltroGrau("todos")}
                  rotulo="Qualquer"
                  qtd={clientes.length}
                />
                {contagemGrau.map((g) => (
                  <FiltroChip
                    key={g.id}
                    ativo={filtroGrau === g.id}
                    onClick={() => setFiltroGrau(g.id)}
                    rotulo={g.rotulo}
                    titulo={g.ajuda}
                    qtd={g.qtd}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Sempre montado, mesmo vazio (uma região viva que nasce com o texto
            não é anunciada por parte dos leitores de tela). */}
        <p role="alert" className="corpo-sm text-destructive empty:hidden">
          {erroLista}
        </p>
      </CardHeader>

      <CardContent>
        {clientes.length === 0 ? (
          /* 🔴 A TELA ONDE 57 ALUNOS PARAM (medido em 10/09/2026).
             O texto anterior — "Nenhum cliente ainda. Clique em Adicionar
             para começar." — mandava procurar um botão, não dizia a meta,
             não dizia o critério e não era clicável. Agora diz o que fazer,
             quantos, com quê, e o próprio bloco abre o diálogo. */
          <div className="grid gap-4 rounded-lg border border-dashed bg-superficie-afundada p-8 text-center">
            <div className="grid gap-1.5">
              <p className="font-heading titulo-h2">
                Comece pela sua lista de 30
              </p>
              <p className="corpo-sm text-muted-foreground">
                São {META_CLIENTES} pessoas do seu círculo de relacionamento.
                Basta <strong>nome e telefone</strong> para cada uma contar — o
                resto você preenche depois, quando souber.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button onClick={abrirNovo}>
                <Plus aria-hidden /> Cadastrar o primeiro cliente
              </Button>
              {/* Zero chamados abertos com 104 alunos travados: ninguém acha
                  o caminho de pedir ajuda. Aqui ele fica ao lado de quem
                  travou, não escondido na 7ª aba do header. */}
              <Link
                href={`${basePath}/chamados`}
                className="corpo-sm text-muted-foreground underline-offset-4 hover:text-accent-foreground hover:underline"
              >
                Travou? Fale com a equipe
              </Link>
            </div>
          </div>
        ) : view === "quadro" ? (
          <Kanban
            clientes={buscaFiltrada}
            fichaHref={fichaHref}
            ctxEstrela={ctxEstrela}
            onMover={mudarFase}
            onToggleEquipe={toggleEquipe}
          />
        ) : listaOrdenada.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-superficie-afundada p-8 text-center text-sm text-muted-foreground">
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
                  ctxEstrela={ctxEstrela}
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
              ctxEstrela={ctxEstrela}
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

      {/* "Novo cliente" — fase e grau ANTES de abrir a ficha. */}
      {novoAberto ? (
        <DialogoNovoCliente
          nome={novoNome}
          onNome={setNovoNome}
          fase={novaFase}
          grau={novoGrau}
          pending={pending}
          erro={erroDialogo}
          onFase={setNovaFase}
          onGrau={setNovoGrau}
          onCriar={criarComFaseEGrau}
          onCancelar={() => {
            setNovoAberto(false);
            setErroDialogo(null);
          }}
        />
      ) : null}

      {/* 🔴 Escolha ÚNICA do aluno (migração ...215) — a troca vira chamado. */}
      {escolhendo ? (
        <DialogoEscolherFavorito
          cliente={escolhendo}
          pending={pending}
          erro={erroDialogo}
          onConfirmar={() => aplicarEquipe(escolhendo)}
          onCancelar={() => {
            setEscolhendo(null);
            setErroDialogo(null);
          }}
        />
      ) : null}

      {/* PL11 — desmarcar a estrela re-trava 5 passos da Etapa 01. Só o admin. */}
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
