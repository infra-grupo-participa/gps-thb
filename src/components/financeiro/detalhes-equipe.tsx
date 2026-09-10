import { ChevronDown, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Gaveta **só do admin** com o que a equipe precisa e o aluno não pode ver:
 * origem do dado, id do cadastro, divergência de quitação, excedente pago.
 *
 * 🔴 Motivo de existir (pedido do João, 09/09/2026): a aba do aluno estava
 * mostrando nome de view (`cs.vw_hm_financeiro`), `contato_hm_id`, "divergência
 * de cadastro" e frases de falha do sistema. Isso é ruído para quem quer saber
 * o próprio progresso, e é exposição desnecessária da nossa cozinha.
 *
 * 🔑 **Nasce fechada** e é renderizada só no ramo `ehAdmin` de quem chama —
 * `previa-oculta` some também na pré-visualização "como o aluno vê". As três
 * travas são de propósito: a de renderização é a que vale, as outras duas
 * evitam que uma página futura vaze por esquecimento.
 */
export function DetalhesEquipe({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <details className={cn("previa-oculta group w-full", className)}>
      <summary className="-m-1 flex cursor-pointer list-none items-center gap-2 rounded-md p-1 text-xs font-medium text-muted-foreground marker:content-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        <Wrench aria-hidden className="size-3.5 shrink-0" />
        <span className="flex-1">Detalhes para a equipe</span>
        <ChevronDown
          aria-hidden
          className="size-3.5 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="mt-2 grid gap-1.5 text-xs text-muted-foreground">
        {children}
      </div>
    </details>
  );
}
