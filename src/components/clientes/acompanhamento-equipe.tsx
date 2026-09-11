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
 * O caminho de saída, num lugar só. Vai como `?assunto=` para o Suporte, que
 * usa o valor como texto inicial do campo (prefill, nada mais — quem valida
 * continua sendo `abrirChamado`).
 */
/**
 * 🔴 Recebe `basePath` porque o link ABSOLUTO ejetava o admin do ambiente:
 * `/chamados` redireciona quem é admin para `/admin/chamados`, e ele perdia
 * o aluno, o cliente e o `?assunto=`. No Modo Assistência o destino tem de
 * ser `/admin/aluno/<id>/chamados`.
 *
 * Default vazio = o caminho do aluno, que é o caso mais comum.
 */
export function hrefChamadoTroca(basePath = ""): string {
  return `${basePath}/chamados?assunto=Trocar%20cliente%20acompanhado`;
}

/**
 * A frase da estrela travada. Repetida em 4 telas, escrita aqui.
 *
 * 🔴 SÓ VALE DEPOIS QUE A EQUIPE CONFIRMA (corrigido em 10/09/2026). Antes
 * ela aparecia desde o instante em que o parceiro marcava a estrela — e a
 * trigger de fato bloqueava, mesmo sem a equipe ter olhado o cliente.
 *
 * Dos 5 chamados abertos no primeiro dia de uso, os 5 eram sobre isso.
 */
export const TEXTO_TROCA_POR_CHAMADO =
  "A equipe assumiu este cliente. Para trocar, abra um chamado";

/** A frase de quando a equipe AINDA NÃO assumiu: o parceiro troca sozinho. */
export const TEXTO_TROCA_LIVRE =
  "Você pode trocar enquanto a equipe não assumir este cliente";

/** O link "abra um chamado", já com o assunto preenchido. */
export function LinkTrocaPorChamado({
  className = "",
  basePath = "",
}: {
  className?: string;
  /** Vazio para o aluno; `/admin/aluno/<id>` no Modo Assistência. */
  basePath?: string;
}) {
  return (
    <Link
      href={hrefChamadoTroca(basePath)}
      className={
        "inline-flex items-center gap-1 font-medium text-accent-foreground underline underline-offset-4 " +
        className
      }
    >
      <LifeBuoy aria-hidden className="size-3.5" />
      {TEXTO_TROCA_POR_CHAMADO}
    </Link>
  );
}

/**
 * O aviso da ficha do cliente que o ALUNO escolheu e a equipe ainda não
 * confirmou (migração ...215).
 *
 * 🔴 O caminho da troca é LIVRE aqui (corrigido em 11/09/2026): enquanto
 * `acompanhamento_confirmado_em` é nulo, a trigger devolve `old` e o parceiro
 * desmarca sozinho. Este aviso mandava abrir chamado desde o primeiro
 * instante — foi o que gerou os 5 chamados do primeiro dia de uso.
 */
export function AvisoEscolhaFeita() {
  return (
    <div className="grid gap-2 rounded-xl border border-borda-fina bg-superficie-afundada p-3.5">
      <p className="corpo-sm">
        <strong>Este é o cliente que a equipe acompanha.</strong> A equipe vai
        acompanhar todo o progresso dele até a sua primeira holding. O resto da
        ficha segue editável — telefone, registro do contato, honorários,
        contrato assinado, perfil DISC e problemas.
      </p>
      <p className="corpo-sm text-muted-foreground">
        {TEXTO_TROCA_LIVRE}: basta clicar na estrela deste cliente ou marcar
        outro. Depois que ela assumir, a troca passa a ser pelo Suporte.
      </p>
    </div>
  );
}

/**
 * O aviso que o aluno lê na ficha do cliente acompanhado.
 *
 * `admin` muda só a última linha: mandar a equipe "falar com a equipe pelo
 * Suporte" seria mandá-la abrir chamado consigo mesma.
 *
 * 🔑 **Na prévia "como o aluno vê" a última linha troca de variante**, por CSS
 * e sem JavaScript: a linha da equipe leva `previa-oculta` (some quando
 * `html[data-previa="aluno"]`) e a linha do aluno é montada junto, escondida,
 * aparecendo só nessa mesma condição. Sem isso a prévia mostrava ao admin um
 * texto que o aluno NUNCA vê — mentindo na única pergunta que ela existe para
 * responder. Só o admin paga o custo do nó extra: para o aluno de verdade,
 * `admin` é `false` e a variante dele é renderizada direto.
 */
export function AvisoAcompanhamento({
  confirmadoEm,
  admin = false,
  basePath = "",
}: {
  confirmadoEm: string;
  admin?: boolean;
  basePath?: string;
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
        telefone, registro do contato, honorários, contrato assinado, perfil
        DISC e problemas.
      </p>
      {admin ? (
        <>
          {/* ⚠️ Depois da migração ...215 “Liberar acompanhamento” NÃO devolve
              ao aluno o direito de trocar a estrela: ele solta só a camada de
              dentro (a fase volta a poder ir para Prospecção e o cliente volta
              a poder ser excluído). A troca continua sendo da equipe, aqui
              mesmo. */}
          <p className="previa-oculta corpo-sm text-sucesso-foreground">
            “Liberar acompanhamento” solta a fase e a exclusão deste cliente. A
            troca do cliente acompanhado continua sendo da equipe — feita aqui,
            no Modo Assistência.
          </p>
          {/* A MESMA linha que o aluno lê, visível só dentro da prévia. */}
          <p className="hidden corpo-sm text-sucesso-foreground [html[data-previa=aluno]_&]:block">
            Precisa trocar? <LinkTrocaPorChamado basePath={basePath} /> — a equipe faz a troca com
            você.
          </p>
        </>
      ) : (
        <p className="corpo-sm text-sucesso-foreground">
          Precisa trocar? <LinkTrocaPorChamado basePath={basePath} /> — a equipe faz a troca com
          você.
        </p>
      )}
    </div>
  );
}

/**
 * O aviso na ficha de um cliente que NÃO é o acompanhado, quando OUTRO do
 * ambiente já é. Existe para a estrela ausente ter explicação — botão que some
 * sem motivo é tão ruim quanto botão que falha.
 *
 * `confirmado` separa os dois estados: a equipe já assumiu, ou o aluno apenas
 * escolheu (e a ...215 já trava a troca nos dois casos).
 */
export function AvisoOutroConfirmado({
  nome,
  admin = false,
  confirmado = true,
  basePath = "",
}: {
  nome: string | null;
  admin?: boolean;
  confirmado?: boolean;
  basePath?: string;
}) {
  return (
    <p className="corpo-sm text-muted-foreground">
      {confirmado ? "A equipe está acompanhando " : "O cliente acompanhado é "}
      <strong className="text-foreground">{nome || "outro cliente"}</strong>, por
      isso a estrela não pode ser movida para cá.{" "}
      {admin ? (
        "A troca é feita na ficha daquele cliente, no Modo Assistência."
      ) : (
        <>
          <LinkTrocaPorChamado basePath={basePath} /> — a equipe faz a troca com você.
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
      <Label htmlFor={id}>Motivo (fica no histórico do parceiro)</Label>
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
        {valor.trim().length}/{MOTIVO_MAX}). Aparece na trilha deste parceiro.
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
          : `${nome} voltou a poder ser trocado pelo parceiro.`,
      );
      aoMudar();
    });
  }

  return (
    // 🔑 `previa-oculta`: o bloco "Equipe" (Confirmar/Liberar acompanhamento) é
    // exclusivo do admin e SOME na prévia "como o aluno vê" — o aluno não tem
    // esses botões nem esse texto. É só visual: a sessão continua sendo a do
    // admin e a RPC continua exigindo `gp_is_admin()`.
    <div className="previa-oculta grid gap-2 rounded-xl border border-borda-fina bg-superficie-afundada p-3.5">
      <p className="rotulo text-accent-foreground">Equipe</p>
      <p className="corpo-sm text-muted-foreground">
        {confirmado
          ? "A equipe assumiu o acompanhamento deste cliente. Liberar solta a fase e a exclusão; a troca do cliente continua sendo da equipe."
          : "Confirmar registra que a equipe ASSUMIU este cliente — e é isso que trava a troca. Até confirmar, o parceiro ainda pode escolher outro sozinho."}
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
                A partir de agora{" "}
                <strong>
                  a fase deste cliente não volta para Prospecção e ele não pode
                  ser excluído
                </strong>
                ; o parceiro continua editando o resto da ficha. A troca do cliente
                acompanhado já era da equipe desde que o parceiro marcou a estrela
                (migração ...215). A trava é do banco — vale também fora desta
                tela.
              </>
            ) : (
              <>
                A fase deste cliente <strong>volta a poder ir para
                Prospecção</strong> e ele volta a poder ser excluído. A{" "}
                <strong>estrela continua neste cliente</strong> e a troca segue
                sendo da equipe (migração ...215) — desmarcar aqui travaria os
                passos 4 a 8 da Etapa 01 de quem não pediu nada.
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
              ? `Escreva o motivo — ele fica no histórico deste parceiro (mínimo de ${MOTIVO_MIN} caracteres).`
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
                : "Ex.: o cliente desistiu; o parceiro vai escolher outro."
            }
          />
        </DialogoConfirmacao>
      ) : null}
    </div>
  );
}
