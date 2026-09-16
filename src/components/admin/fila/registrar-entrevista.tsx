"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PhoneCall, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { gravarEntrevista } from "@/app/admin/entrevista-actions";
import {
  RESULTADOS_ENTREVISTA,
  ENTREVISTA_OBSERVACOES_MAXIMO,
  DECISOR_NOME_MAXIMO,
  DECISOR_PAPEL_MAXIMO,
  QUALIDADE_MINIMA,
  QUALIDADE_MAXIMA,
  type ResultadoEntrevista,
  type DecisorInput,
} from "@/lib/entrevista-tipos";
import { PERFIS_DISC } from "@/lib/etapa1";
import type { PerfilDisc } from "@/lib/types";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";

/** Rótulos do catálogo FECHADO de resultado — "não atendeu" ≠ "sem interesse" de propósito. */
const ROTULO_RESULTADO: Record<ResultadoEntrevista, string> = {
  interessado: "Interessado",
  sem_interesse: "Sem interesse",
  nao_atendeu: "Não atendeu",
  remarcar: "Remarcar",
};

/** O que cada resultado faz com a fila — explicado no próprio Select (D.4). */
const EFEITO_RESULTADO: Record<ResultadoEntrevista, string> = {
  interessado: "Encerra a ficha.",
  sem_interesse: "Encerra a ficha.",
  nao_atendeu: "Volta para a fila (3 seguidas encerram).",
  remarcar: "Some da fila até a data do retorno.",
};

/** Catálogo FECHADO de nota de qualidade, 1-5 (`QUALIDADE_MINIMA`/`QUALIDADE_MAXIMA`). */
const NOTAS_QUALIDADE = Array.from(
  { length: QUALIDADE_MAXIMA - QUALIDADE_MINIMA + 1 },
  (_, i) => QUALIDADE_MINIMA + i,
);
const ROTULO_QUALIDADE: Record<number, string> = {
  1: "1 — muito ruim",
  2: "2 — ruim",
  3: "3 — regular",
  4: "4 — boa",
  5: "5 — muito boa",
};

/**
 * Converte o valor CRU de `<input type="datetime-local">` (hora LOCAL do
 * navegador, sem fuso — ex. "2026-09-18T14:30") para ISO com offset.
 *
 * 🔴 Armadilha de fuso do projeto: mandar a string crua faz o servidor
 * interpretá-la no PRÓPRIO fuso do processo Node (a Hostinger não define
 * `TZ`), não no fuso de quem preencheu o campo. `new Date(valorLocal)` já
 * resolve certo — o motor JS interpreta a string SEM fuso como hora local
 * de quem está executando, que aqui é o navegador do operador — e
 * `.toISOString()` devolve UTC absoluto, que o servidor lê igual em
 * qualquer fuso de processo.
 */
function paraIsoComOffset(valorLocal: string): string | null {
  if (!valorLocal) return null;
  const data = new Date(valorLocal);
  if (Number.isNaN(data.getTime())) return null;
  return data.toISOString();
}

/**
 * `min` do `<input type="datetime-local">` — precisa estar no MESMO formato
 * sem fuso que o input usa (`YYYY-MM-DDTHH:mm`), espelhando a recusa do
 * banco (retorno tem de ser no futuro). Arredonda pro minuto seguinte para
 * não recusar o "agora mesmo" por um segundo de diferença entre o render e
 * o clique.
 */
function proximoMinutoLocal(): string {
  const d = new Date(Date.now() + 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

let seqDecisor = 0;
function novaChaveDecisor(): string {
  seqDecisor += 1;
  return `novo-${seqDecisor}`;
}

interface DecisorForm extends DecisorInput {
  chave: string;
}

/**
 * O formulário de registro da ligação — abre por linha (diálogo), não em
 * página separada, para quem está ligando não perder a fila de vista.
 *
 * Resultado + DISC (opcional) + decisores (lista editável) + observações,
 * numa chamada só a `gravarEntrevista`. `router.refresh()` no sucesso: a RPC
 * filtra por `entrevista_resultado is null`, então sem o refresh a linha some
 * visualmente mas o registro fica pendente na consulta seguinte.
 */
export function RegistrarEntrevista({
  clienteId,
  clienteNome,
  discAtual,
}: {
  clienteId: string;
  clienteNome: string;
  discAtual: PerfilDisc | null;
}) {
  const router = useRouter();
  const uid = useId();
  const [aberto, setAberto] = useState(false);
  const [pending, startTransition] = useTransition();

  const [resultado, setResultado] = useState<ResultadoEntrevista | "">("");
  const [disc, setDisc] = useState<PerfilDisc | "">(discAtual ?? "");
  const [observacoes, setObservacoes] = useState("");
  const [decisores, setDecisores] = useState<DecisorForm[]>([]);
  const [retornoEm, setRetornoEm] = useState("");
  const [qualidade, setQualidade] = useState<number | "">("");
  const [erro, setErro] = useState<string | null>(null);
  const [pedirConfirmacaoFechar, setPedirConfirmacaoFechar] = useState(false);

  function reiniciar() {
    setResultado("");
    setDisc(discAtual ?? "");
    setObservacoes("");
    setDecisores([]);
    setRetornoEm("");
    setQualidade("");
    setErro(null);
  }

  /** D.3: só há algo a perder se o operador já digitou/escolheu alguma coisa. */
  const temConteudoParaPerder =
    resultado !== "" ||
    observacoes.trim() !== "" ||
    decisores.length > 0 ||
    retornoEm !== "" ||
    qualidade !== "";

  function tentarFechar() {
    if (temConteudoParaPerder) {
      setPedirConfirmacaoFechar(true);
      return;
    }
    setAberto(false);
    reiniciar();
  }

  function adicionarDecisor() {
    setDecisores((atual) => [
      ...atual,
      { chave: novaChaveDecisor(), nome: "", papelNoNegocio: "", principal: false },
    ]);
  }

  function removerDecisor(chave: string) {
    setDecisores((atual) => atual.filter((d) => d.chave !== chave));
  }

  function atualizarDecisor(chave: string, patch: Partial<DecisorForm>) {
    setDecisores((atual) =>
      atual.map((d) => (d.chave === chave ? { ...d, ...patch } : d)),
    );
  }

  function marcarPrincipal(chave: string) {
    // Um só marcador de "principal" — não é exclusividade imposta pelo
    // banco, mas manter mais de um marcado na mesma ligação confundiria
    // quem lê o dossiê depois.
    setDecisores((atual) =>
      atual.map((d) => ({ ...d, principal: d.chave === chave })),
    );
  }

  /**
   * D.1: campo de retorno some E LIMPA o valor quando o resultado deixa de
   * ser "remarcar" — campo escondido que guarda valor manda dado que o
   * operador não vê mais na tela.
   */
  function mudarResultado(v: ResultadoEntrevista) {
    setResultado(v);
    if (v !== "remarcar") setRetornoEm("");
  }

  const observacoesValidas = observacoes.length <= ENTREVISTA_OBSERVACOES_MAXIMO;
  const decisoresValidos = decisores.every(
    (d) =>
      d.nome.trim().length > 0 &&
      d.nome.length <= DECISOR_NOME_MAXIMO &&
      (d.papelNoNegocio ?? "").length <= DECISOR_PAPEL_MAXIMO,
  );
  // Comparação em string, não `Date.now()` (impuro durante o render, reprova
  // o lint `react-hooks/purity`): o formato do `datetime-local` é ordenável
  // lexicograficamente, e `proximoMinutoLocal()` já é a mesma régua do `min`.
  const retornoValido =
    resultado !== "remarcar" ||
    (retornoEm !== "" && retornoEm > proximoMinutoLocal());
  const podeSalvar =
    resultado !== "" &&
    observacoesValidas &&
    decisoresValidos &&
    retornoValido &&
    !pending;

  function salvar() {
    if (resultado === "") {
      setErro("Escolha o resultado da ligação.");
      return;
    }
    if (resultado === "remarcar" && !retornoEm) {
      setErro("Informe a data do retorno para remarcar.");
      return;
    }
    if (
      resultado === "remarcar" &&
      retornoEm &&
      new Date(retornoEm).getTime() <= Date.now()
    ) {
      setErro("A data do retorno precisa ser no futuro.");
      return;
    }
    if (!observacoesValidas) {
      setErro(`As observações passam de ${ENTREVISTA_OBSERVACOES_MAXIMO} caracteres.`);
      return;
    }
    if (!decisoresValidos) {
      setErro("Todo decisor precisa de nome; confira os tamanhos dos campos.");
      return;
    }
    setErro(null);

    startTransition(async () => {
      const res = await gravarEntrevista({
        clienteId,
        resultado,
        disc: disc === "" ? null : disc,
        observacoes: observacoes.trim() || null,
        decisores: decisores.map((d) => ({
          nome: d.nome.trim(),
          papelNoNegocio: d.papelNoNegocio?.trim() || null,
          principal: d.principal,
        })),
        retornoEm: resultado === "remarcar" ? paraIsoComOffset(retornoEm) : null,
        qualidade: qualidade === "" ? null : qualidade,
      });

      if (!res.ok) {
        setErro(res.erro ?? "Não foi possível registrar a entrevista.");
        return;
      }

      toast.success(`Entrevista registrada — ${clienteNome}.`);
      reiniciar();
      setAberto(false);
      router.refresh();
    });
  }

  return (
    <>
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        if (!v && pending) return;
        if (!v) {
          tentarFechar();
          return;
        }
        setAberto(v);
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm" aria-label={`Registrar ligação para ${clienteNome}`}>
            <PhoneCall aria-hidden />
            Registrar
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar entrevista — {clienteNome}</DialogTitle>
          <DialogDescription>
            Resultado da ligação, perfil DISC e decisores do negócio. O advogado
            da reunião preliminar lê este registro depois.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="grid gap-4" disabled={pending}>
          <legend className="sr-only">Dados da ligação</legend>

          <div className="grid gap-2">
            <Label htmlFor={`${uid}-resultado`}>Resultado da ligação</Label>
            <Select
              value={resultado}
              onValueChange={(v) => mudarResultado(v as ResultadoEntrevista)}
            >
              <SelectTrigger id={`${uid}-resultado`} className="w-full">
                <SelectValue placeholder="Escolha um resultado">
                  {(v: ResultadoEntrevista) => ROTULO_RESULTADO[v]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {RESULTADOS_ENTREVISTA.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROTULO_RESULTADO[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* D.4: o que cada resultado faz com a fila. */}
            <p className="text-xs text-muted-foreground">
              {resultado === ""
                ? "Interessado/sem interesse encerram a ficha; não atendeu volta para a fila (3 seguidas encerram); remarcar some até a data do retorno."
                : EFEITO_RESULTADO[resultado]}
            </p>
          </div>

          {/* D.1: campo condicional, só com resultado "remarcar". */}
          {resultado === "remarcar" ? (
            <div className="grid gap-2">
              <Label htmlFor={`${uid}-retorno`}>Data do retorno</Label>
              <Input
                id={`${uid}-retorno`}
                type="datetime-local"
                value={retornoEm}
                onChange={(e) => setRetornoEm(e.target.value)}
                min={proximoMinutoLocal()}
                aria-required="true"
                aria-invalid={!retornoValido || undefined}
              />
              <p className="text-xs text-muted-foreground">
                Precisa ser uma data futura — o cliente some da fila até lá.
              </p>
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor={`${uid}-disc`}>
              Perfil DISC <span className="text-muted-foreground">(opcional)</span>
              {/* D.4: distingue "já existia" de "escolhido agora". */}
              {discAtual ? (
                <span className="text-muted-foreground"> — já registrado: {PERFIS_DISC.find((d) => d.id === discAtual)?.rotulo ?? discAtual}</span>
              ) : null}
            </Label>
            <Select
              value={disc}
              onValueChange={(v) => setDisc((v as PerfilDisc) ?? "")}
            >
              <SelectTrigger id={`${uid}-disc`} className="w-full">
                <SelectValue placeholder="Não informado">
                  {(v: PerfilDisc) =>
                    PERFIS_DISC.find((d) => d.id === v)?.rotulo ?? v
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PERFIS_DISC.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`${uid}-qualidade`}>
              Nota de qualidade da ligação{" "}
              <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Select
              value={qualidade === "" ? "" : String(qualidade)}
              onValueChange={(v) => setQualidade(v === "" ? "" : Number(v))}
            >
              <SelectTrigger id={`${uid}-qualidade`} className="w-full">
                <SelectValue placeholder="Não avaliada">
                  {(v: string) => ROTULO_QUALIDADE[Number(v)] ?? v}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {NOTAS_QUALIDADE.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {ROTULO_QUALIDADE[n]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Como você avalia a ligação em si — vale para qualquer resultado.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`${uid}-obs`}>Observações</Label>
            <Textarea
              id={`${uid}-obs`}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={4}
              maxLength={ENTREVISTA_OBSERVACOES_MAXIMO}
              placeholder="O que foi dito na ligação, contexto para a reunião preliminar."
            />
            <p className="text-right text-xs text-muted-foreground">
              {observacoes.length}/{ENTREVISTA_OBSERVACOES_MAXIMO}
            </p>
          </div>

          <fieldset className="grid gap-3 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">
              Decisores do negócio
            </legend>

            {decisores.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum decisor adicionado ainda.
              </p>
            ) : (
              <ul className="grid gap-3">
                {decisores.map((d, i) => (
                  <li key={d.chave} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
                    <div className="grid gap-1">
                      <Label htmlFor={`${uid}-decisor-nome-${i}`}>Nome</Label>
                      <Input
                        id={`${uid}-decisor-nome-${i}`}
                        value={d.nome}
                        onChange={(e) =>
                          atualizarDecisor(d.chave, { nome: e.target.value })
                        }
                        maxLength={DECISOR_NOME_MAXIMO}
                        aria-required="true"
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor={`${uid}-decisor-papel-${i}`}>
                        Papel no negócio <span className="text-muted-foreground">(opcional)</span>
                      </Label>
                      <Input
                        id={`${uid}-decisor-papel-${i}`}
                        value={d.papelNoNegocio ?? ""}
                        onChange={(e) =>
                          atualizarDecisor(d.chave, { papelNoNegocio: e.target.value })
                        }
                        maxLength={DECISOR_PAPEL_MAXIMO}
                      />
                    </div>
                    <label className="flex items-center gap-1.5 text-sm whitespace-nowrap">
                      <Checkbox
                        checked={d.principal}
                        onCheckedChange={() => marcarPrincipal(d.chave)}
                        aria-label={`Marcar ${d.nome || "este decisor"} como principal`}
                      />
                      <Star aria-hidden className="size-3.5" />
                      Principal
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removerDecisor(d.chave)}
                      aria-label={`Remover decisor ${d.nome || i + 1}`}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={adicionarDecisor}
              className="w-fit"
            >
              <Plus aria-hidden />
              Acrescentar decisor
            </Button>
          </fieldset>
        </fieldset>

        <p role="alert" className="text-sm text-destructive empty:hidden">
          {erro}
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={tentarFechar} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={!podeSalvar} aria-busy={pending || undefined}>
            {pending ? "Salvando..." : "Salvar entrevista"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/*
      D.3: Esc/clique-fora com conteúdo digitado NÃO descarta em silêncio.
      Reuso de `DialogoConfirmacao` (não criar componente novo) — o mesmo
      padrão do `lote-acesso.tsx`: a guarda só acende quando há algo a
      perder; diálogo vazio fecha direto (ver `tentarFechar`).
    */}
    <DialogoConfirmacao
      aberto={pedirConfirmacaoFechar}
      titulo="Descartar o registro desta ligação?"
      consequencia="O resultado, a data de retorno, a nota e as observações digitadas para este cliente serão perdidos."
      rotuloConfirmar="Descartar"
      rotuloCancelar="Voltar ao formulário"
      destrutivo
      onConfirmar={() => {
        setPedirConfirmacaoFechar(false);
        setAberto(false);
        reiniciar();
      }}
      onCancelar={() => setPedirConfirmacaoFechar(false)}
    />
    </>
  );
}
