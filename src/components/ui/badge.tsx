import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import {
  AlertCircle,
  CircleCheck,
  Clock,
  Lock,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 aria-invalid:border-destructive [&>svg]:pointer-events-none [&>svg]:size-3.5!",
  {
    variants: {
      variant: {
        // ⚠️ `bg-primary` (#FF6300) com texto branco dá **2,98:1** e reprova
        // o mínimo de 4,5:1 — e o texto do badge tem 12 px. Medido no DOM,
        // não estimado. O laranja escuro da marca (#B04300, o mesmo do
        // `accent-foreground`) com branco dá **5,75:1**: continua sendo um
        // chip laranja sólido e inconfundível, e passa AA.
        default:
          "bg-accent-foreground text-white [a]:hover:bg-accent-foreground/85",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        outline:
          "border-borda-forte text-foreground [a]:hover:bg-muted",
        ghost: "hover:bg-muted hover:text-muted-foreground",
        link: "text-accent-foreground underline-offset-4 hover:underline",

        // ── Estado, com cor semântica e ícone ──────────────────────────────
        // Antes não existia sucesso nem atenção: "Disponível" (etapa liberada)
        // usava o MESMO cinza de "sem login" e de "2 pessoas", e "2 pendências"
        // dividia o vermelho com "1 chamado aberto", sem escada de severidade.
        // Contraste medido de cada par no comentário de `globals.css` — os 4
        // passam AA em 12 px. O ícone é obrigatório por padrão: cor sozinha
        // não é informação acessível (WCAG 1.4.1).
        success: "bg-sucesso text-sucesso-foreground",
        warning: "bg-atencao text-atencao-foreground",
        danger: "bg-risco text-risco-foreground",
        neutral: "bg-neutro text-neutro-foreground",
        /** Alias histórico de `danger` — 20+ chamadas já escritas. */
        destructive: "bg-risco text-risco-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

/** Ícone que acompanha cada estado por padrão. */
const ICONE_DE_ESTADO: Partial<
  Record<NonNullable<VariantProps<typeof badgeVariants>["variant"]>, LucideIcon>
> = {
  success: CircleCheck,
  warning: Clock,
  danger: AlertCircle,
  destructive: AlertCircle,
  neutral: Lock,
}

function Badge({
  className,
  variant = "default",
  icone,
  children,
  render,
  ...props
}: useRender.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    /**
     * Ícone à esquerda do rótulo. Omitido, as variantes de estado usam o
     * ícone padrão do estado; `false` desliga (para quando o ícone já está
     * escrito à mão no `children`, como nos badges que já passavam um `svg`).
     */
    icone?: LucideIcon | false
  }) {
  const Icone =
    icone === false ? null : (icone ?? (variant ? ICONE_DE_ESTADO[variant] : undefined))

  const conteudo = Icone ? (
    <>
      <Icone data-icon="inline-start" aria-hidden />
      {children}
    </>
  ) : (
    children
  )

  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
        children: conteudo,
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
