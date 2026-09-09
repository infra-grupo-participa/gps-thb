"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

/**
 * Interruptor on/off — mesma família de primitivos do `Checkbox`/`Button`
 * (`@base-ui/react`), para não introduzir uma segunda biblioteca de estado
 * de campo. Usado na coluna "Presença" da lista de inscritos do Plantão.
 *
 * Foco por `outline` (não `ring`), no mesmo padrão do `Button`: o
 * `focus-visible:outline-solid` é obrigatório — sem ele o
 * `outline-style:none` herdado zera o contorno e o foco do controle fica
 * invisível (mesma lição documentada em `button.tsx`).
 */
function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent bg-input transition-colors outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 data-checked:bg-marca-acao",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="block size-4 translate-x-0.5 rounded-full bg-background shadow-sm transition-transform data-checked:translate-x-[18px]"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
