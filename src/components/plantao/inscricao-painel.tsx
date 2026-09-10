"use client";

/**
 * Plantão de Dúvidas — Acelera Holding. Painel do dia (dentro do dialog do
 * calendário): lista os plantões do dia e permite se inscrever.
 *
 * ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
 * (commit b457005) e PROIBIDO de reconstruir.
 *
 * Regra de negócio: 1 inscrição ativa por vez — só escolhe outra depois que
 * a anterior passar. Cancelamento vale só até 1h antes do início — dali em
 * diante a sala é liberada e some a possibilidade de cancelar (avisado ANTES
 * de o aluno se inscrever, não só no clique de cancelar).
 *
 * Sem limite de vagas: a contagem de participantes aparece (decisão do Marcio,
 * 08/09/2026 — o aluno escolhe melhor o horário sabendo o movimento), mas
 * NUNCA existe estado "esgotado" e NUNCA se mostra QUEM está inscrito. É
 * número agregado; nome de participante é dado de terceiro.
 *
 * `aoInscrever` é INJETADA (default = a Server Action pública, por e-mail).
 * A aba logada do Programa (`/plantao`) passa a própria — que identifica a
 * pessoa pela SESSÃO e não recebe e-mail/nome nenhum — sem duplicar este
 * componente. Ver `src/app/plantao/actions.ts`.
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserRoundIcon, UsersIcon, ClockIcon } from "lucide-react";
import type { SlotPublico, MinhaInscricao, ResultadoAcao } from "@/lib/plantao-tipos";
import { faixaHorario, rotuloData } from "@/lib/plantao";
import { inscrever as inscreverPublico } from "@/app/p/plantao/actions";
import { Button } from "@/components/ui/button";

/**
 * Contagem de participantes em texto.
 *
 * Zero NÃO vira "0 participantes": num plantão sem limite de vagas, isso só
 * desencoraja quem chegou primeiro, sem informar nada útil. "Seja o primeiro"
 * diz a mesma verdade e convida em vez de esvaziar.
 */
function rotuloParticipantes(qtd: number): string {
  if (qtd <= 0) return "Seja o primeiro";
  if (qtd === 1) return "1 participante";
  return `${qtd} participantes`;
}

export function InscricaoPainel({
  slots,
  email,
  nome,
  minhaInscricaoAtiva,
  onConcluido,
  aoInscrever,
}: {
  slots: SlotPublico[];
  /**
   * E-mail informado no formulário de identificação (rota pública), ou
   * `null` na aba logada — ali a identidade é a SESSÃO, resolvida no
   * servidor, e este componente nunca lê nem envia e-mail.
   */
  email: string | null;
  /** Nome informado junto com o e-mail. `null` na aba logada, pelo mesmo motivo. */
  nome: string | null;
  /** Inscrição ativa (não encerrada) do aluno, em QUALQUER dia — trava escolher outro plantão. */
  minhaInscricaoAtiva: MinhaInscricao | null;
  onConcluido: () => void;
  /**
   * Ação de inscrição. Default = rota pública (`inscrever(email, nome,
   * slotId)`, por e-mail). A aba logada passa a própria Server Action, que
   * ignora `email`/`nome` e identifica a pessoa por `gps.pessoa_atual()`.
   */
  aoInscrever?: (
    email: string | null,
    nome: string | null,
    slotId: string,
  ) => Promise<ResultadoAcao>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const inscreverAcao = aoInscrever ?? inscreverPublico;

  // Na rota pública a identificação é obrigatória (o e-mail é a identidade);
  // na aba logada não há e-mail/nome nenhum para pedir — a sessão já basta.
  const exigeIdentificacao = !aoInscrever;
  const identificado = exigeIdentificacao ? Boolean(email && nome) : true;
  const temInscricaoAtiva = minhaInscricaoAtiva !== null;
  const minha = slots.find((s) => s.minhaInscricao);

  function inscreverNoSlot(slot: SlotPublico) {
    if (exigeIdentificacao && (!email || !nome)) {
      toast.error("Informe seu nome e e-mail antes de se inscrever.");
      return;
    }
    startTransition(async () => {
      // Na aba logada `email`/`nome` são null de propósito: a action da aba
      // resolve a pessoa pela SESSÃO e ignora os dois primeiros argumentos.
      // O guard acima já garante que a rota pública nunca chega aqui sem eles.
      const res = await inscreverAcao(email ?? "", nome ?? "", slot.slotId);
      if (!res.ok) {
        toast.error(res.erro);
        return;
      }
      toast.success(
        `Inscrição confirmada: ${rotuloData(slot.data)} às ${slot.horaInicio} com ${slot.mentoraNome}.`,
      );
      router.refresh();
      onConcluido();
    });
  }

  if (slots.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum plantão liberado neste dia.
      </p>
    );
  }

  // Compreendida, não só sofrida: explica o motivo e qual é a inscrição
  // vigente, em vez de só desabilitar o botão.
  if (temInscricaoAtiva && !minha && minhaInscricaoAtiva) {
    return (
      <p className="rounded-lg border border-dashed bg-muted/40 p-3 text-sm text-muted-foreground">
        Você já está inscrito no plantão de {rotuloData(minhaInscricaoAtiva.data)}{" "}
        às {minhaInscricaoAtiva.horaInicio} com {minhaInscricaoAtiva.mentoraNome}{" "}
        — poderá escolher outro depois que ele acontecer.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {!identificado ? (
        <p
          id="inscricao-precisa-identificar"
          className="rounded-lg border border-dashed bg-muted/40 p-2.5 text-xs text-muted-foreground"
        >
          Para se inscrever, primeiro{" "}
          <a
            href="#identificacao"
            className="font-medium text-accent-foreground underline underline-offset-4 hover:no-underline"
          >
            informe seu nome e e-mail
          </a>
          .
        </p>
      ) : (
        <div className="space-y-2">
          {/*
            Prazo de inscrição. A regra vive no banco
            (`gps.plantao_prazo_inscricao`), e a data da virada em
            `gps.config.plantao_cutoff_vespera_desde` — este texto precisa
            acompanhar se a data mudar. Decisão do Marcio em 10/09/2026:
            esta semana continua valendo até 1h antes; a partir de 14/09
            volta o cut-off do calendário oficial do Acelera.
          */}
          <p className="rounded-lg border border-primary/30 bg-primary/[0.06] p-2.5 text-xs text-foreground">
            <strong>Prazo de inscrição:</strong> a partir de{" "}
            <strong>14 de setembro</strong>, as inscrições se encerram às{" "}
            <strong>12h do dia anterior</strong> ao plantão. Nesta semana, você
            ainda pode se inscrever até 1 hora antes do início.
          </p>
          <p className="rounded-lg border border-dashed bg-muted/40 p-2.5 text-xs text-muted-foreground">
            Você pode cancelar a qualquer momento até 1 hora antes do início — a
            partir daí a sala é liberada e o cancelamento não é mais possível.
          </p>
        </div>
      )}
      {slots.map((slot) => {
        const ehMinha = slot.minhaInscricao;
        return (
          <div
            key={slot.slotId}
            className={
              "flex items-center justify-between gap-3 rounded-lg border p-3 " +
              (ehMinha ? "border-primary/40 bg-primary/[0.04]" : "")
            }
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <ClockIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                {faixaHorario(slot.horaInicio, slot.duracaoMin)}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <UserRoundIcon className="size-3.5 shrink-0" aria-hidden />
                  {slot.mentoraNome}
                </span>
                <span aria-hidden className="text-muted-foreground/40">
                  ·
                </span>
                <span className="flex items-center gap-1.5">
                  <UsersIcon className="size-3.5 shrink-0" aria-hidden />
                  {rotuloParticipantes(slot.inscritosQtd)}
                </span>
              </div>
            </div>

            {ehMinha ? (
              <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-accent-foreground">
                Você está aqui
              </span>
            ) : slot.encerrado ? (
              <span className="shrink-0 text-xs text-muted-foreground">
                Encerrado
              </span>
            ) : slot.inscricaoEncerrada ? (
              /*
                Inscrições fechadas. Desde 08/09/2026 isso é o mesmo que "já
                começou" — o cut-off de 12:00 da véspera saiu (decisão do
                Marcio: dá para agendar até o início).

                O ramo continua aqui de propósito: `inscricao_encerrada` é
                calculado por `plantao_calendario` espelhando exatamente a
                trava de `plantao_inscrever`. Se um prazo voltar (o calendário
                oficial do Acelera ainda o prevê), muda só a expressão no
                banco — esta tela não precisa ser tocada.
              */
              <span className="shrink-0 text-right text-xs text-muted-foreground">
                Inscrições
                <br />
                encerradas
              </span>
            ) : (
              <Button
                size="sm"
                disabled={pending || temInscricaoAtiva || !identificado}
                aria-disabled={pending || temInscricaoAtiva || !identificado}
                aria-describedby={
                  !identificado ? "inscricao-precisa-identificar" : undefined
                }
                title={
                  !identificado
                    ? "Informe seu nome e e-mail para se inscrever"
                    : undefined
                }
                onClick={() => inscreverNoSlot(slot)}
              >
                Inscrever
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
