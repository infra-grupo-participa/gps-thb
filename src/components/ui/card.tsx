import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Superfície do portal — TRÊS níveis, não um.
 *
 * Antes era uma caixa só (`rounded-xl ring-1 ring-foreground/10`, sem sombra)
 * para os 48 arquivos que usam `Card`: KPI, cliente, etapa bloqueada, chamado
 * e formulário de 1.000 px tinham exatamente a mesma moldura. Nada levantava
 * da página, e "importante" versus "secundário" era 5% de saturação num badge.
 *
 * - `elevacao="flat"` (padrão) — borda de 1 px, sem sombra: item de lista,
 *   container de formulário, coisa repetida.
 * - `elevacao="raised"` — sombra baixa de repouso: KPI, hero, card que carrega
 *   um número.
 * - `interativo` — só onde o card inteiro é clicável: acrescenta sombra e
 *   1 px de subida no hover, em 140 ms. Um efeito, não cinco.
 *
 * `size="lg"` dá raio 16 e respiro 24 (hero/KPI); `sm` aperta para 12.
 * Raio pela regra "quanto maior a peça, maior o raio" — 12 base, 16 no `lg`.
 */
function Card({
  className,
  size = "default",
  elevacao = "flat",
  interativo = false,
  ...props
}: React.ComponentProps<"div"> & {
  size?: "default" | "sm" | "lg"
  elevacao?: "flat" | "raised"
  interativo?: boolean
}) {
  return (
    <div
      data-slot="card"
      data-size={size}
      data-elevacao={elevacao}
      data-interativo={interativo || undefined}
      className={cn(
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl border bg-card py-(--card-spacing) text-sm text-card-foreground [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0",
        "data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0",
        "data-[size=lg]:rounded-2xl data-[size=lg]:[--card-spacing:--spacing(6)]",
        "data-[elevacao=raised]:shadow-(--shadow-raised)",
        // Movimento: uma transição, três propriedades, 140 ms. Quem pede
        // `prefers-reduced-motion` já é atendido pelo bloco do globals.css.
        "data-[interativo]:transition-[box-shadow,transform,border-color] data-[interativo]:duration-150 data-[interativo]:ease-out",
        "data-[interativo]:hover:-translate-y-px data-[interativo]:hover:border-borda-forte data-[interativo]:hover:shadow-(--shadow-hover)",
        "*:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-(--card-spacing)", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-xl border-t bg-muted/50 p-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
