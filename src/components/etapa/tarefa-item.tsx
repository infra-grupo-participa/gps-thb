"use client";

import Link from "next/link";
import { ArrowUpRight, Sparkles, EyeOff, RotateCcw, Lock } from "lucide-react";
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
}) {
  const codigo = t.codigo ?? String(t.num);

  const containerCls = bloqueada
    ? "group flex items-start gap-3 rounded-md px-2 py-2.5 opacity-60"
    : "group flex items-start gap-3 rounded-md px-2 py-2.5 transition " +
      (enfase === "realce"
        ? "bg-primary/5 ring-1 ring-primary/30"
        : enfase === "esmaecer"
          ? "opacity-45 hover:opacity-100 hover:bg-muted/50"
          : "hover:bg-muted/50");

  return (
    <div className={containerCls}>
      <Checkbox
        checked={concluida}
        disabled={t.automatica || pending || bloqueada}
        onCheckedChange={(v) => onToggle(Boolean(v))}
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
            {codigo}. {t.titulo}
          </span>
          {bloqueada ? (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <Lock className="size-3" /> Após escolher o cliente da equipe
            </Badge>
          ) : null}
          {t.automatica ? (
            <Badge variant="outline" className="text-[10px]">
              automática
            </Badge>
          ) : null}
          {enfase === "realce" && !concluida && !bloqueada ? (
            <Badge className="gap-1 text-[10px]">
              <Sparkles className="size-3" /> Foco agora
            </Badge>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">{t.descricao}</p>

        {t.apontaClientes && clientesHref ? (
          <Link
            href={clientesHref}
            className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary transition hover:bg-primary/20"
          >
            Registre seus clientes na aba Clientes
            <ArrowUpRight className="size-3.5" />
          </Link>
        ) : null}

        {t.info ? (
          <p className="mt-1 text-xs font-medium text-primary">{t.info}</p>
        ) : null}

        {t.tutorialUrl || t.modelo ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            {t.tutorialUrl ? (
              <a
                href={t.tutorialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
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
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
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
          <div className="mt-2 flex items-center gap-1 opacity-60 transition group-hover:opacity-100">
            <span className="mr-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              Destaque:
            </span>
            <EnfaseBtn
              ativo={overrideAtual === "realce"}
              onClick={() =>
                onEnfase(overrideAtual === "realce" ? null : "realce")
              }
              title="Realçar para o aluno"
            >
              <Sparkles className="size-3.5" />
            </EnfaseBtn>
            <EnfaseBtn
              ativo={overrideAtual === "esmaecer"}
              onClick={() =>
                onEnfase(overrideAtual === "esmaecer" ? null : "esmaecer")
              }
              title="Esmaecer para o aluno"
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
