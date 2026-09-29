"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatarDataHora, formatarDataSoDia } from "@/lib/datas";
import {
  FRASE_MAXIMO_CARACTERES,
  FRASES_MAXIMO,
  type ValidacaoEntrevista,
} from "@/lib/entrevista-previa-fluxo";

/**
 * A CONFIRMAÇÃO antes de concluir: o parceiro lê a frase montada em voz alta
 * e o cliente diz "é isso". Só apresentação — `index.tsx` conclui.
 *
 * 🔑 A frase vem de `montarValidacao` (parte sem resposta é omitida, nunca
 * "undefined"). `null` = nenhuma das três partes respondida: a tela diz isso
 * em vez de mostrar uma frase vazia.
 *
 * 🔴 As frases exatas do cliente são OPCIONAIS (0..3, até 150 caracteres) e
 * não entram em cálculo nenhum — vão só para a Parte 06 do briefing. O limite
 * de tamanho aqui é `maxLength`; quem valida de verdade é a action.
 */
/** Uma opção da escolha "Reunião Preliminar" ou um motivo de "não agendei". */
interface OpcaoAgendamentoTela {
  id: string;
  rotulo: string;
}

/**
 * As opções da Reunião Preliminar e as linhas de apoio.
 *   • viva DESTE cliente → "Já está marcada para {data hora}" (e sem "Marcar
 *     agora": o índice de sessão viva recusaria a segunda);
 *   • a equipe não agenda (item d) → sem "Marcar agora";
 *   • data combinada na ficha → sugestão para o parceiro falar ao cliente;
 *   • viva de OUTRO cliente → aviso (o sistema marca uma por ambiente).
 */
function montarAgendamento(
  preliminarViva: { inicioEm: string; desteCliente: boolean } | null,
  dataCombinada: string | null,
  podeMarcarAgora: boolean,
): { opcoes: OpcaoAgendamentoTela[]; avisos: string[] } {
  const jaMarcada = preliminarViva?.desteCliente === true;
  const opcoes: OpcaoAgendamentoTela[] = [];
  if (jaMarcada && preliminarViva) {
    opcoes.push({ id: "ja_marcada", rotulo: `Já está marcada para ${formatarDataHora(preliminarViva.inicioEm)}` });
  } else if (podeMarcarAgora) {
    opcoes.push({ id: "agora", rotulo: "Marcar agora" });
  }
  opcoes.push({ id: "nao_agendou", rotulo: "Não agendei agora" });

  const avisos: string[] = [];
  const ddmm = formatarDataSoDia(dataCombinada)?.slice(0, 5);
  if (ddmm && !jaMarcada) avisos.push(`Data combinada na ficha: ${ddmm}. Sugira essa data ao cliente.`);
  if (preliminarViva && !preliminarViva.desteCliente) {
    avisos.push(
      `Já existe uma Reunião Preliminar marcada para outro cliente em ${formatarDataHora(preliminarViva.inicioEm)} — o sistema marca uma por vez.`,
    );
  }
  return { opcoes, avisos };
}

export function TelaValidacao({
  validacao,
  preliminarViva,
  dataCombinada,
  podeMarcarAgora,
  agendamento,
  onAgendamento,
  motivos,
  motivo,
  onMotivo,
  frases,
  onFrase,
  erro,
  pendente,
  rotuloConcluir,
  focar,
  onConcluir,
  onAjustar,
  onAnterior,
}: {
  validacao: ValidacaoEntrevista;
  preliminarViva: { inicioEm: string; desteCliente: boolean } | null;
  dataCombinada: string | null;
  podeMarcarAgora: boolean;
  agendamento: string | null;
  onAgendamento: (id: string) => void;
  /** Motivos opcionais de "não agendei", em chips. */
  motivos: readonly OpcaoAgendamentoTela[];
  motivo: string | null;
  onMotivo: (id: string | null) => void;
  frases: string[];
  onFrase: (indice: number, valor: string) => void;
  erro: string | null;
  pendente: boolean;
  rotuloConcluir: string;
  focar: boolean;
  onConcluir: () => void;
  onAjustar: (perguntaId: string) => void;
  onAnterior: () => void;
}) {
  const [ajustando, setAjustando] = useState(false);
  const { opcoes: opcoesAgendamento, avisos: avisoAgendamento } = montarAgendamento(
    preliminarViva,
    dataCombinada,
    podeMarcarAgora,
  );
  const tituloRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focar) tituloRef.current?.focus();
  }, [focar]);

  return (
    <div className="grid gap-4">
      <div>
        <p className="rotulo text-muted-foreground">Confirme com o cliente</p>
        <h2 ref={tituloRef} tabIndex={-1} className="titulo-h2 mt-1 outline-none">
          {validacao.frase ??
            "Nenhuma resposta de motivo, critério ou decisores foi marcada."}
        </h2>
        {validacao.frase ? (
          <p className="corpo-sm mt-2 text-muted-foreground">
            Leia em voz alta. Se ele corrigir, ajuste antes de concluir.
          </p>
        ) : null}
      </div>

      <fieldset className="grid gap-2 border-t border-borda-fina pt-4">
        <legend className="rotulo text-muted-foreground">
          Frases exatas do cliente (opcional, até {FRASES_MAXIMO})
        </legend>
        <p className="corpo-sm text-muted-foreground">
          Anote como ele disse, palavra por palavra. A doutora lê no briefing.
        </p>
        {frases.map((f, i) => (
          <label key={i} className="grid gap-1">
            <span className="sr-only">Frase {i + 1}</span>
            <input
              type="text"
              value={f}
              onChange={(e) => onFrase(i, e.target.value)}
              maxLength={FRASE_MAXIMO_CARACTERES}
              placeholder={`Frase ${i + 1}`}
              autoComplete="off"
              aria-describedby={`frase-${i}-conta`}
              className="w-full rounded-md border border-borda-forte bg-card px-3 py-2 corpo-sm focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            <span id={`frase-${i}-conta`} className="corpo-sm text-muted-foreground">
              {f.length} de {FRASE_MAXIMO_CARACTERES}
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="grid gap-2 border-t border-borda-fina pt-4">
        <legend className="rotulo text-muted-foreground">Reunião Preliminar</legend>
        {avisoAgendamento.map((a) => (
          <p key={a} className="corpo-sm">
            {a}
          </p>
        ))}
        {/* 🔴 ESCOLHA OBRIGATÓRIA (ajuste do Marcio, 29/09): a entrevista não
            conclui sem dizer o que foi feito com a reunião — e "não agendei"
            é resposta válida, não omissão. Botões com `aria-pressed`, a
            mesma forma das opções das perguntas. */}
        <div role="group" aria-label="Reunião Preliminar" className="flex flex-wrap gap-2">
          {opcoesAgendamento.map((o) => (
            <Button
              key={o.id}
              variant="outline"
              aria-pressed={agendamento === o.id}
              onClick={() => onAgendamento(o.id)}
              disabled={pendente}
              className={
                agendamento === o.id
                  ? "border-marca-acao bg-marca-acao/10 font-medium text-accent-foreground"
                  : undefined
              }
            >
              {o.rotulo}
            </Button>
          ))}
        </div>
        {agendamento === "nao_agendou" && motivos.length > 0 ? (
          <div role="group" aria-label="Por que não agendou (opcional)" className="grid gap-1">
            <p className="corpo-sm text-muted-foreground">Por quê? (opcional)</p>
            <div className="flex flex-wrap gap-2">
              {motivos.map((m) => (
                <Button
                  key={m.id}
                  variant="outline"
                  size="sm"
                  aria-pressed={motivo === m.id}
                  onClick={() => onMotivo(motivo === m.id ? null : m.id)}
                  disabled={pendente}
                  className={
                    motivo === m.id
                      ? "border-marca-acao bg-marca-acao/10 font-medium text-accent-foreground"
                      : undefined
                  }
                >
                  {m.rotulo}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
      </fieldset>

      <p role="alert" className="corpo-sm text-destructive empty:hidden">
        {erro}
      </p>

      {agendamento === null ? (
        <p id="concluir-ajuda" className="corpo-sm text-muted-foreground">
          Para concluir, diga acima se a Reunião Preliminar vai ser marcada agora.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={onConcluir}
          disabled={pendente || agendamento === null}
          aria-busy={pendente || undefined}
          aria-describedby={agendamento === null ? "concluir-ajuda" : undefined}
        >
          {pendente ? "Concluindo…" : rotuloConcluir}
        </Button>
        <Button
          variant="outline"
          onClick={() => setAjustando((v) => !v)}
          aria-expanded={ajustando}
          aria-controls={ajustando ? "ajustar-destinos" : undefined}
          disabled={pendente}
        >
          Ajustar motivo, critério ou decisores
        </Button>
        <Button variant="ghost" onClick={onAnterior} disabled={pendente}>
          Anterior
        </Button>
      </div>

      {ajustando ? (
        <div id="ajustar-destinos" className="flex flex-wrap gap-2 border-t border-borda-fina pt-3">
          <Button variant="outline" size="sm" onClick={() => onAjustar(validacao.ajustar.motivo)}>
            Motivo
          </Button>
          <Button variant="outline" size="sm" onClick={() => onAjustar(validacao.ajustar.criterio)}>
            Critério
          </Button>
          <Button variant="outline" size="sm" onClick={() => onAjustar(validacao.ajustar.decisores)}>
            Quem decide
          </Button>
        </div>
      ) : null}
    </div>
  );
}
