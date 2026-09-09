"use client";

/**
 * Plantão de Dúvidas — Acelera Holding. Calendário mensal editável (admin).
 *
 * ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
 * (commit b457005) e PROIBIDO de reconstruir.
 *
 * PORTA o padrão de grade/estado/dialog/toast de
 * `git show b457005^:src/components/admin/reunioes-calendario.tsx`. Sem
 * capacidade/vaga: o admin só vê `inscritosQtd` (a "noção prévia de
 * participantes" pedida pela equipe) — nunca um teto.
 *
 * A lista de mentoras chega por prop (`getMentoras()` em
 * `src/lib/plantao-data.ts`), porque `criarSlot`/`editarSlot` exigem o uuid
 * da mentora. `SlotAdmin` traz `mentoraId`: ao editar — e no seletor inline
 * "Quem apresenta" — a mentora atual é pré-selecionada pelo ID, nunca pelo
 * nome (duas mentoras homônimas fariam um "salvar só o link" reatribuir a
 * mentora em silêncio e zerar o aviso de véspera).
 *
 * FASE 8 (08/09/2026) — autonomia das operadoras, sem dev no meio: interruptor
 * "Inscrições abertas/pausadas" (`gps.config`, chave `plantao_inscricao_aberta`;
 * `gps.plantao_config` virou degrau de compatibilidade na migração ...130);
 * trocar quem apresenta no card do dia (`trocarMentoraSlot` zera
 * `aviso_mentora_em` no servidor, senão a mentora nova nunca é avisada);
 * cancelar com inscritos avisando por e-mail (`cancelarSlot` — cancelado NÃO é
 * apagado, vira estado com motivo); e criar a série semanal de uma vez.
 *
 * ONDA 3 (09/09/2026) — o arquivo tinha 1212 linhas e sete assuntos juntos
 * (CD5). Foi cortado POR RESPONSABILIDADE, sem uma linha de lógica nova:
 *
 *   interruptor-inscricoes.tsx  a barra "abertas/pausadas" e a pausa
 *   grade-mes.tsx               navegação do mês + quadro de 7 colunas
 *   card-slot.tsx               o card de um plantão dentro do diálogo do dia
 *   troca-de-mentora.tsx        "Quem apresenta", sem abrir o formulário
 *   dialogo-cancelamento.tsx    cancelar (≠ remover), com aviso por e-mail
 *   dialogo-inscritos.tsx       a lista de inscritos de um slot
 *   formulario-slot.tsx         criar/editar + a prévia da série semanal
 *   formulario-gravacao.tsx     URL da gravação, só em plantão encerrado
 *   datas-da-serie.ts           aritmética de data, sem React — testável
 *   foco.ts · tipos.ts          o que os arquivos acima dividem
 *
 * 🔑 Aqui ficou o que É compartilhado: o estado do diálogo do dia, o mapa
 * `data → plantões` e as TRÊS escritas de um slot (publicar, remover, trocar
 * mentora) — todas na MESMA `useTransition`, para o `pending` desabilitar os
 * botões de todos os cards. Escrita nova nasce aqui; JSX novo, no assunto.
 */

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlusIcon } from "lucide-react";
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
  trocarMentoraSlot,
} from "@/app/admin/plantao/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { CardSlot } from "./card-slot";
import { DialogoCancelamento } from "./dialogo-cancelamento";
import { DialogoInscritos } from "./dialogo-inscritos";
import { FormularioSlot } from "./formulario-slot";
import { GradeMes } from "./grade-mes";
import { InterruptorInscricoes } from "./interruptor-inscricoes";
import { dataCurta } from "./datas-da-serie";
import { devolverFoco } from "./foco";
import type { ModoDialog } from "./tipos";

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
   * Interruptor geral das escritas do aluno (`gps.config`, chave
   * `plantao_inscricao_aberta`), lido no servidor por
   * `lerInscricoesAbertas()`. Pausado = ninguém se inscreve,
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
  /** Texto do `aria-live` do diálogo do dia (troca de mentora, criação, cancelamento). */
  const [aviso, setAviso] = useState("");
  /** Slot com ação em voo — o rótulo de carregamento sai só no card certo. */
  const [slotEmAcao, setSlotEmAcao] = useState<string | null>(null);

  // Foco de volta ao gatilho quando um diálogo fecha. O card é o alvo de
  // reserva: depois de cancelar, o próprio botão "Cancelar plantão" some da
  // tela e o foco iria parar no <body>.
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
      <InterruptorInscricoes
        inscricoesAbertas={inscricoesAbertas}
        pending={pending}
        startTransition={startTransition}
      />

      <GradeMes ano={ano} mes={mes} porDia={porDia} abrirDia={abrirDia} />

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
                slotsDoDia.map((slot) => (
                  <CardSlot
                    key={slot.slotId}
                    slot={slot}
                    mentoras={mentoras}
                    pending={pending}
                    slotEmAcao={slotEmAcao}
                    gatilhoCancelarRef={gatilhoCancelarRef}
                    registrarCard={(el) => {
                      cardsRef.current.set(slot.slotId, el);
                    }}
                    setModo={setModo}
                    setInscritosAbertos={setInscritosAbertos}
                    setCancelando={setCancelando}
                    togglePublicar={togglePublicar}
                    remover={remover}
                    trocarMentora={trocarMentora}
                  />
                ))
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

      <DialogoInscritos
        inscritosAbertos={inscritosAbertos}
        inscritosPorSlot={inscritosPorSlot}
        setInscritosAbertos={setInscritosAbertos}
      />

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
