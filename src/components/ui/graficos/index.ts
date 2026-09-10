/**
 * Os cinco gráficos do portal — SVG próprio, Server Component, **0 KB de JS**.
 *
 * A alternativa medida era `recharts`: ~95–110 KB gzip na rota mais usada pela
 * equipe (`/admin`, hoje 158 KB), `"use client"` obrigatório e um formatador
 * de número a mais para divergir entre o ICU do Node e o do navegador — que é
 * exatamente o defeito que o `brlCompacto` já custou ao projeto. Cinco
 * desenhos estáticos não pagam esse preço.
 *
 * Regras que valem para os cinco (a razão de cada uma está em `tipos.ts`):
 * `role="img"` + `aria-label` com o resumo em número · tabela de valores
 * visível por padrão · separação por vão na cor da superfície, nunca por
 * contorno · nenhuma cor fora dos tokens semânticos · zero estado.
 */
export { Barras } from "./barras";
export { BarraEmpilhada } from "./barra-empilhada";
export { Rosca } from "./rosca";
export { Linha, type SerieLinha } from "./linha";
export { Funil } from "./funil";
export { TabelaValores } from "./tabela-valores";
export {
  COR_DO_TOM,
  type FormatarValor,
  type PontoGrafico,
  type TomGrafico,
} from "./tipos";
