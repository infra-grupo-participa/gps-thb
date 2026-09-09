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
  eyebrow,
  voltar,
  acao,
  className,
}: {
  titulo: React.ReactNode;
  descricao?: React.ReactNode;
  /**
   * Linha curta acima do título, em SENTENCE CASE (ex.: "Modo assistência").
   * Nunca em caixa alta tracked-out: era o tell mais repetido do portal, 15
   * vezes, e no painel a etiqueta chegava a quebrar em duas linhas de 9 px.
   */
  eyebrow?: React.ReactNode;
  /** Link "← Voltar…" acima do título (o que gerava o `mt-2` avulso). */
  voltar?: React.ReactNode;
  /** Botão/controle alinhado à direita do título. */
  acao?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-8", className)}>
      {voltar ? <div className="mb-2">{voltar}</div> : null}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="mb-1 rotulo text-accent-foreground">{eyebrow}</p>
          ) : null}
          {/* 28 px em Space Grotesk: era `text-2xl` (24) em Inter nas 17
              páginas, com ou sem conteúdo pesado embaixo — o título não tinha
              presença nenhuma sobre um card de KPI de 24 px. */}
          <h1 className="font-heading titulo-h1 text-balance">{titulo}</h1>
          {descricao ? (
            // 62ch: a descrição corria os 1.100 px inteiros do container.
            <p className="mt-1.5 max-w-[62ch] corpo text-muted-foreground">
              {descricao}
            </p>
          ) : null}
        </div>
        {acao ? <div className="shrink-0">{acao}</div> : null}
      </div>
    </div>
  );
}
