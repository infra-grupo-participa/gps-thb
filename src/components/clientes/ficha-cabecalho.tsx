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

import Link from "next/link";
import { MessageCircle, Star } from "lucide-react";
import type { ClienteEtapa1 } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  FICHA_ADMIN,
  FICHA_PARCEIRO_ANTES,
  FICHA_PARCEIRO_DEPOIS_NOME,
  FICHA_PARCEIRO_FIM,
  FICHA_PARCEIRO_LINK,
} from "@/lib/clientes-textos";
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
  estrelaBloqueadaPorSelecao = false,
  nomeNaTela = null,
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
  /**
   * O botão existe, mas o banco recusaria: este cliente não está entre os 5
   * escolhidos para a Entrevista Prévia (CHECK
   * `chk_etapa1_clientes_favorito_e_selecionado`). Derivado na ficha, com o
   * dado do SERVIDOR — ver o comentário em `cliente-ficha.tsx`.
   *
   * `false` por default: quem montar este cabeçalho sem passar a prop não
   * trava botão nenhum. Falhar ABERTO é o certo aqui — a fronteira de verdade
   * é o CHECK, e travar por omissão esconderia a estrela de quem pode marcá-la.
   */
  estrelaBloqueadaPorSelecao?: boolean;
  /**
   * O nome do cliente como está no campo em edição, para o motivo citá-lo.
   * `null` = não informado; a frase cai numa redação sem nome próprio.
   */
  nomeNaTela?: string | null;
  /** Nome do outro cliente que já é a estrela do ambiente, ou `null`. */
  outroNome: string | null;
  /** Esse outro já foi CONFIRMADO pela equipe? Muda a frase, não a trava. */
  outroConfirmado: boolean;
  erroEstrela: string | null;
  pending: boolean;
  onToggleEquipe: () => void;
  aoMudarAcompanhamento: () => void;
  /** Vazio para o aluno; `/admin/aluno/<id>` no Modo Assistência. */
  basePath?: string;
}) {
  /**
   * O id do parágrafo do motivo. Fixo (não `useId`) porque este cabeçalho é
   * montado UMA vez por ficha — e id estável é o que o teste E2E consegue
   * conferir resolvendo o `aria-describedby`.
   */
  const idMotivoSelecao = "estrela-motivo-selecao";
  /** O motivo só é montado quando trava algo — e só então o botão o descreve. */
  const motivoSelecaoVisivel = mostraEstrela && estrelaBloqueadaPorSelecao;

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
            /* 🔴 O botão NÃO OFERECE o que o banco recusaria. Era ele que
               devolvia "Algum campo está fora do formato aceito" para 48 de
               86 parceiros, sem campo errado nenhum. O motivo fica escrito
               logo abaixo, e o `aria-describedby` o liga ao botão — desabilitar
               sem dizer por quê é trocar um erro confuso por um botão mudo. */
            disabled={pending || estrelaBloqueadaPorSelecao}
            aria-describedby={motivoSelecaoVisivel ? idMotivoSelecao : undefined}
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

      {/* ═══════════════════════════════════════════════════════════════════
          O MOTIVO DO BOTÃO DESABILITADO — imediatamente abaixo dele
          ═══════════════════════════════════════════════════════════════════

          🔴 SEM `role="alert"`, de propósito. O `<p role="alert">` logo
          adiante (`erroEstrela`) é para FALHA DE SERVIDOR; este aqui é
          ESTADO — o cliente simplesmente ainda não está entre os 5. Com
          `role="alert"` o leitor de tela anunciaria "alerta" na CARGA da
          página, toda vez que a ficha abrisse, para uma condição que não é
          erro de ninguém. Quem usa teclado chega nele pelo
          `aria-describedby` do botão, no momento em que o botão ganha foco.

          🔴 DENSO E CHAPADO (padrão do Marcio para todo o sistema, exceto a
          tela de condução ao vivo do SIC-HF): mesma família visual dos
          `Aviso*` abaixo — `corpo-sm`, texto corrido. Sem card novo, sem
          ícone decorativo, sem cor de alerta. Hierarquia por POSIÇÃO: ele
          vale porque está colado no botão que travou, não por decoração.

          🔑 PRECEDÊNCIA (confirmada, não suposta): este bloco NÃO disputa com
          os avisos logo abaixo. `estrelaBloqueadaPorSelecao` já exige
          `mostraEstrela`, que é `!confirmado && outroConfirmadoNome == null` —
          então `AvisoAcompanhamento` (confirmado) e `AvisoOutroConfirmado`
          (outro nome) estão fora por construção. Resta `AvisoEscolhaFeita`,
          que exige `escolhidoPeloAluno` e portanto
          `cliente.acompanhado_equipe = true` — cliente JÁ acompanhado satisfaz
          o CHECK (o segundo ramo já foi cumprido quando ele virou estrela),
          e o `!acompanhado` do derivado o exclui de qualquer forma. A ordem
          confirmado → outro favorito → não selecionado se mantém.

          🔑 O link respeita o `basePath`: absoluto, `/clientes` ejetaria o
          admin do ambiente do aluno — o mesmo defeito que o comentário do
          `basePath` em `cliente-ficha.tsx` registra para "abra um chamado". */}
      {motivoSelecaoVisivel ? (
        <p id={idMotivoSelecao} className="corpo-sm text-muted-foreground">
          {admin ? (
            FICHA_ADMIN
          ) : (
            <>
              {FICHA_PARCEIRO_ANTES}
              <strong>{nomeNaTela ?? "Este cliente"}</strong>
              {FICHA_PARCEIRO_DEPOIS_NOME}
              <Link
                href={`${basePath}/clientes`}
                className="foco-visivel rounded-xs font-medium text-accent-foreground underline underline-offset-4"
              >
                {FICHA_PARCEIRO_LINK}
              </Link>
              {FICHA_PARCEIRO_FIM}
            </>
          )}
        </p>
      ) : null}

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
    </>
  );
}
