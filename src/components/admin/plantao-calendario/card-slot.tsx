"use client";

/**
 * O card de UM plantão dentro do diálogo do dia: estado (publicado/rascunho/
 * cancelado), avisos, os botões de editar/publicar/remover, a troca de quem
 * apresenta, o botão de cancelar e — quando o plantão já passou — o campo da
 * gravação.
 *
 * 🔑 Por que tantas props: o card NÃO tem estado nem ação própria. As escritas
 * continuam todas no calendário, numa transição só, para que o `pending`
 * desabilite os botões de TODOS os cards enquanto uma delas roda. Passar os
 * `set*` e o `ref` de cima é o que permitiu cortar este arquivo sem mudar uma
 * linha de comportamento: os handlers são os mesmos, com o mesmo nome.
 */

import type { RefObject } from "react";
import {
  CalendarOffIcon,
  PencilIcon,
  Trash2Icon,
  VideoIcon,
  VideoOffIcon,
  UsersIcon,
  MailXIcon,
} from "lucide-react";
import type { SlotAdmin, MentoraAdmin } from "@/lib/plantao-tipos";
import { faixaHorario } from "@/lib/plantao";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrocaDeMentora } from "./troca-de-mentora";
import { FormularioGravacao } from "./formulario-gravacao";
import type { ModoDialog } from "./tipos";

export function CardSlot({
  slot,
  mentoras,
  pending,
  slotEmAcao,
  gatilhoCancelarRef,
  registrarCard,
  setModo,
  setInscritosAbertos,
  setCancelando,
  togglePublicar,
  remover,
  trocarMentora,
}: {
  slot: SlotAdmin;
  mentoras: MentoraAdmin[];
  pending: boolean;
  /** Slot com ação em voo — o rótulo de carregamento sai só no card certo. */
  slotEmAcao: string | null;
  gatilhoCancelarRef: RefObject<HTMLButtonElement | null>;
  /** Guarda o nó do card no mapa do calendário (alvo de foco pós-cancelamento). */
  registrarCard: (el: HTMLDivElement | null) => void;
  setModo: (modo: ModoDialog) => void;
  setInscritosAbertos: (slot: SlotAdmin) => void;
  setCancelando: (slot: SlotAdmin) => void;
  togglePublicar: (slot: SlotAdmin) => void;
  remover: (slot: SlotAdmin) => void;
  trocarMentora: (slot: SlotAdmin, mentoraId: string) => void;
}) {
  const cancelado = slot.canceladoEm !== null;
  const emAcao = slotEmAcao === slot.slotId;
  const semEmailDaMentora = !slot.mentoraEmail;
  const faixa = faixaHorario(slot.horaInicio, slot.duracaoMin);
  return (
    <div
      ref={registrarCard}
      tabIndex={-1}
      className={
        "foco-visivel rounded-lg border p-3 outline-none " +
        (cancelado ? "border-risco-foreground/30 bg-risco" : "")
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={"font-medium " + (cancelado ? "line-through" : "")}>
            {faixa} · {slot.mentoraNome}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {cancelado ? (
              <Badge variant="danger" icone={CalendarOffIcon}>Cancelado
              </Badge>
            ) : (
              <Badge variant={slot.publicado ? "default" : "secondary"}>
                {slot.publicado ? "Publicado" : "Rascunho"}
              </Badge>
            )}
            {!slot.zoomUrl && !cancelado ? (
              <Badge variant="danger" icone={VideoOffIcon}>Sem link do Zoom
              </Badge>
            ) : null}
            <button
              type="button"
              onClick={() => setInscritosAbertos(slot)}
              className="foco-visivel inline-flex items-center gap-1 rounded-full bg-superficie-afundada px-2 py-0.5 text-xs font-medium text-neutro-foreground transition hover:bg-muted hover:text-foreground"
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
        <p className="mt-2 flex items-start gap-1.5 text-xs text-atencao-foreground">
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
}
