"use client";

/**
 * O acompanhamento do cliente pela EQUIPE — o segundo conceito que o boolean
 * `acompanhado_equipe` guardava sozinho (§B.5 do plano).
 *
 *   `acompanhado_equipe`                → "foi este que EU escolhi" (do aluno)
 *   `acompanhamento_confirmado_em`      → "a equipe ACEITOU e está acompanhando"
 *
 * Duas peças, dois públicos:
 *
 * - **`AvisoAcompanhamento`** é o que o ALUNO lê: a data em que a equipe
 *   assumiu, o que ele deixou de poder fazer e por onde pedir a troca. Nunca um
 *   botão que falha — a trigger `trg_etapa1_clientes_acompanhamento_travado`
 *   devolve 42501 e não há UI que a convença.
 * - **`AcoesAcompanhamento`** é a porta da EQUIPE, e só aparece no Modo
 *   Assistência. É a CASA DE ORIGEM da escrita: a Central mostra a linha de
 *   diagnóstico com link para cá, em vez de abrir uma segunda porta para a
 *   mesma escrita.
 *
 * Motivo obrigatório (3..300) nas duas ações: é ele que a trilha do aluno
 * mostra meses depois para explicar por que a estrela travou.
 */

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { LifeBuoy, Lock, LockOpen } from "lucide-react";
import type { ClienteEtapa1 } from "@/lib/types";
import {
  confirmarAcompanhamento,
  liberarAcompanhamento,
} from "@/app/admin/central-actions";
import { formatarData } from "@/lib/datas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** As RPCs `...203` recusam menos de 3 e mais de 300 — o mesmo limite da Central. */
const MOTIVO_MIN = 3;
const MOTIVO_MAX = 300;

/**
 * O aviso que o aluno lê na ficha do cliente acompanhado.
 *
 * `admin` muda só a última linha: mandar a equipe "falar com a equipe pelo
 * Suporte" seria mandá-la abrir chamado consigo mesma.
 */
export function AvisoAcompanhamento({
  confirmadoEm,
  admin = false,
}: {
  confirmadoEm: string;
  admin?: boolean;
}) {
  return (
    <div className="grid gap-2 rounded-xl border border-sucesso-foreground/25 bg-sucesso p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="success">
          A equipe está acompanhando este cliente desde{" "}
          {formatarData(confirmadoEm)}
        </Badge>
      </div>
      <p className="corpo-sm text-sucesso-foreground">
        Enquanto o acompanhamento estiver ativo, este cliente continua sendo o da
        equipe: a estrela não muda, ele não pode ser excluído e a fase não volta
        para Prospecção. <strong>O resto da ficha segue editável</strong> —
        telefone, registro do contato, honorários, perfil DISC e problemas.
      </p>
      {admin ? (
        <p className="corpo-sm text-sucesso-foreground">
          Para devolver a escolha ao aluno, use “Liberar acompanhamento” aqui
          mesmo.
        </p>
      ) : (
        <p className="corpo-sm text-sucesso-foreground">
          Precisa trocar?{" "}
          <Link
            href="/chamados"
            className="inline-flex items-center gap-1 font-medium underline underline-offset-4"
          >
            <LifeBuoy aria-hidden className="size-3.5" />
            Fale com a equipe pelo Suporte
          </Link>
          .
        </p>
      )}
    </div>
  );
}

/**
 * O aviso na ficha de um cliente que NÃO é o acompanhado, quando outro do
 * ambiente já está confirmado. Existe para a estrela ausente ter explicação —
 * botão que some sem motivo é tão ruim quanto botão que falha.
 */
export function AvisoOutroConfirmado({
  nome,
  admin = false,
}: {
  nome: string | null;
  admin?: boolean;
}) {
  return (
    <p className="corpo-sm text-muted-foreground">
      A equipe está acompanhando{" "}
      <strong className="text-foreground">{nome || "outro cliente"}</strong>, por
      isso a estrela não pode ser movida para cá.{" "}
      {admin ? (
        "Libere o acompanhamento na ficha daquele cliente antes de trocar."
      ) : (
        <>
          Para trocar,{" "}
          <Link
            href="/chamados"
            className="font-medium text-accent-foreground underline underline-offset-4"
          >
            fale com a equipe pelo Suporte
          </Link>
          .
        </>
      )}
    </p>
  );
}

function CampoMotivo({
  valor,
  onChange,
  desabilitado,
  invalido,
  placeholder,
}: {
  valor: string;
  onChange: (v: string) => void;
  desabilitado: boolean;
  invalido: boolean;
  placeholder: string;
}) {
  const id = useId();
  const idAjuda = `${id}-ajuda`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Motivo (fica no histórico do aluno)</Label>
      <Textarea
        id={id}
        value={valor}
        rows={3}
        maxLength={MOTIVO_MAX}
        disabled={desabilitado}
        aria-describedby={idAjuda}
        aria-invalid={invalido || undefined}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <p id={idAjuda} className="corpo-sm text-muted-foreground">
        Obrigatório, de {MOTIVO_MIN} a {MOTIVO_MAX} caracteres (
        {valor.trim().length}/{MOTIVO_MAX}). Aparece na trilha deste aluno.
      </p>
    </div>
  );
}

export function AcoesAcompanhamento({
  cliente,
  alunoId,
  aoMudar,
}: {
  cliente: ClienteEtapa1;
  alunoId: string;
  /** Chamado depois de gravar — a ficha recarrega o dado do servidor. */
  aoMudar: () => void;
}) {
  const [acao, setAcao] = useState<"confirmar" | "liberar" | null>(null);
  const [motivo, setMotivo] = useState("");
  const [tentou, setTentou] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, executando] = useTransition();

  const confirmado = cliente.acompanhamento_confirmado_em != null;
  const nome = cliente.nome || "este cliente";
  const motivoCurto = motivo.trim().length < MOTIVO_MIN;
  const invalido = motivoCurto && (tentou || motivo.length > 0);

  function abrir(nova: "confirmar" | "liberar") {
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
    if (motivoCurto) {
      setTentou(true);
      return;
    }
    setErro(null);
    executando(async () => {
      const fn = acao === "confirmar" ? confirmarAcompanhamento : liberarAcompanhamento;
      const res = await fn(cliente.id, alunoId, motivo.trim());
      if (res.erro) {
        // A frase já vem traduzida da action (`traduzirErroBanco`): mostrar
        // aqui, dentro do diálogo, e não num toast que some com o motivo
        // digitado junto.
        setErro(res.erro);
        return;
      }
      setAcao(null);
      setMotivo("");
      toast.success(
        acao === "confirmar"
          ? `A equipe assumiu o acompanhamento de ${nome}.`
          : `${nome} voltou a poder ser trocado pelo aluno.`,
      );
      aoMudar();
    });
  }

  return (
    <div className="grid gap-2 rounded-xl border border-borda-fina bg-superficie-afundada p-3.5">
      <p className="rotulo text-accent-foreground">Equipe</p>
      <p className="corpo-sm text-muted-foreground">
        {confirmado
          ? "A equipe assumiu o acompanhamento deste cliente. Liberar devolve ao aluno o direito de trocar a estrela."
          : "Confirmar o acompanhamento trava a escolha do aluno neste cliente. Só faz sentido depois de combinar com ele."}
      </p>
      <div className="flex flex-wrap gap-2">
        {confirmado ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pendente}
            onClick={() => abrir("liberar")}
          >
            <LockOpen className="size-4" /> Liberar acompanhamento
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pendente}
            onClick={() => abrir("confirmar")}
          >
            <Lock className="size-4" /> Confirmar acompanhamento
          </Button>
        )}
      </div>

      {acao ? (
        <DialogoConfirmacao
          aberto
          destrutivo={acao === "confirmar"}
          titulo={
            acao === "confirmar"
              ? "Confirmar que a equipe acompanha este cliente?"
              : "Liberar o acompanhamento deste cliente?"
          }
          descricao={nome}
          consequencia={
            acao === "confirmar" ? (
              <>
                A partir de agora o aluno{" "}
                <strong>
                  deixa de poder trocar a estrela, apagar este cliente ou voltar
                  a fase para Prospecção
                </strong>
                ; ele continua editando o resto da ficha. A trava é do banco —
                vale também fora desta tela.
              </>
            ) : (
              <>
                O aluno <strong>volta a poder trocar</strong> o cliente
                acompanhado. A <strong>estrela continua neste cliente</strong>:
                liberar devolve a escolha, não a desfaz — desmarcar aqui travaria
                os passos 4 a 8 da Etapa 01 de quem não pediu nada.
              </>
            )
          }
          rotuloConfirmar={
            acao === "confirmar" ? "Confirmar acompanhamento" : "Liberar acompanhamento"
          }
          rotuloConfirmando="Salvando…"
          confirmando={pendente}
          erro={
            erro ??
            (tentou && motivoCurto
              ? `Escreva o motivo — ele fica no histórico deste aluno (mínimo de ${MOTIVO_MIN} caracteres).`
              : null)
          }
          onConfirmar={confirmar}
          onCancelar={fechar}
        >
          <CampoMotivo
            valor={motivo}
            onChange={setMotivo}
            desabilitado={pendente}
            invalido={invalido}
            placeholder={
              acao === "confirmar"
                ? "Ex.: combinado na reunião de 10/09 — a equipe segue com este caso até a execução."
                : "Ex.: o cliente desistiu; o aluno vai escolher outro."
            }
          />
        </DialogoConfirmacao>
      ) : null}
    </div>
  );
}
