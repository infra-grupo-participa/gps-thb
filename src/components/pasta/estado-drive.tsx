"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ExternalLink, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { agendaDeIntervalos, esperaFinal } from "@/lib/atualizar-pasta";
import {
  ROTULO_SITUACAO,
  TEXTO_AVISO,
  type EstadoPastaDrive,
} from "@/lib/drive-tipos";

export const TEXTO_PAROU =
  "Ainda estamos preparando a pasta. Atualize a página daqui a alguns minutos.";

/**
 * Releitura da página ENQUANTO `criando`, com recuo progressivo (5, 10, 20 e
 * 30 s) e parada depois de 3 min de aba visível (`src/lib/atualizar-pasta.ts`).
 * Aba oculta pausa o relógio; ao voltar, retoma do passo em que estava. Ao
 * parar, `parou` vira `true` e `atualizarAgora` faz uma releitura e reinicia o
 * ciclo. Tudo morre quando `criando` vira `false` e no unmount.
 */
export function useAtualizarEnquantoCriando(criando: boolean) {
  const router = useRouter();
  const [parou, setParou] = useState(false);
  const [ciclo, setCiclo] = useState(0);

  useEffect(() => {
    if (!criando) return;
    const esperas = agendaDeIntervalos();
    let passo = 0;
    let fim = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function agendar() {
      if (fim) return;
      if (passo < esperas.length) {
        timer = setTimeout(() => {
          timer = undefined;
          passo += 1;
          router.refresh();
          agendar();
        }, esperas[passo]);
      } else {
        timer = setTimeout(() => {
          timer = undefined;
          fim = true;
          setParou(true);
        }, esperaFinal());
      }
    }
    function aoMudarVisibilidade() {
      if (document.visibilityState === "hidden") {
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
      } else if (timer === undefined) {
        agendar();
      }
    }

    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    if (document.visibilityState === "visible") agendar();
    return () => {
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
      if (timer !== undefined) clearTimeout(timer);
      setParou(false);
    };
  }, [criando, ciclo, router]);

  const atualizarAgora = useCallback(() => {
    router.refresh();
    setCiclo((c) => c + 1);
  }, [router]);

  return { parou: criando && parou, atualizarAgora };
}

/** Aviso de leitura que falhou: nunca vira "sem pasta". */
export function AvisoLeituraDrive() {
  return (
    <p
      role="alert"
      className="flex items-start gap-1.5 text-base font-medium text-risco-foreground"
    >
      <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
      Não deu para conferir a pasta no Drive. Recarregue a página.
    </p>
  );
}

/**
 * Região viva com o estado do pedido: criando (spinner + texto), pronta (link)
 * ou erro (a frase). `nenhuma` não escreve nada. Quem usa chama
 * `useAtualizarEnquantoCriando`.
 */
export function EstadoPasta({
  estado,
  textoCriando,
  mostrarLink = true,
  mostrarAvisos = false,
  parou = false,
  onAtualizarAgora,
}: {
  estado: EstadoPastaDrive;
  textoCriando: string;
  mostrarLink?: boolean;
  mostrarAvisos?: boolean;
  /** A releitura automática parou: troca o texto e oferece "Atualizar agora". */
  parou?: boolean;
  onAtualizarAgora?: () => void;
}) {
  const { situacao } = estado;
  return (
    <div
      role="status"
      aria-live="polite"
      className="grid gap-2 text-base empty:hidden"
    >
      {situacao === "criando" && parou ? (
        <div className="grid justify-items-start gap-2">
          <p className="flex items-start gap-2 font-medium">
            <AlertCircle aria-hidden className="mt-0.5 size-5 shrink-0" />
            <span>{TEXTO_PAROU}</span>
          </p>
          {onAtualizarAgora ? (
            <Button
              type="button"
              size="lg"
              className="min-h-11 text-base"
              onClick={onAtualizarAgora}
            >
              <RefreshCw aria-hidden />
              Atualizar agora
            </Button>
          ) : null}
        </div>
      ) : null}
      {situacao === "criando" && !parou ? (
        <p className="flex items-start gap-2 font-medium">
          <Loader2
            aria-hidden
            className="mt-0.5 size-5 shrink-0 animate-spin"
          />
          <span>
            <span className="sr-only">{ROTULO_SITUACAO.criando} </span>
            {textoCriando}
          </span>
        </p>
      ) : null}
      {situacao === "pronta" && mostrarLink && estado.url ? (
        <p>
          <span className="font-medium">{ROTULO_SITUACAO.pronta}. </span>
          <a
            href={estado.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent-foreground underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Abrir a pasta no Drive
            <ExternalLink aria-hidden className="size-5" />
            <span className="sr-only"> (abre em nova aba)</span>
          </a>
        </p>
      ) : null}
      {situacao === "erro" ? (
        <p className="flex items-start gap-1.5 font-medium text-risco-foreground">
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            {ROTULO_SITUACAO.erro}. {estado.erro}
          </span>
        </p>
      ) : null}
      {mostrarAvisos
        ? estado.avisos.map((a) => (
            <p
              key={a}
              className="flex items-start gap-1.5 font-medium text-risco-foreground"
            >
              <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
              {TEXTO_AVISO[a]}
            </p>
          ))
        : null}
    </div>
  );
}
