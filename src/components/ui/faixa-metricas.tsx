import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * **Faixa de métricas com denominação visual por URGÊNCIA.**
 *
 * Decisão do Marcio, 17/09/2026. O pedido foi literal: *"essa métrica de
 * reunião preliminar e seus status, faz sentido ter uma denominação visual
 * quanto às métricas estabelecidas… a ideia disso é colocar em prova a
 * diferenciação caso a gente coloque outras métricas aí"*.
 *
 * Ou seja: o componente não existe para deixar a faixa de reunião bonita.
 * Existe para que a SEGUNDA família de métricas (honorários, DISC, fase,
 * acesso) possa entrar na mesma tela sem virar uma parede de números iguais.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * A REGRA, e por que ela é esta
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 🔑 **A cor diz URGÊNCIA, nunca categoria.** `risco` = já passou do ponto;
 * `atencao` = prazo curto; `sucesso` = meta batida; `neutro` = em dia, nada
 * a fazer. O olho varre a tela e acha o vermelho primeiro, esteja ele na
 * família de reunião, de honorários ou de qualquer outra que venha.
 *
 * A alternativa avaliada e RECUSADA era cor por família (reunião laranja,
 * honorários azul...). Dois motivos:
 *   1. a cor não informaria nada — "azul" não diz se está bom ou ruim, só
 *      repete o que o cabeçalho da seção já disse;
 *   2. não escala — cada família nova consome uma cor até acabarem as
 *      distinguíveis, e este repo JÁ mediu que 7 tons quentes não se separam
 *      (ΔE 2,7 em deuteranopia, no gráfico de grau de relação).
 *
 * **O agrupamento resolve-se por POSIÇÃO e cabeçalho** (`titulo` +
 * `resumo`), que é a regra que já vale no portal: hierarquia por posição,
 * não por enfeite.
 *
 * 🔴 **Zero nunca é alarme.** `tomDoValor` rebaixa qualquer tom a `neutro`
 * quando o valor é 0: "0 vencidas" é a ausência do problema, não o problema.
 * Pintar de vermelho um zero treina o olho a ignorar vermelho — e aí o
 * vermelho verdadeiro, no dia em que aparecer, também será ignorado.
 * É a regra que mantém a cor com significado ao longo do tempo.
 *
 * 🔴 **A cor nunca é o ÚNICO sinal** (WCAG 1.4.1). Todo tile com tom
 * diferente de `neutro` carrega também um ponto sólido antes do rótulo e o
 * tom no texto do rótulo — quem não distingue as cores lê a mesma
 * informação pela forma e pelo texto. Os 4 pares usados
 * (`sucesso`/`atencao`/`risco`/`neutro`) têm contraste medido em AA a 12 px
 * no `globals.css`; não introduzir cor fora deles.
 *
 * Server Component: zero JS no cliente. Navegação por `<Link>` de verdade —
 * o estado do filtro mora na URL, então recarregar e compartilhar link
 * devolvem a mesma tela.
 */

/** Os 4 tons semânticos do portal. Não acrescentar cor fora desta união. */
export type TomMetrica = "neutro" | "sucesso" | "atencao" | "risco";

export interface MetricaTile {
  /** Chave estável — usada no `key` e para casar com o filtro ativo. */
  id: string;
  rotulo: string;
  valor: number;
  /**
   * Tom PRETENDIDO. Vira `neutro` automaticamente quando `valor === 0`
   * (ver `tomDoValor`) — quem chama declara a intenção, não o resultado.
   */
  tom?: TomMetrica;
  /** Sem `href`, o tile é informativo (não clicável). */
  href?: string;
  /** Uma linha curta abaixo do rótulo: o critério, não a interpretação. */
  detalhe?: string;
}

/**
 * 🔴 Zero rebaixa qualquer tom a neutro. Ver o bloco "Zero nunca é alarme"
 * acima — é a regra que impede a faixa de virar decoração vermelha.
 */
function tomDoValor(m: MetricaTile): TomMetrica {
  if (m.valor === 0) return "neutro";
  return m.tom ?? "neutro";
}

/** Classes por tom. Mapa explícito: Tailwind não lê classe interpolada. */
const ESTILO: Record<
  TomMetrica,
  { base: string; ativo: string; ponto: string; rotulo: string }
> = {
  neutro: {
    base: "border-borda-fina bg-card hover:bg-superficie-afundada",
    ativo: "border-2 border-marca-acao bg-marca-acao/5",
    ponto: "",
    rotulo: "text-muted-foreground",
  },
  sucesso: {
    base: "border-sucesso-foreground/25 bg-sucesso hover:border-sucesso-foreground/50",
    ativo: "border-2 border-sucesso-foreground bg-sucesso",
    ponto: "bg-sucesso-foreground",
    rotulo: "text-sucesso-foreground",
  },
  atencao: {
    base: "border-atencao-foreground/25 bg-atencao hover:border-atencao-foreground/50",
    ativo: "border-2 border-atencao-foreground bg-atencao",
    ponto: "bg-atencao-foreground",
    rotulo: "text-atencao-foreground",
  },
  risco: {
    base: "border-risco-foreground/25 bg-risco hover:border-risco-foreground/50",
    ativo: "border-2 border-risco-foreground bg-risco",
    ponto: "bg-risco-foreground",
    rotulo: "text-risco-foreground",
  },
};

export function FaixaMetricas({
  titulo,
  resumo,
  metricas,
  ativo,
  colunas = 4,
  className,
}: {
  /** Nome da FAMÍLIA — é ele que agrupa, não a cor. */
  titulo: string;
  /** Número-âncora da família, à direita do título (ex.: "42 com reunião"). */
  resumo?: string;
  metricas: MetricaTile[];
  /** `id` do tile correspondente ao filtro ativo, se houver. */
  ativo?: string | null;
  colunas?: 3 | 4 | 5;
  className?: string;
}) {
  if (metricas.length === 0) return null;

  return (
    <section aria-label={titulo} className={cn("grid gap-2", className)}>
      {/* Cabeçalho da família: é ele que diz "estes números são de reunião".
          Régua ocupando o resto da largura — mesmo desenho do `Secao`, sem
          puxar o componente inteiro (aqui não há numeração de passo). */}
      <div className="flex items-baseline gap-3">
        <h3 className="rotulo shrink-0 text-muted-foreground">{titulo}</h3>
        <span aria-hidden className="h-px min-w-4 flex-1 bg-borda-fina" />
        {resumo ? (
          <span className="corpo-sm shrink-0 tabular-nums text-muted-foreground">
            {resumo}
          </span>
        ) : null}
      </div>

      <div
        className={cn(
          "grid grid-cols-2 gap-2",
          colunas === 3 && "sm:grid-cols-3",
          colunas === 4 && "sm:grid-cols-4",
          colunas === 5 && "sm:grid-cols-5",
        )}
      >
        {metricas.map((m) => (
          <TileMetrica key={m.id} metrica={m} ativo={ativo === m.id} />
        ))}
      </div>
    </section>
  );
}

function TileMetrica({
  metrica,
  ativo,
}: {
  metrica: MetricaTile;
  ativo: boolean;
}) {
  const tom = tomDoValor(metrica);
  const estilo = ESTILO[tom];

  const conteudo = (
    <>
      <span className="numero-lg leading-none tabular-nums text-foreground">
        {metrica.valor}
      </span>
      <span className={cn("rotulo flex items-center gap-1.5", estilo.rotulo)}>
        {/* 🔴 O ponto é o sinal NÃO-cromático: quem não distingue as cores
            ainda vê que este tile é diferente dos neutros. Sem ele, a
            informação existiria só na cor (WCAG 1.4.1). */}
        {tom !== "neutro" ? (
          <span
            aria-hidden
            className={cn("size-1.5 shrink-0 rounded-full", estilo.ponto)}
          />
        ) : null}
        {metrica.rotulo}
      </span>
      {metrica.detalhe ? (
        <span className="corpo-sm text-muted-foreground">{metrica.detalhe}</span>
      ) : null}
    </>
  );

  const classes = cn(
    "flex min-h-11 flex-col justify-center gap-0.5 rounded-lg border px-3 py-2 transition",
    ativo ? estilo.ativo : estilo.base,
  );

  if (!metrica.href) {
    return <div className={classes}>{conteudo}</div>;
  }

  return (
    <Link
      href={metrica.href}
      prefetch={false}
      aria-current={ativo ? "true" : undefined}
      // O nome acessível carrega rótulo + número + o critério, porque o
      // leitor de tela não recebe nada do tom nem do ponto.
      aria-label={`${metrica.rotulo}: ${metrica.valor}${
        metrica.detalhe ? `, ${metrica.detalhe}` : ""
      }`}
      className={cn("foco-visivel", classes)}
    >
      {conteudo}
    </Link>
  );
}
