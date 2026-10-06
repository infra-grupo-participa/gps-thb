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
 *
 * ── TOPO ENXUTO (05/10/2026) ───────────────────────────────────────────────
 * Pedido do Marcio: *"tem muita informação acima do que realmente importa,
 * que é a ficha"*. O topo ficou com: selos (fase, estrela, WhatsApp) · o
 * MINI-CAMINHO das 4 fases (botão que abre a folha "Trajetória") · UMA linha
 * do acompanhamento com "Entenda" (`acompanhamento-equipe.tsx`). O link do
 * Drive e o caminho completo foram para DENTRO das folhas. O que continua
 * sempre à vista: o erro da estrela (`role="alert"`) e, para a equipe, a
 * porta "Confirmar/Liberar acompanhamento".
 */

import { MessageCircle, Star } from "lucide-react";
import type { ClienteEtapa1, FaseCliente } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  MarcadorFase,
  estadoDaFase,
} from "@/components/clientes/caminho-fases";
import { rotuloFaseNoCaminho } from "@/lib/etapa1";
import { FASES_DA_TRAJETORIA } from "@/lib/trajetoria-tipos";
import { cn } from "@/lib/utils";
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
  basePath = "",
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
  onVerTrajetoria,
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
  /** Abre a folha "Trajetória" (o mini-caminho é a porta dela no topo). */
  onVerTrajetoria: () => void;
  /** Vazio para o aluno; `/admin/aluno/<id>` no Modo Assistência. */
  basePath?: string;
}) {
  return (
    // Um bloco só, com respiro curto: como filhos soltos do `grid gap-6` da
    // ficha, selos, caminho e a linha do acompanhamento ficavam a 24 px um
    // do outro e o topo crescia à toa.
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* A fase sobe para o topo, como CHIP: o verde que existia era uma
            caixa de 300 px em volta do formulário do contrato — cor de estado
            aplicada à moldura, não ao estado. Agora o token semântico da fase
            (`FASES_CLIENTE.cor`, contraste medido) diz onde o cliente está,
            e a caixa colorida some. */}
        {/* 05/10/2026: com o mini-caminho logo abaixo nomeando a fase atual,
            o chip só aparece quando o caminho NÃO aparece (fase desconhecida)
            — repetir a fase duas vezes era o excesso que o João apontou. */}
        {fase && !faseNoCaminho(cliente.fase) ? (
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
        ) : confirmado ? (
          // 🔴 SÓ QUANDO A EQUIPE CONFIRMA a estrela vira somente leitura
          // (corrigido em 10/09/2026). Era `confirmado || escolhidoPeloAluno`:
          // o parceiro marcava e no mesmo instante perdia o botão, mesmo sem
          // a equipe ter olhado o cliente. Os 5 chamados do primeiro dia de
          // uso eram todos sobre isso.
          //
          // `escolhidoPeloAluno` sem confirmação volta a cair no ramo do
          // botão acima — a escolha é dele e ele a desfaz sozinho.
          <span
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-sucesso-foreground/25 bg-sucesso px-3 text-xs font-semibold text-sucesso-foreground"
            title={`${TEXTO_TROCA_POR_CHAMADO}.`}
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

      <MiniCaminho fase={cliente.fase} onClick={onVerTrajetoria} />

      {confirmado ? (
        <AvisoAcompanhamento
          confirmadoEm={cliente.acompanhamento_confirmado_em}
          admin={admin}
          basePath={basePath}
        />
      ) : escolhidoPeloAluno ? (
        <AvisoEscolhaFeita />
      ) : outroNome != null ? (
        <AvisoOutroConfirmado
          nome={outroNome}
          admin={admin}
          confirmado={outroConfirmado}
          basePath={basePath}
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
          🔑 Na prévia "como o aluno vê" este bloco SOME: a classe
          `previa-oculta` vive na raiz de `AcoesAcompanhamento`, um lugar só,
          para valer em qualquer tela que venha a montá-lo. O aviso logo acima
          (`AvisoAcompanhamento`) troca para a variante do aluno pela mesma
          regra de CSS.
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
    </div>
  );
}

/**
 * O MINI-CAMINHO: as 4 fases (① Captação · ② Fechamento · ③ Execução ·
 * ④ Concluído) com a atual acesa, as passadas marcadas e as futuras neutras —
 * o mesmo `MarcadorFase` do cabeçalho de fases da folha "Trajetória".
 *
 * É UM botão: abre a folha "Trajetória" (`irParaAba`, que escreve `?aba=`
 * por `replaceState` — zero ida ao servidor). O nome acessível diz a fase
 * em texto ("Fase atual: Execução. Ver trajetória"); os marcadores são
 * `aria-hidden`.
 *
 * A fase é a do SERVIDOR (`cliente.fase`, calculada pelo banco a partir das
 * etapas): as actions da trajetória revalidam a página e o topo acompanha.
 * Fase fora das 4 (coluna nova, tela velha) não desenha caminho nenhum —
 * acender a 1ª seria afirmar uma fase que o dado não diz.
 *
 * No celular só a fase ATUAL leva rótulo (as outras ficam só no número):
 * os 4 rótulos não cabem em 390 px numa linha.
 */
function faseNoCaminho(fase: FaseCliente | null | undefined): boolean {
  return !!fase && (FASES_DA_TRAJETORIA as readonly string[]).includes(fase);
}

function MiniCaminho({
  fase,
  onClick,
}: {
  fase: FaseCliente | null | undefined;
  onClick: () => void;
}) {
  const posicao = fase
    ? (FASES_DA_TRAJETORIA as readonly string[]).indexOf(fase)
    : -1;
  if (!fase || posicao < 0) return null;
  const atual = rotuloFaseNoCaminho(fase);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Fase atual: ${atual}. Ver trajetória`}
      className="foco-visivel -mx-1 flex min-h-11 w-fit max-w-full cursor-pointer flex-wrap items-center gap-x-1.5 gap-y-1 rounded-md px-1 hover:bg-superficie-afundada"
    >
      {FASES_DA_TRAJETORIA.map((f, i) => {
        const estado = estadoDaFase(i, posicao);
        const ultima = i === FASES_DA_TRAJETORIA.length - 1;
        return (
          <span key={f} className="flex items-center gap-1.5">
            <MarcadorFase pequeno numero={i + 1} estado={estado} />
            <span
              className={cn(
                "text-sm",
                estado === "atual"
                  ? "font-semibold text-foreground"
                  : "hidden text-muted-foreground sm:inline",
              )}
            >
              {rotuloFaseNoCaminho(f)}
            </span>
            {!ultima ? (
              <span aria-hidden className="h-px w-3 bg-borda-forte sm:w-4" />
            ) : null}
          </span>
        );
      })}
      <span className="ml-1 text-sm font-medium text-accent-foreground underline underline-offset-4">
        Ver trajetória
      </span>
    </button>
  );
}
