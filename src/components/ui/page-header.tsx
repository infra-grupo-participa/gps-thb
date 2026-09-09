import { cn } from "@/lib/utils";

/**
 * Cabeçalho de página — o único lugar onde o `h1`, a linha de apoio, o link de
 * voltar e a ação da direita são montados.
 *
 * Existia escrito à mão em 17 páginas, com `mt-2` em 5 delas e sem `mt-2` nas
 * outras 12 — o espaço acima do título mudava ao trocar de aba. O `mt-2` vinha
 * do link "voltar" logo acima; aqui ele é um slot e o espaçamento passa a ser
 * do componente, não de cada página.
 */
export function PageHeader({
  titulo,
  descricao,
  voltar,
  acao,
  className,
}: {
  titulo: React.ReactNode;
  descricao?: React.ReactNode;
  /** Link "← Voltar…" acima do título (o que gerava o `mt-2` avulso). */
  voltar?: React.ReactNode;
  /** Botão/controle alinhado à direita do título. */
  acao?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6", className)}>
      {voltar ? <div className="mb-2">{voltar}</div> : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
          {descricao ? (
            <p className="mt-1 text-muted-foreground">{descricao}</p>
          ) : null}
        </div>
        {acao ? <div className="shrink-0">{acao}</div> : null}
      </div>
    </div>
  );
}
