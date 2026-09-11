"use client";

/**
 * Aprovar / Declinar uma solicitação de troca (cliente ou sócio) —
 * `/admin/chamados/[chamadoId]`.
 *
 * 🔴 APROVAR EXECUTA A TROCA (decisão do Marcio, briefing 11/09/2026). O
 * diálogo tem de dizer isso com todas as letras, nomeando os dois clientes —
 * mesma regra da casa de `AcoesAcompanhamento`
 * (`src/components/clientes/acompanhamento-equipe.tsx`): "a consequência diz
 * o que acontece, não 'tem certeza?'".
 *
 * Declinar exige motivo (3..300) DENTRO do próprio diálogo — o parceiro vai
 * ler esse motivo na thread do chamado.
 */

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import {
  aprovarSolicitacaoChamado,
  declinarSolicitacaoChamado,
} from "@/app/admin/chamados/actions";
import {
  SOLICITACAO_MOTIVO_MAXIMO,
  SOLICITACAO_MOTIVO_MINIMO,
  type ChamadoSolicitacao,
} from "@/lib/chamados-tipos";
import { Button } from "@/components/ui/button";
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Acao = "aprovar" | "declinar";

export function AcoesSolicitacao({
  chamadoId,
  alunoId,
  solicitacao,
}: {
  chamadoId: string;
  alunoId: string;
  solicitacao: ChamadoSolicitacao;
}) {
  const [acao, setAcao] = useState<Acao | null>(null);
  const [motivo, setMotivo] = useState("");
  const [tentou, setTentou] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, executando] = useTransition();

  if (solicitacao.estado !== "pendente") return null;

  const atual = solicitacao.alvo_atual_rotulo || "o atual";
  const novo = solicitacao.alvo_novo_rotulo || "o novo";
  const ehCliente = solicitacao.tipo === "troca_cliente";

  const motivoCurto = motivo.trim().length < SOLICITACAO_MOTIVO_MINIMO;
  const motivoLongo = motivo.trim().length > SOLICITACAO_MOTIVO_MAXIMO;
  const invalidoDeclinar = acao === "declinar" && motivoCurto;

  function abrir(nova: Acao) {
    setErro(null);
    setMotivo("");
    setTentou(false);
    setAcao(nova);
  }

  function fechar() {
    if (pendente) return;
    setAcao(null);
    setErro(null);
    setMotivo("");
  }

  function confirmar() {
    if (!acao) return;
    if (acao === "declinar" && (motivoCurto || motivoLongo)) {
      setTentou(true);
      return;
    }
    setErro(null);
    executando(async () => {
      const fn = acao === "aprovar" ? aprovarSolicitacaoChamado : declinarSolicitacaoChamado;
      const res = await fn(chamadoId, alunoId, motivo.trim());
      if (!res.ok) {
        setErro(res.erro);
        return;
      }
      setAcao(null);
      setMotivo("");
      toast.success(
        acao === "aprovar"
          ? `Troca aprovada: ${atual} → ${novo}.`
          : "Pedido declinado. O parceiro vê o motivo na thread.",
      );
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" disabled={pendente} onClick={() => abrir("aprovar")}>
        <Check className="size-4" /> Aprovar
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pendente}
        onClick={() => abrir("declinar")}
      >
        <X className="size-4" /> Declinar
      </Button>

      {acao ? (
        <DialogoConfirmacao
          aberto
          destrutivo={acao === "declinar"}
          titulo={
            acao === "aprovar"
              ? `Aprovar a troca de ${ehCliente ? "cliente" : "sócio"}?`
              : `Declinar o pedido de troca de ${ehCliente ? "cliente" : "sócio"}?`
          }
          consequencia={
            acao === "aprovar" ? (
              <>
                Isto EXECUTA a troca agora: <strong>{atual}</strong> sai e{" "}
                <strong>{novo}</strong> entra no lugar
                {ehCliente
                  ? " como cliente acompanhado pela equipe"
                  : " como sócio deste ambiente"}
                . O chamado fecha com a aprovação registrada. Não há uma
                segunda confirmação depois desta — reverter exige abrir um
                novo pedido.
              </>
            ) : (
              <>
                O pedido de troca de <strong>{atual}</strong> para{" "}
                <strong>{novo}</strong> é encerrado sem executar nada. O
                parceiro vê o motivo abaixo na thread do chamado, e a
                conversa pode continuar por mensagem.
              </>
            )
          }
          rotuloConfirmar={acao === "aprovar" ? "Aprovar e executar a troca" : "Declinar pedido"}
          rotuloConfirmando="Salvando…"
          confirmando={pendente}
          erro={
            erro ??
            (tentou && invalidoDeclinar
              ? `Escreva o motivo — o parceiro vai ver (mínimo de ${SOLICITACAO_MOTIVO_MINIMO} caracteres).`
              : null)
          }
          onConfirmar={confirmar}
          onCancelar={fechar}
        >
          {acao === "declinar" ? (
            <CampoMotivo
              valor={motivo}
              onChange={setMotivo}
              desabilitado={pendente}
              invalido={tentou && invalidoDeclinar}
            />
          ) : null}
        </DialogoConfirmacao>
      ) : null}
    </div>
  );
}

function CampoMotivo({
  valor,
  onChange,
  desabilitado,
  invalido,
}: {
  valor: string;
  onChange: (v: string) => void;
  desabilitado: boolean;
  invalido: boolean;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="motivo-declinio">Motivo (o parceiro vê)</Label>
      <Textarea
        id="motivo-declinio"
        value={valor}
        rows={3}
        maxLength={SOLICITACAO_MOTIVO_MAXIMO}
        disabled={desabilitado}
        aria-invalid={invalido || undefined}
        placeholder="Ex.: precisamos conversar antes — o cliente novo ainda não tem reunião preliminar."
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="corpo-sm text-muted-foreground">
        Obrigatório, de {SOLICITACAO_MOTIVO_MINIMO} a {SOLICITACAO_MOTIVO_MAXIMO}{" "}
        caracteres ({valor.trim().length}/{SOLICITACAO_MOTIVO_MAXIMO}).
      </p>
    </div>
  );
}
