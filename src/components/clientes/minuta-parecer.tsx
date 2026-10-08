"use client";

/**
 * Status e parecer da EQUIPE sobre uma versão de minuta (migração `…341`,
 * decisão do João 02/10/2026, card 86akryphf) **e sobre uma folha de croqui**
 * (migração `…378`, 08/10/2026). Mesmo comportamento, por isso um corpo só:
 * as peças genéricas recebem `tipo` e os wrappers `Minuta*`/`Croqui*` mantêm
 * a API de quem já usava. Sem integração com o gerador de minutas.
 *
 * - `*SeloStatus` + `*Andamento` + `*ParecerLeitura`: o que TODOS veem
 *   (parceiro e equipe). O parecer é renderizado como TEXTO (`{texto}` do
 *   React, com `whitespace-pre-wrap`) — nunca `dangerouslySetInnerHTML`.
 * - `*ParecerForm`: só a equipe (modo assistência). Leva `previa-oculta`
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
import {
  CROQUI_PARECER_MAXIMO,
  CROQUI_STATUS_ROTULO,
  type ClienteCroqui,
} from "@/lib/croquis-tipos";
import { registrarParecerMinuta } from "@/app/clientes/minuta-actions";
import { registrarParecerCroqui } from "@/app/clientes/croqui-actions";

/** Os dois catálogos de status são idênticos (CHECK copiado no banco). */
type Status = MinutaStatus;
export type TipoParecer = "minuta" | "croqui";

const VARIANTE: Record<Status, "neutral" | "warning" | "success"> = {
  enviada: "neutral",
  em_analise: "warning",
  revisada: "success",
};

const CLASSE_SELECT =
  "border-input bg-background focus-visible:ring-ring/50 h-9 rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:outline-solid focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-50";

/** Ícone de cada andamento: o estado nunca fica só na cor. */
const ICONE_STATUS: Record<Status, LucideIcon> = {
  enviada: Send,
  em_analise: Clock,
  revisada: CircleCheck,
};

const CONFIG: Record<
  TipoParecer,
  {
    rotulo: Record<Status, string>;
    maximo: number;
    ajuda: Record<Status, string>;
  }
> = {
  minuta: {
    rotulo: MINUTA_STATUS_ROTULO,
    maximo: MINUTA_PARECER_MAXIMO,
    // Frase curta que diz o que o andamento significa (parceiro e equipe).
    ajuda: {
      enviada: "Enviada. Aguardando a análise da equipe.",
      em_analise: "A equipe está analisando esta minuta.",
      revisada: "Análise concluída. Leia o parecer abaixo.",
    },
  },
  croqui: {
    rotulo: CROQUI_STATUS_ROTULO,
    maximo: CROQUI_PARECER_MAXIMO,
    ajuda: {
      enviada: "Enviado. Aguardando a análise da equipe.",
      em_analise: "A equipe está analisando este croqui.",
      revisada: "Análise concluída. Leia o parecer abaixo.",
    },
  },
};

// Valor fora do catálogo (não deveria existir: CHECK no banco) cai em
// "Enviada" em vez de quebrar a ficha.
const normalizar = (s: unknown): Status => (ehMinutaStatus(s) ? s : "enviada");

function SeloStatus({ tipo, status }: { tipo: TipoParecer; status: Status }) {
  const s = normalizar(status);
  // Selo com ícone próprio (o padrão de `neutral` é um cadeado, que diria
  // "travada") e texto em 14 px: o andamento é a primeira coisa que o parceiro procura.
  return (
    <Badge
      variant={VARIANTE[s]}
      icone={ICONE_STATUS[s]}
      className="h-8 shrink-0 gap-1.5 px-3 text-sm font-semibold [&>svg]:size-4!"
    >
      {CONFIG[tipo].rotulo[s]}
    </Badge>
  );
}

/** Selo + uma frase dizendo o que ele significa. */
function Andamento({ tipo, status }: { tipo: TipoParecer; status: Status }) {
  const s = normalizar(status);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-base font-medium">Andamento:</span>
      <SeloStatus tipo={tipo} status={s} />
      <span className="text-base text-muted-foreground">{CONFIG[tipo].ajuda[s]}</span>
    </div>
  );
}

function ParecerLeitura({
  parecer,
  parecerEm,
}: {
  parecer: string | null;
  parecerEm: string | null;
}) {
  if (!parecer) return null;
  return (
    <div className="grid gap-1.5 rounded-lg border border-borda-forte border-l-4 border-l-primary bg-card px-3 py-2.5">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-base font-semibold">
        <MessageSquareText aria-hidden className="size-5 shrink-0 text-accent-foreground" />
        Parecer da equipe
        {parecerEm ? (
          <span className="font-normal text-muted-foreground">
            em {formatarDataHora(parecerEm)}
          </span>
        ) : null}
      </p>
      <p className="text-base leading-relaxed whitespace-pre-wrap break-words">
        {parecer}
      </p>
    </div>
  );
}

function ParecerForm({
  tipo,
  itemId,
  statusAtual,
  parecerAtual,
  aoMudar,
}: {
  tipo: TipoParecer;
  itemId: string;
  statusAtual: Status;
  parecerAtual: string | null;
  aoMudar: () => void;
}) {
  const { rotulo, maximo } = CONFIG[tipo];
  const uid = useId();
  const idStatus = `${uid}-status`;
  const idParecer = `${uid}-parecer`;
  const [aberto, setAberto] = useState(false);
  const [status, setStatus] = useState<Status>(normalizar(statusAtual));
  const [parecer, setParecer] = useState(parecerAtual ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  const tamanho = parecer.trim().length;
  const excedido = tamanho > maximo;
  const faltaParecer = status === "revisada" && tamanho === 0;

  function salvar() {
    setErro(null);
    setAviso(null);
    iniciar(async () => {
      const r =
        tipo === "croqui"
          ? await registrarParecerCroqui({ croquiId: itemId, status, parecer })
          : await registrarParecerMinuta({ minutaId: itemId, status, parecer });
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
              // Relê da prop: depois do `refresh()` o item pode ter mudado
              // (outra pessoa da equipe salvou) e o estado local ficaria velho.
              setAviso(null);
              setErro(null);
              setStatus(normalizar(statusAtual));
              setParecer(parecerAtual ?? "");
              setAberto(true);
            }}
          >
            {parecerAtual ? "Editar parecer" : "Registrar parecer"}
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
                  {rotulo[s]}
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
                ? `Até ${maximo} caracteres (${tamanho} digitados).`
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
                setStatus(normalizar(statusAtual));
                setParecer(parecerAtual ?? "");
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

/* ── Minuta (API original, inalterada) ─────────────────────────────── */

export function MinutaSeloStatus({ status }: { status: MinutaStatus }) {
  return <SeloStatus tipo="minuta" status={status} />;
}

export function MinutaAndamento({ status }: { status: MinutaStatus }) {
  return <Andamento tipo="minuta" status={status} />;
}

export function MinutaParecerLeitura({ minuta }: { minuta: ClienteMinuta }) {
  return <ParecerLeitura parecer={minuta.parecer} parecerEm={minuta.parecer_em} />;
}

export function MinutaParecerForm({
  minuta,
  aoMudar,
}: {
  minuta: ClienteMinuta;
  aoMudar: () => void;
}) {
  return (
    <ParecerForm
      tipo="minuta"
      itemId={minuta.id}
      statusAtual={minuta.status}
      parecerAtual={minuta.parecer}
      aoMudar={aoMudar}
    />
  );
}

/* ── Croqui ─────────────────────────────────────────────────────────── */

export function CroquiSeloStatus({ status }: { status: ClienteCroqui["status"] }) {
  return <SeloStatus tipo="croqui" status={status} />;
}

export function CroquiAndamento({ status }: { status: ClienteCroqui["status"] }) {
  return <Andamento tipo="croqui" status={status} />;
}

export function CroquiParecerLeitura({ croqui }: { croqui: ClienteCroqui }) {
  return <ParecerLeitura parecer={croqui.parecer} parecerEm={croqui.parecer_em} />;
}

export function CroquiParecerForm({
  croqui,
  aoMudar,
}: {
  croqui: ClienteCroqui;
  aoMudar: () => void;
}) {
  return (
    <ParecerForm
      tipo="croqui"
      itemId={croqui.id}
      statusAtual={croqui.status}
      parecerAtual={croqui.parecer}
      aoMudar={aoMudar}
    />
  );
}
