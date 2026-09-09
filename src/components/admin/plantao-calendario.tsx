"use client";

/**
 * Plantão de Dúvidas — Acelera Holding. Calendário mensal editável (admin).
 *
 * ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
 * (commit b457005) e PROIBIDO de reconstruir.
 *
 * PORTA o padrão de grade/estado/dialog/toast de
 * `git show b457005^:src/components/admin/reunioes-calendario.tsx`.
 * Sem capacidade/vaga: o admin só vê `inscritosQtd` (a "noção prévia de
 * participantes" pedida pela equipe) — nunca um teto.
 *
 * A lista de mentoras chega por prop (`getMentoras()` em
 * `src/lib/plantao-data.ts`), porque `criarSlot`/`editarSlot` exigem o uuid
 * da mentora. `SlotAdmin` traz `mentoraId`: ao editar — e no seletor inline
 * "Quem apresenta" — a mentora atual é pré-selecionada pelo ID, nunca pelo
 * nome (duas mentoras homônimas fariam um "salvar só o link" reatribuir a
 * mentora em silêncio e zerar o aviso de véspera).
 *
 * FASE 8 (08/09/2026) — autonomia das operadoras, sem dev no meio:
 * - interruptor "Inscrições abertas/pausadas" (`gps.plantao_config`);
 * - trocar quem apresenta direto no card do dia (`trocarMentoraSlot`), que no
 *   servidor zera `aviso_mentora_em` — senão a mentora nova nunca é avisada;
 * - cancelar plantão com inscritos, avisando por e-mail (`cancelarSlot`):
 *   cancelado NÃO é apagado, vira estado com motivo;
 * - criar a série semanal de uma vez (`criarSlot` + `repetirSemanas`).
 */

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CalendarDaysIcon,
  CalendarOffIcon,
  PlusIcon,
  PencilIcon,
  Trash2Icon,
  VideoIcon,
  VideoOffIcon,
  UsersIcon,
  ExternalLinkIcon,
  MailXIcon,
  PauseIcon,
  PlayIcon,
} from "lucide-react";
import type {
  SlotAdmin,
  InscritoAdmin,
  MentoraAdmin,
} from "@/lib/plantao-tipos";
import { faixaHorario, rotuloData } from "@/lib/plantao";
import {
  criarSlot,
  editarSlot,
  publicarSlot,
  removerSlot,
  salvarGravacao,
  cancelarSlot,
  trocarMentoraSlot,
  definirInscricoesAbertas,
} from "@/app/admin/plantao/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { PlantaoInscritos } from "@/components/admin/plantao-inscritos";
import { rotuloMes } from "@/components/plantao/calendario-mes";

/** Teto do "repetir semanalmente" — mesmo clamp que `criarSlot` aplica no servidor. */
const MAX_REPETICOES = 12;

/** `<select>` nativo com o visual do `Input` do shadcn (não há Select nativo aqui). */
const CLASSE_SELECT =
  "border-input bg-background focus-visible:ring-ring/50 h-9 rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50";

function mesAnterior(ano: number, mes: number) {
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
}
function proximoMes(ano: number, mes: number) {
  return mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };
}
function paramMes(ano: number, mes: number) {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

function diasDaGrade(ano: number, mes: number): (string | null)[] {
  const primeiro = new Date(Date.UTC(ano, mes - 1, 1));
  const totalDias = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const diaSemanaInicio = primeiro.getUTCDay();
  const dias: (string | null)[] = Array(diaSemanaInicio).fill(null);
  for (let d = 1; d <= totalDias; d++) {
    dias.push(`${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (dias.length % 7 !== 0) dias.push(null);
  return dias;
}

/** "2026-09-15" → "15/09". Data-only tratada como texto: sem drift de fuso. */
function dataCurta(iso: string): string {
  const [, m, d] = iso.split("-");
  return d && m ? `${d}/${m}` : iso;
}

/** A série semanal a partir de uma data-only: a própria + `repeticoes` semanas. */
function datasDaSerie(inicio: string, repeticoes: number): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return [];
  const [y, m, d] = inicio.split("-").map(Number);
  const datas: string[] = [];
  for (let i = 0; i <= repeticoes; i++) {
    // Aritmética em UTC: `Date.UTC` normaliza a virada de mês/ano sozinho.
    datas.push(new Date(Date.UTC(y, m - 1, d + 7 * i)).toISOString().slice(0, 10));
  }
  return datas;
}

/** Devolve o foco ao gatilho quando o diálogo fecha, se ele ainda existe. */
function devolverFoco(ref: { current: HTMLButtonElement | null }) {
  requestAnimationFrame(() => {
    const el = ref.current;
    if (el && document.contains(el)) el.focus();
  });
}

type ModoDialog = "lista" | "novo" | { editando: SlotAdmin };

export function PlantaoCalendario({
  ano,
  mes,
  slots,
  mentoras,
  inscritosPorSlot,
  inscricoesAbertas,
}: {
  ano: number;
  mes: number;
  slots: SlotAdmin[];
  /** Mentoras disponíveis para o seletor ao criar/editar um plantão. */
  mentoras: MentoraAdmin[];
  /** Inscritos pré-carregados só dos slots com `inscritosQtd > 0` (ver page.tsx). */
  inscritosPorSlot: Record<string, InscritoAdmin[]>;
  /**
   * Interruptor geral das escritas do aluno (`gps.plantao_config`), lido no
   * servidor por `lerInscricoesAbertas()`. Pausado = ninguém se inscreve,
   * cancela ou revela o link; os plantões continuam visíveis.
   */
  inscricoesAbertas: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [diaAberto, setDiaAberto] = useState<string | null>(null);
  const [modo, setModo] = useState<ModoDialog>("lista");
  const [inscritosAbertos, setInscritosAbertos] = useState<SlotAdmin | null>(null);
  const [cancelando, setCancelando] = useState<SlotAdmin | null>(null);
  const [confirmandoPausa, setConfirmandoPausa] = useState(false);
  /** Texto do `aria-live` do diálogo do dia (troca de mentora, criação, cancelamento). */
  const [aviso, setAviso] = useState("");
  /** Texto do `aria-live` da barra do interruptor. */
  const [avisoInterruptor, setAvisoInterruptor] = useState("");
  /** Slot com ação em voo — o rótulo de carregamento sai só no card certo. */
  const [slotEmAcao, setSlotEmAcao] = useState<string | null>(null);
  const [alternandoInscricoes, setAlternandoInscricoes] = useState(false);

  // Foco de volta ao gatilho quando um diálogo fecha. O card é o alvo de
  // reserva: depois de cancelar, o próprio botão "Cancelar plantão" some da
  // tela e o foco iria parar no <body>.
  const gatilhoInterruptorRef = useRef<HTMLButtonElement | null>(null);
  const gatilhoCancelarRef = useRef<HTMLButtonElement | null>(null);
  const cardsRef = useRef(new Map<string, HTMLDivElement | null>());

  const porDia = useMemo(() => {
    const mapa = new Map<string, SlotAdmin[]>();
    for (const s of slots) {
      const lista = mapa.get(s.data) ?? [];
      lista.push(s);
      mapa.set(s.data, lista);
    }
    return mapa;
  }, [slots]);

  const grade = useMemo(() => diasDaGrade(ano, mes), [ano, mes]);
  const anterior = mesAnterior(ano, mes);
  const proximo = proximoMes(ano, mes);
  const slotsDoDia = diaAberto ? (porDia.get(diaAberto) ?? []) : [];

  function fecharDialog() {
    setDiaAberto(null);
    setModo("lista");
    setAviso("");
  }

  function abrirDia(iso: string) {
    setDiaAberto(iso);
    setModo("lista");
    setAviso("");
  }

  function togglePublicar(slot: SlotAdmin) {
    setSlotEmAcao(slot.slotId);
    startTransition(async () => {
      const res = await publicarSlot(slot.slotId, !slot.publicado);
      setSlotEmAcao(null);
      if (!res.ok) {
        toast.error(res.erro);
        setAviso(res.erro);
        return;
      }
      const msg = slot.publicado ? "Plantão despublicado." : "Plantão publicado.";
      toast.success(msg);
      setAviso(msg);
      router.refresh();
    });
  }

  function remover(slot: SlotAdmin) {
    if (
      !window.confirm(
        `Remover o plantão de ${faixaHorario(slot.horaInicio, slot.duracaoMin)} com ${slot.mentoraNome}?`,
      )
    ) {
      return;
    }
    setSlotEmAcao(slot.slotId);
    startTransition(async () => {
      const res = await removerSlot(slot.slotId);
      setSlotEmAcao(null);
      if (!res.ok) {
        toast.error(res.erro);
        setAviso(res.erro);
        return;
      }
      toast.success("Plantão removido.");
      setAviso("Plantão removido.");
      router.refresh();
    });
  }

  /**
   * Troca quem apresenta sem abrir o formulário inteiro. O servidor zera
   * `aviso_mentora_em` junto — senão a mentora nova nunca receberia o aviso de
   * véspera (o envio daquele plantão já constaria como feito para a antiga).
   */
  function trocarMentora(slot: SlotAdmin, mentoraId: string) {
    setSlotEmAcao(slot.slotId);
    startTransition(async () => {
      const res = await trocarMentoraSlot(slot.slotId, mentoraId);
      setSlotEmAcao(null);
      if (!res.ok) {
        toast.error(res.erro);
        setAviso(res.erro);
        return;
      }
      const nome = mentoras.find((m) => m.id === mentoraId)?.nome ?? "a mentora escolhida";
      // O botão "Trocar" some quando a troca dá certo (não há mais o que
      // trocar) — sem isto o foco cairia no <body> no meio do diálogo.
      requestAnimationFrame(() =>
        document.getElementById(`mentora-slot-${slot.slotId}`)?.focus(),
      );
      toast.success(`Agora quem apresenta é ${nome}.`);
      setAviso(
        `Agora quem apresenta é ${nome}. O aviso de véspera será enviado para a mentora nova.`,
      );
      router.refresh();
    });
  }

  function fecharConfirmacaoPausa() {
    setConfirmandoPausa(false);
    devolverFoco(gatilhoInterruptorRef);
  }

  function alternarInscricoes(aberta: boolean) {
    setAlternandoInscricoes(true);
    startTransition(async () => {
      const res = await definirInscricoesAbertas(aberta);
      setAlternandoInscricoes(false);
      if (!res.ok) {
        toast.error(res.erro);
        setAvisoInterruptor(res.erro);
        return;
      }
      toast.success(aberta ? "Inscrições reabertas." : "Inscrições pausadas.");
      setAvisoInterruptor(
        aberta
          ? "Inscrições reabertas. Os alunos voltam a se inscrever e cancelar."
          : "Inscrições pausadas. Ninguém consegue se inscrever, cancelar ou revelar o link.",
      );
      if (!aberta) fecharConfirmacaoPausa();
      router.refresh();
    });
  }

  function fecharCancelamento(cancelou: boolean) {
    const slotId = cancelando?.slotId;
    setCancelando(null);
    // Cancelou: o gatilho deixa de existir (o card cancelado não mostra mais o
    // botão), então o foco vai para o card.
    if (cancelou && slotId) {
      requestAnimationFrame(() => cardsRef.current.get(slotId)?.focus());
      return;
    }
    devolverFoco(gatilhoCancelarRef);
  }

  function salvarSlot(form: {
    slotId?: string;
    mentoraId?: string;
    data: string;
    horaInicio: string;
    duracaoMin: number;
    zoomUrl?: string;
    observacao?: string;
    repetirSemanas: number;
  }) {
    // Guarda de integridade: sem o uuid da mentora, gravar mandaria
    // `mentora_id` vazio para o banco. O seletor é `required`, então isto só
    // dispara se alguém contornar o formulário.
    if (!form.mentoraId) {
      toast.error("Escolha a mentora do plantão.");
      setAviso("Escolha a mentora do plantão.");
      return;
    }
    const mentoraId = form.mentoraId;

    startTransition(async () => {
      if (form.slotId) {
        const res = await editarSlot({
          slotId: form.slotId,
          mentoraId,
          data: form.data,
          horaInicio: form.horaInicio,
          duracaoMin: form.duracaoMin,
          zoomUrl: form.zoomUrl,
          observacao: form.observacao,
        });
        if (!res.ok) {
          toast.error(res.erro);
          setAviso(res.erro);
          return;
        }
        toast.success("Plantão atualizado.");
        setAviso("Plantão atualizado.");
        router.refresh();
        setModo("lista");
        return;
      }

      const res = await criarSlot({
        mentoraId,
        data: form.data,
        horaInicio: form.horaInicio,
        duracaoMin: form.duracaoMin,
        observacao: form.observacao,
        repetirSemanas: form.repetirSemanas,
      });
      if (!res.ok) {
        toast.error(res.erro);
        setAviso(res.erro);
        return;
      }

      // `criados`/`pulados` são opcionais no contrato do servidor (ver
      // `criarSlot`): trata a ausência como "1 criado, nada pulado", que é o
      // caso de sempre — nunca imprime "undefined" na tela.
      const qtd = res.criados ?? 1;
      const datasPuladas = res.pulados ?? [];
      const criados = qtd === 1 ? "1 plantão criado." : `${qtd} plantões criados.`;
      const pulados =
        datasPuladas.length > 0
          ? ` ${datasPuladas.length} pulado(s) por já existir plantão desta mentora no mesmo horário: ${datasPuladas
              .map(dataCurta)
              .join(", ")}.`
          : "";
      toast.success(criados);
      setAviso(`${criados}${pulados} Nascem como rascunho — publique quando quiser.`);
      router.refresh();
      setModo("lista");
    });
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3 shadow-sm">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className={
              "mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium " +
              // O laranja da marca (#ff6300) não passa 4.5:1 como texto —
              // entra só no ponto (decorativo); o rótulo usa a cor de texto.
              (inscricoesAbertas
                ? "border-primary/40 bg-primary/10 text-foreground"
                : "border-amber-600/40 bg-amber-500/15 text-amber-900 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-200")
            }
          >
            <span
              className={
                "size-1.5 rounded-full " + (inscricoesAbertas ? "bg-primary" : "bg-amber-500")
              }
              aria-hidden
            />
            {inscricoesAbertas ? "Inscrições abertas" : "Inscrições pausadas"}
          </span>
          <p className="text-xs text-muted-foreground">
            {inscricoesAbertas
              ? "Os alunos conseguem se inscrever, cancelar e revelar o link da sala."
              : "Ninguém consegue se inscrever, cancelar ou revelar o link. Os plantões continuam visíveis."}
          </p>
        </div>
        <Button
          ref={gatilhoInterruptorRef}
          variant="outline"
          size="sm"
          disabled={pending || alternandoInscricoes}
          onClick={() => {
            if (inscricoesAbertas) {
              setConfirmandoPausa(true);
              return;
            }
            alternarInscricoes(true);
          }}
        >
          {inscricoesAbertas ? (
            <PauseIcon className="size-4" />
          ) : (
            <PlayIcon className="size-4" />
          )}
          {alternandoInscricoes
            ? "Salvando..."
            : inscricoesAbertas
              ? "Pausar inscrições"
              : "Reabrir inscrições"}
        </Button>
        <p aria-live="polite" className="sr-only">
          {avisoInterruptor}
        </p>
      </div>

      <div className="flex items-center justify-between gap-2 rounded-xl border bg-card p-3 shadow-sm">
        <Link
          href={`/admin/plantao?m=${paramMes(anterior.ano, anterior.mes)}`}
          className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label="Mês anterior"
        >
          <ChevronLeftIcon className="size-4" />
        </Link>
        {/* `capitalize` maiúsculizava toda palavra e a tela dizia
            "Setembro De 2026". Mesmo bug, mesma correção do calendário
            público: o rótulo vem pronto de `rotuloMes()`. */}
        <div className="flex items-center gap-1.5 font-medium">
          <CalendarDaysIcon className="size-4 text-primary" aria-hidden />
          {rotuloMes(mes, ano)}
        </div>
        <Link
          href={`/admin/plantao?m=${paramMes(proximo.ano, proximo.mes)}`}
          className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label="Próximo mês"
        >
          <ChevronRightIcon className="size-4" />
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-medium text-muted-foreground">
          {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map((d) => (
            <div key={d} className="py-1.5">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {grade.map((iso, i) => {
            if (!iso) return <div key={`vazio-${i}`} className="aspect-square sm:aspect-auto sm:h-20" />;
            const doDia = porDia.get(iso) ?? [];
            const publicados = doDia.filter((s) => s.publicado).length;
            const cancelados = doDia.filter((s) => s.canceladoEm !== null).length;
            const numeroDia = Number(iso.slice(-2));
            return (
              <button
                key={iso}
                type="button"
                onClick={() => abrirDia(iso)}
                className="flex aspect-square flex-col items-center justify-center gap-0.5 border-b border-r p-1 text-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:aspect-auto sm:h-20 sm:items-start sm:justify-start sm:gap-1"
              >
                <span className="font-medium">{numeroDia}</span>
                {doDia.length > 0 ? (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <span
                      className={
                        "size-1.5 rounded-full " +
                        (publicados > 0 ? "bg-primary" : "bg-muted-foreground/40")
                      }
                      aria-hidden
                    />
                    {doDia.length}
                    {cancelados > 0 ? (
                      <CalendarOffIcon className="size-3 text-destructive" aria-hidden />
                    ) : null}
                  </span>
                ) : null}
                <span className="sr-only">
                  {doDia.length === 0
                    ? "sem plantão"
                    : `${doDia.length} plantão(ões)${cancelados > 0 ? `, ${cancelados} cancelado(s)` : ""}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <Dialog
        open={diaAberto !== null}
        onOpenChange={(v) => {
          if (!v) fecharDialog();
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{diaAberto ? rotuloData(diaAberto) : ""}</DialogTitle>
            <DialogDescription>
              Slot sem link do Zoom cadastrado NÃO aparece para o aluno, mesmo
              que esteja marcado como publicado.
            </DialogDescription>
          </DialogHeader>

          {modo === "lista" ? (
            <div className="flex flex-col gap-3">
              {slotsDoDia.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum plantão cadastrado neste dia.
                </p>
              ) : (
                slotsDoDia.map((slot) => {
                  const cancelado = slot.canceladoEm !== null;
                  const emAcao = slotEmAcao === slot.slotId;
                  const semEmailDaMentora = !slot.mentoraEmail;
                  const faixa = faixaHorario(slot.horaInicio, slot.duracaoMin);
                  return (
                    <div
                      key={slot.slotId}
                      ref={(el) => {
                        cardsRef.current.set(slot.slotId, el);
                      }}
                      tabIndex={-1}
                      className={
                        "rounded-lg border p-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 " +
                        (cancelado ? "border-destructive/30 bg-destructive/5" : "")
                      }
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className={"font-medium " + (cancelado ? "line-through" : "")}>
                            {faixa} · {slot.mentoraNome}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            {cancelado ? (
                              <Badge variant="destructive" className="gap-1">
                                <CalendarOffIcon className="size-3" /> Cancelado
                              </Badge>
                            ) : (
                              <Badge variant={slot.publicado ? "default" : "secondary"}>
                                {slot.publicado ? "Publicado" : "Rascunho"}
                              </Badge>
                            )}
                            {!slot.zoomUrl && !cancelado ? (
                              <Badge variant="destructive" className="gap-1">
                                <VideoOffIcon className="size-3" /> Sem link do Zoom
                              </Badge>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => setInscritosAbertos(slot)}
                              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground transition hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                            >
                              <UsersIcon className="size-3" /> {slot.inscritosQtd} inscrito(s)
                            </button>
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          {!cancelado ? (
                            <>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                disabled={pending}
                                onClick={() => setModo({ editando: slot })}
                                title="Editar"
                                aria-label={`Editar o plantão das ${faixa}`}
                              >
                                <PencilIcon className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                disabled={pending || (!slot.publicado && semEmailDaMentora)}
                                onClick={() => togglePublicar(slot)}
                                title={slot.publicado ? "Despublicar" : "Publicar"}
                                aria-label={`${slot.publicado ? "Despublicar" : "Publicar"} o plantão das ${faixa}`}
                              >
                                {slot.publicado ? (
                                  <VideoOffIcon className="size-4" />
                                ) : (
                                  <VideoIcon className="size-4" />
                                )}
                              </Button>
                            </>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={pending}
                            onClick={() => remover(slot)}
                            className="text-muted-foreground hover:text-destructive"
                            title="Remover"
                            aria-label={`Remover o plantão das ${faixa}`}
                          >
                            <Trash2Icon className="size-4" />
                          </Button>
                        </div>
                      </div>

                      {cancelado ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {slot.canceladoMotivo
                            ? `Motivo: ${slot.canceladoMotivo}. `
                            : "Cancelado sem motivo registrado. "}
                          Os inscritos receberam aviso por e-mail no cancelamento
                          (quem não recebeu precisa ser avisado por fora) e o plantão
                          saiu do ar. Fica aqui como histórico; use remover para tirar
                          da agenda.
                        </p>
                      ) : null}

                      {!cancelado && semEmailDaMentora ? (
                        <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                          <MailXIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                          <span>
                            {slot.mentoraNome} não tem e-mail cadastrado; sem ele
                            ela não recebe o aviso de véspera. Cadastre na aba
                            Mentoras para poder publicar.
                          </span>
                        </p>
                      ) : null}

                      {!cancelado && !slot.encerrado ? (
                        <div className="mt-3 flex flex-wrap items-end justify-between gap-2 border-t pt-3">
                          <TrocaDeMentora
                            key={slot.mentoraId}
                            slot={slot}
                            mentoras={mentoras}
                            pending={pending}
                            emAcao={emAcao}
                            onTrocar={(mentoraId) => trocarMentora(slot, mentoraId)}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={pending}
                            className="text-destructive hover:text-destructive"
                            onClick={(e) => {
                              gatilhoCancelarRef.current = e.currentTarget;
                              setCancelando(slot);
                            }}
                          >
                            <CalendarOffIcon className="size-4" />
                            Cancelar plantão
                          </Button>
                        </div>
                      ) : null}

                      {slot.encerrado && !cancelado ? (
                        <FormularioGravacao slot={slot} pending={pending} />
                      ) : null}
                    </div>
                  );
                })
              )}

              <p aria-live="polite" className="text-xs text-muted-foreground empty:hidden">
                {aviso}
              </p>

              <Button
                variant="outline"
                onClick={() => setModo("novo")}
                disabled={pending}
                className="self-start"
              >
                <PlusIcon className="size-4" /> Novo plantão neste dia
              </Button>
            </div>
          ) : (
            <FormularioSlot
              dataInicial={diaAberto ?? ""}
              slot={typeof modo === "object" ? modo.editando : undefined}
              mentoras={mentoras}
              pending={pending}
              aviso={aviso}
              onCancelar={() => setModo("lista")}
              onSalvar={salvarSlot}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={inscritosAbertos !== null}
        onOpenChange={(v) => {
          if (!v) setInscritosAbertos(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Inscritos</DialogTitle>
            <DialogDescription>
              {inscritosAbertos
                ? `${faixaHorario(inscritosAbertos.horaInicio, inscritosAbertos.duracaoMin)} · ${inscritosAbertos.mentoraNome}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <PlantaoInscritos
            inscritos={inscritosAbertos ? (inscritosPorSlot[inscritosAbertos.slotId] ?? []) : []}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmandoPausa}
        onOpenChange={(v) => {
          if (!v && !alternandoInscricoes) fecharConfirmacaoPausa();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pausar as inscrições?</DialogTitle>
            <DialogDescription>
              Ninguém consegue se inscrever, cancelar ou revelar o link até você
              reabrir. Os plantões continuam visíveis.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={fecharConfirmacaoPausa}
              disabled={alternandoInscricoes}
            >
              Voltar
            </Button>
            <Button onClick={() => alternarInscricoes(false)} disabled={alternandoInscricoes}>
              {alternandoInscricoes ? "Pausando..." : "Pausar inscrições"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {cancelando ? (
        <DialogoCancelamento
          slot={cancelando}
          onFechar={fecharCancelamento}
          onResultado={setAviso}
        />
      ) : null}
    </div>
  );
}

/**
 * "Quem apresenta" — troca a mentora de UM dia sem abrir o formulário inteiro.
 *
 * O `<select>` NÃO dispara a troca sozinho no `onChange`: no Windows, navegar
 * pelas opções com as setas emite um `change` por opção, e cada um viraria uma
 * escrita no banco (e um `aviso_mentora_em` zerado). A confirmação fica num
 * botão, que só aparece quando a escolha muda de verdade.
 *
 * A mentora atual é casada pelo NOME contra a lista (`SlotAdmin` não carrega o
 * uuid). Mentora inativa continua listada enquanto for a do plantão — senão o
 * seletor mostraria outra pessoa como se fosse ela.
 */
function TrocaDeMentora({
  slot,
  mentoras,
  pending,
  emAcao,
  onTrocar,
}: {
  slot: SlotAdmin;
  mentoras: MentoraAdmin[];
  pending: boolean;
  emAcao: boolean;
  onTrocar: (mentoraId: string) => void;
}) {
  const atualId = slot.mentoraId;
  const [escolhida, setEscolhida] = useState(atualId);
  const mudou = escolhida !== "" && escolhida !== atualId;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`mentora-slot-${slot.slotId}`} className="text-xs">
          Quem apresenta
        </Label>
        <select
          id={`mentora-slot-${slot.slotId}`}
          className={CLASSE_SELECT}
          value={escolhida}
          disabled={pending}
          onChange={(e) => setEscolhida(e.target.value)}
        >
          {atualId ? null : (
            <option value="">{slot.mentoraNome || "Escolha a mentora…"}</option>
          )}
          {mentoras
            .filter((m) => m.ativa || m.id === slot.mentoraId)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
        </select>
      </div>
      {mudou ? (
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => onTrocar(escolhida)}
        >
          {emAcao ? "Trocando..." : "Trocar"}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Cancelar é diferente de remover: o plantão fica na agenda com o motivo, as
 * inscrições ativas caem e cada inscrito recebe um e-mail. Por isso o diálogo
 * diz quantas pessoas serão avisadas ANTES do clique e quantas foram avisadas
 * DEPOIS — e-mail que falha não desfaz o cancelamento, e alguém precisa avisar
 * essa pessoa por fora.
 */
function DialogoCancelamento({
  slot,
  onFechar,
  onResultado,
}: {
  slot: SlotAdmin;
  onFechar: (cancelou: boolean) => void;
  onResultado: (msg: string) => void;
}) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function confirmar() {
    setSalvando(true);
    setErro("");
    const res = await cancelarSlot(slot.slotId, motivo.trim());
    setSalvando(false);
    if (!res.ok) {
      setErro(res.erro);
      toast.error(res.erro);
      return;
    }
    // Contadores opcionais no contrato do servidor: sem eles, cai no que a
    // tela já sabe (`inscritosQtd`) em vez de escrever "undefined".
    const inscritos = res.inscritos ?? slot.inscritosQtd;
    const avisados = res.avisados ?? 0;
    const falhas = res.falhas ?? 0;
    onResultado(
      `Plantão cancelado. ${avisados} de ${inscritos} inscrito(s) avisados por e-mail.` +
        (falhas > 0
          ? ` ${falhas} e-mail(s) não saíram — avise essas pessoas por fora.`
          : ""),
    );
    toast.success("Plantão cancelado.");
    router.refresh();
    onFechar(true);
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !salvando) onFechar(false);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar este plantão?</DialogTitle>
          <DialogDescription>
            {rotuloData(slot.data)} · {faixaHorario(slot.horaInicio, slot.duracaoMin)} ·{" "}
            {slot.mentoraNome}
          </DialogDescription>
        </DialogHeader>

        <p className="text-sm">
          {slot.inscritosQtd === 0
            ? "Ninguém está inscrito neste plantão."
            : `${slot.inscritosQtd} inscrito(s) serão avisados por e-mail e a inscrição deles será cancelada.`}{" "}
          O plantão sai do ar para os alunos, mas continua aqui no histórico.
        </p>

        <div className="flex flex-col gap-2">
          <Label htmlFor="cancelar-motivo">Motivo (opcional)</Label>
          <Textarea
            id="cancelar-motivo"
            value={motivo}
            maxLength={300}
            rows={3}
            disabled={salvando}
            aria-describedby="cancelar-motivo-ajuda"
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: a mentora precisou remarcar; volta na semana que vem."
          />
          <p id="cancelar-motivo-ajuda" className="text-xs text-muted-foreground">
            Vai no e-mail dos inscritos. Até 300 caracteres ({motivo.length}/300).
          </p>
        </div>

        <p aria-live="assertive" className="text-xs text-destructive empty:hidden">
          {erro}
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onFechar(false)} disabled={salvando}>
            Voltar
          </Button>
          <Button onClick={confirmar} disabled={salvando}>
            {salvando ? "Cancelando..." : "Cancelar plantão"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FormularioSlot({
  dataInicial,
  slot,
  mentoras,
  pending,
  aviso,
  onCancelar,
  onSalvar,
}: {
  dataInicial: string;
  slot?: SlotAdmin;
  mentoras: MentoraAdmin[];
  pending: boolean;
  /** Mesma mensagem do `aria-live` da lista — o erro da action cai aqui. */
  aviso: string;
  onCancelar: () => void;
  onSalvar: (form: {
    slotId?: string;
    mentoraId?: string;
    data: string;
    horaInicio: string;
    duracaoMin: number;
    zoomUrl?: string;
    observacao?: string;
    repetirSemanas: number;
  }) => void;
}) {
  const [data, setData] = useState(slot?.data ?? dataInicial);
  const [horaInicio, setHoraInicio] = useState(slot?.horaInicio ?? "19:00");
  const [duracaoMin, setDuracaoMin] = useState(String(slot?.duracaoMin ?? 60));
  const [zoomUrl, setZoomUrl] = useState(slot?.zoomUrl ?? "");
  const [observacao, setObservacao] = useState(slot?.observacao ?? "");
  /** Só na criação: repete a mesma configuração nas próximas N semanas. */
  const [repetirSemanas, setRepetirSemanas] = useState(0);
  // Ao editar, a mentora atual vem por `slot.mentoraId` (nunca pelo nome).
  const [mentoraId, setMentoraId] = useState(
    () => slot?.mentoraId ?? "",
  );

  const serie = useMemo(
    () => (repetirSemanas > 0 ? datasDaSerie(data, repetirSemanas) : []),
    [data, repetirSemanas],
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSalvar({
          slotId: slot?.slotId,
          mentoraId,
          data,
          horaInicio,
          duracaoMin: Number(duracaoMin) || 60,
          zoomUrl,
          observacao,
          repetirSemanas,
        });
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="slot-mentora">Mentora</Label>
        <select
          id="slot-mentora"
          value={mentoraId}
          onChange={(e) => setMentoraId(e.target.value)}
          required
          disabled={pending}
          className={CLASSE_SELECT}
        >
          <option value="">Escolha a mentora…</option>
          {mentoras
            .filter((m) => m.ativa || m.id === slot?.mentoraId)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="slot-data">Data</Label>
          <Input
            id="slot-data"
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            required
            disabled={pending}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="slot-hora">Hora de início</Label>
          <Input
            id="slot-hora"
            type="time"
            value={horaInicio}
            onChange={(e) => setHoraInicio(e.target.value)}
            required
            disabled={pending}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="slot-duracao">Duração (minutos)</Label>
        <Input
          id="slot-duracao"
          type="number"
          min={15}
          step={15}
          value={duracaoMin}
          onChange={(e) => setDuracaoMin(e.target.value)}
          required
          disabled={pending}
        />
      </div>

      {!slot ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="slot-repetir">Repetir semanalmente por</Label>
          <select
            id="slot-repetir"
            value={repetirSemanas}
            onChange={(e) => setRepetirSemanas(Number(e.target.value))}
            disabled={pending}
            aria-describedby="slot-repetir-previa"
            className={CLASSE_SELECT}
          >
            <option value={0}>Não repetir (só esta data)</option>
            {Array.from({ length: MAX_REPETICOES }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                mais {n} semana{n > 1 ? "s" : ""}
              </option>
            ))}
          </select>
          <p id="slot-repetir-previa" className="text-xs text-muted-foreground">
            {serie.length > 0
              ? `Cria ${serie.length} plantões: ${serie.map(dataCurta).join(", ")}. Data que já tiver plantão desta mentora no mesmo horário é pulada.`
              : "Cria só o plantão desta data."}
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="slot-zoom">Link do Zoom</Label>
        <Input
          id="slot-zoom"
          type="url"
          placeholder="https://zoom.us/j/..."
          value={zoomUrl}
          onChange={(e) => setZoomUrl(e.target.value)}
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          Sem este link, o plantão não aparece para o aluno mesmo que
          publicado.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="slot-obs">Observação interna (opcional)</Label>
        <Input
          id="slot-obs"
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          disabled={pending}
        />
      </div>

      <p aria-live="polite" className="text-xs text-destructive empty:hidden">
        {aviso}
      </p>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancelar} disabled={pending}>
          Voltar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending
            ? "Salvando..."
            : slot
              ? "Salvar alterações"
              : serie.length > 0
                ? `Criar ${serie.length} plantões`
                : "Criar plantão"}
        </Button>
      </div>
    </form>
  );
}

function FormularioGravacao({ slot, pending }: { slot: SlotAdmin; pending: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [url, setUrl] = useState(slot.gravacaoUrl ?? "");
  const [salvando, setSalvando] = useState(false);

  function salvar() {
    setSalvando(true);
    startTransition(async () => {
      const res = await salvarGravacao(slot.slotId, url);
      setSalvando(false);
      if (!res.ok) {
        toast.error(res.erro);
        return;
      }
      toast.success("Gravação salva.");
      router.refresh();
    });
  }

  return (
    <div className="mt-3 flex items-end gap-2 border-t pt-3">
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor={`gravacao-${slot.slotId}`} className="text-xs">
          URL da gravação (opcional)
        </Label>
        <Input
          id={`gravacao-${slot.slotId}`}
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          disabled={pending || salvando}
        />
      </div>
      <Button size="sm" onClick={salvar} disabled={pending || salvando}>
        {salvando ? "Salvando..." : "Salvar"}
      </Button>
      {slot.gravacaoUrl ? (
        <a
          href={slot.gravacaoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          title="Abrir gravação"
        >
          <ExternalLinkIcon className="size-4" />
        </a>
      ) : null}
    </div>
  );
}
