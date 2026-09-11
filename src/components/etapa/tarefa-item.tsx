"use client";

import Link from "next/link";
import { ArrowUpRight, Sparkles, EyeOff, RotateCcw } from "lucide-react";
import type { TarefaDef } from "@/lib/etapa1";
import type { Enfase } from "@/lib/enfase";
import type { ModoEnfase } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

export function TarefaItem({
  tarefa: t,
  concluida,
  pending,
  onToggle,
  enfase = "normal",
  clientesHref,
  isAdmin = false,
  overrideAtual = null,
  onEnfase,
  bloqueada = false,
  motivoBloqueio,
  detalheBloqueio,
  mostrarCodigo = true,
}: {
  tarefa: TarefaDef;
  concluida: boolean;
  pending: boolean;
  onToggle: (v: boolean) => void;
  enfase?: Enfase;
  /** Quando a tarefa aponta para a aba Clientes, link para lá. */
  clientesHref?: string;
  isAdmin?: boolean;
  overrideAtual?: ModoEnfase | null;
  onEnfase?: (modo: ModoEnfase | null) => void;
  /** Passo travado (aguardando o aluno escolher o cliente da equipe). */
  bloqueada?: boolean;
  /** Texto do badge de bloqueio. Default: "Após escolher o cliente da equipe". */
  motivoBloqueio?: string;
  /** Linha explicativa sob o título, só quando bloqueada. */
  detalheBloqueio?: string;
  /**
   * `false` quando quem chama já desenha o número do passo por fora — é o caso
   * do trilho vertical da Etapa 01, em que o código vira o marcador da
   * sequência. Sem isto o "1.1" apareceria duas vezes na mesma linha.
   * Default `true`: as etapas 2–6 (`EtapaGuide`) não mudam.
   */
  mostrarCodigo?: boolean;
}) {
  const codigo = t.codigo ?? String(t.num);

  // VIS3 (UX3): a tarefa bloqueada NÃO recebe mais opacidade no bloco
  // inteiro — a opacidade derrubava junto o contraste do título, da descrição
  // e do badge, e é justamente aqui que o aluno passa o tempo. O estado passa
  // a ser dito por FORMA (borda tracejada + fundo apagado + chip neutro),
  // exatamente como já se fazia no card de etapa (`etapas-overview.tsx`), que
  // não custa contraste nenhum. O cadeado e o `detalheBloqueio` continuam.
  const containerCls = bloqueada
    ? "group flex items-start gap-3 rounded-md border border-dashed bg-muted/20 px-2 py-2.5"
    : "group flex items-start gap-3 rounded-md border border-transparent px-2 py-2.5 transition " +
      (enfase === "realce"
        ? "bg-primary/5 ring-1 ring-primary/30"
        : enfase === "esmaecer"
          // Era `opacity-45`, que derrubava o contraste do título e da
          // descrição das tarefas 4 a 8 para um cinza quase ilegível. VIS3
          // vale para "futura" também: o estado se diz por cor de TEXTO
          // (`muted-foreground`, 5,42:1 — AA), não por opacidade no bloco.
          ? "text-muted-foreground [&_*]:text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:[&_*]:text-inherit"
          : "hover:bg-muted/50");

  return (
    <div className={containerCls}>
      {/* ♿ A interação principal do produto não tinha nome acessível: sem
          `<label for>` e sem `aria-label`, o leitor de tela anunciava "caixa
          de seleção, não marcada" seis vezes seguidas, sem dizer qual passo.
          O código entra junto do título porque é ele que o aluno usa para se
          achar na sequência (e no trilho da Etapa 01 o número é `aria-hidden`,
          então some do texto lido). */}
      <Checkbox
        checked={concluida}
        disabled={t.automatica || pending || bloqueada}
        onCheckedChange={(v) => onToggle(Boolean(v))}
        aria-label={`Passo ${codigo}: ${t.titulo}`}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={
              "text-sm font-medium " +
              (concluida ? "text-muted-foreground line-through" : "")
            }
          >
            {mostrarCodigo ? (
              `${codigo}. `
            ) : (
              // O código saiu do texto visível (virou o marcador do trilho,
              // que é `aria-hidden`) — mas continua no nome lido em voz alta.
              <span className="sr-only">Passo {codigo}. </span>
            )}
            {t.titulo}
          </span>
          {bloqueada ? (
            // `secondary` (fundo cinza sólido) em vez de `outline`: sem a
            // opacidade do container, o chip precisa se sustentar sozinho — e
            // texto cinza sobre borda fina lia pior que o próprio título.
            <Badge variant="neutral" className="text-[10px]">
              {motivoBloqueio ?? "Após escolher o cliente da equipe"}
            </Badge>
          ) : null}
          {t.automatica ? (
            <Badge variant="outline" className="text-[10px]">
              automática
            </Badge>
          ) : null}
          {enfase === "realce" && !concluida && !bloqueada ? (
            <Badge icone={Sparkles} className="text-[10px]">Foco agora
            </Badge>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">{t.descricao}</p>
        {bloqueada && detalheBloqueio ? (
          <p className="text-xs text-muted-foreground">{detalheBloqueio}</p>
        ) : null}

        {t.apontaClientes && clientesHref ? (
          <Link
            href={clientesHref}
            className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-accent-foreground transition hover:bg-primary/20"
          >
            Registre seus clientes na aba Clientes
            <ArrowUpRight className="size-3.5" />
          </Link>
        ) : null}

        {t.info ? (
          <p className="mt-1 text-xs font-medium text-accent-foreground">{t.info}</p>
        ) : null}

        {t.tutorialUrl || t.modelo ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            {t.tutorialUrl ? (
              <a
                href={t.tutorialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-accent-foreground underline-offset-4 hover:underline"
              >
                ▶ Ver tutorial
              </a>
            ) : null}
            {t.modelo ? (
              t.modelo.url ? (
                <a
                  href={t.modelo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-accent-foreground underline-offset-4 hover:underline"
                >
                  ⬇ Modelo: {t.modelo.nome}
                </a>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Modelo: {t.modelo.nome}
                </span>
              )
            ) : null}
          </div>
        ) : null}

        {isAdmin && onEnfase ? (
          // Revela no hover E no foco: `group-hover` sozinho deixava os
          // controles de ênfase quase invisíveis para quem navega por Tab.
          <div className="previa-oculta mt-2 flex items-center gap-1 opacity-70 transition group-hover:opacity-100 focus-within:opacity-100">
            <span className="mr-1 text-[10px] font-semibold text-muted-foreground">
              Destaque:
            </span>
            <EnfaseBtn
              ativo={overrideAtual === "realce"}
              onClick={() =>
                onEnfase(overrideAtual === "realce" ? null : "realce")
              }
              title="Realçar para o parceiro"
            >
              <Sparkles className="size-3.5" />
            </EnfaseBtn>
            <EnfaseBtn
              ativo={overrideAtual === "esmaecer"}
              onClick={() =>
                onEnfase(overrideAtual === "esmaecer" ? null : "esmaecer")
              }
              title="Esmaecer para o parceiro"
            >
              <EyeOff className="size-3.5" />
            </EnfaseBtn>
            {overrideAtual ? (
              <EnfaseBtn
                ativo={false}
                onClick={() => onEnfase(null)}
                title="Voltar ao automático"
              >
                <RotateCcw className="size-3.5" />
              </EnfaseBtn>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EnfaseBtn({
  ativo,
  onClick,
  title,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={
        "inline-flex size-6 items-center justify-center rounded border transition " +
        (ativo
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:bg-muted")
      }
    >
      {children}
    </button>
  );
}
