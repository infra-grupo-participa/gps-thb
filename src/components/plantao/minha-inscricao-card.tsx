"use client";

/**
 * Plantão de Dúvidas — Acelera Holding. Card da inscrição ativa do aluno.
 *
 * ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
 * (commit b457005) e PROIBIDO de reconstruir.
 *
 * Três estados:
 * - antes da janela → contagem regressiva ("a sala abre 1 hora antes") +
 *   botão "Cancelar inscrição";
 * - dentro da janela — de 1h ANTES até o FIM da sessão, não até o início
 *   (decisão do Marcio, 09/09/2026: quem chega atrasado ainda entra) →
 *   botão "Entrar na sala", que AVISA antes de revelar
 *   (revelar confirma presença) — idempotente: reclicar não duplica nada;
 *   o botão de cancelar SOME e vira aviso ("o prazo para cancelar
 *   terminou") — `janelaAberta` é o mesmo instante em que a sala libera e
 *   em que `cancelar()` passa a recusar no servidor, então a UI antecipa
 *   isso em vez de deixar a pessoa descobrir só no clique;
 * - depois → "esta sala já encerrou" (some o botão de entrar; NPS mora em
 *   `NpsForm`, componente separado, renderizado por quem chama este card).
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClockIcon, CheckCircle2Icon, CopyIcon, VideoIcon, XCircleIcon } from "lucide-react";
import type { MinhaInscricao } from "@/lib/plantao-tipos";
import { rotuloData, urlSegura } from "@/lib/plantao";
import { cancelar, revelarLink } from "@/app/p/plantao/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** "1h 20min" / "45min" a partir de milissegundos restantes. */
function formatarContagem(ms: number): string {
  const totalMin = Math.max(0, Math.ceil(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (h > 0) return `${h}h ${min}min`;
  return `${min}min`;
}


export function MinhaInscricaoCard({
  inscricao,
  email,
}: {
  inscricao: MinhaInscricao;
  /** E-mail informado no formulário de identificação — dono da inscrição. */
  email: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => Date.now());

  // Recalcula a cada 30s só para manter a contagem regressiva viva — a
  // decisão de "janela aberta" continua vindo do servidor a cada refresh.
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (inscricao.encerrado) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3">
          <XCircleIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 text-sm">
            <p className="font-medium">Este plantão já foi encerrado.</p>
            <p className="text-muted-foreground">
              {rotuloData(inscricao.data)} às {inscricao.horaInicio} com{" "}
              {inscricao.mentoraNome}.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  function confirmarEEntrar() {
    if (
      !window.confirm(
        "Ao entrar na sala agora, sua presença neste plantão fica confirmada. Continuar?",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await revelarLink(email, inscricao.inscricaoId);
      if (!res.ok) {
        toast.error(res.erro);
        return;
      }
      setZoomUrl(res.zoomUrl ?? null);
      toast.success("Presença confirmada.");
      router.refresh();
    });
  }

  function copiarLink() {
    if (!zoomUrl) return;
    navigator.clipboard?.writeText(zoomUrl);
    toast.success("Link copiado.");
  }

  function cancelarInscricao() {
    if (
      !window.confirm(
        `Cancelar sua inscrição no plantão de ${rotuloData(inscricao.data)} às ${inscricao.horaInicio}?`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await cancelar(email, inscricao.inscricaoId);
      if (!res.ok) {
        toast.error(res.erro);
        return;
      }
      toast.success("Inscrição cancelada.");
      router.refresh();
    });
  }

  // Presença já confirmada nesta sessão (ou em visita anterior) — idempotente:
  // mostra o link de novo sem precisar reconfirmar nem duplicar nada.
  const presencaJaConfirmada = Boolean(inscricao.presencaEm) || zoomUrl !== null;

  const inicioMs = (() => {
    // `inicio_em` não vem pronto aqui — reconstituído a partir de data+hora.
    //
    // ⚠️ O horário do plantão é sempre em America/Sao_Paulo, e `new Date(ano,
    // mes, dia, hh, mm)` monta no fuso do NAVEGADOR: para um aluno em Lisboa
    // ou em Manaus a contagem regressiva erraria em horas. Como o Brasil não
    // usa mais horário de verão, o offset é fixo em -03:00 — montar a partir
    // do ISO com o offset explícito resolve sem depender de biblioteca.
    //
    // Isto é só o texto da contagem: quem decide se a janela abriu continua
    // sendo o servidor (`janelaAberta`).
    const iso = `${inscricao.data}T${inscricao.horaInicio}:00-03:00`;
    return new Date(iso).getTime();
  })();
  const faltamMs = inicioMs - agora;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Seu plantão</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="text-sm">
          <p className="font-medium">
            {rotuloData(inscricao.data)} · {inscricao.horaInicio}
          </p>
          <p className="text-muted-foreground">com {inscricao.mentoraNome}</p>
        </div>

        {inscricao.janelaAberta ? (
          presencaJaConfirmada ? (
            <div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/[0.04] p-3">
              <div className="flex items-center gap-1.5 text-sm font-medium text-accent-foreground">
                <CheckCircle2Icon className="size-4" aria-hidden />
                Presença confirmada
              </div>
              {zoomUrl && urlSegura(zoomUrl) ? (
                <>
                  <p className="truncate text-sm text-muted-foreground" title={zoomUrl}>
                    {zoomUrl}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={zoomUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/80"
                    >
                      <VideoIcon className="size-4" /> Abrir a sala
                    </a>
                    <Button variant="outline" size="sm" onClick={copiarLink}>
                      <CopyIcon className="size-4" /> Copiar link
                    </Button>
                  </div>
                </>
              ) : (
                <Button size="sm" onClick={confirmarEEntrar} disabled={pending}>
                  <VideoIcon className="size-4" /> Ver o link novamente
                </Button>
              )}
            </div>
          ) : !inscricao.temSala ? (
            // Sem sala cadastrada ainda: NÃO oferecer "Entrar". O clique
            // gravaria presença e só então falharia com "Link indisponível" —
            // presença registrada numa sala que não existe. Publicar deixou de
            // exigir `zoom_url` (08/09/2026), então este estado é normal, não
            // um erro: a inscrição vale, só a sala ainda não foi definida.
            <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
              <p className="text-sm text-muted-foreground">
                Sua vaga está garantida. O link da sala ainda não foi
                divulgado — ele aparece aqui assim que a equipe publicar.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
              <p className="text-sm text-muted-foreground">
                A sala está aberta até o fim do plantão. Ao entrar, sua
                presença é confirmada.
              </p>
              <Button onClick={confirmarEEntrar} disabled={pending} className="self-start">
                <VideoIcon className="size-4" />{" "}
                {pending ? "Entrando..." : "Entrar na sala"}
              </Button>
            </div>
          )
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
            <CalendarClockIcon className="size-4 shrink-0" aria-hidden />
            {faltamMs > 0
              ? `A sala abre 1 hora antes do início — faltam ${formatarContagem(faltamMs)}.`
              : "A sala abre 1 hora antes do início."}
          </div>
        )}

        {/*
          🔑 Decide por `podeCancelar`, que o BANCO calcula
          (`plantao_minha_inscricao`) espelhando exatamente a trava de
          `plantao_cancelar` — inclusive o "só trava se houver sala".

          Decidir por `janelaAberta` (só tempo) mentia duas vezes quando o
          plantão ainda não tem `zoom_url`: escondia o botão que o servidor
          aceitaria, e dizia "a sala já foi liberada" sem sala nenhuma. Era o
          caso dos 3 plantões reais de setembro, todos sem Zoom.
        */}
        {!inscricao.podeCancelar ? (
          <p className="text-xs text-muted-foreground">
            {inscricao.temSala
              ? "O prazo para cancelar terminou — a sala já foi liberada."
              : "O prazo para cancelar terminou."}
          </p>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={cancelarInscricao}
            disabled={pending}
            className="self-start text-muted-foreground hover:text-destructive"
          >
            Cancelar inscrição
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
