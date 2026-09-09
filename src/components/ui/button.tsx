import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // Foco por OUTLINE, não por ring: `Card` é `overflow-hidden` e recorta o
  // anel — botão dentro de card ficava com o foco invisível. Outline é
  // pintado fora do fluxo e não é cortado (regra VIS do projeto).
  //
  // ⚠️ `focus-visible:outline-solid` é OBRIGATÓRIO e não é enfeite. O
  // `outline-none` da base (herdado do shadcn) grava `--tw-outline-style:none`,
  // e o `outline-2` do Tailwind v4 emite `outline-style: var(--tw-outline-style)`
  // — ou seja, define a LARGURA e deixa o estilo apontando para uma variável
  // envenenada. Sem `outline-solid`, o foco de TODO botão do portal fica
  // invisível. Medido no /login com Tab: `outline-style:none`, `width:0px`
  // sem ele; `solid`, `2px` com ele. Não remover.
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // ⚠️ CONTRASTE — o preenchimento NÃO é `--primary`.
        // `bg-primary` (#FF6300) com `text-primary-foreground` (branco) dá
        // **2,98:1** no DOM, com texto de 14 px: reprovava o WCAG 1.4.3 no
        // botão mais clicado do portal. `marca-acao` (#C74600) com branco dá
        // **4,88:1** — medido, não estimado — e o hover cai para
        // `marca-solida` (#B04300, **5,75:1**), um passo mais escuro da mesma
        // escada. O laranja de marca (#FF6300) continua vivo onde é
        // DECORATIVO: ícone, chip, régua da aba ativa, anel de foco.
        // Reversível em uma linha (ver `--color-marca-acao` no globals.css).
        default:
          "bg-marca-acao text-primary-foreground hover:bg-marca-solida",
        // Laranja SÓLIDO é reservado a uma ação primária por tela. Toda
        // secundária sai em neutro (`outline`/`secondary`/`ghost`) — antes o
        // único botão sólido da Etapa 01 era o do banner "Ir para Clientes",
        // e não o passo que o aluno tem de fazer.
        outline:
          "border-borda-forte bg-card hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        destructive:
          "bg-risco text-risco-foreground hover:bg-[color-mix(in_oklch,var(--color-risco),var(--color-risco-foreground)_10%)] focus-visible:outline-risco-foreground",
        // Ação destrutiva DENTRO de linha de lista: sem peso de repouso, o
        // vermelho só aparece na intenção. "Excluir" repetido 8 vezes numa
        // tabela não pode ter o mesmo peso de "Abrir ficha".
        "ghost-danger":
          "text-muted-foreground hover:bg-risco hover:text-risco-foreground focus-visible:outline-risco-foreground",
        link: "text-accent-foreground underline-offset-4 hover:underline",
      },
      // 36 px de altura na base (era 32) e 40 no `lg`: o alvo de toque mínimo
      // recomendado é 44 e o botão parecia apertado em toda tela. `sm` sobe
      // para 32, que continua sendo o denso das linhas de lista.
      size: {
        default:
          "h-9 gap-1.5 px-3.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-6 gap-1 rounded-sm px-2 text-xs in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1 rounded-md px-3 text-[0.8rem] in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-2 px-4 text-[0.9375rem] has-data-[icon=inline-end]:pr-3.5 has-data-[icon=inline-start]:pl-3.5",
        icon: "size-9",
        "icon-xs":
          "size-6 rounded-sm in-data-[slot=button-group]:rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-8 rounded-md in-data-[slot=button-group]:rounded-md",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
