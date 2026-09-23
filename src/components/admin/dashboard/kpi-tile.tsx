import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Um par rótulo → valor da lista de submétricas. `href` vira link PRÓPRIO. */
export interface ParDoTile {
  rotulo: string;
  valor: string;
  /** Quando presente, a LINHA inteira vira `<Link>` — não só o rodapé. */
  href?: string;
  /** Obrigatório com `href`: o que o conjunto É, para quem usa leitor de tela. */
  ariaLabel?: string;
}

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
 *
 * 🔴 CADA NÚMERO É UM LINK PRÓPRIO — grandes E pequenos (15/09/2026, decisão
 * do Marcio, ciente de que desfaz o "card inteiro clicável" de 14/09: as
 * duas coisas são exclusivas, porque o `after:absolute after:inset-0` do
 * card cobriria qualquer link de linha). Molde: `dashboard/fila.tsx` (card
 * "Grau de relação"), que já resolvia isso com `link={null}` no card + uma
 * âncora por linha. Aqui é o mesmo padrão: o card NUNCA usa `after:inset-0`
 * — o número macro é `<Link>` de verdade (não span esticado por CSS) e cada
 * `par` com `href` vira `<Link>` de linha.
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
  pares?: ParDoTile[];
  /**
   * O link do número MACRO — sempre uma âncora de verdade, com
   * `aria-label` nomeando o conjunto. Continua obrigatório: todo tile leva a
   * algum lugar.
   */
  link: { href: string; rotulo: string; ariaLabel?: string };
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
    /* 🔴 15/09/2026: o card DEIXOU de ser alvo inteiro de clique (era assim
       desde 14/09) — decisão do Marcio, para cada submétrica poder ser o seu
       próprio alvo. Sem `relative`/`after:inset-0` aqui: cada link é uma
       âncora de verdade, do tamanho do texto que ela é. */
    /* 🔑 DENSIFICADO em 23/09/2026 (queixa do Marcio: os cards tinham "muito
       espaço em volta" e só 4 números cabiam por tela, enquanto a TABELA de
       parceiros — que ele aprovou — mostra 86 linhas de uma vez). O que saiu
       foi ESPAÇO, nunca informação: nenhum número, submétrica, link ou
       denominador foi removido daqui. Ver `faixa-kpis.tsx` para a grade. */
    <Card elevacao="raised" className="h-full transition-colors hover:border-borda-forte">
      <CardContent className="flex h-full flex-col gap-1 py-3">
        {/* `min-h-8` reservava DUAS linhas de rótulo em todos os seis tiles
            para alinhar a linha de base dos números — 16 px de vazio em cada
            um dos cinco cujo rótulo cabe em uma linha. O alinhamento continua,
            mas por `leading-tight` + o `items-baseline` do número: os rótulos
            longos ("Ativos nos últimos 30 dias") quebram e empurram só o
            próprio tile, que a grade já equaliza pela altura da linha. */}
        <span className="rotulo flex items-start leading-tight text-muted-foreground">
          {rotulo}
        </span>

        {/* 🔴 O NÚMERO MACRO É LINK (15/09/2026) — `<Link>` de verdade, não
            `<span>` esticado por `after`. `foco-visivel` para o Tab mostrar o
            alvo, `aria-label` nomeando o conjunto (o número sozinho, "142",
            não diz nada a quem usa leitor de tela). */}
        <Link
          href={link.href}
          prefetch={false}
          aria-label={link.ariaLabel ?? `${link.rotulo}: ${rotulo}, ${valor}`}
          className="foco-visivel group flex w-fit flex-wrap items-baseline gap-x-1.5 rounded-sm"
        >
          <span
            className={cn(
              "numero-lg leading-none group-hover:underline",
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
        </Link>

        {variacao}
        {pares && pares.length > 0 ? (
          // `<dl>`: cada item é termo → valor, e é assim que o leitor de tela
          // emparelha os dois. Mesmo desenho do `CardDashboard`, para a Visão
          // geral ter uma linguagem só. Item com `href` vira `<Link>` — a
          // LINHA inteira é o alvo, não só o número.
          <dl className="grid gap-0.5 corpo-sm">
            {pares.map((p) =>
              p.href ? (
                <Link
                  key={p.rotulo}
                  href={p.href}
                  prefetch={false}
                  aria-label={p.ariaLabel ?? `Ver ${p.rotulo.toLowerCase()}: ${p.valor}`}
                  className="foco-visivel group -mx-1.5 flex items-baseline justify-between gap-2 rounded-sm px-1.5 py-0.5 hover:bg-superficie-afundada"
                >
                  {/* `dt`/`dd` dentro do `<Link>`: a linha inteira é o alvo,
                      e a semântica de termo→valor do `<dl>` não se perde —
                      `<a>` pode envolver `dt`+`dd` sem invalidar a lista de
                      definição. */}
                  <dt className="min-w-0 truncate text-accent-foreground underline-offset-4 group-hover:underline">
                    {p.rotulo}
                  </dt>
                  <dd className="numero shrink-0 font-semibold tabular-nums">
                    {p.valor}
                  </dd>
                </Link>
              ) : (
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
              ),
            )}
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
            faixa, e não seis cards soltos.
            ⚠️ `pt-1.5` e não `pt-2` (23/09): 3 px × 6 tiles, na densificação.
            A régua e o link FICAM — o alvo de clique não encolheu, e cortar o
            link tiraria o destino do tile, que é a razão de ele existir. */}
        <div className="mt-auto border-t border-borda-fina pt-1.5">
          <Link
            href={link.href}
            prefetch={false}
            className="foco-visivel group inline-flex items-center gap-1 rounded-sm corpo-sm font-medium text-accent-foreground hover:underline"
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
