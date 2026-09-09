/**
 * A pílula de "a bola é sua" — o único destaque forte da feature.
 *
 * 🔑 NÃO usar `Badge variant="default"` aqui. Ele é `bg-primary`
 * (#FF6300) com `text-primary-foreground` (#FFFFFF): **3,05:1**, que reprova
 * o mínimo de 4,5:1 de texto — e o texto do badge tem 12 px. O par
 * `accent`/`accent-foreground` (#FFEDD5 com #B04300) é o MESMO laranja da
 * marca com **5,9:1**, e já é o que o `NavTabs` usa na aba ativa pelo mesmo
 * motivo (medido, não estimado).
 *
 * Usado com `variant="outline"`, que zera o fundo e a cor — o `border-transparent`
 * apaga a borda que aquela variante desenha.
 */
export const BADGE_ATENCAO =
  "border-transparent bg-accent text-accent-foreground";
