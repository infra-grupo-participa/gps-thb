import { TrendingDown, TrendingUp } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Chip de ícone da marca — UM tamanho e UMA cor para o sistema inteiro.
 *
 * O mesmo bloco existia copiado em 4 lugares, em dois tamanhos (`size-8` e
 * `size-9`). Fica em 32 px: com o número agora em 30–40 px, um chip de 36
 * disputava atenção com o dado. Por padrão é decorativo — o rótulo em texto
 * está sempre ao lado, então `aria-hidden` evita ruído no leitor de tela.
 *
 * `decorativo={false}` para o caso em que o conteúdo do chip é a informação
 * (o número da etapa em `etapas-overview`, que não aparece em nenhum outro
 * lugar do card) — aí esconder do leitor de tela seria perder conteúdo.
 */
export function IconeChip({
  children,
  destaque,
  decorativo = true,
  className,
}: {
  children: React.ReactNode;
  destaque?: boolean;
  decorativo?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden={decorativo || undefined}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md [&>svg]:size-4",
        // `bg-primary` (#FF6300) com branco dá 2,98:1 e este chip carrega
        // CONTEÚDO quando `decorativo={false}` (o número da etapa em
        // `etapas-overview`). `marca-solida` (#B04300) com branco: 5,75:1.
        destaque
          ? "bg-marca-solida text-white"
          : "bg-accent text-accent-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Barra de meta embutida no KPI. Aparece só quando o número TEM meta
 * (clientes/30, reuniões/15, honorários/150k) — sem meta não há barra.
 *
 * 6 px de altura sobre trilho afundado: a barra do portal era `h-1` e
 * literalmente sumia da tela.
 */
function BarraMeta({ pct }: { pct: number }) {
  const v = Math.max(0, Math.min(100, pct));
  return (
    <div
      aria-hidden
      className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-superficie-afundada inset-ring inset-ring-black/5"
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-300 ease-out",
          v >= 100 ? "bg-sucesso-foreground" : "bg-primary",
        )}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}

/**
 * Card de número — o único desenho de KPI do portal.
 *
 * Existiam DOIS: este (chip laranja, usado no `/admin`) e o `MetricCard`
 * próprio da Etapa 01 (sem ícone, rótulo em caixa alta). Eram dois desenhos de
 * cartão de número na mesma marca, lado a lado no mesmo produto.
 *
 * Anatomia fixa: chip + rótulo em sentence case · número em Space Grotesk
 * tabular · delta opcional · barra quando há meta · auxílio.
 */
export function KpiCard({
  icone,
  rotulo,
  valor,
  hint,
  delta,
  deltaTom = "neutro",
  meta,
  destaque,
  className,
  children,
}: {
  icone: React.ReactNode;
  rotulo: string;
  valor: string;
  hint?: string;
  /** Comparação curta ("+4 na semana", "há 51 dias"). Não existia no portal. */
  delta?: string;
  deltaTom?: "bom" | "ruim" | "neutro";
  /** 0–100. Desenha a barra de meta; `undefined` = o número não tem meta. */
  meta?: number;
  destaque?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Card elevacao="raised" className={className}>
      {/* Sem `pt-*` aqui: o `Card` já paga `py-(--card-spacing)`. */}
      <CardContent>
        <div className="flex items-start justify-between gap-2">
          <span className="rotulo text-muted-foreground">{rotulo}</span>
          <IconeChip destaque={destaque}>{icone}</IconeChip>
        </div>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span
            className={cn(
              "numero-lg",
              // `text-primary` (#FF6300) dá 2,98:1 sobre o card — reprova até
              // como texto grande (3:1). `accent-foreground` é o mesmo laranja
              // escurecido (#B04300): 5,76:1. Medido, não estimado.
              destaque && "text-accent-foreground",
            )}
          >
            {valor}
          </span>
          {delta ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 corpo-sm font-medium [&>svg]:size-3.5",
                deltaTom === "bom" && "text-sucesso-foreground",
                deltaTom === "ruim" && "text-risco-foreground",
                deltaTom === "neutro" && "text-muted-foreground",
              )}
            >
              {deltaTom === "bom" ? (
                <TrendingUp aria-hidden />
              ) : deltaTom === "ruim" ? (
                <TrendingDown aria-hidden />
              ) : null}
              {delta}
            </span>
          ) : null}
        </div>
        {meta != null ? <BarraMeta pct={meta} /> : null}
        {hint ? (
          <p className="mt-1 corpo-sm text-muted-foreground">{hint}</p>
        ) : null}
        {children}
      </CardContent>
    </Card>
  );
}

/**
 * Mesma informação em uma LINHA, para quando vários números dividem um card
 * só (a coluna de apoio da home). Absorve o `Linha` interno de `home-resumo`.
 *
 * O rótulo ganhou `text-balance` e o valor não quebra: "Perda pela inércia"
 * quebrava em duas linhas e encostava no número.
 */
export function KpiLinha({
  icone,
  rotulo,
  valor,
  hint,
  destaque,
}: {
  icone: React.ReactNode;
  rotulo: string;
  valor: string;
  hint?: string;
  destaque?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <IconeChip>{icone}</IconeChip>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-balance">{rotulo}</div>
        {hint ? (
          <div className="corpo-sm text-muted-foreground">{hint}</div>
        ) : null}
      </div>
      <div
        className={cn(
          "numero shrink-0 text-xl font-semibold whitespace-nowrap",
          destaque && "text-accent-foreground",
        )}
      >
        {valor}
      </div>
    </div>
  );
}
