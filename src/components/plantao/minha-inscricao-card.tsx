"use client";

/**
 * Plantão de Dúvidas — Acelera Holding. Card da inscrição ativa do aluno.
 *
 * ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
 * (commit b457005) e PROIBIDO de reconstruir.
 *
 * Três estados:
 * - antes da janela → contagem regressiva ("a sala abre 1 hora antes");
 * - dentro da janela → botão "Entrar na sala", que AVISA antes de revelar
 *   (revelar confirma presença) — idempotente: reclicar não duplica nada;
 * - depois → "esta sala já encerrou" (some o botão de entrar; NPS mora em
 *   `NpsForm`, componente separado, renderizado por quem chama este card).
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClockIcon, CheckCircle2Icon, CopyIcon, VideoIcon, XCircleIcon } from "lucide-react";
import type { MinhaInscricao } from "@/lib/plantao-tipos";
import { rotuloData } from "@/lib/plantao";
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


/**
 * Só deixa virar `<a href>` o que for http(s).
 *
 * Defesa em profundidade: a validação principal está em `editarSlot`
 * (`src/app/admin/plantao/actions.ts`), mas React NÃO neutraliza
 * `javascript:` em `href` — se um valor antigo ou gravado por outro caminho
 * chegar aqui, o link não é renderizado como clicável.
 */
function urlSegura(valor: string): boolean {
  try {
    const p = new URL(valor).protocol;
    return p === "https:" || p === "http:";
  } catch {
    return false;
  }
}

export function MinhaInscricaoCard({
  inscricao,
}: {
  inscricao: MinhaInscricao;
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
        <CardContent className="flex items-center gap-3 pt-5">
          <XCircleIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 text-sm">
            <p className="font-medium">Esta sala já encerrou.</p>
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
      const res = await revelarLink(inscricao.inscricaoId);
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
      const res = await cancelar(inscricao.inscricaoId);
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
    // `inicio_em` não vem pronto aqui — reconstituído a partir de data+hora
    // (mesmo fuso usado no restante do módulo: o servidor já decide
    // `janelaAberta`, isto é só para a contagem regressiva visual).
    const [ano, mes, dia] = inscricao.data.split("-").map(Number);
    const [hh, mm] = inscricao.horaInicio.split(":").map(Number);
    return new Date(ano, mes - 1, dia, hh, mm).getTime();
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
              <div className="flex items-center gap-1.5 text-sm font-medium text-primary">
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
          ) : (
            <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
              <p className="text-sm text-muted-foreground">
                A sala está aberta. Ao entrar, sua presença é confirmada.
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

        {!presencaJaConfirmada ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={cancelarInscricao}
            disabled={pending}
            className="self-start text-muted-foreground hover:text-destructive"
          >
            Cancelar inscrição
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
