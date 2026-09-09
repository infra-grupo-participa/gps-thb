"use client";

/**
 * As dez confirmações da Central — a copy, num lugar só.
 *
 * Arquivo separado porque o que importa aqui é **texto**, não lógica: cada
 * `DialogoConfirmacao` existe para dizer o que vai acontecer ANTES de
 * acontecer, com o alvo nomeado e o botão com nome próprio. Misturar essa
 * escrita com o `switch` de execução faria a frase virar detalhe de
 * implementação — e frase de consequência é a feature.
 *
 * Textos obrigatórios (C.4 do contrato publicado), reproduzidos aqui:
 * troca de titular (o novo titular PASSA a ver o Financeiro), mover sócio (o
 * que ele registrou fica no ambiente de origem), reabrir etapa (N tarefas
 * voltam a ficar pendentes e nada é apagado), travar etapa (o aluno perde o
 * acesso mesmo com a etapa liberada para todo mundo) e desvincular contrato
 * (pode ter vindo do sistema de origem).
 */

import { useId, useState } from "react";
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { brlOuTraco } from "@/lib/moeda";
import {
  MOTIVO_MAX,
  MOTIVO_MIN,
  exigeMotivo,
  rotuloEtapa,
  type AcaoPendente,
} from "../tipos";

/**
 * "Motivo (fica no histórico do aluno)" — o mesmo desenho do "Motivo (o aluno
 * vê)" da recusa de solicitação. Aqui ele é **obrigatório**: as RPCs de trilha
 * recusam menos de 3 caracteres, e o motivo é o que a trilha do Diário mostra
 * meses depois para explicar por que aquela etapa abriu.
 */
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
        Obrigatório, de {MOTIVO_MIN} a {MOTIVO_MAX} caracteres ({valor.trim().length}
        /{MOTIVO_MAX}). Aparece na trilha deste aluno.
      </p>
    </div>
  );
}

const PLACEHOLDER_MOTIVO: Record<string, string> = {
  "liberar-etapa":
    "Ex.: adiantou o croqui na reunião de 08/09 e precisa da etapa aberta.",
  "travar-etapa": "Ex.: vai refazer a lista de clientes antes de seguir.",
  "voltar-regra-geral": "Ex.: a turma inteira alcançou, não precisa mais da exceção.",
  "reabrir-etapa": "Ex.: marcou as tarefas sem ter feito; combinamos refazer.",
};

export function ConfirmacaoDaAcao({
  acao,
  motivo,
  onMotivo,
  pendente,
  erro,
  onConfirmar,
  onCancelar,
}: {
  acao: AcaoPendente;
  motivo: string;
  onMotivo: (v: string) => void;
  pendente: boolean;
  erro: string | null;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  /** Só depois da primeira tentativa o campo vazio vira erro anunciado. */
  const [tentou, setTentou] = useState(false);

  const precisaMotivo = exigeMotivo(acao);
  const motivoCurto = motivo.trim().length < MOTIVO_MIN;
  const invalido = precisaMotivo && motivoCurto && (tentou || motivo.length > 0);
  const campo = precisaMotivo ? (
    <CampoMotivo
      valor={motivo}
      onChange={onMotivo}
      desabilitado={pendente}
      invalido={invalido}
      placeholder={PLACEHOLDER_MOTIVO[acao.tipo] ?? ""}
    />
  ) : null;

  // A validação acontece ANTES de enviar. O servidor e o banco recusam igual,
  // mas descobrir isso só depois do clique custaria o texto já escrito — e um
  // botão que não faz nada, sem dizer por quê, é pior que um botão desligado.
  const confirmar = () => {
    if (precisaMotivo && motivoCurto) {
      setTentou(true);
      return;
    }
    onConfirmar();
  };

  const comum = {
    aberto: true,
    confirmando: pendente,
    erro:
      erro ??
      (tentou && precisaMotivo && motivoCurto
        ? `Escreva o motivo — ele fica no histórico deste aluno (mínimo de ${MOTIVO_MIN} caracteres).`
        : null),
    onConfirmar: confirmar,
    onCancelar,
  } as const;

  switch (acao.tipo) {
    case "alinhar-email":
      return (
        <DialogoConfirmacao
          {...comum}
          destrutivo={false}
          titulo="Alinhar o e-mail do cadastro ao do login?"
          descricao={`${acao.deCadastro ?? "cadastro sem e-mail"} → ${acao.paraLogin}`}
          consequencia={
            <>
              O cadastro do Time Holding Brasil passa a guardar{" "}
              <strong>{acao.paraLogin}</strong>, que é o e-mail com que a pessoa
              entra hoje. O login <strong>não muda</strong> e ninguém é
              desconectado; o que muda é para onde a equipe escreve.
            </>
          }
          rotuloConfirmar="Alinhar o cadastro"
          rotuloConfirmando="Alinhando…"
        />
      );

    case "vincular-pessoa":
      return (
        <DialogoConfirmacao
          {...comum}
          destrutivo={false}
          titulo="Vincular esta pessoa a um cadastro?"
          descricao={`${acao.membro.emailLogin ?? "membro sem e-mail"} · ${
            acao.membro.papel === "titular" ? "titular" : "sócio"
          } deste ambiente`}
          consequencia={
            <>
              Este membro passa a ser{" "}
              <strong>{acao.pessoa.nome ?? "o cadastro escolhido"}</strong>
              {acao.pessoa.email ? ` (${acao.pessoa.email})` : ""}. O nome e o
              telefone dele voltam a aparecer nas telas da equipe. Nada do que
              ele registrou muda de lugar, e dá para trocar o vínculo depois.
            </>
          }
          rotuloConfirmar="Vincular ao cadastro"
          rotuloConfirmando="Vinculando…"
        />
      );

    case "trocar-titular":
      return (
        <DialogoConfirmacao
          {...comum}
          titulo="Tornar esta pessoa a titular do ambiente?"
          descricao={acao.membro.emailLogin ?? "membro sem e-mail"}
          consequencia={
            <>
              <strong>
                {acao.membro.pessoaNome ??
                  acao.membro.emailLogin ??
                  "Este membro"}
              </strong>{" "}
              passa a ser o titular e o titular de hoje passa a sócio, mantendo
              login e histórico.{" "}
              <strong>
                O novo titular passa a ver o Financeiro do ambiente e o antigo
                deixa de ver
              </strong>{" "}
              — o contrato exibido continua sendo o que já estava no ambiente. A
              Etapa 01, os clientes e o Diário continuam os mesmos. Para
              desfazer, troque de volta.
            </>
          }
          rotuloConfirmar="Tornar titular"
          rotuloConfirmando="Trocando…"
        />
      );

    case "mover-membro":
      return (
        <DialogoConfirmacao
          {...comum}
          titulo="Mover este sócio para outro ambiente?"
          descricao={`${acao.membro.emailLogin ?? "sócio sem e-mail"} → ${
            acao.destino.nome ?? "ambiente escolhido"
          }`}
          consequencia={
            <>
              O acesso dele passa para o ambiente de{" "}
              <strong>{acao.destino.nome ?? "destino"}</strong>.{" "}
              <strong>
                O que ele registrou (clientes, progresso, notas e chamados) é do
                ambiente e fica no ambiente de origem.
              </strong>{" "}
              Ele deixa de enxergar tudo isso.
            </>
          }
          rotuloConfirmar="Mover sócio"
          rotuloConfirmando="Movendo…"
        />
      );

    case "liberar-etapa":
      return (
        <DialogoConfirmacao
          {...comum}
          destrutivo={false}
          titulo={`Liberar a ${rotuloEtapa(acao.etapa.etapa)} só para este aluno?`}
          descricao={acao.etapa.nome}
          consequencia={
            <>
              A <strong>{rotuloEtapa(acao.etapa.etapa)}</strong> abre{" "}
              <strong>só para este aluno</strong>. Os outros continuam com a
              regra geral, que hoje diz{" "}
              <strong>{acao.etapa.global ? "liberada" : "bloqueada"}</strong>.
              Para desfazer, use &ldquo;Voltar à regra geral&rdquo;.
            </>
          }
          rotuloConfirmar="Liberar para este aluno"
          rotuloConfirmando="Liberando…"
        >
          {campo}
        </DialogoConfirmacao>
      );

    case "travar-etapa":
      return (
        <DialogoConfirmacao
          {...comum}
          titulo={`Travar a ${rotuloEtapa(acao.etapa.etapa)} só para este aluno?`}
          descricao={acao.etapa.nome}
          consequencia={
            <>
              <strong>
                O aluno perde o acesso a esta etapa mesmo que ela esteja liberada
                para todo mundo.
              </strong>{" "}
              A regra geral continua{" "}
              <strong>{acao.etapa.global ? "liberada" : "bloqueada"}</strong>{" "}
              para os demais. Nada do que ele já fez é apagado; para desfazer,
              use &ldquo;Voltar à regra geral&rdquo;.
            </>
          }
          rotuloConfirmar="Travar para este aluno"
          rotuloConfirmando="Travando…"
        >
          {campo}
        </DialogoConfirmacao>
      );

    case "voltar-regra-geral":
      return (
        <DialogoConfirmacao
          {...comum}
          destrutivo={false}
          titulo={`Voltar a ${rotuloEtapa(acao.etapa.etapa)} à regra geral?`}
          descricao={acao.etapa.nome}
          consequencia={
            <>
              A exceção deste aluno é removida e a{" "}
              <strong>{rotuloEtapa(acao.etapa.etapa)}</strong> volta a seguir a
              regra geral, que hoje diz{" "}
              <strong>{acao.etapa.global ? "liberada" : "bloqueada"}</strong>.
              {acao.etapa.liberada && !acao.etapa.global ? (
                <> O aluno perde o acesso que tinha por exceção.</>
              ) : null}
            </>
          }
          rotuloConfirmar="Voltar à regra geral"
          rotuloConfirmando="Voltando…"
        >
          {campo}
        </DialogoConfirmacao>
      );

    case "reabrir-etapa":
      return (
        <DialogoConfirmacao
          {...comum}
          titulo={`Reabrir a ${rotuloEtapa(acao.etapa.etapa)}?`}
          descricao={acao.etapa.nome}
          consequencia={
            <>
              <strong>{acao.concluidas}</strong>{" "}
              {acao.concluidas === 1 ? "tarefa volta" : "tarefas voltam"} a ficar
              {acao.concluidas === 1 ? " pendente" : " pendentes"} para o aluno.
              Nada é apagado: cada uma fica registrada como reaberta na trilha
              dele, e dá para marcar de novo na tela da etapa.
            </>
          }
          rotuloConfirmar="Reabrir a etapa"
          rotuloConfirmando="Reabrindo…"
        >
          {campo}
        </DialogoConfirmacao>
      );

    case "vincular-financeiro":
      return (
        <DialogoConfirmacao
          {...comum}
          destrutivo={false}
          titulo="Vincular este contrato ao ambiente?"
          descricao={`${acao.candidato.produto ?? "Contrato sem produto"} · casou pelo ${
            acao.candidato.casouPor
          }`}
          consequencia={
            <>
              O contrato de{" "}
              <strong>{brlOuTraco(acao.candidato.valorTotal)}</strong> passa a
              ser deste ambiente, e o pagamento dele aparece na aba Financeiro
              para o titular. O dado continua sendo do sistema de origem: aqui
              só se decide a quem ele pertence.
            </>
          }
          rotuloConfirmar="Vincular contrato"
          rotuloConfirmando="Vinculando…"
        />
      );

    case "desvincular-financeiro":
      return (
        <DialogoConfirmacao
          {...comum}
          titulo="Desfazer o vínculo deste contrato?"
          descricao={acao.produto ?? "Contrato sem produto"}
          consequencia={
            <>
              O contrato deixa de pertencer a este ambiente e o titular passa a
              ver &ldquo;Financeiro não disponível&rdquo;.{" "}
              <strong>
                Se este vínculo não foi feito por aqui, ele veio do sistema de
                origem — desfazer apaga o trabalho dele.
              </strong>{" "}
              A origem do vínculo aparece na confirmação, depois de desfeito.
            </>
          }
          rotuloConfirmar="Desvincular contrato"
          rotuloConfirmando="Desvinculando…"
        />
      );
  }
}
