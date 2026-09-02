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
 * da mentora e `SlotAdmin` só carrega o nome. Ao editar, a mentora atual é
 * pré-selecionada casando pelo nome contra essa lista.
 */

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CalendarDaysIcon,
  PlusIcon,
  PencilIcon,
  Trash2Icon,
  VideoIcon,
  VideoOffIcon,
  UsersIcon,
  ExternalLinkIcon,
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
} from "@/app/admin/plantao/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PlantaoInscritos } from "@/components/admin/plantao-inscritos";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

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

type ModoDialog = "lista" | "novo" | { editando: SlotAdmin };

export function PlantaoCalendario({
  ano,
  mes,
  slots,
  mentoras,
  inscritosPorSlot,
}: {
  ano: number;
  mes: number;
  slots: SlotAdmin[];
  /** Mentoras disponíveis para o seletor ao criar/editar um plantão. */
  mentoras: MentoraAdmin[];
  /** Inscritos pré-carregados só dos slots com `inscritosQtd > 0` (ver page.tsx). */
  inscritosPorSlot: Record<string, InscritoAdmin[]>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [diaAberto, setDiaAberto] = useState<string | null>(null);
  const [modo, setModo] = useState<ModoDialog>("lista");
  const [inscritosAbertos, setInscritosAbertos] = useState<SlotAdmin | null>(null);

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
  }

  function abrirDia(iso: string) {
    setDiaAberto(iso);
    setModo("lista");
  }

  function togglePublicar(slot: SlotAdmin) {
    startTransition(async () => {
      const res = await publicarSlot(slot.slotId, !slot.publicado);
      if (!res.ok) {
        toast.error(res.erro);
        return;
      }
      toast.success(slot.publicado ? "Plantão despublicado." : "Plantão publicado.");
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
    startTransition(async () => {
      const res = await removerSlot(slot.slotId);
      if (!res.ok) {
        toast.error(res.erro);
        return;
      }
      toast.success("Plantão removido.");
      router.refresh();
    });
  }

  function salvarSlot(form: {
    slotId?: string;
    mentoraId?: string;
    data: string;
    horaInicio: string;
    duracaoMin: number;
    zoomUrl?: string;
    observacao?: string;
  }) {
    // Guarda de integridade: sem o uuid da mentora, gravar mandaria
    // `mentora_id` vazio para o banco. O seletor é `required`, então isto só
    // dispara se alguém contornar o formulário.
    if (!form.mentoraId) {
      toast.error("Escolha a mentora do plantão.");
      return;
    }

    startTransition(async () => {
      const res = form.slotId
        ? await editarSlot({
            slotId: form.slotId,
            mentoraId: form.mentoraId as string,
            data: form.data,
            horaInicio: form.horaInicio,
            duracaoMin: form.duracaoMin,
            zoomUrl: form.zoomUrl,
            observacao: form.observacao,
          })
        : await criarSlot({
            mentoraId: form.mentoraId as string,
            data: form.data,
            horaInicio: form.horaInicio,
            duracaoMin: form.duracaoMin,
            observacao: form.observacao,
          });

      if (!res.ok) {
        toast.error(res.erro);
        return;
      }
      toast.success(form.slotId ? "Plantão atualizado." : "Plantão criado.");
      router.refresh();
      setModo("lista");
    });
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-2 rounded-xl border bg-card p-3 shadow-sm">
        <Link
          href={`/admin/plantao?m=${paramMes(anterior.ano, anterior.mes)}`}
          className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label="Mês anterior"
        >
          <ChevronLeftIcon className="size-4" />
        </Link>
        <div className="flex items-center gap-1.5 font-medium capitalize">
          <CalendarDaysIcon className="size-4 text-primary" aria-hidden />
          {MESES[mes - 1]} de {ano}
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
                  </span>
                ) : null}
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
        <DialogContent className="max-h-[85vh] overflow-y-auto">
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
                slotsDoDia.map((slot) => (
                  <div key={slot.slotId} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium">
                          {faixaHorario(slot.horaInicio, slot.duracaoMin)} ·{" "}
                          {slot.mentoraNome}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Badge variant={slot.publicado ? "default" : "secondary"}>
                            {slot.publicado ? "Publicado" : "Rascunho"}
                          </Badge>
                          {!slot.zoomUrl ? (
                            <Badge variant="destructive" className="gap-1">
                              <VideoOffIcon className="size-3" /> Sem link do Zoom
                            </Badge>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => setInscritosAbertos(slot)}
                            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground transition hover:bg-muted/70 hover:text-foreground"
                          >
                            <UsersIcon className="size-3" /> {slot.inscritosQtd} inscrito(s)
                          </button>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={pending}
                          onClick={() => setModo({ editando: slot })}
                          title="Editar"
                        >
                          <PencilIcon className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={pending}
                          onClick={() => togglePublicar(slot)}
                          title={slot.publicado ? "Despublicar" : "Publicar"}
                        >
                          {slot.publicado ? (
                            <VideoOffIcon className="size-4" />
                          ) : (
                            <VideoIcon className="size-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={pending}
                          onClick={() => remover(slot)}
                          className="text-muted-foreground hover:text-destructive"
                          title="Remover"
                        >
                          <Trash2Icon className="size-4" />
                        </Button>
                      </div>
                    </div>

                    {slot.encerrado ? (
                      <FormularioGravacao slot={slot} pending={pending} />
                    ) : null}
                  </div>
                ))
              )}

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
    </div>
  );
}

function FormularioSlot({
  dataInicial,
  slot,
  mentoras,
  pending,
  onCancelar,
  onSalvar,
}: {
  dataInicial: string;
  slot?: SlotAdmin;
  mentoras: MentoraAdmin[];
  pending: boolean;
  onCancelar: () => void;
  onSalvar: (form: {
    slotId?: string;
    mentoraId?: string;
    data: string;
    horaInicio: string;
    duracaoMin: number;
    zoomUrl?: string;
    observacao?: string;
  }) => void;
}) {
  const [data, setData] = useState(slot?.data ?? dataInicial);
  const [horaInicio, setHoraInicio] = useState(slot?.horaInicio ?? "19:00");
  const [duracaoMin, setDuracaoMin] = useState(String(slot?.duracaoMin ?? 60));
  const [zoomUrl, setZoomUrl] = useState(slot?.zoomUrl ?? "");
  const [observacao, setObservacao] = useState(slot?.observacao ?? "");
  // Ao editar, a mentora atual chega só pelo nome (SlotAdmin não carrega id);
  // casa pelo nome contra a lista para pré-selecionar o valor certo.
  const [mentoraId, setMentoraId] = useState(
    () => mentoras.find((m) => m.nome === slot?.mentoraNome)?.id ?? "",
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
          className="border-input bg-background focus-visible:ring-ring/50 h-9 rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
        >
          <option value="">Escolha a mentora…</option>
          {mentoras
            .filter((m) => m.ativa || m.nome === slot?.mentoraNome)
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

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancelar} disabled={pending}>
          Cancelar
        </Button>
        <Button
          type="submit"
          // Criar OU editar exige mentoraId (uuid); sem uma leitura de
          // mentoras no backend não há id confiável para enviar em nenhum
          // dos dois casos — ver nota de divergência no topo do arquivo.
          disabled
          title="Falta a lista de mentoras no backend (id + nome) para salvar com segurança"
        >
          {slot ? "Salvar alterações" : "Criar plantão"}
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
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
          title="Abrir gravação"
        >
          <ExternalLinkIcon className="size-4" />
        </a>
      ) : null}
    </div>
  );
}
