"use client";

/**
 * Status e parecer da EQUIPE sobre uma versão de minuta (migração `…341`,
 * decisão do João 02/10/2026, card 86akryphf). Sem integração com o gerador
 * de minutas.
 *
 * - `MinutaSeloStatus` + `MinutaParecerLeitura`: o que TODOS veem (parceiro e
 *   equipe). O parecer é renderizado como TEXTO (`{texto}` do React, com
 *   `whitespace-pre-wrap`) — nunca `dangerouslySetInnerHTML`.
 * - `MinutaParecerForm`: só a equipe (modo assistência). Leva `previa-oculta`
 *   para sumir na prévia "como o aluno vê". Esconder NÃO é a proteção: a
 *   action confere `ehAdmin()` e a RPC confere `gp_is_admin()` (42501).
 */

import { useId, useState, useTransition } from "react";
import {
  AlertCircle,
  CircleCheck,
  Clock,
  MessageSquareText,
  Send,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatarDataHora } from "@/lib/datas";
import {
  MINUTA_PARECER_MAXIMO,
  MINUTA_STATUS,
  MINUTA_STATUS_ROTULO,
  ehMinutaStatus,
  type ClienteMinuta,
  type MinutaStatus,
} from "@/lib/minutas-tipos";
import { registrarParecerMinuta } from "@/app/clientes/minuta-actions";

const VARIANTE: Record<MinutaStatus, "neutral" | "warning" | "success"> = {
  enviada: "neutral",
  em_analise: "warning",
  revisada: "success",
};

const CLASSE_SELECT =
  "border-input bg-background focus-visible:ring-ring/50 h-9 rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:outline-solid focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-50";

/** Ícone de cada andamento: o estado nunca fica só na cor. */
const ICONE_STATUS: Record<MinutaStatus, LucideIcon> = {
  enviada: Send,
  em_analise: Clock,
  revisada: CircleCheck,
};

/** Frase curta que diz o que o andamento significa (vale para parceiro e equipe). */
const AJUDA_STATUS: Record<MinutaStatus, string> = {
  enviada: "Enviada. Aguardando a análise da equipe.",
  em_analise: "A equipe está analisando esta minuta.",
  revisada: "Análise concluída. Leia o parecer abaixo.",
};

export function MinutaSeloStatus({ status }: { status: MinutaStatus }) {
  // Valor fora do catálogo (não deveria existir: CHECK no banco) cai em
  // "Enviada" em vez de quebrar a ficha.
  const s: MinutaStatus = ehMinutaStatus(status) ? status : "enviada";
  // Selo com ícone próprio (o padrão de `neutral` é um cadeado, que diria
  // "travada") e texto em 14 px: o andamento é a primeira coisa que o parceiro procura.
  return (
    <Badge
      variant={VARIANTE[s]}
      icone={ICONE_STATUS[s]}
      className="h-8 shrink-0 gap-1.5 px-3 text-sm font-semibold [&>svg]:size-4!"
    >
      {MINUTA_STATUS_ROTULO[s]}
    </Badge>
  );
}

/** Selo + uma frase dizendo o que ele significa. */
export function MinutaAndamento({ status }: { status: MinutaStatus }) {
  const s: MinutaStatus = ehMinutaStatus(status) ? status : "enviada";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-base font-medium">Andamento:</span>
      <MinutaSeloStatus status={s} />
      <span className="text-base text-muted-foreground">{AJUDA_STATUS[s]}</span>
    </div>
  );
}

export function MinutaParecerLeitura({ minuta }: { minuta: ClienteMinuta }) {
  if (!minuta.parecer) return null;
  return (
    <div className="grid gap-1.5 rounded-lg border border-borda-forte border-l-4 border-l-primary bg-card px-3 py-2.5">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-base font-semibold">
        <MessageSquareText aria-hidden className="size-5 shrink-0 text-accent-foreground" />
        Parecer da equipe
        {minuta.parecer_em ? (
          <span className="font-normal text-muted-foreground">
            em {formatarDataHora(minuta.parecer_em)}
          </span>
        ) : null}
      </p>
      <p className="text-base leading-relaxed whitespace-pre-wrap break-words">
        {minuta.parecer}
      </p>
    </div>
  );
}

export function MinutaParecerForm({
  minuta,
  aoMudar,
}: {
  minuta: ClienteMinuta;
  aoMudar: () => void;
}) {
  const uid = useId();
  const idStatus = `${uid}-status`;
  const idParecer = `${uid}-parecer`;
  const [aberto, setAberto] = useState(false);
  const [status, setStatus] = useState<MinutaStatus>(
    ehMinutaStatus(minuta.status) ? minuta.status : "enviada",
  );
  const [parecer, setParecer] = useState(minuta.parecer ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  const tamanho = parecer.trim().length;
  const excedido = tamanho > MINUTA_PARECER_MAXIMO;
  const faltaParecer = status === "revisada" && tamanho === 0;

  function salvar() {
    setErro(null);
    setAviso(null);
    iniciar(async () => {
      const r = await registrarParecerMinuta({
        minutaId: minuta.id,
        status,
        parecer,
      });
      if (r.erro) {
        setErro(r.erro);
        return;
      }
      if (status === "revisada") {
        setAviso(
          r.avisado
            ? "Parecer salvo. O parceiro foi avisado por e-mail."
            : "Parecer salvo. O e-mail ao parceiro não saiu — avise por fora.",
        );
      } else {
        setAviso("Status salvo.");
      }
      setAberto(false);
      aoMudar();
    });
  }

  return (
    <div className="previa-oculta grid gap-2">
      {!aberto ? (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              // Relê da prop: depois do `refresh()` a minuta pode ter mudado
              // (outra pessoa da equipe salvou) e o estado local ficaria velho.
              setAviso(null);
              setErro(null);
              setStatus(ehMinutaStatus(minuta.status) ? minuta.status : "enviada");
              setParecer(minuta.parecer ?? "");
              setAberto(true);
            }}
          >
            {minuta.parecer ? "Editar parecer" : "Registrar parecer"}
          </Button>
        </div>
      ) : (
        <div className="grid gap-2 rounded-md border border-borda-fina px-2.5 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor={idStatus}>Andamento da análise</Label>
            <select
              id={idStatus}
              value={status}
              disabled={salvando}
              onChange={(e) => {
                if (ehMinutaStatus(e.target.value)) setStatus(e.target.value);
              }}
              className={CLASSE_SELECT}
            >
              {MINUTA_STATUS.map((s) => (
                <option key={s} value={s}>
                  {MINUTA_STATUS_ROTULO[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={idParecer}>
              Parecer{status === "revisada" ? " (obrigatório)" : " (opcional)"}
            </Label>
            <Textarea
              id={idParecer}
              value={parecer}
              onChange={(e) => setParecer(e.target.value)}
              disabled={salvando}
              rows={4}
              aria-invalid={excedido || undefined}
              aria-describedby={`${idParecer}-ajuda`}
            />
            <p
              id={`${idParecer}-ajuda`}
              className={
                excedido
                  ? "corpo-sm text-destructive"
                  : "corpo-sm text-muted-foreground"
              }
            >
              {excedido
                ? `Até ${MINUTA_PARECER_MAXIMO} caracteres (${tamanho} digitados).`
                : "O parceiro lê este texto na ficha. Ao marcar Revisada, ele recebe um e-mail avisando (sem o texto do parecer)."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={salvando || excedido || faltaParecer}
              aria-busy={salvando || undefined}
              onClick={salvar}
            >
              {salvando ? "Salvando…" : "Salvar"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={salvando}
              onClick={() => {
                setAberto(false);
                setErro(null);
                setStatus(ehMinutaStatus(minuta.status) ? minuta.status : "enviada");
                setParecer(minuta.parecer ?? "");
              }}
            >
              Cancelar
            </Button>
            {faltaParecer ? (
              <span className="text-base text-muted-foreground">
                Para marcar como Revisada, escreva o parecer.
              </span>
            ) : null}
          </div>
        </div>
      )}
      <div role="alert" className="empty:hidden">
        {erro ? (
          <p className="flex items-start gap-1.5 text-base font-medium text-risco-foreground">
            <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
            {erro}
          </p>
        ) : null}
      </div>
      <div aria-live="polite" className="empty:hidden">
        {aviso ? (
          <p className="flex items-start gap-1.5 text-base font-medium text-sucesso-foreground">
            <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
            {aviso}
          </p>
        ) : null}
      </div>
    </div>
  );
}
