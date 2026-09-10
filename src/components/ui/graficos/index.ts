/**
 * Os gráficos do portal — desenho próprio, Server Component, **0 KB de JS**.
 *
 * A alternativa medida era `recharts`: ~95–110 KB gzip na rota mais usada pela
 * equipe (`/admin`, hoje 158 KB), `"use client"` obrigatório e um formatador
 * de número a mais para divergir entre o ICU do Node e o do navegador — que é
 * exatamente o defeito que o `brlCompacto` já custou ao projeto. Seis
 * desenhos estáticos não pagam esse preço.
 *
 * Regras que valem para os seis (a razão de cada uma está em `tipos.ts`):
 * número em TEXTO sempre (rótulo direto, miolo da rosca ou legenda) · o que é
 * pura geometria leva `role="img"` + `aria-label` com o resumo em número ·
 * separação por vão na cor da superfície, nunca por contorno · nenhuma cor
 * fora dos tokens semânticos · altura em PIXELS, decidida pelo card · zero
 * estado.
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
export { pctDe, type TomGrafico } from "./tipos";
