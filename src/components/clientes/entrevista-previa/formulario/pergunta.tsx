"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import {
  BLOCOS_ENTREVISTA,
  type OpcaoPergunta,
  type PerguntaEntrevista,
  type SinalDecisor,
} from "@/lib/entrevista-previa-perguntas";
import { ROTULO_DECISOR, type DecisorDetectado } from "@/lib/entrevista-previa-calculo";

/**
 * UMA pergunta da Entrevista Prévia 3.0 — só apresentação. Estado, navegação e
 * gravação moram em `index.tsx`; aqui nada busca dado nem chama action.
 *
 * 🔑 Não há DISC parcial nesta tela (plano 3.0, §2): um "Parcial: D" no meio
 * da conversa convida o parceiro a conduzir o resto já com a letra na cabeça,
 * e a letra de meia entrevista muda na última pergunta, que pesa 3.
 *
 * 🔴 Sem `transition`/`animation`: o destaque de 200 ms da escolha única é o
 * `aria-pressed` pintado na hora; quem avança é o `setTimeout` de `index.tsx`,
 * não um keyframe (trocar um pelo outro já matou gatilho com a suíte verde).
 */
export function TelaPergunta({
  pergunta,
  marcadas,
  posicao,
  total,
  minutosRestantes,
  temAnterior,
  focar,
  emAjuste,
  decideJunto,
  nomes,
  onNome,
  onEscolher,
  onContinuar,
  onAnterior,
  onPular,
  onVoltarValidacao,
}: {
  pergunta: PerguntaEntrevista;
  marcadas: string[];
  posicao: number;
  total: number;
  minutosRestantes: number;
  temAnterior: boolean;
  /** Leva o foco ao enunciado ao montar (troca de pergunta), não no 1º render da página. */
  focar: boolean;
  /** Veio do "Ajustar" da validação: mostra o atalho de volta. */
  emAjuste: boolean;
  /** Quem decide junto — os campos de nome em `presenca_decisores`. */
  decideJunto: DecisorDetectado[];
  nomes: Partial<Record<SinalDecisor, string>>;
  onNome: (sinal: SinalDecisor, nome: string) => void;
  onEscolher: (opcaoId: string) => void;
  onContinuar: () => void;
  onAnterior: () => void;
  onPular: () => void;
  onVoltarValidacao: () => void;
}) {
  const tituloRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // Teclado e leitor de tela: a pergunta nova é anunciada e o próximo Tab
    // cai nas opções dela, não no botão da pergunta anterior.
    if (focar) tituloRef.current?.focus();
  }, [focar]);

  const bloco = BLOCOS_ENTREVISTA.find((b) => b.id === pergunta.bloco);
  // A escolha única avança sozinha, EXCETO onde há campo de texto na mesma
  // tela (nomes dos decisores): avançar no clique esconderia os campos antes
  // de o parceiro digitar.
  const comContinuar = Boolean(pergunta.multipla || pergunta.pedeNomesDecisores);
  // O selo já diz "Não pergunte"; repetir no enunciado lia como eco.
  const enunciado = pergunta.observacao
    ? pergunta.enunciado.replace(/^Não pergunte\.\s*/, "")
    : pergunta.enunciado;
  const marcadasSet = new Set(marcadas);
  const opcoes = pergunta.opcoes.filter((o) => !o.aposentada);
  const emColunas = opcoes.some((o) => o.grupo);

  function botao(o: OpcaoPergunta) {
    const ativa = marcadasSet.has(o.id);
    return (
      <button
        key={o.id}
        type="button"
        onClick={() => onEscolher(o.id)}
        aria-pressed={ativa}
        // `min-h-14`: alvo generoso para quem clica sem olhar, com o
        // telefone na orelha. Muito acima dos 24 px do WCAG 2.5.8.
        className={
          "foco-visivel flex min-h-14 w-full items-center rounded-md border px-4 py-3 text-left corpo " +
          (ativa
            ? "border-marca-acao bg-marca-acao/10 font-medium text-accent-foreground"
            : "border-borda-forte hover:bg-superficie-afundada")
        }
      >
        {pergunta.multipla ? (
          // Múltipla: a caixa diz "pode marcar mais de um" pela FORMA, não só
          // pela cor do fundo (WCAG 1.4.1).
          <span
            aria-hidden
            className={
              "mr-3 inline-flex size-4 shrink-0 items-center justify-center border text-[0.7rem] leading-none " +
              (ativa ? "border-marca-acao" : "border-borda-forte")
            }
          >
            {ativa ? "✓" : ""}
          </span>
        ) : null}
        {o.rotulo}
      </button>
    );
  }

  return (
    <div className="grid gap-4">
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <p className="rotulo text-muted-foreground">{bloco?.rotulo}</p>
          <p className="corpo-sm text-muted-foreground">
            Pergunta {posicao} de {total}
            {minutosRestantes > 0 ? ` · ≈ ${minutosRestantes} min restantes` : ""}
          </p>
        </div>
        <div
          className="mt-2 h-2 w-full bg-superficie-afundada"
          role="progressbar"
          aria-valuenow={posicao}
          aria-valuemin={1}
          aria-valuemax={total}
          aria-label={`Pergunta ${posicao} de ${total}`}
        >
          <div className="h-full bg-marca-acao" style={{ width: `${(posicao / total) * 100}%` }} />
        </div>
      </div>

      <div>
        {pergunta.observacao ? (
          <p className="rotulo mb-2 inline-block border border-foreground px-2 py-0.5 uppercase">
            Não pergunte
          </p>
        ) : null}
        {/* O enunciado é grande porque é para ser LIDO EM VOZ ALTA. */}
        <h2 ref={tituloRef} tabIndex={-1} className="titulo-h2 outline-none">
          {enunciado}
        </h2>
        {pergunta.dica ? (
          <p className="corpo-sm mt-2 text-muted-foreground">{pergunta.dica}</p>
        ) : null}
      </div>

      {!pergunta.observacao ? (
        <p className="corpo-sm text-muted-foreground">
          Marque o que mais se aproxima — não leia as opções.
        </p>
      ) : null}

      {emColunas ? (
        // `obs_comportamento`: duas colunas, JEITO × PONTOS DE ATENÇÃO. O
        // primeiro grupo pesa no DISC; o segundo vai só para o briefing.
        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              ["jeito", "Jeito"],
              ["atencao", "Pontos de atenção"],
            ] as const
          ).map(([grupo, rotulo]) => (
            <div key={grupo} role="group" aria-label={rotulo} className="grid content-start gap-2">
              <p className="rotulo text-muted-foreground">{rotulo}</p>
              {opcoes.filter((o) => o.grupo === grupo).map(botao)}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-2">{opcoes.map(botao)}</div>
      )}

      {pergunta.pedeNomesDecisores && decideJunto.length > 0 ? (
        <div className="grid gap-3 border-t border-borda-fina pt-4">
          <p className="rotulo text-muted-foreground">Nome de quem decide junto (opcional)</p>
          {decideJunto.map((d) => (
            <label key={d.sinal} className="grid gap-1">
              <span className="corpo-sm">{ROTULO_DECISOR[d.sinal]}</span>
              <input
                type="text"
                value={nomes[d.sinal] ?? ""}
                onChange={(e) => onNome(d.sinal, e.target.value)}
                placeholder="Nome"
                maxLength={120}
                autoComplete="off"
                className="w-full rounded-md border border-borda-forte bg-card px-3 py-2 corpo-sm focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
            </label>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {comContinuar ? (
          <Button onClick={onContinuar} disabled={marcadas.length === 0}>
            Continuar
          </Button>
        ) : null}
        <Button variant="outline" onClick={onAnterior} disabled={!temAnterior}>
          Anterior
        </Button>
        <Button variant="ghost" onClick={onPular}>
          Pular
        </Button>
        {emAjuste ? (
          <Button variant="outline" className="ml-auto" onClick={onVoltarValidacao}>
            Voltar à confirmação
          </Button>
        ) : null}
      </div>
    </div>
  );
}
