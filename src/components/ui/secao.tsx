import { cn } from "@/lib/utils";

/**
 * Cabeçalho de SEÇÃO — marcador + título + régua.
 *
 * Substitui os 15 `uppercase tracking-wide` espalhados pelo portal ("SEU
 * CAMINHO", "PROGRESSO DA ETAPA", "COMPLETOS · 30 LISTADOS"). Rótulo tracked-out
 * acima de tudo é o tell mais conhecido de UI gerada — e, no painel, a etiqueta
 * chegava a quebrar em duas linhas de 9 px e virar ruído ilegível.
 *
 * O desenho encoda o que o produto É: um roteiro. Quando a seção faz parte de
 * uma sequência de verdade (as 6 etapas, os 8 passos), `numero` desenha o
 * marcador; quando não faz (— "Meus clientes"), passa-se `icone` no lugar.
 * **Não usar `numero` onde não há sequência** — numeração decorativa é o
 * clichê que este componente existe para não reintroduzir.
 *
 * A régua ocupa a largura restante: custa nada e amarra o título ao conteúdo
 * abaixo sem pedir mais um card.
 */
export function Secao({
  numero,
  icone,
  titulo,
  descricao,
  acao,
  nivel: Tag = "h2",
  className,
  classeConteudo,
  children,
}: {
  /** Posição na sequência. Só quando a seção de fato é um passo de uma. */
  numero?: number | string;
  /** Alternativa ao número, para seção que não é etapa de nada. */
  icone?: React.ReactNode;
  titulo: React.ReactNode;
  descricao?: React.ReactNode;
  /** Link/botão à direita, na mesma linha do título. */
  acao?: React.ReactNode;
  nivel?: "h2" | "h3";
  className?: string;
  /** Classe do bloco de conteúdo (ex.: a grade dos campos de um formulário). */
  classeConteudo?: string;
  /** Conteúdo da seção. Omitido, o componente é só o cabeçalho. */
  children?: React.ReactNode;
}) {
  const marcador = numero ?? icone;

  return (
    <section className={cn(className)}>
      <div className="flex items-center gap-3">
        {marcador != null ? (
          <span
            aria-hidden
            className="flex size-6 shrink-0 items-center justify-center rounded-md bg-accent font-heading text-[0.8125rem] font-semibold text-accent-foreground [&>svg]:size-3.5"
          >
            {marcador}
          </span>
        ) : null}
        <Tag className="font-heading titulo-h2 text-foreground">{titulo}</Tag>
        {/* A régua. `min-w-0` + `flex-1` para ela encolher antes do título. */}
        <span aria-hidden className="h-px min-w-4 flex-1 bg-borda-fina" />
        {acao ? <div className="shrink-0">{acao}</div> : null}
      </div>
      {descricao ? (
        <p className="mt-1.5 max-w-[62ch] corpo-sm text-muted-foreground">
          {descricao}
        </p>
      ) : null}
      {children ? (
        <div className={cn("mt-4", classeConteudo)}>{children}</div>
      ) : null}
    </section>
  );
}
