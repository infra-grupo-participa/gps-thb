"use client";

/**
 * Liberar etapas da trilha para VÁRIOS parceiros de uma vez (30/09/2026).
 *
 * Molde: `lote-acesso.tsx` (barra de seleção, teto escrito, confirmação
 * nomeada). O que muda:
 *
 * 1. **Só LIBERAR.** O seletor oferece "Não mexer" e "Liberar" — travar em
 *    lote não existe aqui. `override: null` em toda etapa: num lote não há
 *    estado individual para mostrar (cada pessoa pode ter o seu).
 * 2. **Motivo obrigatório (MOTIVO_MIN..MOTIVO_MAX).** Vai para a trilha de
 *    cada parceiro — o mesmo contrato da liberação individual da Central.
 * 3. **Atômico.** `definirLiberacaoEtapasEmLote` grava tudo ou nada: com
 *    `erro`, nada foi gravado, e a seleção FICA para tentar de novo.
 * 4. **O resultado é contagem, não relatório por pessoa**: não há e-mail nem
 *    senha envolvidos, e a action é atômica — "X alterações, Y já estavam
 *    assim" diz tudo o que aconteceu.
 */

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ListChecks, X } from "lucide-react";

import { definirLiberacaoEtapasEmLote } from "@/app/admin/central-actions";
// ⚠️ Constantes em módulo `-tipos`, nunca no `central-actions.ts`: arquivo
// `"use server"` só exporta função async (ver `lote-acesso.tsx`).
import {
  LOTE_ETAPAS_MAX_ALUNOS,
  MOTIVO_MAX,
  MOTIVO_MIN,
  type ItemLiberacaoEtapa,
} from "@/lib/etapas-lote-tipos";
import type { AlunoGps } from "@/lib/data";
import type { Etapa } from "@/lib/types";
import {
  SeletorEtapas,
  type EscolhaEtapa,
  type EtapaInfo,
} from "@/components/admin/etapas-liberacao/seletor-etapas";
import { Button } from "@/components/ui/button";
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type PessoaDoLote = Pick<AlunoGps, "alunoId" | "aluno">;

const nomeDe = (a: PessoaDoLote) =>
  a.aluno?.nome ?? a.aluno?.email ?? "Parceiro sem nome";

const plural = (n: number, um: string, varios: string) =>
  `${n} ${n === 1 ? um : varios}`;

function escolhaInicial(etapas: Etapa[]): Record<number, EscolhaEtapa> {
  return Object.fromEntries(etapas.map((e) => [e.id, "regra" as const]));
}

export function LoteDeEtapas({
  etapas,
  selecionados,
  candidatos,
  onLimpar,
  onSelecionarAte,
}: {
  /** As etapas com a liberação global (`getEtapas()`, lida uma vez na página). */
  etapas: Etapa[];
  /** Os marcados, na ordem da lista (já é a interseção com o que está na tela). */
  selecionados: PessoaDoLote[];
  /** O que a lista mostra agora — a base do "selecionar todos". */
  candidatos: PessoaDoLote[];
  onLimpar: () => void;
  /** Marca os N primeiros da lista visível (N = o teto). */
  onSelecionarAte: (n: number) => void;
}) {
  const router = useRouter();
  const idMotivo = useId();
  const [escolha, setEscolha] = useState<Record<number, EscolhaEtapa>>(() =>
    escolhaInicial(etapas),
  );
  const [motivo, setMotivo] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();

  const infos: EtapaInfo[] = etapas.map((e) => ({
    numero: e.id,
    titulo: e.nome,
    liberadaGlobal: e.liberada,
    override: null,
  }));

  const qtd = selecionados.length;
  const acimaDoTeto = qtd > LOTE_ETAPAS_MAX_ALUNOS;
  const aLiberar = etapas.filter((e) => escolha[e.id] === "liberar");
  const itens: ItemLiberacaoEtapa[] = aLiberar.map((e) => ({
    etapa: e.id,
    liberada: true,
  }));
  const tamMotivo = motivo.trim().length;
  const motivoOk = tamMotivo >= MOTIVO_MIN && tamMotivo <= MOTIVO_MAX;

  // A razão do travamento fica ESCRITA — nunca deixar clicar para o servidor
  // recusar depois. Uma frase só, a primeira que falta.
  const bloqueio =
    qtd === 0
      ? null // a barra já diz "Nenhum parceiro selecionado"
      : acimaDoTeto
        ? `Selecione no máximo ${LOTE_ETAPAS_MAX_ALUNOS} por vez — a liberação grava tudo numa transação só, e o teto a mantém curta.`
        : itens.length === 0
          ? "Marque “Liberar” em pelo menos uma etapa."
          : !motivoOk
            ? `Escreva o motivo (${MOTIVO_MIN} a ${MOTIVO_MAX} caracteres).`
            : null;
  const podeEnviar = qtd > 0 && bloqueio === null && !enviando;

  const nomesEtapas = aLiberar.map((e) => `Etapa ${e.id} (${e.nome})`).join(", ");

  function liberar() {
    setErro(null);
    const ids = selecionados.map((a) => a.alunoId);
    const motivoLimpo = motivo.trim();
    startTransition(async () => {
      const r = await definirLiberacaoEtapasEmLote(ids, itens, motivoLimpo);
      if (r.erro) {
        // Atômica: nada foi gravado. A seleção fica para tentar de novo.
        setErro(r.erro);
        return;
      }
      const alterados = r.alterados ?? 0;
      const semMudanca = r.semMudanca ?? 0;
      setConfirmando(false);
      setResultado(
        `${plural(alterados, "alteração", "alterações")}, ${semMudanca} ${
          semMudanca === 1 ? "já estava assim" : "já estavam assim"
        }.`,
      );
      setEscolha(escolhaInicial(etapas));
      setMotivo("");
      onLimpar();
      // Sem isto os cards e a Central continuam mostrando a liberação antiga
      // até alguém recarregar à mão.
      router.refresh();
    });
  }

  return (
    <div className="grid gap-2 rounded-xl bg-superficie-afundada px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 corpo-sm">
          <span className="font-medium">
            {qtd === 0
              ? "Nenhum parceiro selecionado"
              : `${plural(qtd, "parceiro selecionado", "parceiros selecionados")}`}
          </span>
          <span className="text-muted-foreground">
            {" "}
            · {candidatos.length} nesta lista · até {LOTE_ETAPAS_MAX_ALUNOS} por
            vez
          </span>
        </p>

        {qtd > 0 ? (
          <Button variant="ghost" size="sm" onClick={onLimpar} disabled={enviando}>
            <X aria-hidden />
            Limpar seleção
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={candidatos.length === 0}
            onClick={() => onSelecionarAte(LOTE_ETAPAS_MAX_ALUNOS)}
          >
            Selecionar{" "}
            {candidatos.length <= LOTE_ETAPAS_MAX_ALUNOS
              ? "todos"
              : `os primeiros ${LOTE_ETAPAS_MAX_ALUNOS}`}
          </Button>
        )}
      </div>

      <SeletorEtapas
        etapas={infos}
        valor={escolha}
        onChange={(v: Record<number, EscolhaEtapa>) => setEscolha(v)}
        opcoes={["regra", "liberar"]}
        rotuloRegra="Não mexer"
        disabled={enviando}
      />

      <div className="grid gap-1">
        <Label htmlFor={idMotivo}>Motivo (fica no histórico de cada parceiro)</Label>
        <Textarea
          id={idMotivo}
          value={motivo}
          rows={2}
          maxLength={MOTIVO_MAX}
          disabled={enviando}
          aria-describedby={`${idMotivo}-ajuda`}
          aria-invalid={(motivo.length > 0 && !motivoOk) || undefined}
          onChange={(e) => setMotivo(e.target.value)}
        />
        <p id={`${idMotivo}-ajuda`} className="corpo-sm text-muted-foreground">
          Obrigatório, de {MOTIVO_MIN} a {MOTIVO_MAX} caracteres ({tamMotivo}/
          {MOTIVO_MAX}).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={!podeEnviar}
          onClick={() => {
            setErro(null);
            setResultado(null);
            setConfirmando(true);
          }}
        >
          <ListChecks aria-hidden />
          Liberar etapas para os selecionados
        </Button>
        {bloqueio ? (
          <p className="corpo-sm text-atencao-foreground">{bloqueio}</p>
        ) : null}
      </div>

      {/* Sempre montado: região viva que nasce junto com o texto não é
          anunciada por todo leitor de tela. */}
      <p aria-live="polite" className="corpo-sm">
        {resultado}
      </p>

      <DialogoConfirmacao
        aberto={confirmando}
        titulo={`Liberar ${aLiberar.length === 1 ? "1 etapa" : `${aLiberar.length} etapas`} para ${plural(qtd, "pessoa", "pessoas")}?`}
        descricao={
          <span className="line-clamp-3">
            {selecionados.map(nomeDe).join(", ")}
          </span>
        }
        consequencia={
          <>
            {nomesEtapas} {aLiberar.length === 1 ? "fica liberada" : "ficam liberadas"}{" "}
            para essas {plural(qtd, "pessoa", "pessoas")}, mesmo que a regra
            geral mantenha a etapa travada.{" "}
            <strong>
              Liberar a etapa também libera o agendamento de sessão dela.
            </strong>{" "}
            O motivo vai para a trilha de cada parceiro.
          </>
        }
        rotuloConfirmar={`Liberar para ${plural(qtd, "pessoa", "pessoas")}`}
        rotuloConfirmando="Liberando…"
        destrutivo={false}
        confirmando={enviando}
        erro={erro}
        onConfirmar={liberar}
        onCancelar={() => {
          if (enviando) return;
          setConfirmando(false);
          setErro(null);
        }}
      />
    </div>
  );
}
