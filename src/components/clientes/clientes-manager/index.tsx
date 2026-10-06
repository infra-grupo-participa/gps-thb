"use client";

/**
 * CRM do aluno: a lista/quadro dos 30 clientes da Etapa 01, com busca, fase,
 * cliente da equipe (a estrela), meta de faturamento e exclusão.
 *
 * ONDA 3 (09/09/2026) — o arquivo tinha 905 linhas e cinco assuntos juntos
 * (CD5). Foi cortado POR RESPONSABILIDADE, sem uma linha de lógica nova:
 *
 *   clientes-tabela.tsx      a tabela do desktop
 *   clientes-quadro.tsx      o quadro por fase (só leitura: a fase é calculada pelo banco)
 *   cliente-card-lista.tsx   a mesma lista no celular
 *   clientes-chips.tsx       chip, estrela, WhatsApp, "Recusou", lista/quadro
 *   confirmacao-equipe.tsx   o banner verde do cliente acompanhado
 *   dialogos.tsx             excluir cliente e tirar do acompanhamento
 *   ordenacao.ts             busca, filtro e ordem — sem React, testáveis
 *   tipos.ts                 o tipo `Ordenacao`
 *
 * 🔑 Aqui ficou o que É compartilhado: a lista em estado (`clientes`), as
 * QUATRO escritas (criar, cliente da equipe, excluir) e os dois
 * diálogos de confirmação. Todas as escritas usam a MESMA `useTransition`,
 * para que o `pending` desabilite os botões das três visões enquanto uma
 * delas roda — e as duas com desfazer otimista (fase e estrela) revertem o
 * estado local quando a action falha.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import {
  ClipboardPaste,
  LayoutGrid,
  List as ListIcon,
  PhoneCall,
  Plus,
  Users,
} from "lucide-react";
import type { ClienteEtapa1, FaseCliente, GrauRelacao } from "@/lib/types";
import {
  META_CLIENTES,
  calcularMetricasEtapa1,
  resumoHonorarios,
} from "@/lib/etapa1";
import {
  atualizarCliente,
  criarCliente,
  definirClienteEquipe,
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
import { DialogoColarLista } from "./dialogo-colar-lista";
import { DialogoDesfavoritar } from "../dialogo-desfavoritar";
import { DialogoEscolherFavorito } from "../dialogo-escolher-favorito";
import { DialogoSelecaoEntrevista } from "../selecao-entrevista";
import {
  contarPorFase,
  contarPorGrau,
  filtrarPorBusca,
  ordenarClientes,
  estrelaTravada,
} from "./ordenacao";
import { ROTULO_ORDENACAO, type FiltroGrau, type Ordenacao } from "./tipos";
import { erroDeNomeAbreviado } from "@/lib/nomes";

export function ClientesManager({
  alunoId,
  clientesIniciais,
  basePath,
  admin = false,
  abrirNovoAoMontar = false,
}: {
  alunoId: string;
  clientesIniciais: ClienteEtapa1[];
  basePath: string;
  /**
   * A página recebeu `?novo=1` (o card "Continue de onde parou" da home leva
   * direto à ação). Quem valida o valor é a PÁGINA, no servidor — só `"1"`
   * exato liga isto. O diálogo nasce aberto e o parâmetro sai da URL (ver o
   * efeito abaixo), para não reabrir no recarregar.
   */
  abrirNovoAoMontar?: boolean;
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
  /**
   * 🔴 A LISTA ACOMPANHA O SERVIDOR (02/10/2026). Até aqui `clientesIniciais`
   * só valia na montagem: o `revalidatePath` das actions trazia a lista nova
   * por prop e o `useState` a ignorava. Com um cadastro por abertura isso não
   * aparecia (o "Criar" navega para a ficha); com "Salvar e adicionar outro" e
   * "Colar lista" a pessoa fica NESTA tela e veria o contador parado em 3
   * depois de cadastrar 10. Padrão "ajustar estado quando a prop muda" do
   * React (sem efeito): prop nova = verdade do servidor, que substitui o
   * otimismo local — que, a essa altura, já foi confirmado ou desfeito.
   */
  const [iniciaisVistos, setIniciaisVistos] = useState(clientesIniciais);
  if (clientesIniciais !== iniciaisVistos) {
    setIniciaisVistos(clientesIniciais);
    setClientes(clientesIniciais);
  }
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
  const [novoAberto, setNovoAberto] = useState(abrirNovoAoMontar);
  /** "Colar lista" aberto? Só para o parceiro (a action resolve o ambiente pela sessão). */
  const [colarAberto, setColarAberto] = useState(false);
  const [novoTelefone, setNovoTelefone] = useState("");
  /** Qual botão do diálogo disparou a gravação — só ele diz "Salvando…". */
  const [emCurso, setEmCurso] = useState<"ficha" | "outro" | null>(null);
  /** Quantos "Salvar e adicionar outro" nesta abertura (devolve o foco ao nome). */
  const [salvosNaSequencia, setSalvosNaSequencia] = useState(0);
  /** Nome do último salvo pelo "adicionar outro" — vira a confirmação. */
  const [ultimoSalvo, setUltimoSalvo] = useState<string | null>(null);
  /** Diálogo "Escolher os 5 da entrevista" aberto? */
  const [selecionandoEntrevista, setSelecionandoEntrevista] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoGrau, setNovoGrau] = useState<string>("");
  const [erroDialogo, setErroDialogo] = useState<string | null>(null);
  /**
   * Falha de escrita FORA de diálogo (estrela é um clique só). Fica na
   * tela com `role="alert"` e com a frase que a action já traduziu do banco —
   * "Erro ao marcar a estrela" num toast apagaria justamente o que explica a trava.
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
  const { comDados } = useMemo(
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
   * O favorito cujo caso JÁ ANDOU (migração ...304, 23/09/2026). Enquanto ele
   * existe:
   *   · a estrela não aparece em nenhum outro card/linha — `definirClienteEquipe`
   *     desmarcaria este primeiro e o banco recusaria (42501);
   *   · "Excluir" some nele;
   *   · "Prospecção" sai das fases oferecidas.
   * Nada disto é a trava — a trava é a trigger. Isto é não oferecer o que vai
   * falhar.
   *
   * 🔴 Era `clientes.find(travadoPelaEquipe)`, que agora casaria com QUALQUER
   * cliente fora de prospecção — inclusive um que nunca foi favorito. Tem de
   * ser `estrelaTravada` (favorito E caso andado), senão a estrela some da
   * lista inteira no primeiro cliente que o aluno mover para fechamento.
   */
  const travado = clientes.find(estrelaTravada) ?? null;
  const existeTravado = travado !== null;
  const ctxEstrela = { admin, existeTravado };

  // `?novo=1` já abriu o diálogo (estado inicial). Aqui só sai da URL, para
  // recarregar a página não abrir de novo. `history.replaceState` e não
  // `router.replace`: este último re-executa o Server Component inteiro
  // (nota de 23/09) só para apagar um parâmetro que o servidor já leu.
  useEffect(() => {
    if (!abrirNovoAoMontar) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("novo")) return;
    url.searchParams.delete("novo");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [abrirNovoAoMontar]);

  // ---- Ações ----
  function abrirNovo() {
    setErroDialogo(null);
    setNovoNome("");
    setNovoTelefone("");
    setNovoGrau("");
    setSalvosNaSequencia(0);
    setUltimoSalvo(null);
    setNovoAberto(true);
  }

  /**
   * Cria o cliente (nasce em Prospecção) já com o vínculo escolhido no diálogo.
   *
   * `modo = "ficha"`: o de sempre — cria e abre a ficha.
   * `modo = "outro"`: cria, limpa nome e telefone e fica no diálogo.
   *
   * O telefone vai por `atualizarCliente` logo depois do `criarCliente`, que
   * não o aceita. São duas chamadas; se a segunda falhar o cliente JÁ existe,
   * e a frase diz isso em vez de "não foi possível" (que levaria a pessoa a
   * cadastrar de novo e duplicar).
   */
  function criarComFaseEGrau(modo: "ficha" | "outro") {
    setErroDialogo(null);
    const nomeAbreviado = erroDeNomeAbreviado(novoNome);
    if (nomeAbreviado) {
      setErroDialogo(nomeAbreviado);
      return;
    }
    setEmCurso(modo);
    const nome = novoNome.trim();
    const telefone = novoTelefone.trim();
    startTransition(async () => {
      const res = await criarCliente(alunoId, {
        nome,
        grau_relacao: (novoGrau as GrauRelacao) || null,
      });
      if (res.erro || !res.id) {
        setEmCurso(null);
        setErroDialogo(res.erro ?? "Não foi possível adicionar o cliente.");
        return;
      }
      let erroTelefone: string | null = null;
      if (telefone) {
        const tel = await atualizarCliente(res.id, alunoId, { telefone });
        if (tel.erro) erroTelefone = tel.erro;
      }
      setEmCurso(null);
      if (modo === "ficha") {
        setNovoAberto(false);
        router.push(fichaHref(res.id));
        return;
      }
      setNovoNome("");
      setNovoTelefone("");
      setUltimoSalvo(nome);
      setSalvosNaSequencia((n) => n + 1);
      if (erroTelefone) {
        setErroDialogo(
          `${nome} foi salvo, mas o telefone não: ${erroTelefone} Preencha o telefone na ficha dele.`,
        );
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
      // 🔴 `estrelaTravada`, não `acompanhado_equipe`: enquanto o caso não
      // andou, o parceiro desmarca sozinho (migração ...304; antes de
      // 23/09/2026 a condição era a confirmação da equipe, que nunca vinha).
      // Com a checagem por `acompanhado_equipe` o botão aparecia e o clique
      // não fazia nada.
      if (!admin && estrelaTravada(cliente)) return;
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
          // 🔴 Só o número (João, 06/10/2026: "ninguém vai ler esses textos").
          // Os 3 parágrafos que moravam aqui (a conta do passo 2, a estrela,
          // o contrato) saíram: a estrela já se explica na caixa de certeza
          // ANTES de gravar, e o passo 2 se explica na própria Etapa 01.
          descricao={`${comDados} de ${META_CLIENTES} com nome e telefone`}
          acao={
            // `flex-wrap`: no celular os botões quebram linha; sem ele a fila
            // empurrava o card e cortava o texto à direita (medido em 390 px).
            <div className="flex flex-wrap items-center justify-end gap-2">
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
              <Button
                variant="outline"
                size="lg"
                className="h-11"
                onClick={() => setSelecionandoEntrevista(true)}
                disabled={pending || clientes.length === 0}
              >
                <PhoneCall aria-hidden /> Escolher os 5 da entrevista
              </Button>
              {/* "Colar lista" só para o parceiro: `cadastrarClientesEmLote`
                  resolve o ambiente pela SESSÃO, e no modo assistência a
                  sessão é do admin. */}
              {!admin ? (
                <Button
                  variant="outline"
                  size="lg"
                  className="h-11"
                  onClick={() => setColarAberto(true)}
                  disabled={pending}
                >
                  <ClipboardPaste aria-hidden /> Colar lista
                </Button>
              ) : null}
              <Button size="lg" className="h-11" onClick={abrirNovo} disabled={pending}>
                <Plus aria-hidden /> Adicionar cliente
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
              <p className="corpo text-muted-foreground">
                São {META_CLIENTES} pessoas do seu círculo de relacionamento.
                Basta <strong>nome e telefone</strong> para cada uma contar — o
                resto você preenche depois, quando souber.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button onClick={abrirNovo} size="lg" className="h-11">
                <Plus aria-hidden /> Cadastrar o primeiro cliente
              </Button>
              {!admin ? (
                <Button
                  variant="outline"
                  size="lg"
                  className="h-11"
                  onClick={() => setColarAberto(true)}
                >
                  <ClipboardPaste aria-hidden /> Já tenho a lista: colar
                </Button>
              ) : null}
              {/* Zero chamados abertos com 104 alunos travados: ninguém acha
                  o caminho de pedir ajuda. Aqui ele fica ao lado de quem
                  travou, não escondido na 7ª aba do header. */}
              <Link
                href={`${basePath}/chamados`}
                className="inline-flex min-h-11 items-center corpo text-muted-foreground underline underline-offset-4 hover:text-accent-foreground"
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
            onToggleEquipe={toggleEquipe}
          />
        ) : listaOrdenada.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-superficie-afundada p-8 text-center text-sm text-muted-foreground">
            Nenhum cliente encontrado. Limpe a busca ou o filtro.
          </div>
        ) : (
          <>
            {/* Cartões até `xl`: a tabela tem 60rem e, abaixo disso, arrastava
                para o lado (03/10/2026 — "isso nao pode acontecer"). */}
            <div className="grid gap-2 sm:grid-cols-2 xl:hidden">
              {listaOrdenada.map((c) => (
                <ClienteCardLista
                  key={c.id}
                  cliente={c}
                  fichaHref={fichaHref}
                  ctxEstrela={ctxEstrela}
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

      {/* "Novo cliente" — grau ANTES de abrir a ficha. */}
      {novoAberto ? (
        <DialogoNovoCliente
          nome={novoNome}
          onNome={setNovoNome}
          telefone={novoTelefone}
          onTelefone={setNovoTelefone}
          grau={novoGrau}
          pending={pending}
          erro={erroDialogo}
          confirmacao={
            ultimoSalvo
              ? `${ultimoSalvo} foi salvo. ${comDados} de ${META_CLIENTES} com nome e telefone.`
              : null
          }
          salvosNaSequencia={salvosNaSequencia}
          emCurso={emCurso}
          onGrau={setNovoGrau}
          onCriar={() => criarComFaseEGrau("ficha")}
          onSalvarEOutro={() => criarComFaseEGrau("outro")}
          onCancelar={() => {
            setNovoAberto(false);
            setErroDialogo(null);
            // Quem salvou em sequência fecha com um resumo (o diálogo some).
            if (salvosNaSequencia > 0) {
              toast.success(
                salvosNaSequencia === 1
                  ? "1 cliente cadastrado."
                  : `${salvosNaSequencia} clientes cadastrados.`,
              );
            }
          }}
        />
      ) : null}

      {colarAberto ? (
        <DialogoColarLista
          comDados={comDados}
          meta={META_CLIENTES}
          onFechar={() => setColarAberto(false)}
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

      {/* Seletor dos 5 da entrevista prévia (migração ...261). Conjunto
          inteiro por action — ver o comentário de `selecao-entrevista.tsx`. */}
      {selecionandoEntrevista ? (
        <DialogoSelecaoEntrevista
          aberto={selecionandoEntrevista}
          clientes={clientes}
          alunoId={alunoId}
          onFechar={() => setSelecionandoEntrevista(false)}
          onSalvo={(ids) => {
            const idsSelecionados = new Set(ids);
            setClientes((prev) =>
              prev.map((c) => ({
                ...c,
                selecionado_entrevista: idsSelecionados.has(c.id),
              })),
            );
            setSelecionandoEntrevista(false);
            toast.success(
              `Seleção salva: ${ids.length} de 5 clientes para a entrevista.`,
            );
            // 🔴 Lição registrada: em Client Component com estado por prop,
            // sem refresh o próximo clique nesta lista partiria de um
            // `clientesIniciais` desatualizado e desfaria o que acabou de
            // ser salvo.
            router.refresh();
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
