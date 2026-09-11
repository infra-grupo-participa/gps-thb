"use client";

/**
 * A aba "Etapas" do painel: o interruptor de liberação de cada uma das 6
 * etapas do programa.
 *
 * 🔴 Este é o interruptor de maior alcance do sistema: ele vale para TODOS os
 * ambientes de uma vez. Bloquear a Etapa 01 — a única liberada hoje — tira o
 * conteúdo do portal do ar para todo mundo ao mesmo tempo. Por isso:
 *
 * 1. **Confirmação nomeada** (`DialogoConfirmacao`), com a consequência escrita
 *    e o botão dizendo o que vai acontecer. Era um clique seco.
 * 2. **Nada de otimismo antes da confirmação.** A UI otimista pintava a etapa
 *    como bloqueada no instante do clique e desfazia se a action falhasse — ou
 *    seja, mostrava um estado que o banco nunca teve. O estado só muda depois
 *    do `ok` do servidor.
 * 3. A consequência lembra que a **liberação individual** por ambiente
 *    (`gps.etapa_liberacao_aluno`) continua valendo: quem tem override vê a
 *    etapa mesmo com o interruptor geral desligado.
 */

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Lock, Unlock } from "lucide-react";
import type { Etapa } from "@/lib/types";
import { definirEtapaLiberada } from "@/app/admin/etapas-actions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";

export function EtapasControle({
  etapasIniciais,
  totalAmbientes,
}: {
  etapasIniciais: Etapa[];
  /**
   * Quantos ambientes esta decisão alcança. Opcional de propósito: sem o
   * número vindo do servidor, a frase fala em "todos os parceiros do programa" —
   * número inventado na consequência de uma ação destrutiva é pior do que
   * número nenhum.
   */
  totalAmbientes?: number;
}) {
  const [etapas, setEtapas] = useState<Etapa[]>(etapasIniciais);
  const [pending, startTransition] = useTransition();
  /** A etapa cuja mudança está sendo confirmada. `null` = nada aberto. */
  const [confirmando, setConfirmando] = useState<Etapa | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function alternar() {
    const etapa = confirmando;
    if (!etapa) return;
    const nova = !etapa.liberada;
    setErro(null);
    startTransition(async () => {
      const res = await definirEtapaLiberada(etapa.id, nova);
      if (res.erro) {
        // A frase já vem traduzida da action.
        setErro(res.erro);
        toast.error(res.erro);
        return;
      }
      // Só agora — o que a tela mostra é o que o banco confirmou.
      setEtapas((prev) =>
        prev.map((e) => (e.id === etapa.id ? { ...e, liberada: nova } : e)),
      );
      setConfirmando(null);
      toast.success(
        nova ? "Etapa liberada para os parceiros." : "Etapa bloqueada.",
      );
    });
  }

  const alcance = totalAmbientes
    ? `os ${totalAmbientes} ambientes do programa`
    : "todos os parceiros do programa";

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Controle quais etapas ficam disponíveis para <strong>todos</strong> os
        parceiros.
      </p>
      {etapas.map((etapa) => (
        <Card key={etapa.id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-3">
              <span
                className={
                  "flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold " +
                  (etapa.liberada
                    ? "bg-marca-acao text-white"
                    : "bg-muted text-muted-foreground")
                }
              >
                {etapa.ordem}
              </span>
              <div>
                <div className="text-sm font-medium">{etapa.nome}</div>
                {etapa.liberada ? (
                  <Badge variant="secondary" className="mt-0.5 text-[10px]">
                    Liberada
                  </Badge>
                ) : (
                  <Badge variant="neutral" className="mt-0.5 text-[10px]">Bloqueada
                  </Badge>
                )}
              </div>
            </div>
            <Button
              variant={etapa.liberada ? "outline" : "default"}
              size="sm"
              onClick={() => {
                setErro(null);
                setConfirmando(etapa);
              }}
              disabled={pending}
            >
              {etapa.liberada ? (
                <>
                  <Lock className="size-4" /> Bloquear
                </>
              ) : (
                <>
                  <Unlock className="size-4" /> Liberar
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      ))}

      {/* 🔑 O card da etapa continua montado durante a confirmação — é o que
          devolve o foco ao botão que abriu o diálogo. */}
      {confirmando ? (
        <DialogoConfirmacao
          aberto
          titulo={
            confirmando.liberada
              ? `Bloquear a Etapa ${confirmando.ordem} para todos?`
              : `Liberar a Etapa ${confirmando.ordem} para todos?`
          }
          descricao={`Etapa ${confirmando.ordem} · ${confirmando.nome}`}
          consequencia={
            confirmando.liberada ? (
              <>
                A Etapa {confirmando.ordem} <strong>sai do ar</strong> para{" "}
                {alcance}, na hora e sem aviso: quem estiver com ela aberta
                perde o conteúdo no próximo carregamento. Quem tem{" "}
                <strong>liberação individual</strong> concedida pela equipe
                continua vendo.
              </>
            ) : (
              <>
                A Etapa {confirmando.ordem} <strong>passa a aparecer</strong>{" "}
                para {alcance}, na hora e sem aviso — inclusive para quem ainda
                não terminou a etapa anterior. O progresso já registrado não
                muda.
              </>
            )
          }
          rotuloConfirmar={
            confirmando.liberada
              ? `Bloquear a Etapa ${confirmando.ordem}`
              : `Liberar a Etapa ${confirmando.ordem}`
          }
          rotuloConfirmando={confirmando.liberada ? "Bloqueando…" : "Liberando…"}
          destrutivo={confirmando.liberada}
          confirmando={pending}
          erro={erro}
          onConfirmar={alternar}
          onCancelar={() => {
            if (pending) return;
            setConfirmando(null);
            setErro(null);
          }}
        />
      ) : null}
    </div>
  );
}
