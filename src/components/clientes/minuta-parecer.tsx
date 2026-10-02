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

export function MinutaSeloStatus({ status }: { status: MinutaStatus }) {
  // Valor fora do catálogo (não deveria existir: CHECK no banco) cai em
  // "Enviada" em vez de quebrar a ficha.
  const s: MinutaStatus = ehMinutaStatus(status) ? status : "enviada";
  // Ícone desligado: o padrão de `neutral` é um cadeado, que diria "travada".
  return (
    <Badge variant={VARIANTE[s]} icone={false} className="shrink-0">
      {MINUTA_STATUS_ROTULO[s]}
    </Badge>
  );
}

export function MinutaParecerLeitura({ minuta }: { minuta: ClienteMinuta }) {
  if (!minuta.parecer) return null;
  return (
    <div className="grid gap-1 rounded-md border border-borda-fina bg-background px-2.5 py-2">
      <p className="corpo-sm text-muted-foreground">
        Parecer da equipe
        {minuta.parecer_em ? ` · ${formatarDataHora(minuta.parecer_em)}` : ""}
      </p>
      <p className="corpo-sm whitespace-pre-wrap break-words">{minuta.parecer}</p>
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
            size="xs"
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
            <Label htmlFor={idStatus}>Status da análise</Label>
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
                : "O parceiro lê este texto na ficha. Ao marcar Revisada, ele recebe um e-mail (sem o parecer)."}
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
              <span className="corpo-sm text-muted-foreground">
                Escreva o parecer para marcar como revisada.
              </span>
            ) : null}
          </div>
        </div>
      )}
      <p role="alert" className="corpo-sm text-destructive empty:hidden">
        {erro}
      </p>
      <p aria-live="polite" className="corpo-sm text-muted-foreground empty:hidden">
        {aviso}
      </p>
    </div>
  );
}
