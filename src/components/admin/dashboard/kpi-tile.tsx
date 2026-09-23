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
 * Anatomia fixa — **TRÊS linhas**, desde 23/09/2026 (2ª rodada):
 *
 *   rótulo · NÚMERO · % · variação   ← tudo na MESMA linha, baseline comum
 *   Titular 148 · Sócio 17           ← submétricas em UMA linha, separadas por ·
 *   → link para a lista              ← o que fazer depois de ver
 *
 * 🔑 A versão anterior empilhava NOVE linhas (rótulo, número, variação, a nota
 * "vs. ago, até dia 23", duas submétricas em `<dl>` vertical, a frase de
 * contexto, a régua e o link) e media **253 px de altura para 180 px de
 * largura** — mais alto que largo para mostrar um número. Apertar `gap` e
 * `padding` não conserta um card de nove linhas; o que encolhe é a CONTAGEM
 * DE LINHAS. Nenhum número saiu: as submétricas viraram linha corrida, e a
 * única frase removida (`contexto` de "Parceiros") repetia em prosa a soma
 * que as próprias submétricas já escreviam.
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
       âncora de verdade, do tamanho do texto que ela é.

       🔑 2ª RODADA, 23/09/2026. A 1ª densificação mexeu em `gap` e `padding`
       e o Marcio reprovou de novo ("você não fez o que falamos sobre os cards
       imensos"). Ele tinha razão: medido no card "Parceiros", 202 dos 253 px
       eram CONTEÚDO (9 linhas de texto) e só 51 px eram vão. `gap` não tinha
       o que entregar. Agora são 3 linhas. */
    <Card elevacao="raised" className="h-full transition-colors hover:border-borda-forte">
      <CardContent className="flex h-full flex-col gap-1 py-2.5">
        {/* LINHA 1 — rótulo, número, percentual e variação na MESMA linha.
            Antes eram 4 linhas empilhadas (~92 px); agora uma só (~34 px),
            com `flex-wrap` para o rótulo longo ("Ativos nos últimos 30 dias")
            poder ocupar a largura que precisar sem desalinhar os números.

            🔴 O NÚMERO MACRO CONTINUA SENDO LINK (15/09/2026) — `<Link>` de
            verdade, não `<span>` esticado por `after`. O alvo NÃO encolheu:
            `py-1` sobre um `numero-lg` de 34 px dá ~42 px de altura clicável,
            e o alvo é o número inteiro, nunca um ícone. */}
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="rotulo shrink-0 leading-tight text-muted-foreground">
            {rotulo}
          </span>
          <Link
            href={link.href}
            prefetch={false}
            aria-label={link.ariaLabel ?? `${link.rotulo}: ${rotulo}, ${valor}`}
            className="foco-visivel group -my-1 flex items-baseline gap-x-1.5 rounded-sm py-1"
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
        </div>

        {/* LINHA 2 — submétricas em UMA linha corrida, separadas por `·`.
            Antes o `<dl>` era vertical: 2 submétricas = 2 linhas de ~22 px,
            mais o `contexto` numa terceira. Agora tudo emenda numa linha só.

            🔴 Nenhuma submétrica saiu, e cada uma com `href` CONTINUA sendo
            âncora própria — o par inteiro é o alvo (rótulo + número dentro do
            `<Link>`), com `py-1` para o toque não encolher. `<dl>` com
            `display:flex` não perde a semântica termo→valor, e `<a>` pode
            envolver `dt`+`dd` sem invalidar a lista de definição. */}
        {(pares && pares.length > 0) || contexto ? (
          <dl className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 corpo-sm">
            {(pares ?? []).map((p, i) =>
              p.href ? (
                <Link
                  key={p.rotulo}
                  href={p.href}
                  prefetch={false}
                  aria-label={p.ariaLabel ?? `Ver ${p.rotulo.toLowerCase()}: ${p.valor}`}
                  className="foco-visivel group -mx-1 -my-1 flex items-baseline gap-1.5 rounded-sm px-1 py-1 hover:bg-superficie-afundada"
                >
                  <dt className="min-w-0 text-accent-foreground underline-offset-4 group-hover:underline">
                    {p.rotulo}
                  </dt>
                  <dd className="numero shrink-0 font-semibold tabular-nums">
                    {p.valor}
                  </dd>
                </Link>
              ) : (
                <div key={p.rotulo} className="flex items-baseline gap-1.5">
                  {i > 0 ? (
                    <span aria-hidden className="text-muted-foreground">
                      ·
                    </span>
                  ) : null}
                  <dt className="min-w-0 text-muted-foreground">{p.rotulo}</dt>
                  <dd className="numero shrink-0 font-semibold tabular-nums">
                    {p.valor}
                  </dd>
                </div>
              ),
            )}
            {contexto ? (
              <dd className="min-w-0 text-muted-foreground">{contexto}</dd>
            ) : null}
          </dl>
        ) : null}

        {/* LINHA 3 — o destino.

            🔑 A RÉGUA SAIU (23/09, 2ª rodada). Ela existia desde 14/09 para
            separar "o que é" de "o que fazer" num bloco de texto contínuo de
            seis linhas; com duas linhas acima, a separação já vem da posição,
            e a régua custava 1 px de borda + 6 px de `pt` em cada um dos seis
            tiles. O LINK FICA — cortá-lo tiraria o destino do tile, que é a
            razão de ele existir — e `mt-auto` continua alinhando os seis na
            mesma altura, que é o que faz a faixa parecer uma faixa e não seis
            cards soltos.

            ⚠️ O alvo de clique NÃO encolheu: `py-1` mantém a mesma altura
            clicável de antes (a régua nunca fez parte do alvo). */}
        <div className="mt-auto pt-0.5">
          <Link
            href={link.href}
            prefetch={false}
            className="foco-visivel group -my-1 inline-flex items-center gap-1 rounded-sm py-1 corpo-sm font-medium text-accent-foreground hover:underline"
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
