/**
 * Dinheiro em reais — um lugar só (CD1).
 *
 * Havia 9 cópias de `new Intl.NumberFormat("pt-BR", { style: "currency" })`
 * espalhadas por `components/`, cada uma com o seu `maximumFractionDigits`.
 * Nove cópias é o mesmo que nenhuma regra: bastava alguém esquecer o
 * `maximumFractionDigits` para a mesma quantia sair com dois rostos em duas
 * telas do mesmo portal.
 *
 * 🔑 Não confundir com `masks.ts:numeroParaMoeda`, que é MÁSCARA DE ENTRADA
 * (valor inicial de `input`), não exibição. Aquele fica onde está.
 *
 * Os formatadores são criados uma vez por módulo: `Intl.NumberFormat` é caro
 * de construir e barato de reusar, e estas funções rodam dentro de listas de
 * 30 clientes e de 100 ambientes.
 *
 * Sem `"use client"` e sem `server-only`: Server e Client Component formatam
 * pelo MESMO caminho — `pt-BR` explícito, nunca o locale do processo Node
 * (Hostinger) nem o do navegador, senão o SSR e a hidratação divergem.
 */

/** "R$ 1.234,56" — o valor de conferência, sempre com centavos. */
const FMT = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/**
 * "R$ 1.235" — sem centavos. Para linha de destaque e meta: uma meta de
 * R$ 150.000 lida com ",00" atrás rouba a atenção do número que interessa.
 * O valor exato continua no `title`/`sr-only` de quem usa.
 */
const FMT_INTEIRO = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

/**
 * "R$ 42 mil" / "R$ 1,3 mi" — número de COMPARAÇÃO, para card em lista onde
 * o espaço é disputado. Quem usa é obrigado a expor o valor exato ao lado
 * (`title` + `sr-only`), porque compacto arredonda.
 */
// ⚠️ NÃO usar `notation: "compact"` aqui. A abreviação vem dos dados de locale
// do ICU, e o ICU do Node (Hostinger) e o do navegador divergem: o servidor
// renderizava "R$ 68 mil" e o cliente "R$ 68,0 mil" — erro de hidratação em
// TODA abertura de /admin (achado da Onda A do design, 09/09). A conta é feita
// à mão e só a parte numérica passa pelo Intl, com regra explícita de casas.
const FMT_UMA_CASA = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/** "R$ 1.234,56" */
export function brl(n: number): string {
  return FMT.format(n);
}

/** "R$ 1.235" — sem centavos. */
export function brlInteiro(n: number): string {
  return FMT_INTEIRO.format(n);
}

/** "R$ 42 mil" · "R$ 1,3 mi" — arredonda; exiba o exato junto. */
export function brlCompacto(n: number): string {
  const abs = Math.abs(n);
  if (!Number.isFinite(n) || abs < 1000) return FMT_INTEIRO.format(n);
  const [divisor, sufixo] =
    abs >= 1e9 ? [1e9, "bi"] : abs >= 1e6 ? [1e6, "mi"] : [1e3, "mil"];
  const sinal = n < 0 ? "-" : "";
  return `${sinal}R$ ${FMT_UMA_CASA.format(abs / divisor)} ${sufixo}`;
}

/**
 * `null`/`undefined` → "—", nunca "R$ 0,00".
 *
 * 🔑 A regra que justifica esta função: `perda_inercia`, `valor_honorarios` e
 * as colunas de contrato nasceram NULL (migração ...090). "R$ 0,00" ali seria
 * uma afirmação sobre o dinheiro de gente real feita em cima de campo vazio.
 * Ausência de dado se diz com travessão.
 */
export function brlOuTraco(n: number | null | undefined): string {
  return n == null ? "—" : FMT.format(n);
}
