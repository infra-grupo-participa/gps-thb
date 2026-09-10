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
 * `role="img"` + `aria-label` com o resumo em número · legenda numérica
 * visível por padrão · separação por vão na cor da superfície, nunca por
 * contorno · nenhuma cor fora dos tokens semânticos · zero estado.
 */
export { Barras } from "./barras";
export { BarraEmpilhada } from "./barra-empilhada";
export { Rosca } from "./rosca";
export { Linha } from "./linha";
export { Funil } from "./funil";
// ⚠️ Só o que ALGUÉM importa daqui. `LegendaValores`, `COR_DO_TOM`,
// `SerieLinha`, `FormatarValor` e `PontoGrafico` saíram do barril: os usos
// reais importam direto de `./legenda-valores` e `./tipos`, e reexport que
// ninguém consome é superfície morta que o próximo leitor confunde com API.
export { type TomGrafico } from "./tipos";
