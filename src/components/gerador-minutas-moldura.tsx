import { cn } from "@/lib/utils";

/**
 * Janela do Gerador de Minutas dentro do GPS: faixa fina com o nome + a ação
 * à direita, e a área de trabalho embaixo ocupando o resto da altura.
 *
 * É a MESMA geometria na página, no `loading.tsx` e no estado "Indisponível":
 * trocar de estado não pula a tela (esqueleto de altura errada é CLS).
 *
 * A altura vem do pai em flex (`flex-1 min-h-0`), não de um `calc` com a
 * altura do header chutada: o `AppHeader` muda de altura quando o grupo ativo
 * ganha a 3ª linha de sub-abas, e um `calc` fixo voltaria a rolar a página.
 */
export function GeradorMinutasMoldura({
  acao,
  children,
  className,
}: {
  acao?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby="gerador-titulo"
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-white",
        className,
      )}
    >
      <div className="flex flex-col gap-3 border-b bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1
            id="gerador-titulo"
            className="font-heading text-lg leading-tight font-semibold text-foreground"
          >
            Gerador de Minutas
          </h1>
          {/* No celular a frase quebrava em 2 linhas e roubava ~50 px do
              gerador; o nome já diz onde a pessoa está. */}
          <p className="hidden text-base text-muted-foreground sm:block">
            Suas minutas e casos, sem sair do Programa
          </p>
        </div>
        {acao ? <div className="shrink-0">{acao}</div> : null}
      </div>
      {children}
    </section>
  );
}
