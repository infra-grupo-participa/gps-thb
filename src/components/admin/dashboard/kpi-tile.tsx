import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Um tile da **faixa de KPIs** do topo da Visão geral — o macro do programa
 * em seis números, sem gráfico nenhum.
 *
 * 🔑 Por que ele existe ao lado de `CardDashboard`: os nove cards de 10/09
 * tinham todos o mesmo peso, e macro e micro disputavam a mesma atenção
 * ("nove cards iguais em grade 3×3 sem hierarquia", diagnóstico de 11/09). A
 * faixa passa a ser a primeira leitura — número grande, percentual ao lado,
 * uma linha de contexto e o destino — e os gráficos vêm depois, grandes.
 *
 * Anatomia fixa:
 *
 *   rótulo pequeno              ← o que é
 *   NÚMERO  ·  %                ← o dado, e de quanto ele é
 *   contexto OU variação        ← UMA linha, sempre numérica
 *   → link para a lista         ← o que fazer depois de ver
 *
 * 🔴 `pct` é `number | null`, e `null` vira **"—"**. Denominador zero não
 * produz "0%" (afirmação sobre conjunto vazio) nem `NaN%` — a conta está em
 * `graficos/tipos.ts:pctDe`.
 *
 * Sem `IconeChip`: seis chips em fila competiriam com os seis números, e o
 * chip é o vocabulário dos cards de gráfico, onde ele separa assuntos.
 */
export function KpiTile({
  rotulo,
  valor,
  pct,
  pctBom = null,
  destaque = false,
  variacao,
  contexto,
  pares,
  link,
}: {
  rotulo: string;
  /** O número macro, já formatado. */
  valor: string;
  /** O quanto ele representa do próprio universo. `null` → "—". */
  pct?: number | null;
  /**
   * O percentual é bom quando ALTO (cobertura: "já entraram", "ativos") ou
   * quando BAIXO (problema: "sem login")? Decide a cor — verde acima de 80,
   * âmbar de 40 a 80, cinza abaixo.
   *
   * `null` (padrão) = sem juízo, sempre cinza. Use quando o percentual for só
   * proporção, sem "melhor" nem "pior" (ex.: "clientes em fechamento").
   */
  pctBom?: "alto" | "baixo" | null;
  destaque?: boolean;
  /** `<VariacaoDoMes compacto>`, quando o tile tem comparação com o mês anterior. */
  variacao?: React.ReactNode;
  /** UMA linha curta, numérica. Ex.: "de 136 · 19 sem login". */
  contexto?: string;
  /**
   * Submétricas como PAR rótulo → valor, no molde do `CardDashboard`
   * (14/09/2026, pedido do Marcio: *"queria ser direto, tipo: Parceiros 152,
   * Titulares 140, Sócios 12"*).
   *
   * Prefira `pares` a `contexto` sempre que a submétrica for um número com
   * nome. Frase corrida ("os outros 19 estão parados") obriga a ler para
   * achar o número; o par põe os dois em colunas e o olho varre.
   */
  pares?: { rotulo: string; valor: string }[];
  link: { href: string; rotulo: string };
}) {
  /**
   * A cor do percentual (14/09/2026). Antes TODOS eram cinza, então "86%
   * ativos" e "0% concluíram a Etapa 01" tinham o mesmo peso visual — o olho
   * não distinguia o que vai bem do que precisa de ação.
   *
   * Faixas: ≥80 verde · 40–79 âmbar · <40 risco. Só quando `pctBom` diz de
   * que lado está o bom; sem isso o número é proporção, não nota.
   */
  const tomPct =
    pct == null || pctBom == null
      ? "text-muted-foreground"
      : (() => {
          const nota = pctBom === "alto" ? pct : 100 - pct;
          if (nota >= 80) return "text-sucesso-foreground";
          if (nota >= 40) return "text-atencao-foreground";
          return "text-risco-foreground";
        })();

  return (
    /* 🔑 O CARD INTEIRO É CLICÁVEL (14/09/2026). O Marcio clicou no "152" e
       nada aconteceu — o alvo era só o link do rodapé, e ninguém mira num
       link de 11 px quando o número de 30 px está ali em cima.

       `group` + `after` no link: a âncora do rodapé cresce até cobrir o card
       (`after:absolute after:inset-0`), então o card inteiro vira alvo SEM
       aninhar âncoras — âncora dentro de âncora é HTML inválido e some do
       Tab. É o mesmo padrão do `CardDashboard`, que já resolveu isto.

       `relative` no Card é o que dá o retângulo de referência ao `after`. */
    <Card
      elevacao="raised"
      interativo
      className="relative h-full transition-colors hover:border-borda-forte"
    >
      <CardContent className="flex h-full flex-col gap-1.5">
        {/* `min-h-8` = duas linhas de rótulo reservadas: sem isso, o tile
            cujo nome quebra ("Ativos nos últimos 30 dias") empurra o número
            para baixo e os seis macros deixam de compartilhar a mesma linha de
            base — que é o que faz a faixa ser lida de uma vez. */}
        <span className="rotulo flex min-h-8 items-start text-muted-foreground">
          {rotulo}
        </span>

        {/* 🔑 `gap-x-1.5` + `leading-none` no número: o percentual colado
            (`139` `99%`) disputava com o macro. Agora ele respira e, com cor,
            vira leitura secundária de verdade. */}
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <span
            className={cn(
              "numero-lg leading-none",
              destaque && "text-accent-foreground",
            )}
          >
            {valor}
          </span>
          {pct !== undefined ? (
            <span className={cn("numero corpo-sm font-semibold", tomPct)}>
              {pct === null ? "—" : `${pct}%`}
            </span>
          ) : null}
        </div>

        {variacao}
        {pares && pares.length > 0 ? (
          // `<dl>`: cada item é termo → valor, e é assim que o leitor de tela
          // emparelha os dois. Mesmo desenho do `CardDashboard`, para a Visão
          // geral ter uma linguagem só.
          <dl className="grid gap-0.5 corpo-sm">
            {pares.map((p) => (
              <div
                key={p.rotulo}
                className="flex items-baseline justify-between gap-2"
              >
                <dt className="min-w-0 truncate text-muted-foreground">
                  {p.rotulo}
                </dt>
                <dd className="numero shrink-0 font-semibold tabular-nums">
                  {p.valor}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        {contexto ? (
          <p className="corpo-sm text-muted-foreground">{contexto}</p>
        ) : null}

        {/* 🔑 Régua antes do link (14/09/2026): os seis tiles eram blocos de
            texto contínuo, e o link de ação se misturava ao contexto. A linha
            fina separa "o que é" de "o que fazer", sem acrescentar cor nem
            peso. `mt-auto` mantém os seis links na MESMA altura, mesmo com
            rótulos de tamanhos diferentes — é o que faz a faixa parecer uma
            faixa, e não seis cards soltos. */}
        <div className="mt-auto border-t border-borda-fina pt-2">
          <Link
            href={link.href}
            prefetch={false}
            className={cn(
              "foco-visivel group inline-flex items-center gap-1 rounded-sm corpo-sm font-medium text-accent-foreground hover:underline",
              // Estica o alvo de clique sobre o card inteiro.
              "after:absolute after:inset-0 after:content-['']",
            )}
          >
            {link.rotulo}
            <ArrowRight
              aria-hidden
              className="size-3.5 transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
