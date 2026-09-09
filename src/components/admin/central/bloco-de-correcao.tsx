import { ChevronRight } from "lucide-react";

/**
 * O painel de correção de uma seção — pessoas, etapas, contratos.
 *
 * 🔑 Existe para conciliar duas regras que se contradizem no papel: *"botão só
 * onde há vermelho ou âmbar"* (senão a Central vira painel de "tudo pode") e
 * *"o admin precisa conseguir trocar o titular / voltar a etapa à regra geral"*
 * — coisas que ele faz **sobre linha verde**. A saída é atrito, não ausência:
 * o bloco nasce **fechado** quando a seção está toda em ordem e **aberto**
 * quando há problema ou aviso. Nada some; o que muda é quantos cliques uma
 * escrita rara custa.
 *
 * `<details>` nativo de propósito: já é operável por teclado (Tab + Enter),
 * já anuncia expandido/recolhido ao leitor de tela e não gasta JavaScript.
 */
export function BlocoDeCorrecao({
  aberto,
  titulo,
  ajuda,
  children,
}: {
  aberto: boolean;
  titulo: string;
  ajuda?: string;
  children: React.ReactNode;
}) {
  return (
    <details
      open={aberto}
      className="group/bloco mt-4 rounded-xl border border-borda-fina bg-superficie-afundada p-3"
    >
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md corpo font-medium text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open/bloco:rotate-90"
        />
        {titulo}
      </summary>

      {ajuda ? (
        <p className="mt-1.5 ml-6 max-w-[70ch] corpo-sm text-muted-foreground">
          {ajuda}
        </p>
      ) : null}

      <div className="mt-3">{children}</div>
    </details>
  );
}
