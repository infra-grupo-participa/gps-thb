"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarCheck,
  Check,
  ListChecks,
  Lock,
  TrendingDown,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import type {
  ClienteEtapa1,
  ModoEnfase,
  ProgressoTarefa,
} from "@/lib/types";
import {
  META_CLIENTES,
  faltaParaContar,
  META_REUNIOES,
  TAREFAS_ETAPA1,
  calcularMetricasEtapa1,
} from "@/lib/etapa1";
import { calcularEnfases } from "@/lib/enfase";
import { brl } from "@/lib/moeda";
import {
  definirEnfaseTarefa,
  marcarTarefa,
  salvarDataAgendamento,
} from "@/app/clientes/actions";
import { TarefaItem } from "@/components/etapa/tarefa-item";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KpiCard } from "@/components/ui/kpi-card";
import { cn } from "@/lib/utils";

export function Etapa1Guide({
  alunoId,
  clientesIniciais,
  progressoInicial,
  dataAgendamentoInicial,
  clientesHref,
  enfasesIniciais = {},
  isAdmin = false,
  temFavorito = false,
  jaTemCliente = false,
}: {
  alunoId: string;
  clientesIniciais: ClienteEtapa1[];
  progressoInicial: ProgressoTarefa[];
  dataAgendamentoInicial: string | null;
  clientesHref: string;
  enfasesIniciais?: Record<number, ModoEnfase>;
  isAdmin?: boolean;
  /** Aluno já escolheu o cliente acompanhado pela equipe? Libera os passos 4+. */
  temFavorito?: boolean;
  /**
   * O aluno chegou COM cliente (respondeu "já tenho" no questionário
   * inicial)? Quem já tem não é travado pela tarefa dos 30.
   */
  jaTemCliente?: boolean;
}) {
  const [manual, setManual] = useState<Record<number, boolean>>(() => {
    const m: Record<number, boolean> = {};
    for (const p of progressoInicial) m[p.tarefa] = p.concluida;
    return m;
  });
  const [overrides, setOverrides] =
    useState<Record<number, ModoEnfase>>(enfasesIniciais);
  const [dataAgendamento, setDataAgendamento] = useState(
    dataAgendamentoInicial ?? "",
  );
  /** Último valor que o servidor confirmou — a régua do "mudou?" no `blur`. */
  const [dataSalva, setDataSalva] = useState(dataAgendamentoInicial ?? "");
  const [pending, startTransition] = useTransition();

  const {
    preenchidos,
    comDados,
    agendados,
    perdaTotal,
    totalConcluidas,
    pct: progressoPct,
    tarefaConcluida,
  } = useMemo(
    () => calcularMetricasEtapa1(clientesIniciais, manual),
    [clientesIniciais, manual],
  );

  /** O que falta para os já listados contarem. `frase` é null quando nada falta. */
  /** Sem nenhum cliente cadastrado não existe estrela para escolher. */
  const semCliente = clientesIniciais.length === 0;

  const faltam = useMemo(
    () => faltaParaContar(clientesIniciais),
    [clientesIniciais],
  );

  const enfases = useMemo(
    () => calcularEnfases(TAREFAS_ETAPA1, tarefaConcluida, overrides),
    [tarefaConcluida, overrides],
  );

  function setEnfase(num: number, modo: ModoEnfase | null) {
    setOverrides((prev) => {
      const next = { ...prev };
      if (modo === null) delete next[num];
      else next[num] = modo;
      return next;
    });
    startTransition(async () => {
      const res = await definirEnfaseTarefa(alunoId, 1, num, modo);
      if (res.erro) toast.error("Erro ao atualizar o destaque.");
    });
  }

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

  /**
   * Grava a data — chamada no `blur`, nunca no `onChange`.
   *
   * 🔑 `input[type=date]` dispara `change` a cada pedaço digitado (dia, mês,
   * ano) e a cada clique no calendário: escrever "10/09/2026" à mão rendia
   * três `update` no banco e três toasts empilhados. No `blur` a gravação
   * acontece uma vez, com o valor final — e sai um toast só.
   *
   * Sem escrita quando nada mudou: sair do campo sem tocar nele não é evento
   * de salvamento, e um "Data salva." sem alteração ensina a ignorar o aviso.
   * A comparação é contra o último valor CONFIRMADO pelo servidor
   * (`dataSalva`), não contra a prop inicial — senão voltar ao valor de origem
   * depois de gravar outro seria descartado em silêncio.
   */
  function salvarData(valor: string) {
    if (valor === dataSalva) return;
    startTransition(async () => {
      const res = await salvarDataAgendamento(alunoId, valor || null);
      if (res.erro) {
        toast.error("Erro ao salvar a data.");
        return;
      }
      setDataSalva(valor);
      toast.success("Data de agendamento salva.");
    });
  }

  return (
    // `ritmo-secao`: o espaço entre seções vem de UMA variável
    // (`--gap-secao`, 24 no celular / 32 no desktop), não de um `gap-6` por tela.
    <div className="ritmo-secao">
      {/* Progresso — 2x2 no celular (era 1x4: os quatro cards de largura
          total comiam ~480 px de rolagem antes do primeiro passo). O da perda
          fica com as duas colunas porque o número é longo: "R$ 2.955.000,00"
          em 30 px não cabe em 171 px, e encolher a fonte só dele quebraria a
          escala. */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {/* Estes 4 números usavam um `MetricCard` PRÓPRIO, escrito neste
            arquivo (sem ícone, rótulo em caixa alta), enquanto o `/admin`
            usava o `KpiCard` do design system (com chip laranja). Eram dois
            desenhos de cartão de número na mesma marca. Fica o do sistema. */}
        <KpiCard
          icone={<ListChecks />}
          rotulo="Progresso da etapa"
          valor={`${progressoPct}%`}
          meta={progressoPct}
          hint={`${totalConcluidas} de ${TAREFAS_ETAPA1.length} tarefas`}
        />
        {/* PL3 — a tarefa 1 exige nome + telefone + nível (`comDados`), e era
            `preenchidos` (só o nome) que aparecia aqui: o aluno lia "30/30" ao
            lado de um cadeado dizendo "faltam N clientes com nome, telefone e
            nível". Um número, uma verdade — o outro vira detalhe. */}
        <KpiCard
          icone={<Users />}
          rotulo="Clientes com os dados"
          valor={`${comDados}/${META_CLIENTES}`}
          meta={(comDados / META_CLIENTES) * 100}
          hint={
            // 🔑 Quando há cliente incompleto, o hint diz QUAL campo falta —
            // não só o número. O caso que motivou (medido em 10/09/2026): um
            // aluno com 51 clientes cadastrados, nome e telefone em todos e
            // nível em nenhum, lia "0 de 30" ao lado de 51 nomes na lista.
            // O critério não mudou; a explicação sim.
            faltam?.frase ??
            `${preenchidos} listados · ${comDados} com nome, telefone e nível`
          }
        />
        <KpiCard
          icone={<CalendarCheck />}
          rotulo="Reuniões agendadas"
          valor={`${agendados}/${META_REUNIOES}`}
          meta={(agendados / META_REUNIOES) * 100}
          hint="meta de 15 reuniões"
          destaque={agendados >= META_REUNIOES}
        />
        <KpiCard
          className="col-span-2 lg:col-span-1"
          icone={<TrendingDown />}
          rotulo="Perda pela inércia (total)"
          valor={perdaTotal > 0 ? brl(perdaTotal) : "—"}
          hint="soma dos seus clientes"
        />
      </div>

      {/* CTA: gestão fica na aba Clientes */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div>
            <div className="font-medium">
              A lista e a gestão dos clientes ficam na aba{" "}
              <span className="text-accent-foreground">Clientes</span>.
            </div>
            {/* 🔴 O fichário de documentos por cliente saiu da UI em 07/2026 e
                não volta: o documento do cliente vive no Drive. A aba Clientes
                guarda UM arquivo, o contrato assinado (bucket
                `gps-onboarding`), e é isso que a frase promete. */}
            <p className="text-sm text-muted-foreground">
              Aqui você acompanha o passo a passo; lá você cadastra, controla o
              contato e anexa o contrato assinado.
            </p>
          </div>
          {/* Era o ÚNICO botão laranja sólido da tela, acima do passo a
              passo: a CTA mais forte da Etapa 01 mandava o aluno EMBORA dela.
              O laranja cheio volta a ser do passo atual. */}
          <Link
            href={clientesHref}
            className={buttonVariants({ variant: "outline" })}
          >
            Ir para Clientes
            <ArrowUpRight aria-hidden />
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
        <CardContent className="grid gap-3">
          {!temFavorito ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-accent/60 px-3 py-2.5">
              <div className="flex items-start gap-2">
                <Lock className="mt-0.5 size-4 shrink-0 text-primary" />
                {/* 🔑 Sem cliente cadastrado não há estrela para escolher.
                    O CTA "Escolher o cliente da equipe" levava a uma lista
                    VAZIA — o aluno clicava e não achava nada. A frase e o
                    botão passam a dizer o passo que existe agora. */}
                <p className="text-sm">
                  {semCliente ? (
                    <>
                      <span className="font-medium">Do passo 4 em diante</span>,
                      os passos abrem quando você escolher o cliente que a
                      equipe vai acompanhar. Para isso, cadastre primeiro os
                      seus clientes na aba Clientes.
                    </>
                  ) : (
                    <>
                      <span className="font-medium">Do passo 4 em diante</span>,
                      os passos abrem quando você escolher, na aba Clientes, o
                      cliente que a equipe vai acompanhar (a{" "}
                      <span className="text-accent-foreground">estrela</span>).
                    </>
                  )}
                </p>
              </div>
              <Link
                href={clientesHref}
                className={buttonVariants({ size: "sm" })}
              >
                {semCliente
                  ? "Cadastrar o primeiro cliente"
                  : "Escolher o cliente da equipe"}
              </Link>
            </div>
          ) : null}
          {/* TRILHO VERTICAL NUMERADO.
              A Etapa 01 é uma sequência de verdade (1.1 → 8) e não parecia
              uma: nove tarefas com a mesma altura, o mesmo recuo e a mesma
              tipografia, com o número perdido dentro do título em texto
              corrido. Este é um dos raros casos em que numeração merece
              tratamento gráfico — aqui ela é o conteúdo, não enfeite.
              `<ol>` porque a ordem importa; o marcador é `aria-hidden` e o
              código continua no nome acessível de cada item. */}
          <ol className="relative grid gap-1 pl-11">
            <span
              aria-hidden
              className="absolute top-4 bottom-4 left-[1.0625rem] w-px bg-borda-fina"
            />
            {TAREFAS_ETAPA1.map((t) => {
              const travadoPorFavorito = Boolean(t.exigeFavorito) && !temFavorito;
              // A trava dos 30 vale para quem começa do zero. Quem chegou
              // COM cliente passa direto (decisão do Marcio, 10/09/2026) —
              // ver `proximoPasso` em `src/lib/etapas.ts`, mesma regra.
              const travadoPorTarefa =
                t.exigeTarefa != null &&
                !jaTemCliente &&
                !tarefaConcluida(t.exigeTarefa);
              const bloqueada = travadoPorFavorito || travadoPorTarefa;
              const faltam = META_CLIENTES - Math.min(comDados, META_CLIENTES);
              const concluida = tarefaConcluida(t.num);
              const foco = enfases[t.num] === "realce" && !concluida && !bloqueada;

              return (
                <li key={t.num} className="relative">
                  {/* Estado do passo dito pelo MARCADOR, sem opacidade:
                      concluído verde, atual em laranja sólido, travado
                      neutro tracejado, futuro em contorno fino. */}
                  <span
                    aria-hidden
                    className={cn(
                      "absolute top-2 -left-11 flex size-[2.125rem] items-center justify-center rounded-full border font-heading text-[0.6875rem] font-semibold",
                      concluida &&
                        "border-transparent bg-sucesso text-sucesso-foreground",
                      !concluida &&
                        foco &&
                        "border-transparent bg-marca-solida text-white",
                      !concluida &&
                        !foco &&
                        bloqueada &&
                        "border-dashed bg-neutro text-neutro-foreground",
                      !concluida &&
                        !foco &&
                        !bloqueada &&
                        "bg-card text-muted-foreground",
                    )}
                  >
                    {concluida ? (
                      <Check className="size-4" />
                    ) : bloqueada ? (
                      <Lock className="size-3.5" />
                    ) : (
                      (t.codigo ?? String(t.num))
                    )}
                  </span>
                  <TarefaItem
                    tarefa={t}
                    concluida={concluida}
                    pending={pending}
                    onToggle={(v) => toggleTarefa(t.num, v)}
                    enfase={enfases[t.num]}
                    clientesHref={clientesHref}
                    isAdmin={isAdmin}
                    overrideAtual={overrides[t.num] ?? null}
                    onEnfase={(modo) => setEnfase(t.num, modo)}
                    bloqueada={bloqueada}
                    mostrarCodigo={false}
                    // Quando as duas travas valem, a de tarefa vem primeiro: é
                    // a que o aluno resolve antes. O favorito segue no default.
                    motivoBloqueio={
                      travadoPorTarefa ? "Após listar os 30 clientes" : undefined
                    }
                    detalheBloqueio={
                      travadoPorTarefa
                        ? `Faltam ${faltam} cliente(s) com nome, telefone e nível de relacionamento preenchidos.`
                        : undefined
                    }
                  />
                </li>
              );
            })}
          </ol>
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
                onChange={(e) => setDataAgendamento(e.target.value)}
                onBlur={(e) => salvarData(e.target.value)}
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

