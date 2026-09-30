"use client";

/**
 * Liberar ou travar etapas de UM aluno, todas de uma vez, à vista.
 *
 * Envia só o que mudou, pela mesma action do lote
 * (`definirLiberacaoEtapasEmLote([alunoId], …)`). Liberar abre direto; travar
 * e voltar à regra geral tiram acesso, então passam por confirmação nomeando
 * as etapas.
 */

import { useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirLiberacaoEtapasEmLote } from "@/app/admin/central-actions";
import {
  MOTIVO_MAX,
  MOTIVO_MIN,
  type ItemLiberacaoEtapa,
} from "@/lib/etapas-lote-tipos";
import { Button } from "@/components/ui/button";
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  SeletorEtapas,
  type EscolhaEtapa,
  type EtapaInfo,
} from "./seletor-etapas";

function escolhaInicial(e: EtapaInfo): EscolhaEtapa {
  if (e.override === true) return "liberar";
  if (e.override === false) return "travar";
  return "regra";
}

const PARA_LIBERADA: Record<EscolhaEtapa, boolean | null> = {
  regra: null,
  liberar: true,
  travar: false,
};

const rotulo = (e: EtapaInfo) =>
  `${String(e.numero).padStart(2, "0")} — ${e.titulo}`;

export function PainelEtapasAluno({
  alunoId,
  nomeAluno,
  etapas,
}: {
  alunoId: string;
  nomeAluno: string | null;
  etapas: EtapaInfo[];
}) {
  const router = useRouter();
  const idMotivo = useId();
  const idAjudaMotivo = `${idMotivo}-ajuda`;

  const inicial = useMemo(() => {
    const r: Record<number, EscolhaEtapa> = {};
    for (const e of etapas) r[e.numero] = escolhaInicial(e);
    return r;
  }, [etapas]);

  const [valor, setValor] = useState<Record<number, EscolhaEtapa>>(inicial);
  // Depois de salvar, `router.refresh()` traz `etapas` novas e `inicial` muda:
  // o formulário acompanha o estado salvo em vez de ficar com a escolha antiga.
  const [inicialVisto, setInicialVisto] = useState(inicial);
  if (inicial !== inicialVisto) {
    setInicialVisto(inicial);
    setValor(inicial);
  }
  const [motivo, setMotivo] = useState("");
  const [tentou, setTentou] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");
  const [pendente, startTransition] = useTransition();

  const alteradas = etapas.filter(
    (e) => (valor[e.numero] ?? "regra") !== inicial[e.numero],
  );
  const restritivas = alteradas.filter(
    (e) => valor[e.numero] !== "liberar",
  );
  const motivoCurto = motivo.trim().length < MOTIVO_MIN;

  function salvar() {
    setErro(null);
    const itens: ItemLiberacaoEtapa[] = alteradas.map((e) => ({
      etapa: e.numero,
      liberada: PARA_LIBERADA[valor[e.numero]],
    }));
    startTransition(async () => {
      const res = await definirLiberacaoEtapasEmLote(
        [alunoId],
        itens,
        motivo.trim(),
      );
      setConfirmando(false);
      if (res.erro) {
        setErro(res.erro);
        return;
      }
      const n = res.alterados ?? 0;
      setAviso(
        n === 0
          ? "Nada mudou."
          : `${n} ${n === 1 ? "etapa alterada" : "etapas alteradas"}.`,
      );
      setMotivo("");
      setTentou(false);
      router.refresh();
    });
  }

  function clicarSalvar() {
    setAviso("");
    if (motivoCurto) {
      setTentou(true);
      return;
    }
    if (restritivas.length > 0) {
      setErro(null);
      setConfirmando(true);
      return;
    }
    salvar();
  }

  const trava = alteradas.filter((e) => valor[e.numero] === "travar");
  const volta = alteradas.filter((e) => valor[e.numero] === "regra");
  const libera = alteradas.filter((e) => valor[e.numero] === "liberar");
  const lista = (xs: EtapaInfo[]) => xs.map(rotulo).join("; ");

  return (
    <div className="grid gap-4">
      <p className="max-w-[70ch] corpo-sm text-muted-foreground">
        A exceção vale só para {nomeAluno ?? "este aluno"}; a regra geral
        continua valendo para os demais. Liberar uma etapa também libera o
        agendamento de sessão dela. Toda mudança pede motivo e entra na trilha.
      </p>

      <SeletorEtapas
        etapas={etapas}
        valor={valor}
        onChange={setValor}
        disabled={pendente}
      />

      <div className="grid gap-1.5">
        <Label htmlFor={idMotivo}>Motivo (fica no histórico do parceiro)</Label>
        <Textarea
          id={idMotivo}
          value={motivo}
          rows={2}
          maxLength={MOTIVO_MAX}
          disabled={pendente}
          aria-describedby={idAjudaMotivo}
          aria-invalid={(tentou && motivoCurto) || undefined}
          onChange={(ev) => setMotivo(ev.target.value)}
        />
        <p
          id={idAjudaMotivo}
          className={
            tentou && motivoCurto
              ? "corpo-sm text-destructive"
              : "corpo-sm text-muted-foreground"
          }
        >
          {tentou && motivoCurto
            ? `Escreva o motivo (mínimo de ${MOTIVO_MIN} caracteres). `
            : ""}
          Obrigatório, de {MOTIVO_MIN} a {MOTIVO_MAX} caracteres (
          {motivo.trim().length}/{MOTIVO_MAX}).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={clicarSalvar}
          disabled={alteradas.length === 0 || pendente}
          aria-busy={pendente || undefined}
        >
          {pendente ? "Salvando…" : "Salvar"}
        </Button>
        {alteradas.length > 0 ? (
          <span className="corpo-sm text-muted-foreground">
            {alteradas.length}{" "}
            {alteradas.length === 1 ? "etapa alterada" : "etapas alteradas"}{" "}
            aguardando salvar
          </span>
        ) : null}
      </div>

      <p aria-live="polite" className="corpo-sm empty:hidden">
        {aviso}
      </p>
      {erro && !confirmando ? (
        <p role="alert" className="corpo-sm text-destructive">
          {erro}
        </p>
      ) : null}

      <DialogoConfirmacao
        aberto={confirmando}
        titulo="Confirmar mudança nas etapas?"
        descricao={nomeAluno ?? undefined}
        consequencia={
          <>
            {trava.length > 0 ? (
              <>
                <strong>Trava</strong> só para este parceiro: {lista(trava)}.
                Ele perde o acesso mesmo que a etapa esteja liberada para todos.{" "}
              </>
            ) : null}
            {volta.length > 0 ? (
              <>
                <strong>Volta à regra geral</strong>: {lista(volta)}. A exceção
                é removida; se a regra geral estiver travada, ele perde o
                acesso que tinha por exceção.{" "}
              </>
            ) : null}
            {libera.length > 0 ? (
              <>
                <strong>Libera</strong>: {lista(libera)}. Liberar a etapa também
                libera o agendamento de sessão dela.
              </>
            ) : null}
          </>
        }
        rotuloConfirmar="Salvar mudanças"
        rotuloConfirmando="Salvando…"
        confirmando={pendente}
        erro={erro}
        onConfirmar={salvar}
        onCancelar={() => setConfirmando(false)}
      />
    </div>
  );
}
