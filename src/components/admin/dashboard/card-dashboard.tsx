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
 * O juízo de valor sobre o número que o card lidera — e **só** quando existe
 * um limiar objetivo que o torne bom ou ruim.
 *
 * 🔴 **`neutro` é o padrão e não pinta nada.** Card cuja métrica é proporção
 * sem "melhor" nem "pior" (entradas por mês, eventos no portal, progresso
 * declarado que depende do parceiro marcar) fica `neutro`. Se todo card
 * ganhasse faixa, a hierarquia se perderia de novo — que é exatamente o
 * problema que a faixa existe para resolver.
 */
export type EstadoDoCard = "neutro" | "bom" | "atencao" | "risco";

/**
 * Faixa lateral por estado. Os quatro pares semânticos do `globals.css`,
 * nenhuma cor nova.
 *
 * 🔴 **A faixa é REDUNDANTE, nunca a única indicação.** Daltonismo: os tokens
 * da casa são quentes e #A32020 ↔ #8A5300 dá ΔE 2,7 em deuteranopia (medido,
 * ver `ui/graficos/tipos.ts`). Quem não distingue as duas cores continua lendo
 * o estado no texto e no número do card, que dizem a mesma coisa por escrito —
 * a faixa só reforça para quem bate o olho. **Em grayscale o card tem de
 * continuar legível**, e continua: nada de informação vive só aqui.
 */
/**
 * 🔴 A faixa é PSEUDO-ELEMENTO, não `border-l-4`.
 *
 * `Card` tem `rounded-xl` (12px) e `overflow-hidden`. Borda lateral de 4px num
 * canto de raio 12 **não** desenha uma faixa reta: o arredondamento afunila os
 * extremos e a faixa sai como uma cunha, mais fina no topo e na base que no
 * meio. Medido no navegador em 23/09/2026 — `borderTopLeftRadius: 12px` contra
 * `borderLeftWidth: 4px`, e a captura confirmou o afunilamento.
 *
 * O pseudo-elemento absoluto ignora o raio do pai e cobre `top-0 bottom-0` com
 * largura constante. `overflow-hidden` do `Card` apara os cantos dele, o que é
 * justamente o desejado: a faixa acompanha a curva sem perder espessura.
 *
 * ⚠️ Exige `relative` no `Card` — já aplicado junto com a faixa.
 */
const FAIXA_DO_ESTADO: Record<EstadoDoCard, string> = {
  neutro: "",
  bom: "relative before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-sucesso-foreground",
  atencao:
    "relative before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-atencao-foreground",
  risco:
    "relative before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-risco-foreground",
};

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
 *
 * 🔑 **`estado` (23/09/2026)** — faixa lateral opcional, para atacar o "tudo
 * tem o mesmo peso visual": até aqui TODO card tinha borda idêntica. A trava
 * é dupla e não se afrouxa: (1) a faixa é **redundante**, o card já diz o
 * estado em texto/número; (2) só recebe faixa o card com **limiar objetivo**
 * — o padrão é `neutro`, sem faixa. Ver `EstadoDoCard`.
 */
export function CardDashboard({
  icone,
  rotulo,
  valor,
  valorDescricao,
  valorHref,
  valorAriaLabel,
  destaque = false,
  estado = "neutro",
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
  /**
   * 🔴 15/09/2026: quando presente, o NÚMERO MACRO vira link PRÓPRIO — o
   * conjunto que ele representa, não o complemento do rodapé. Existe para os
   * cards que mostram "117 de 136 já entraram"/"82 concluíram o onboarding"
   * mas cujo `link` de rodapé leva ao OPOSTO ("Ver quem está sem login"/"Ver
   * quem não respondeu"): dois alvos distintos, cada um honesto sobre para
   * onde leva. Com `valorHref`, o card NÃO usa mais `after:inset-0` no
   * rodapé — os dois links têm de coexistir sem um cobrir o outro.
   */
  valorHref?: string;
  /** Obrigatório com `valorHref`: nomeia o conjunto para leitor de tela. */
  valorAriaLabel?: string;
  destaque?: boolean;
  /**
   * Faixa lateral de estado. **Padrão `neutro` = sem faixa.** Só use quando
   * existir um limiar objetivo que torne o número bom ou ruim; na dúvida,
   * deixe sem. Ver `EstadoDoCard` e `FAIXA_DO_ESTADO` acima — e lembre que o
   * card precisa dizer o mesmo estado em texto, porque a faixa é reforço, não
   * o portador da informação.
   */
  estado?: EstadoDoCard;
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
  link?: { href: string; rotulo: string; ariaLabel?: string } | null;
  /** Por que este card não leva a lugar nenhum. Exigido quando `link` é nulo. */
  semLink?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    /* 🔑 Card com link de rodapé vira alvo INTEIRO de clique (14/09/2026):
       o Marcio clicou no número e nada aconteceu. `relative` dá o retângulo
       ao `after:inset-0` do link lá embaixo.

       ⚠️ Só quando HÁ `link`: os cards de `link={null}` (fila "Esperando a
       equipe", grau de relação) têm âncoras PRÓPRIAS nas linhas do corpo, e
       esticar um link de rodapé por cima cobriria todas elas. */
    <Card
      elevacao="raised"
      interativo={Boolean(link) && !valorHref}
      className={cn(
        /* 🔴 SEM `h-full` (medido em 23/09/2026).
​
           O `h-full` anulava o `items-start` da grade da página: a célula
           parava de esticar, mas o CARD dentro dela pedia 100% da altura da
           célula — e a célula continua tão alta quanto a fileira. Medido no
           Chromium em 1920px: "Onboarding" (3 números), "Evolução semanal" e
           "Passos marcados" ficavam todos em 802px, a altura da "Jornada do
           parceiro" (9 degraus), com ~400px de vazio abaixo do conteúdo.
​
           Sem ele cada card tem a altura do próprio conteúdo. A fileira passa
           a ter cards de alturas diferentes — é a aparência correta quando o
           conteúdo é diferente, e é o que elimina o buraco. */
        link && !valorHref && "relative",
        // A faixa vem ANTES do `className` de quem chama, para o card poder
        // sobrescrever se precisar. `neutro` contribui com string vazia — o
        // card sem juízo de valor sai com a borda idêntica à de sempre.
        FAIXA_DO_ESTADO[estado],
        className,
      )}
    >
      {/* 🔑 23/09/2026 (2ª rodada): `gap-2.5` → `gap-1.5` e `py-3` no
          `CardContent` — o `Card` já paga `py-4` (32 px de chrome vertical) e
          13 cards × 8 px devolvidos somam ~100 px de página. O `IconeChip`
          caiu de 32 px para 24: ele é DECORATIVO (`aria-hidden`) e, em 32 px,
          era ele quem mandava na altura da linha do rótulo. */}
      <CardContent className="flex flex-col gap-1.5 py-3">
        <div className="flex items-start justify-between gap-2">
          <span className="rotulo min-w-0 text-muted-foreground">{rotulo}</span>
          <IconeChip
            destaque={destaque}
            className="size-6 [&>svg]:size-3.5"
          >
            {icone}
          </IconeChip>
        </div>

        {valor !== undefined ? (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          {valorHref ? (
            <Link
              href={valorHref}
              prefetch={false}
              aria-label={valorAriaLabel}
              className="foco-visivel group rounded-sm"
            >
              <span
                className={cn(
                  "numero-lg group-hover:underline",
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
            </Link>
          ) : (
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
          )}
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
              variante === "grafico" ? "min-h-0 flex-1" : "",
            )}
          >
            {children}
          </div>
        ) : null}

        <div className="mt-auto pt-0.5">
          {link ? (
            <Link
              href={link.href}
              prefetch={false}
              aria-label={link.ariaLabel}
              className={cn(
                "foco-visivel group inline-flex items-center gap-1 corpo-sm font-medium text-accent-foreground hover:underline",
                // Só estica sobre o card inteiro quando ele é o ÚNICO alvo:
                // com `valorHref`, o macro já é um link próprio, e um
                // `after:inset-0` aqui o cobriria por cima.
                !valorHref && "after:absolute after:inset-0 after:content-['']",
              )}
            >
              {link.rotulo}
              <ArrowRight
                aria-hidden
                className="size-3.5 transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          ) : semLink ? (
            <p className="corpo-sm text-muted-foreground">{semLink}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
