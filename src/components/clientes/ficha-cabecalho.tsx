"use client";

/**
 * O cabeçalho da ficha do cliente: fase, estrela, WhatsApp e TUDO que fala do
 * acompanhamento pela equipe (o aviso do aluno, a porta da equipe e o erro da
 * estrela).
 *
 * Saiu de `cliente-ficha.tsx` sem uma linha de lógica nova. O motivo é
 * responsabilidade, não contagem: este bloco é o único da ficha que **não é
 * formulário** — nada aqui passa por "Salvar ficha", e a estrela é escrita
 * imediata com regra própria (migrações ...203 e ...215). Deixá-lo no meio dos
 * `useState` dos campos misturava duas coisas que mudam por motivos
 * diferentes.
 *
 * 🔑 Ordem proposital: primeiro o que o ALUNO precisa saber (por que a estrela
 * não se move), depois a porta da EQUIPE.
 */

import { MessageCircle, Star } from "lucide-react";
import type { ClienteEtapa1 } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  AcoesAcompanhamento,
  AvisoAcompanhamento,
  AvisoEscolhaFeita,
  AvisoOutroConfirmado,
  TEXTO_TROCA_POR_CHAMADO,
} from "@/components/clientes/acompanhamento-equipe";

export function FichaCabecalho({
  cliente,
  alunoId,
  admin,
  fase,
  wpp,
  acompanhado,
  confirmado,
  escolhidoPeloAluno,
  mostraEstrela,
  outroNome,
  outroConfirmado,
  erroEstrela,
  pending,
  onToggleEquipe,
  aoMudarAcompanhamento,
}: {
  cliente: ClienteEtapa1;
  alunoId: string;
  admin: boolean;
  /** A fase ATUAL da tela (a do formulário), com rótulo, ajuda e cor. */
  fase: { rotulo: string; ajuda: string; cor: string } | undefined;
  /** Link do WhatsApp já montado, ou `null`. */
  wpp: string | null;
  /** Estado OTIMISTA da estrela — só o botão o usa. */
  acompanhado: boolean;
  confirmado: boolean;
  escolhidoPeloAluno: boolean;
  mostraEstrela: boolean;
  /** Nome do outro cliente que já é a estrela do ambiente, ou `null`. */
  outroNome: string | null;
  /** Esse outro já foi CONFIRMADO pela equipe? Muda a frase, não a trava. */
  outroConfirmado: boolean;
  erroEstrela: string | null;
  pending: boolean;
  onToggleEquipe: () => void;
  aoMudarAcompanhamento: () => void;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {/* A fase sobe para o topo, como CHIP: o verde que existia era uma
            caixa de 300 px em volta do formulário do contrato — cor de estado
            aplicada à moldura, não ao estado. Agora o token semântico da fase
            (`FASES_CLIENTE.cor`, contraste medido) diz onde o cliente está,
            e a caixa colorida some. */}
        {fase ? (
          <span
            className={
              "inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold " +
              fase.cor
            }
            title={fase.ajuda}
          >
            {fase.rotulo}
          </span>
        ) : null}

        {mostraEstrela ? (
          <Button
            type="button"
            variant={acompanhado ? "default" : "outline"}
            size="sm"
            onClick={onToggleEquipe}
            disabled={pending}
          >
            <Star className={"size-4 " + (acompanhado ? "fill-current" : "")} />
            {acompanhado
              ? "Cliente acompanhado pela equipe"
              : "Marcar como cliente da equipe"}
          </Button>
        ) : confirmado || escolhidoPeloAluno ? (
          // Somente leitura: a estrela vira SINAL, não botão. A explicação e o
          // caminho de saída ficam no aviso logo abaixo.
          <span
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-sucesso-foreground/25 bg-sucesso px-3 text-xs font-semibold text-sucesso-foreground"
            title={`Só a equipe troca o cliente acompanhado. ${TEXTO_TROCA_POR_CHAMADO}.`}
          >
            <Star className="size-4 fill-current" aria-hidden />
            Cliente acompanhado pela equipe
          </span>
        ) : null}

        {wpp ? (
          <a
            href={wpp}
            target="_blank"
            rel="noopener noreferrer"
            className="foco-visivel inline-flex items-center gap-1.5 rounded-md border border-sucesso-foreground/25 bg-sucesso px-3 py-1.5 text-sm font-medium text-sucesso-foreground transition hover:brightness-97"
          >
            <MessageCircle className="size-4" /> WhatsApp
          </a>
        ) : null}
      </div>

      {confirmado ? (
        <AvisoAcompanhamento
          confirmadoEm={cliente.acompanhamento_confirmado_em as string}
          admin={admin}
        />
      ) : escolhidoPeloAluno ? (
        <AvisoEscolhaFeita />
      ) : outroNome != null ? (
        <AvisoOutroConfirmado
          nome={outroNome}
          admin={admin}
          confirmado={outroConfirmado}
        />
      ) : null}

      {/* Sempre montado, mesmo vazio: região viva que nasce junto com o texto
          não é anunciada por parte dos leitores de tela. */}
      <p role="alert" className="corpo-sm text-destructive empty:hidden">
        {erroEstrela}
      </p>

      {/* Só a equipe confirma/libera — e só quando este cliente É a estrela.
          Confirmar um que não é a estrela criaria um terceiro estado que
          nenhuma tela sabe mostrar (a RPC recusa).
          🔑 A condição lê `cliente.acompanhado_equipe` (dado do SERVIDOR), não
          o `acompanhado` otimista: com o otimista, marcar a estrela faria o
          botão "Confirmar" aparecer antes de o banco ter a estrela, e o clique
          rápido cairia na recusa da RPC. */}
      {admin && (cliente.acompanhado_equipe || confirmado) ? (
        <AcoesAcompanhamento
          cliente={cliente}
          alunoId={alunoId}
          aoMudar={aoMudarAcompanhamento}
        />
      ) : null}
    </>
  );
}
