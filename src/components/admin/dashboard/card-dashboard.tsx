import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { IconeChip } from "@/components/ui/kpi-card";
import { cn } from "@/lib/utils";

/** Um par `rótulo · valor` da linha compacta de micro-números. */
export interface ParDoCard {
  rotulo: string;
  /** Já formatado (`"139"`, `"R$ 42 mil"`). O card não formata nada. */
  valor: string;
}

/**
 * A moldura de UM card do dashboard — a anatomia é fixa:
 *
 *   rótulo · chip           ← o que é
 *   NÚMERO MACRO · variação ← o dado que o card lidera (opcional)
 *   pares rótulo · valor    ← a repartição do macro, EM NÚMERO
 *   gráfico + legenda       ← a forma do mesmo dado
 *   → link para a lista     ← o que fazer depois de ver
 *
 * 🔑 **Número, não frase** (pedido do João, 10/09: "está com muita informação
 * de texto; prefiro focar em números, com a representatividade mas em
 * números"). A repartição do macro era uma frase corrida ("19 sem login · 3
 * com login que nunca entraram"); virou `pares`, que o olho varre. Sobrou UM
 * slot de prosa por card — `contexto`, uma linha curta — e ele é opcional.
 *
 * 🔑 O **link é obrigatório** em todo card que tem para onde ir. Gráfico que
 * não termina numa lista filtrada de gente é ornamento, e ornamento é o que a
 * regra de otimização da casa proíbe. Os dois que não têm (atividade e grau de
 * relação) passam `link={null}` e declaram o motivo em `semLink`, curto.
 *
 * O card NÃO é clicável por inteiro: ele contém uma legenda e um link, e
 * âncora dentro de âncora é HTML inválido e some do Tab. O alvo de clique é o
 * link do rodapé, com nome próprio ("Ver quem não respondeu").
 */
export function CardDashboard({
  icone,
  rotulo,
  valor,
  valorDescricao,
  destaque = false,
  variante = "kpi",
  variacao,
  contexto,
  pares,
  link,
  semLink,
  className,
  children,
}: {
  icone: React.ReactNode;
  rotulo: string;
  /**
   * O número macro, já formatado. Aceita nó, e não só texto — quando for nó,
   * mande também `valorDescricao`, que é o que o leitor de tela anuncia.
   *
   * **Opcional.** O card "Esperando a equipe" não tem macro: ele é uma fila de
   * quatro números de unidades diferentes (pendência do Diário, chamado, falta
   * de nota, falta de acesso), e somar produziria um total que não existe em
   * lugar nenhum. Card sem macro começa direto no conteúdo.
   */
  valor?: React.ReactNode;
  /** Texto para leitor de tela quando `valor` é abreviado ("R$ 42 mil"). */
  valorDescricao?: string;
  destaque?: boolean;
  /**
   * `"grafico"` derruba o número macro de 30 px para 24 e deixa o desenho ser
   * a peça principal do card. Na faixa de KPIs o número é o assunto; num card
   * de gráfico ele é a escala do desenho, e dois protagonistas do mesmo
   * tamanho foi metade do "está cru" de 11/09.
   */
  variante?: "kpi" | "grafico";
  /** `<VariacaoDoMes>`, quando o card tem comparação com o mês anterior. */
  variacao?: React.ReactNode;
  /**
   * UMA linha curta de contexto, quando o número macro não se explica pelo
   * rótulo. Máximo de uma frase — o resto é `pares`.
   */
  contexto?: string;
  /** A repartição do macro em pares compactos. É a linha de micro-números. */
  pares?: ParDoCard[];
  link?: { href: string; rotulo: string } | null;
  /** Por que este card não leva a lugar nenhum. Exigido quando `link` é nulo. */
  semLink?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Card elevacao="raised" className={cn("h-full", className)}>
      <CardContent className="flex h-full flex-col gap-2.5">
        <div className="flex items-start justify-between gap-2">
          <span className="rotulo text-muted-foreground">{rotulo}</span>
          <IconeChip destaque={destaque}>{icone}</IconeChip>
        </div>

        {valor !== undefined ? (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span
            className={cn(
              "numero-lg",
              variante === "grafico" && "text-2xl",
              destaque && "text-accent-foreground",
            )}
          >
            {valorDescricao ? (
              <>
                <span aria-hidden>{valor}</span>
                <span className="sr-only">{valorDescricao}</span>
              </>
            ) : (
              valor
            )}
          </span>
          {variacao}
        </div>
        ) : null}

        {contexto ? (
          <p className="corpo-sm text-muted-foreground">{contexto}</p>
        ) : null}

        {pares && pares.length > 0 ? (
          // `<dl>` e não `<p>`: cada item é literalmente termo → valor, e é
          // assim que o leitor de tela emparelha os dois. Quebra em várias
          // linhas quando não cabe — nunca corta número.
          <dl className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 corpo-sm">
            {pares.map((p, i) => (
              <div key={p.rotulo} className="flex items-baseline gap-1.5">
                {i > 0 ? (
                  <span aria-hidden className="mr-1.5 text-muted-foreground">
                    ·
                  </span>
                ) : null}
                <dt className="text-muted-foreground">{p.rotulo}</dt>
                <dd className="numero font-semibold">{p.valor}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {children ? (
          <div
            className={cn(
              // `flex-1` no card de gráfico: quem tem gráfico elástico (as
              // colunas) cresce até a altura da linha da grade em vez de
              // deixar vão entre o desenho e o link.
              variante === "grafico" ? "mt-1.5 min-h-0 flex-1" : "mt-0.5",
            )}
          >
            {children}
          </div>
        ) : null}

        <div className="mt-auto pt-1">
          {link ? (
            <Link
              href={link.href}
              prefetch={false}
              className="foco-visivel inline-flex items-center gap-1 corpo-sm font-medium text-accent-foreground hover:underline"
            >
              {link.rotulo}
              <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          ) : semLink ? (
            <p className="corpo-sm text-muted-foreground">{semLink}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
