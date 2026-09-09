import { CircleCheck, Flag } from "lucide-react";
import { brlInteiro } from "@/lib/moeda";
import { cn } from "@/lib/utils";

/**
 * Barra de progresso com MARCOS desenhados na trilha.
 *
 * Nasceu para a meta de faturamento (R$ 150.000 = "Áureo", R$ 250.000 =
 * bônus do programa), que aparece em DOIS lugares com o mesmo desenho: o hero
 * da aba Financeiro e o `MetaHonorarios` da home/Clientes. Duas cópias da
 * mesma geometria dariam duas barras diferentes para o mesmo número — foi o
 * motivo de `moeda.ts` e `datas.ts` existirem (CD1/CD2).
 *
 * 🔑 A barra só desenha porque quem chama JÁ decidiu que há dado. Ela não
 * conhece `null`: `valor` é `number`. Componente que aceitasse `null` e
 * desenhasse 0% transformaria "não sei" em "você não faturou nada" — a mesma
 * mentira do `coalesce(..., 0)`. Quem tem `null` mostra frase, não barra.
 *
 * ♿ `role="progressbar"` + `aria-valuenow/min/max` + `aria-valuetext` em
 * português. A legenda abaixo repete tudo em texto: cor e posição NUNCA
 * carregam informação sozinhas — cada marco tem ícone (✓ / bandeira),
 * peso de fonte e a palavra "atingido" no `aria-valuetext` de quem chama.
 *
 * Server Component: nenhuma interação, nenhum estado, zero JS no cliente.
 */

export interface Marco {
  /** Onde o marco cai na trilha, na mesma unidade de `valor`/`max`. */
  valor: number;
  /** "Áureo", "Bônus" — a palavra que o aluno lê. */
  rotulo: string;
  /** `true` pinta ✓ e o laranja de marca; `false` fica em cinza com bandeira. */
  atingido: boolean;
}

/** 0–100, sempre dentro da trilha. */
function posicao(valor: number, max: number): number {
  if (!(max > 0) || !Number.isFinite(valor)) return 0;
  return Math.max(0, Math.min(100, (valor / max) * 100));
}

export function BarraMarcos({
  valor,
  max,
  marcos,
  rotuloAcessivel,
  textoAcessivel,
  className,
}: {
  valor: number;
  /** Fim da trilha — o marco mais alto (bônus), não a meta. */
  max: number;
  marcos: Marco[];
  /** Nome acessível da barra ("Faturamento na mentoria"). */
  rotuloAcessivel: string;
  /**
   * `aria-valuetext` da barra. Sem ele o leitor de tela anuncia
   * "R$ 40.000 de R$ 250.000" — o fim da TRILHA, que é o bônus, e não a meta
   * de R$ 150.000 que a tela inteira usa como referência. Quem chama sabe qual
   * é a frase certa; a barra não inventa.
   */
  textoAcessivel?: string;
  className?: string;
}) {
  const pct = posicao(valor, max);
  const ordenados = [...marcos].sort((a, b) => a.valor - b.valor);

  // A legenda fica ANCORADA nos marcos: cada item ocupa a faixa entre o marco
  // anterior e o dele, com o texto alinhado à direita — ou seja, embaixo do
  // próprio traço. Rótulo posicionado com `translateX(-50%)` colidiria em
  // 360 px (as duas etiquetas se sobrepõem a partir de ~330 px de trilha).
  //
  // 🔑 Rótulo e valor em DUAS LINHAS, não lado a lado. Medido em 360 px: numa
  // linha só, a faixa do bônus tem 128 px e "Bônus R$ 250.000" precisa de
  // ~150 — o rótulo truncava para "Bô…". Empilhado, cada célula precisa de
  // ~80 px e cabe até na coluna de apoio da home (~300 px).
  const posicoes = ordenados.map((m) => posicao(m.valor, max));
  const faixas = ordenados.map((m, i) => ({
    marco: m,
    posicao: posicoes[i],
    largura: Math.max(0, posicoes[i] - (i === 0 ? 0 : posicoes[i - 1])),
  }));

  return (
    <div className={cn("min-w-0", className)}>
      <div
        role="progressbar"
        aria-label={rotuloAcessivel}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.round(valor)}
        aria-valuetext={
          textoAcessivel ?? `${brlInteiro(valor)} de ${brlInteiro(max)}`
        }
        className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted ring-1 ring-foreground/5 ring-inset"
      >
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${pct}%` }}
        />
        {faixas.map(({ marco, posicao: p }) => {
          // O marco do FIM da trilha não vira traço: ele é a própria borda
          // direita, e um traço colado na borda lê como falha de renderização.
          if (p >= 100) return null;
          return (
            <span
              key={marco.rotulo}
              aria-hidden
              // `bg-card` (branco) lê tanto sobre o laranja preenchido quanto
              // sobre o cinza da trilha — um traço colorido sumiria em um dos
              // dois lados conforme o aluno avança.
              className="absolute inset-y-0 w-0.5 bg-card"
              style={{ left: `calc(${p}% - 1px)` }}
            />
          );
        })}
      </div>

      <div className="mt-1.5 flex text-xs">
        {faixas.map(({ marco, largura }) => (
          <div
            key={marco.rotulo}
            style={{ width: `${largura}%` }}
            className={cn(
              "flex min-w-0 flex-col items-end pl-2 text-right leading-tight",
              marco.atingido
                ? "font-medium text-accent-foreground"
                : "text-muted-foreground",
            )}
          >
            <span className="flex max-w-full items-center gap-1">
              {marco.atingido ? (
                <CircleCheck aria-hidden className="size-3.5 shrink-0" />
              ) : (
                <Flag aria-hidden className="size-3.5 shrink-0" />
              )}
              <span className="truncate">{marco.rotulo}</span>
            </span>
            <span className="tabular-nums">{brlInteiro(marco.valor)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
